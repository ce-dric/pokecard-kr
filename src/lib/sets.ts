export interface Card {
  number: string;
  printedIn: string;
  nameKo: string | null;
  nameStatus: "verified-kr" | "ja-fallback";
  nameJa: string | null;
  rarity: string;
  type: string | null;
  typeKo: string | null;
  category: "pokemon" | "trainer" | "energy" | string;
  stage: string;
  categoryKo: string;
  halfKo: string | null;
  tags: string[];
  hp: number | null;
  illustrator: string | null;
  /** Printed regulation mark from the Korean official detail page. Empty when the page has no mark. */
  regulation?: string | null;
  krCardId: string;
  krUrl: string;
  verifiedUrl?: string;
  jpCardId: string | null;
  jpUrl: string | null;
  jpNumber: string | null;
  jpRarity: string | null;
  jpStage: string | null;
  image: string;
  thumb: string;
}

export interface ExternalLink {
  label: string;
  href: string;
}

export interface CardSet {
  id: string;
  slug: string;
  nameKo: string;
  nameJa: string;
  productNameKo: string;
  productNameJa: string;
  series: string;
  regulation: string;
  expansionMark: string;
  releaseDateKr: string;
  releaseDateJp: string;
  packPriceKr: number;
  boxPriceKr: number;
  cardsPerPack: number;
  packsPerBox: number;
  printedTotal: number;
  cardCount: number;
  krProductUrl: string;
  jpSetUrl: string;
  notes: string[];
  externalLinks?: ExternalLink[];
  cards: Card[];
}

const modules = import.meta.glob("../data/sets/*.json", {
  eager: true,
}) as Record<string, { default: CardSet }>;

export const sets: CardSet[] = Object.values(modules)
  .map((mod) => mod.default)
  .sort((a, b) => b.releaseDateKr.localeCompare(a.releaseDateKr));

export const rarityOrder = ["C", "U", "R", "RR", "ACE", "AR", "SR", "SAR", "MA", "UR", "MUR", "FUR", "BWR"] as const;

export const rarityLabel: Record<string, string> = {
  C: "커먼",
  U: "언커먼",
  R: "레어",
  RR: "더블레어",
  ACE: "ACE",
  AR: "아트레어",
  SR: "슈퍼레어",
  SAR: "스페셜아트레어",
  MA: "MA",
  UR: "UR",
  MUR: "메가울트라레어",
  FUR: "FUR",
  BWR: "BWR",
};

export const typeLabel: Record<string, string> = {
  grass: "풀",
  fire: "불꽃",
  water: "물",
  electric: "번개",
  psychic: "초",
  fighting: "격투",
  dark: "악",
  steel: "강철",
  dragon: "드래곤",
  colorless: "무색",
};

export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL;
  const clean = path.replace(/^\/+/, "");
  return `${base}${clean}`;
}

export function setHref(set: CardSet): string {
  return withBase(`sets/${set.slug}/`);
}

export function cardHref(set: CardSet, card: Card): string {
  return withBase(`cards/${set.slug}/${card.number}/`);
}

export function imageHref(set: CardSet, file: string): string {
  return withBase(`images/cards/${set.id}/${file}`);
}

export function absoluteUrl(path: string): string {
  const site = import.meta.env.SITE || "https://ce-dric.github.io";
  return new URL(path, site.endsWith("/") ? site : `${site}/`).href;
}

export function displayName(card: Card): string {
  if (card.nameStatus === "verified-kr" && card.nameKo) return card.nameKo;
  return card.nameJa || "이름 미확인";
}

export function usesJapaneseName(card: Card): boolean {
  return !(card.nameStatus === "verified-kr" && card.nameKo);
}

export function cardHeading(card: Card): string {
  const half = card.halfKo ? ` ${card.halfKo}` : "";
  return `${displayName(card)}${half}`;
}

export function collector(card: Card): string {
  if (!card.printedIn) return card.number;
  return `${card.number}/${card.printedIn}`;
}

export function formatWon(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

export function findSet(slug: string): CardSet | undefined {
  return sets.find((set) => set.slug === slug);
}

export function siblings(set: CardSet, card: Card): Card[] {
  const name = displayName(card);
  return set.cards.filter((other) => other.number !== card.number && displayName(other) === name);
}

export function neighbors(set: CardSet, card: Card): { prev?: Card; next?: Card } {
  const index = set.cards.findIndex((item) => item.number === card.number);
  return {
    prev: index > 0 ? set.cards[index - 1] : undefined,
    next: index >= 0 && index < set.cards.length - 1 ? set.cards[index + 1] : undefined,
  };
}

export function rarityCounts(set: CardSet): { code: string; label: string; count: number }[] {
  return rarityOrder
    .map((code) => ({
      code,
      label: rarityLabel[code] || code,
      count: set.cards.filter((card) => card.rarity === code).length,
    }))
    .filter((row) => row.count > 0);
}

export function typeCounts(set: CardSet): { code: string; label: string; count: number }[] {
  const codes = [...new Set(set.cards.map((card) => card.type).filter(Boolean))] as string[];
  const order = Object.keys(typeLabel);
  codes.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return codes.map((code) => ({
    code,
    label: typeLabel[code] || code,
    count: set.cards.filter((card) => card.type === code).length,
  }));
}

export function altText(set: CardSet, card: Card): string {
  const bits = [
    set.productNameKo,
    collector(card),
    card.rarity,
    card.halfKo || "",
    displayName(card),
    "카드 이미지",
  ].filter(Boolean);
  return bits.join(" ");
}
