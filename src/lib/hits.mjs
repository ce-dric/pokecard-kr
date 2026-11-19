export const HITS_NAV_LABEL = "\uD79B\uCE74\uB4DC";

const BULK_RARITIES = new Set(["", "C", "U", "R", "RR", "RRR", "ACE", "TR"]);

export const hitRankHighFirst = [
  "BWR",
  "FUR",
  "MUR",
  "HR",
  "UR",
  "MA",
  "SSR",
  "CSR",
  "SAR",
  "A",
  "K",
  "CHR",
  "SR",
  "PR",
  "S",
  "AR",
];

const ODDS_KEYS = ["odds", "pullOdds", "pullRate"];

export function isStarterSet(set) {
  if (!set || typeof set !== "object") return false;
  const packs = Number(set.packsPerBox);
  if (Number.isFinite(packs) && packs <= 1) return true;
  const name = `${set.productNameKo || ""} ${set.nameKo || ""}`;
  return name.includes("스타터");
}

export function isHitRarity(code) {
  if (typeof code !== "string") return false;
  const rarity = code.trim();
  if (!rarity || BULK_RARITIES.has(rarity)) return false;
  return true;
}

export function existingOdds(record) {
  if (!record || typeof record !== "object") return "";
  for (const key of ODDS_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function cardTitle(card) {
  const half = card?.halfKo ? ` ${card.halfKo}` : "";
  if (card?.nameStatus === "verified-kr" && card.nameKo) return `${card.nameKo}${half}`;
  return `${card?.nameJa || "이름 미확인"}${half}`;
}

export function usesJapaneseName(card) {
  return !(card && card.nameStatus === "verified-kr" && card.nameKo);
}

export function collectorNumber(card) {
  if (!card?.number) return "";
  if (!card.printedIn) return card.number;
  return `${card.number}/${card.printedIn}`;
}

function hasPrintedRarity(set) {
  return (set?.cards || []).some((card) => typeof card?.rarity === "string" && card.rarity.trim());
}

export function hitCards(set) {
  if (!set || isStarterSet(set)) return [];
  return (set.cards || []).filter((card) => isHitRarity(card?.rarity));
}

export function hitNote(set) {
  if (hitCards(set).length) return "";
  if (isStarterSet(set) && !hasPrintedRarity(set)) {
    return "이 상품은 스타터 세트입니다. 공식 상세에 레어도 표기가 없어 힛카드를 나누지 않습니다.";
  }
  if (isStarterSet(set)) {
    return "이 상품은 스타터 세트라 힛카드 목록에서 빼 둡니다.";
  }
  if (!hasPrintedRarity(set)) {
    return "공식 상세에 레어도 표기가 없어 힛카드를 나누지 않습니다.";
  }
  return "이 세트의 데이터에는 힛카드로 모을 레어도가 없습니다.";
}

export function hitGroups(set) {
  const byCode = new Map();
  for (const card of hitCards(set)) {
    const code = card.rarity.trim();
    const list = byCode.get(code);
    if (list) list.push(card);
    else byCode.set(code, [card]);
  }
  const known = hitRankHighFirst.filter((code) => byCode.has(code));
  const extra = [...byCode.keys()]
    .filter((code) => !hitRankHighFirst.includes(code))
    .sort((a, b) => a.localeCompare(b, "en"));
  return [...known, ...extra].map((code) => ({ code, cards: byCode.get(code) }));
}

export function groupSetsBySeries(list) {
  const groups = [];
  for (const set of list || []) {
    const series = set?.series || "";
    const found = groups.find((group) => group.series === series);
    if (found) found.sets.push(set);
    else groups.push({ series, sets: [set] });
  }
  return groups;
}

function tagList(card) {
  if (!Array.isArray(card?.tags)) return [];
  return card.tags.filter((tag) => typeof tag === "string" && tag.trim()).map((tag) => tag.trim());
}

export function describeHit(card, options = {}) {
  const rarityLabels = options.rarityLabels || {};
  const typeLabels = options.typeLabels || {};
  const facts = [];
  const number = collectorNumber(card);
  if (number) facts.push({ label: "번호", value: number });
  const rarity = typeof card?.rarity === "string" ? card.rarity.trim() : "";
  if (rarity) {
    const label = rarityLabels[rarity];
    const value = typeof label === "string" && label.trim() && label.trim() !== rarity
      ? `${rarity} ${label.trim()}`
      : rarity;
    facts.push({ label: "레어도", value });
  }
  const tags = tagList(card);
  if (card?.categoryKo || tags.length) {
    facts.push({
      label: "종류",
      value: [card?.categoryKo, ...tags].filter(Boolean).join(", "),
    });
  }
  const typeValue = (card?.type && typeLabels[card.type]) || card?.typeKo || card?.type || "";
  if (typeValue) facts.push({ label: "타입", value: typeValue });
  if (typeof card?.hp === "number" && Number.isFinite(card.hp)) {
    facts.push({ label: "HP", value: String(card.hp) });
  }
  if (typeof card?.illustrator === "string" && card.illustrator.trim()) {
    facts.push({ label: "일러스트", value: card.illustrator.trim() });
  }
  const odds = existingOdds(card);
  if (odds) facts.push({ label: "확률", value: odds });
  return {
    title: cardTitle(card),
    japaneseFallback: usesJapaneseName(card),
    facts,
  };
}

export function hitsIndexPath() {
  return "hits/";
}

export function hitsSetPath(set) {
  return `hits/${set.id}/`;
}
