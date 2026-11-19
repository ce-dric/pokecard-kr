import glossaryData from "../data/glossary.json";
import { glossaryHaystack } from "./glossary-search.js";
import {
  rarityLabel,
  sets,
  withBase,
  type Card,
  type CardSet,
} from "./sets";

export { glossaryHaystack };

export type GlossaryGroupId = "community" | "card" | "rarity";

export interface GlossaryLinks {
  rarities?: string[];
  tags?: string[];
  nameIncludes?: string[];
  setSlugs?: string[];
  setSeries?: string[];
  abovePrinted?: boolean;
  allSets?: boolean;
  rarityIndex?: boolean;
}

export interface GlossaryExternal {
  label: string;
  href: string;
}

export interface GlossaryTerm {
  slug: string;
  term: string;
  english: string;
  aliases: string[];
  group: GlossaryGroupId;
  summary: string;
  definition: string[];
  related?: string[];
  external?: GlossaryExternal[];
  links?: GlossaryLinks;
}

export const glossary = glossaryData as GlossaryTerm[];

export const glossaryGroups: { id: GlossaryGroupId; label: string }[] = [
  { id: "community", label: "커뮤니티" },
  { id: "card", label: "카드와 상품" },
  { id: "rarity", label: "레어도" },
];

export function glossaryIndexHref(): string {
  return withBase("glossary/");
}

export function glossaryHref(slug: string): string {
  return withBase(`glossary/${slug}/`);
}

export function termsInGroup(group: GlossaryGroupId): GlossaryTerm[] {
  return glossary.filter((term) => term.group === group);
}

export function findTerm(slug: string): GlossaryTerm | undefined {
  return glossary.find((term) => term.slug === slug);
}

export function relatedTerms(term: GlossaryTerm): GlossaryTerm[] {
  return (term.related ?? []).flatMap((slug) => {
    const found = findTerm(slug);
    return found ? [found] : [];
  });
}

function explicitSets(term: GlossaryTerm): CardSet[] {
  const links = term.links;
  if (!links) return [];
  if (links.allSets) return [...sets];
  return sets.filter(
    (set) =>
      Boolean(links.setSlugs?.includes(set.slug)) || Boolean(links.setSeries?.includes(set.series)),
  );
}

function hasCardRule(links: GlossaryLinks): boolean {
  return Boolean(
    links.rarities?.length || links.tags?.length || links.nameIncludes?.length || links.abovePrinted,
  );
}

function cardWanted(set: CardSet, card: Card, links: GlossaryLinks): boolean {
  if (links.rarities?.includes(card.rarity)) return true;
  if (links.tags?.some((tag) => card.tags.includes(tag))) return true;
  if (links.nameIncludes?.some((part) => (card.nameKo || "").includes(part))) return true;
  if (links.abovePrinted) {
    const number = Number(card.number);
    if (Number.isFinite(number) && number > set.printedTotal) return true;
  }
  return false;
}

export function linkedCards(term: GlossaryTerm): { set: CardSet; card: Card }[] {
  const links = term.links;
  if (!links || !hasCardRule(links)) return [];
  const narrowed = explicitSets(term);
  const scoped = Boolean(links.allSets || links.setSlugs?.length || links.setSeries?.length);
  const source = scoped ? narrowed : sets;
  const rows: { set: CardSet; card: Card }[] = [];
  for (const set of source) {
    for (const card of set.cards) {
      if (cardWanted(set, card, links)) rows.push({ set, card });
    }
  }
  return rows;
}

export interface LinkedCardGroup {
  set: CardSet;
  cards: Card[];
}

export function linkedCardGroups(term: GlossaryTerm): LinkedCardGroup[] {
  const groups: LinkedCardGroup[] = [];
  for (const row of linkedCards(term)) {
    let group = groups.find((item) => item.set.id === row.set.id);
    if (!group) {
      group = { set: row.set, cards: [] };
      groups.push(group);
    }
    group.cards.push(row.card);
  }
  return groups;
}

export function linkedSets(term: GlossaryTerm): CardSet[] {
  const seen = new Set<string>();
  const merged: CardSet[] = [];
  for (const set of [...explicitSets(term), ...linkedCards(term).map((row) => row.set)]) {
    if (seen.has(set.id)) continue;
    seen.add(set.id);
    merged.push(set);
  }
  return merged;
}

export interface LinkedRarity {
  set: CardSet;
  code: string;
  label: string;
  count: number;
  href: string;
}

export function linkedRarities(term: GlossaryTerm): LinkedRarity[] {
  const codes = term.links?.rarities ?? [];
  const rows: LinkedRarity[] = [];
  for (const set of sets) {
    for (const code of codes) {
      const count = set.cards.filter((card) => card.rarity === code).length;
      if (!count) continue;
      const label = rarityLabel[code] || "";
      rows.push({
        set,
        code,
        label: label && label !== code ? label : "",
        count,
        href: `${withBase("rarity/")}#${set.id}-${code}`,
      });
    }
  }
  return rows;
}

export function siteRarityLabel(term: GlossaryTerm): string {
  const code = term.links?.rarities?.[0];
  if (!code || (term.links?.rarities?.length ?? 0) !== 1) return "";
  const label = rarityLabel[code] || "";
  return label && label !== code ? label : "";
}

export function rarityIndexHref(term: GlossaryTerm): string {
  return term.links?.rarityIndex ? withBase("rarity/") : "";
}
