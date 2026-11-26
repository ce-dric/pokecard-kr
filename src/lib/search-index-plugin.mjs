import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const virtualId = "virtual:card-search";
const resolvedId = "\0virtual:card-search";

function clean(value) {
  return String(value ?? "").trim();
}

function fold(value) {
  return clean(value).toLowerCase().replace(/\s+/g, "");
}

function displayName(card) {
  if (
    card.nameKo &&
    (card.nameStatus === "verified-kr" ||
      card.nameStatus === "kr-store" ||
      card.nameStatus === "owner-blog")
  ) {
    return clean(card.nameKo);
  }
  return clean(card.nameJa || "이름 미확인");
}

function collector(card) {
  if (!card.printedIn) return clean(card.number);
  return `${clean(card.number)}/${clean(card.printedIn)}`;
}

function coverThumb(set) {
  const preferred = ["SAR", "MUR", "UR", "SR", "AR", "MA", "RR", "R"];
  for (const code of preferred) {
    const found = set.cards.find((card) => card.rarity === code && card.thumb);
    if (found) return found.thumb;
  }
  return set.cards.find((card) => card.thumb)?.thumb || "";
}

function buildItems() {
  const setDir = join(root, "src/data/sets");
  const sets = readdirSync(setDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(setDir, name), "utf8")));
  const glossary = JSON.parse(readFileSync(join(root, "src/data/glossary.json"), "utf8"));
  const items = [];

  for (const set of sets) {
    const title = clean(set.nameKo);
    const product = clean(set.productNameKo);
    const thumb = coverThumb(set);
    items.push({
      k: "set",
      t: title,
      s: "세트",
      m: product,
      h: `sets/${set.slug}/`,
      i: thumb ? `images/cards/${set.id}/${thumb}` : "",
      q: fold([title, product, set.series, set.expansionMark, set.id, set.slug, set.nameJa].join(" ")),
    });
    for (const card of set.cards) {
      const name = displayName(card);
      const half = card.halfKo ? ` ${clean(card.halfKo)}` : "";
      const number = collector(card);
      const rarity = clean(card.rarity);
      items.push({
        k: "card",
        t: `${name}${half}`,
        s: title,
        m: [number, rarity].filter(Boolean).join(" "),
        h: `cards/${set.slug}/${card.number}/`,
        i: card.thumb ? `images/cards/${set.id}/${card.thumb}` : "",
        q: fold([name, half, card.nameJa, card.number, number, rarity, title, product, card.typeKo].join(" ")),
      });
    }
  }

  for (const term of glossary) {
    const aliases = Array.isArray(term.aliases) ? term.aliases.map(clean) : [];
    const english = clean(term.english);
    const title = clean(term.term);
    items.push({
      k: "term",
      t: title,
      s: "용어",
      m: english && english.toLowerCase() !== title.toLowerCase() ? english : aliases[0] || "",
      h: `glossary/${term.slug}/`,
      i: "",
      q: fold([title, english, term.summary, ...aliases].join(" ")),
    });
  }

  return items;
}

export function searchIndexPlugin() {
  let cache = null;
  return {
    name: "card-search-index",
    enforce: "pre",
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return null;
      if (!cache) cache = buildItems();
      return `export default ${JSON.stringify(cache)}`;
    },
  };
}
