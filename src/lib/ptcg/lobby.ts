import mappingFile from "../../data/game-cards.json" with { type: "json" };
import { decks } from "./decks.ts";
import { esc, fullFromThumb, imageSrc } from "./html.ts";
import type { CardMapping, DeckFile } from "./types.ts";

const mapping = mappingFile as CardMapping;

export type Difficulty = "easy" | "normal" | "hard";

export const RANDOM_DECK = "random";

export const DIFFICULTY_OPTIONS: ReadonlyArray<{ id: Difficulty; labelKo: string }> = [
  { id: "easy", labelKo: "쉬움" },
  { id: "normal", labelKo: "보통" },
  { id: "hard", labelKo: "어려움" },
];

export interface LobbyPrefs {
  mine: string;
  theirs: string;
  difficulty: Difficulty;
}

const STORAGE_KEY = "ptcg.lobby";

/** Presentation fields for lobby deck cards. Kept here so decks.json stays list-only. */
const DECK_BLURBS: Record<
  string,
  { faceId: number; typeKo: string; blurbKo: string }
> = {
  sample: {
    faceId: 721,
    typeKo: "물",
    blurbKo: "가이오가와 메가눈설왕으로 물을 밀어붙이는 구성입니다.",
  },
  crustle: {
    faceId: 345,
    typeKo: "풀",
    blurbKo: "암팰리스를 중심으로 특수 에너지와 방해를 섞은 구성입니다.",
  },
  dragapult: {
    faceId: 121,
    typeKo: "드래곤",
    blurbKo: "드래펄트 ex 라인으로 빠르게 전개를 노리는 구성입니다.",
  },
};

export interface DeckCardInfo {
  id: string;
  titleKo: string;
  faceKo: string;
  typeKo: string;
  blurbKo: string;
  image: string | null;
  fullImage: string | null;
}

export function deckCardInfo(deck: DeckFile): DeckCardInfo {
  const meta = DECK_BLURBS[deck.id];
  const faceId = meta?.faceId;
  const row = faceId != null ? mapping.cards[String(faceId)] : undefined;
  const thumb = row?.link?.image || row?.picture?.thumb || null;
  return {
    id: deck.id,
    titleKo: deck.titleKo,
    faceKo: deck.faceEn,
    typeKo: meta?.typeKo || "",
    blurbKo: meta?.blurbKo || `${deck.faceEn} 중심의 샘플 덱입니다.`,
    image: thumb,
    fullImage: fullFromThumb(thumb) || row?.picture?.full || null,
  };
}

export function allDeckCards(): DeckCardInfo[] {
  return decks.map(deckCardInfo);
}

export function isDifficulty(value: string): value is Difficulty {
  return value === "easy" || value === "normal" || value === "hard";
}

export function defaultPrefs(): LobbyPrefs {
  return {
    mine: decks[0]?.id ?? "sample",
    theirs: RANDOM_DECK,
    difficulty: "easy",
  };
}

export function loadPrefs(storage: Pick<Storage, "getItem"> | null | undefined = globalStorage()): LobbyPrefs {
  const fallback = defaultPrefs();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<LobbyPrefs>;
    const mine = typeof parsed.mine === "string" && findDeckId(parsed.mine) ? parsed.mine : fallback.mine;
    const theirs =
      parsed.theirs === RANDOM_DECK || (typeof parsed.theirs === "string" && findDeckId(parsed.theirs))
        ? parsed.theirs
        : fallback.theirs;
    const difficulty = typeof parsed.difficulty === "string" && isDifficulty(parsed.difficulty)
      ? parsed.difficulty
      : fallback.difficulty;
    return { mine, theirs, difficulty };
  } catch {
    return fallback;
  }
}

export function savePrefs(
  prefs: LobbyPrefs,
  storage: Pick<Storage, "setItem"> | null | undefined = globalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function globalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function findDeckId(id: string): boolean {
  return decks.some((deck) => deck.id === id);
}

export function resolveOpponentDeck(theirs: string, mine: string, random = Math.random): string {
  if (theirs !== RANDOM_DECK) return theirs;
  const pool = decks.map((deck) => deck.id);
  if (pool.length === 0) return mine;
  const index = Math.floor(random() * pool.length) % pool.length;
  return pool[index] ?? mine;
}

function deckCardButton(group: "mine" | "theirs", info: DeckCardInfo, current: string): string {
  const pressed = info.id === current ? "true" : "false";
  const src = imageSrc(info.image);
  const portrait = src
    ? `<img src="${esc(src)}" alt="" width="96" height="134" loading="lazy" decoding="async" />`
    : `<span class="ptcg-lobby-fallback">${esc(info.faceKo)}</span>`;
  return `<button type="button" class="ptcg-lobby-card" data-deck="${group}" data-id="${esc(info.id)}" aria-pressed="${pressed}">
    <span class="ptcg-lobby-art">${portrait}</span>
    <span class="ptcg-lobby-body">
      <strong class="ptcg-lobby-title">${esc(info.titleKo)}</strong>
      <span class="ptcg-lobby-face">${esc(info.faceKo)}</span>
      <span class="ptcg-lobby-type">${esc(info.typeKo)}</span>
      <span class="ptcg-lobby-blurb">${esc(info.blurbKo)}</span>
    </span>
  </button>`;
}

function randomOpponentButton(current: string): string {
  const pressed = current === RANDOM_DECK ? "true" : "false";
  return `<button type="button" class="ptcg-lobby-card ptcg-lobby-card--random" data-deck="theirs" data-id="${RANDOM_DECK}" aria-pressed="${pressed}">
    <span class="ptcg-lobby-art"><span class="ptcg-lobby-fallback">?</span></span>
    <span class="ptcg-lobby-body">
      <strong class="ptcg-lobby-title">무작위</strong>
      <span class="ptcg-lobby-face">상대 덱</span>
      <span class="ptcg-lobby-type">랜덤</span>
      <span class="ptcg-lobby-blurb">시작할 때 샘플 덱 중 하나를 고릅니다.</span>
    </span>
  </button>`;
}

function difficultyButtons(current: Difficulty): string {
  return DIFFICULTY_OPTIONS.map((option) => {
    const pressed = option.id === current ? "true" : "false";
    return `<button type="button" data-difficulty="${option.id}" aria-pressed="${pressed}">${esc(option.labelKo)}</button>`;
  }).join("");
}

export function lobbyHtml(prefs: LobbyPrefs): string {
  const cards = allDeckCards();
  const mine = cards.map((info) => deckCardButton("mine", info, prefs.mine)).join("");
  const theirs =
    randomOpponentButton(prefs.theirs) +
    cards.map((info) => deckCardButton("theirs", info, prefs.theirs)).join("");
  return `<div class="ptcg-setup ptcg-lobby">
    <fieldset class="ptcg-lobby-field">
      <legend>내 덱</legend>
      <div class="ptcg-lobby-grid" role="group" aria-label="내 덱">${mine}</div>
    </fieldset>
    <fieldset class="ptcg-lobby-field">
      <legend>상대 덱</legend>
      <div class="ptcg-lobby-grid" role="group" aria-label="상대 덱">${theirs}</div>
    </fieldset>
    <fieldset class="ptcg-lobby-field">
      <legend>봇 난이도</legend>
      <div class="ptcg-choices ptcg-lobby-difficulty" role="group" aria-label="봇 난이도">${difficultyButtons(prefs.difficulty)}</div>
    </fieldset>
    <p class="ptcg-note">샘플 덱은 공식 스탠다드 레귤레이션(마크 H, I, J)을 따릅니다. 규정은 <a href="https://pokemoncard.co.kr/card/play_qna" rel="noopener noreferrer">포켓몬 카드 게임 공식 플레이 안내</a>를 보세요. 한국판 목록에 확인된 카드는 우리 이름과 이미지를 쓰고, 아직 없는 카드는 영문 이름과 일본 공식 이미지를 씁니다. 고른 덱과 난이도는 이 브라우저에 기억합니다.</p>
    <button type="button" data-start>대전 시작</button>
  </div><div data-board hidden></div>`;
}
