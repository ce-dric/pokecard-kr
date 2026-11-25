import type {
  AttackData,
  BattleLog,
  CardData,
  CardMapping,
  Catalogs,
  Observation,
  Option,
  PlayerView,
  PokemonState,
} from "./types.ts";

const TYPE_KO = ["무색", "풀", "불꽃", "물", "번개", "초", "격투", "악", "강철", "드래곤"];
const KIND_KO = ["포켓몬", "아이템", "도구", "서포터", "스타디움", "에너지", "특수 에너지"];
const SWATCH = ["colorless", "grass", "fire", "water", "electric", "psychic", "fighting", "dark", "steel", "dragon"];
const AREA_KO: Record<number, string> = {
  1: "덱",
  2: "패",
  3: "트래쉬",
  4: "배틀필드",
  5: "벤치",
  6: "프라이즈",
  7: "스타디움",
  8: "에너지",
  9: "도구",
  10: "진화 전",
  12: "확인",
};

const PROMPTS: Record<number, string> = {
  0: "할 일을 고르세요",
  1: "배틀에 낼 포켓몬을 고르세요",
  2: "벤치에 낼 포켓몬을 고르세요",
  3: "교체할 포켓몬을 고르세요",
  4: "배틀로 보낼 포켓몬을 고르세요",
  7: "손으로 가져올 카드를 고르세요",
  8: "버릴 카드를 고르세요",
  13: "데미지 카운터를 올릴 포켓몬을 고르세요",
  21: "붙일 카드를 고르세요",
  22: "붙일 곳을 고르세요",
  35: "공격을 고르세요",
  38: "뽑을 장수를 고르세요",
  41: "선공할까요",
  42: "다시 뽑을까요",
  43: "효과를 쓸까요",
};

export function cleanText(value: string): string {
  return value.replaceAll("\u00b7", " ").replaceAll("\u30fb", " ");
}

export function cardName(id: number | undefined, cards: Map<number, CardData>, mapping: CardMapping): string {
  if (id == null) return "카드";
  const link = mapping.cards[String(id)]?.link;
  if (link?.nameKo) return cleanText(link.nameKo);
  const engine = cards.get(id);
  if (engine?.name) return cleanText(engine.name);
  return `카드 ${id}`;
}

export interface FaceCard {
  hidden?: boolean;
  name: string;
  nameKo: string | null;
  image: string | null;
  fullImage: string | null;
  hp: number | null;
  maxHp: number | null;
  energies: string[];
  kind: string | null;
  typeLabel: string | null;
}

function fullFromThumb(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.endsWith("-thumb.webp")) return path.replace(/-thumb\.webp$/, ".webp");
  return path;
}

const EMPTY_FACE: FaceCard = {
  hidden: true,
  name: "뒷면",
  nameKo: null,
  image: null,
  fullImage: null,
  hp: null,
  maxHp: null,
  energies: [],
  kind: null,
  typeLabel: null,
};

export function cardFace(
  id: number,
  cards: Map<number, CardData>,
  mapping: CardMapping,
  poke?: PokemonState | null,
): FaceCard {
  const data = cards.get(id);
  const row = mapping.cards[String(id)];
  const link = row?.link;
  const nameKo = link?.nameKo ? cleanText(link.nameKo) : null;
  const name = nameKo || (data?.name ? cleanText(data.name) : `카드 ${id}`);
  const energyType = data?.energyType;
  const thumb = link?.image || row?.picture?.thumb || null;
  return {
    name,
    nameKo,
    image: thumb,
    fullImage: fullFromThumb(link?.image) || row?.picture?.full || null,
    hp: poke ? poke.hp : data?.cardType === 0 ? data.hp : null,
    maxHp: poke ? poke.maxHp : data?.cardType === 0 ? data.hp : null,
    energies: (poke?.energies || []).map((type) => SWATCH[type] || "colorless"),
    kind: data ? KIND_KO[data.cardType] || null : null,
    typeLabel: energyType != null && TYPE_KO[energyType] ? TYPE_KO[energyType] : null,
  };
}

function pokemonFace(
  poke: PokemonState | null,
  cards: Map<number, CardData>,
  mapping: CardMapping,
): FaceCard {
  if (!poke) return EMPTY_FACE;
  return cardFace(poke.id, cards, mapping, poke);
}

function conditions(player: PlayerView): string[] {
  const names: string[] = [];
  if (player.poisoned) names.push("독");
  if (player.burned) names.push("화상");
  if (player.asleep) names.push("잠");
  if (player.paralyzed) names.push("마비");
  if (player.confused) names.push("혼란");
  return names;
}

export interface SideView {
  active: FaceCard[];
  bench: FaceCard[];
  hand: FaceCard[] | null;
  handCount: number;
  prizeCount: number;
  discard: FaceCard[];
  discardCount: number;
  deckCount: number;
  conditions: string[];
}

function sideView(
  player: PlayerView,
  playerIndex: number,
  humanSeat: number,
  cards: Map<number, CardData>,
  mapping: CardMapping,
): SideView {
  const hand =
    playerIndex === humanSeat && player.hand
      ? player.hand.map((card) => cardFace(card.id, cards, mapping))
      : null;
  return {
    active: (player.active || []).map((poke) => pokemonFace(poke, cards, mapping)),
    bench: (player.bench || []).map((poke) => pokemonFace(poke, cards, mapping)),
    hand,
    handCount: player.handCount,
    prizeCount: player.prize?.length || 0,
    discard: (player.discard || []).map((card) => cardFace(card.id, cards, mapping)),
    discardCount: player.discard?.length || 0,
    deckCount: player.deckCount,
    conditions: conditions(player),
  };
}

function optionTarget(obs: Observation, option: Option) {
  const you = obs.current.yourIndex;
  const owner = option.playerIndex ?? you;
  const player = obs.current.players[owner];
  if (option.type === 7) return obs.current.players[you]?.hand?.[option.index ?? -1];
  if (option.area === 12) return obs.current.looking?.[option.index ?? -1];
  // Stadium is one shared list. Ability and discard options omit playerIndex.
  if (option.area === 7) return obs.current.stadium?.[option.index ?? -1];
  if (!player) return undefined;
  if (option.area === 2 && owner === you) return player.hand?.[option.index ?? -1];
  if (option.area === 3) return player.discard?.[option.index ?? -1];
  if (option.area === 4) return player.active?.[option.index ?? -1] || undefined;
  if (option.area === 5) return player.bench?.[option.index ?? -1];
  return undefined;
}

export function optionLabel(
  obs: Observation,
  option: Option,
  cards: Map<number, CardData>,
  attacks: Map<number, AttackData>,
  mapping: CardMapping,
): string {
  const named = (id: number | undefined) => cardName(id, cards, mapping);
  switch (option.type) {
    case 13: {
      const attack = option.attackId == null ? undefined : attacks.get(option.attackId);
      const damage = attack?.damage ? ` ${attack.damage}` : "";
      return `공격 ${cleanText(attack?.name || "공격")}${damage}`;
    }
    case 14:
      return "턴 종료";
    case 12:
      return "후퇴";
    case 11:
      return "버리기";
    case 10:
      return "특성";
    case 9:
      return `진화 ${named(optionTarget(obs, option)?.id)}`;
    case 8:
      return `에너지 부착 ${named(optionTarget(obs, option)?.id)}`;
    case 7:
      return `사용 ${named(optionTarget(obs, option)?.id)}`;
    case 1:
      return "예";
    case 2:
      return "아니오";
    case 0:
      return `${option.number ?? 0}장`;
    case 3:
    case 4:
    case 5: {
      const card = optionTarget(obs, option);
      const area = AREA_KO[option.area ?? -1] || "카드";
      return card ? `${area} ${named(card.id)}` : `${area} ${(option.index ?? 0) + 1}`;
    }
    case 6:
      return `에너지 ${option.count || 1}`;
    case 15:
      return "효과 순서";
    case 16:
      return "특수 상태";
    default:
      return "선택";
  }
}

export function selectionPrompt(select: { context: number; minCount: number; maxCount: number }): string {
  const base = PROMPTS[select.context] || "고르세요";
  if (select.minCount === select.maxCount) {
    return select.maxCount === 1 ? base : `${base}. ${select.maxCount}개`;
  }
  if (select.minCount === 0) return `${base}. 최대 ${select.maxCount}개`;
  return `${base}. ${select.minCount}개에서 ${select.maxCount}개`;
}

export function formatLog(
  log: BattleLog,
  viewer: number,
  cards: Map<number, CardData>,
  attacks: Map<number, AttackData>,
  mapping: CardMapping,
): string {
  const who = log.playerIndex === viewer ? "나" : "상대";
  const name = cardName(log.cardId, cards, mapping);
  switch (log.type) {
    case 0:
      return `${who} 덱을 섞었습니다`;
    case 2:
      return log.playerIndex === viewer ? "내 턴" : "상대 턴";
    case 3:
      return log.playerIndex === viewer ? "내 턴 끝" : "상대 턴 끝";
    case 4:
      return `${who} 드로우 ${name}`;
    case 5:
      return `${who} 드로우`;
    case 6:
      return log.toArea === 3 ? `${name} 트래쉬` : "";
    case 7:
      return log.toArea === 3 ? "카드가 트래쉬로 갔습니다" : "";
    case 8:
      return `${who} 교체`;
    case 10:
      return `${who} 사용 ${name}`;
    case 11:
      return `${who} 부착 ${name}`;
    case 12:
      return `${who} 진화 ${name}`;
    case 15: {
      const attack = log.attackId == null ? undefined : attacks.get(log.attackId);
      return `${who} 공격 ${cleanText(attack?.name || "공격")}`;
    }
    case 16:
      return `${name} HP ${log.value ?? 0}`;
    case 17:
      return log.isRecover ? `${who} 독 회복` : `${who} 독`;
    case 18:
      return log.isRecover ? `${who} 화상 회복` : `${who} 화상`;
    case 19:
      return log.isRecover ? `${who} 잠 회복` : `${who} 잠`;
    case 20:
      return log.isRecover ? `${who} 마비 회복` : `${who} 마비`;
    case 21:
      return log.isRecover ? `${who} 혼란 회복` : `${who} 혼란`;
    case 22:
      return `코인 ${log.head ? "앞" : "뒤"}`;
    default:
      return "";
  }
}

export function resultText(result: number, you: number, reason: number | undefined): string {
  const why: Record<number, string> = {
    1: "프라이즈가 없습니다",
    2: "덱이 비었습니다",
    3: "배틀 포켓몬이 없습니다",
    4: "카드 효과입니다",
  };
  const detail = reason != null && why[reason] ? ` ${why[reason]}` : "";
  if (result === 2) return `무승부입니다.${detail}`;
  if (result === you) return `이겼습니다.${detail}`;
  return `졌습니다.${detail}`;
}

export interface ChoiceOption {
  index: number;
  label: string;
  image: string | null;
  fullImage: string | null;
}

export interface GameView {
  phase: "choose" | "over";
  prompt: string;
  /** Engine select.context when the human is choosing; null otherwise. */
  context: number | null;
  minCount: number;
  maxCount: number;
  options: ChoiceOption[];
  log: string[];
  you: SideView;
  opp: SideView;
  turn: number;
  resultText: string | null;
  stadium: FaceCard | null;
}

export function buildView(
  obs: Observation,
  humanSeat: number,
  log: string[],
  catalogs: Catalogs,
  mapping: CardMapping,
  reason: number | undefined,
): GameView {
  const current = obs.current;
  const yours = current.players[humanSeat];
  const theirs = current.players[1 - humanSeat];
  const over = current.result !== -1;
  const choosing = !over && current.yourIndex === humanSeat && obs.select;
  const stadium = current.stadium?.[0];
  return {
    phase: over ? "over" : "choose",
    prompt: choosing && obs.select ? selectionPrompt(obs.select) : over ? "대전이 끝났습니다" : "상대가 고르는 중",
    context: choosing && obs.select ? obs.select.context : null,
    minCount: choosing && obs.select ? obs.select.minCount : 0,
    maxCount: choosing && obs.select ? obs.select.maxCount : 0,
    options:
      choosing && obs.select
        ? obs.select.option.map((option, index) => {
            const target = optionTarget(obs, option);
            const face = target ? cardFace(target.id, catalogs.cards, mapping) : null;
            return {
              index,
              label: optionLabel(obs, option, catalogs.cards, catalogs.attacks, mapping),
              image: face?.image || null,
              fullImage: face?.fullImage || null,
            };
          })
        : [],
    log,
    you: sideView(yours, humanSeat, humanSeat, catalogs.cards, mapping),
    opp: sideView(theirs, 1 - humanSeat, humanSeat, catalogs.cards, mapping),
    turn: current.turn,
    resultText: over ? resultText(current.result, humanSeat, reason) : null,
    stadium: stadium ? cardFace(stadium.id, catalogs.cards, mapping) : null,
  };
}

const PRIVATE_AREAS = new Set([1, 2, 6, 12]);

export function redactLogs(logs: BattleLog[], viewer: number): BattleLog[] {
  return logs.map((log) => {
    if (log.type === 4 && log.playerIndex !== viewer) {
      return { type: 5, playerIndex: log.playerIndex };
    }
    if (log.type === 6 && log.playerIndex !== viewer && log.toArea != null && PRIVATE_AREAS.has(log.toArea)) {
      return { type: 7, playerIndex: log.playerIndex, fromArea: log.fromArea, toArea: log.toArea };
    }
    return log;
  });
}
