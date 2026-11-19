import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { glossaryMatches } from "../src/lib/glossary-search.js";

const file = new URL("../src/data/sets/m6.json", import.meta.url);
const set = JSON.parse(readFileSync(file, "utf8"));
const expected = { C: 38, U: 22, R: 8, RR: 8, AR: 12, SR: 18, SAR: 6, MUR: 1 };
const counts = {};
const errors = [];

if (set.cards.length !== 113) errors.push(`card count ${set.cards.length}`);
const numbers = set.cards.map((card) => card.number);
const wanted = Array.from({ length: 113 }, (_, i) => String(i + 1).padStart(3, "0"));
if (numbers.join() !== wanted.join()) errors.push("numbers are not 001-113");

for (const card of set.cards) {
  counts[card.rarity] = (counts[card.rarity] || 0) + 1;
  if (card.nameStatus !== "verified-kr" || !card.nameKo) {
    errors.push(`${card.number} missing verified Korean name`);
  }
  if (!card.category || !card.stage) errors.push(`${card.number} missing category`);
  const full = join("public/images/cards/m6", card.image);
  const thumb = join("public/images/cards/m6", card.thumb);
  for (const path of [full, thumb]) {
    try {
      if (statSync(path).size < 1000) errors.push(`${path} too small`);
    } catch {
      errors.push(`missing ${path}`);
    }
  }
}
for (const [code, count] of Object.entries(expected)) {
  if (counts[code] !== count) errors.push(`rarity ${code} is ${counts[code] ?? 0}, expected ${count}`);
}

const files = readdirSync("public/images/cards/m6").filter((name) => name.endsWith(".webp"));
if (files.length !== 226) errors.push(`webp count ${files.length}`);

const m6aFile = new URL("../src/data/sets/m6a.json", import.meta.url);
const m6a = JSON.parse(readFileSync(m6aFile, "utf8"));
const m6aExpected = { "": 101, RR: 10, AR: 19, SAR: 7, FUR: 2 };
const m6aCounts = {};
if (m6a.cardCount !== 139 || m6a.cards.length !== 139) {
  errors.push(`m6a card count ${m6a.cards.length}`);
}
if (m6a.printedTotal !== 103) errors.push(`m6a printed total ${m6a.printedTotal}`);
if (m6a.krProductUrl !== "https://pokemoncard.co.kr/card/960") {
  errors.push("m6a product url");
}
const m6aNumbers = new Set();
for (const card of m6a.cards) {
  m6aCounts[card.rarity] = (m6aCounts[card.rarity] || 0) + 1;
  if (card.nameStatus !== "verified-kr" || !card.nameKo) {
    errors.push(`m6a ${card.number} missing verified Korean name`);
  }
  if (!card.category || !card.stage) errors.push(`m6a ${card.number} missing category`);
  if (m6aNumbers.has(card.number)) errors.push(`m6a duplicate ${card.number}`);
  m6aNumbers.add(card.number);
  if (`${card.nameKo}${card.number}${m6a.productNameKo}`.includes("·")) {
    errors.push(`m6a ${card.number} contains a middle dot`);
  }
  if (!card.krUrl.startsWith("https://pokemoncard.co.kr/cards/detail/BS2026006")) {
    errors.push(`m6a ${card.number} missing official url`);
  }
  const full = join("public/images/cards/m6a", card.image);
  const thumb = join("public/images/cards/m6a", card.thumb);
  for (const path of [full, thumb]) {
    try {
      if (statSync(path).size < 1000) errors.push(`${path} too small`);
    } catch {
      errors.push(`missing ${path}`);
    }
  }
}
const m6aItems = {
  "101": ["포켓몬 교체", "ポケモンいれかえ", "50744", "103"],
  "102": ["포켓패드", "ポケパッド", "50743", "102"],
  "103": ["하이퍼볼", "ハイパーボール", "50742", "101"],
};
for (const [number, [nameKo, nameJa, jpCardId, jpNumber]] of Object.entries(m6aItems)) {
  const card = m6a.cards.find((item) => item.number === number);
  if (
    !card ||
    card.nameKo !== nameKo ||
    card.nameJa !== nameJa ||
    card.jpCardId !== jpCardId ||
    card.jpNumber !== jpNumber
  ) {
    errors.push(`m6a ${number} Japanese item pairing`);
  }
}
for (const code of ["GRA", "FIR", "WAT", "LIG", "PSY", "FIG", "DAR", "MET"]) {
  if (!m6aNumbers.has(code)) errors.push(`m6a missing energy ${code}`);
}
for (const [code, count] of Object.entries(m6aExpected)) {
  if (m6aCounts[code] !== count) {
    errors.push(`m6a rarity ${code || "(empty)"} is ${m6aCounts[code] ?? 0}, expected ${count}`);
  }
}
const m6aFiles = readdirSync("public/images/cards/m6a").filter((name) => name.endsWith(".webp"));
if (m6aFiles.length !== 278) errors.push(`m6a webp count ${m6aFiles.length}`);

const setFiles = readdirSync("src/data/sets").filter((name) => name.endsWith(".json"));
const allSets = setFiles.map((name) => JSON.parse(readFileSync(join("src/data/sets", name), "utf8")));
const glossary = JSON.parse(readFileSync("src/data/glossary.json", "utf8"));
const groups = new Set(["community", "card", "rarity"]);
const slugSeen = new Set();
const termSeen = new Set();
const middleDots = ["·", "・"];

function walkStrings(value, visit) {
  if (typeof value === "string") visit(value);
  else if (Array.isArray(value)) value.forEach((item) => walkStrings(item, visit));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => walkStrings(item, visit));
}

if (!Array.isArray(glossary) || glossary.length === 0) errors.push("glossary is empty");

walkStrings(glossary, (value) => {
  for (const dot of middleDots) {
    if (value.includes(dot)) errors.push(`glossary contains a middle dot: ${value}`);
  }
});

function cardsMatching(predicate) {
  const rows = [];
  for (const cardSet of allSets) {
    for (const card of cardSet.cards) {
      if (predicate(cardSet, card)) rows.push(card);
    }
  }
  return rows;
}

for (const term of glossary) {
  const where = `glossary ${term.slug || "(no slug)"}`;
  if (!term.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(term.slug)) errors.push(`${where} bad slug`);
  if (slugSeen.has(term.slug)) errors.push(`${where} duplicate slug`);
  slugSeen.add(term.slug);
  if (!term.term || termSeen.has(term.term)) errors.push(`${where} missing or duplicate term`);
  termSeen.add(term.term);
  if (!term.english) errors.push(`${where} missing english`);
  if (!groups.has(term.group)) errors.push(`${where} bad group`);
  if (!term.summary || term.summary.length > 160) errors.push(`${where} summary missing or too long`);
  if (!Array.isArray(term.definition) || term.definition.length === 0) errors.push(`${where} missing definition`);
  for (const paragraph of term.definition ?? []) {
    if (typeof paragraph !== "string" || paragraph.length < 8) errors.push(`${where} short definition`);
  }
  if (!Array.isArray(term.aliases)) errors.push(`${where} aliases not an array`);
  const aliasSeen = new Set();
  for (const alias of term.aliases ?? []) {
    if (typeof alias !== "string" || !alias.trim()) errors.push(`${where} empty alias`);
    const key = alias.toLowerCase();
    if (aliasSeen.has(key)) errors.push(`${where} duplicate alias ${alias}`);
    aliasSeen.add(key);
    if (key === term.term.toLowerCase() || key === term.english.toLowerCase()) {
      errors.push(`${where} alias repeats the term or english: ${alias}`);
    }
  }
  for (const slug of term.related ?? []) {
    if (slug === term.slug) errors.push(`${where} related to itself`);
    if (!glossary.some((item) => item.slug === slug)) errors.push(`${where} missing related ${slug}`);
  }
  for (const link of term.external ?? []) {
    if (!link.label || typeof link.href !== "string" || !link.href.startsWith("https://")) {
      errors.push(`${where} bad external link`);
    }
  }
  const links = term.links ?? {};
  const known = [
    "rarities",
    "tags",
    "nameIncludes",
    "setSlugs",
    "setSeries",
    "abovePrinted",
    "allSets",
    "rarityIndex",
  ];
  for (const key of Object.keys(links)) {
    if (!known.includes(key)) errors.push(`${where} unknown link ${key}`);
  }
  for (const code of links.rarities ?? []) {
    const found = cardsMatching((_set, card) => card.rarity === code);
    if (!found.length) errors.push(`${where} rarity ${code} has no cards`);
  }
  for (const tag of links.tags ?? []) {
    const found = cardsMatching((_set, card) => card.tags.includes(tag));
    if (!found.length) errors.push(`${where} tag ${tag} has no cards`);
  }
  for (const part of links.nameIncludes ?? []) {
    const found = cardsMatching((_set, card) => (card.nameKo || "").includes(part));
    if (!found.length) errors.push(`${where} name ${part} has no cards`);
  }
  for (const slug of links.setSlugs ?? []) {
    if (!allSets.some((cardSet) => cardSet.slug === slug)) errors.push(`${where} missing set ${slug}`);
  }
  for (const series of links.setSeries ?? []) {
    if (!allSets.some((cardSet) => cardSet.series === series)) errors.push(`${where} missing series ${series}`);
  }
  if (links.abovePrinted) {
    const found = cardsMatching((cardSet, card) => {
      const number = Number(card.number);
      return Number.isFinite(number) && number > cardSet.printedTotal;
    });
    if (!found.length) errors.push(`${where} abovePrinted matched nothing`);
  }
  if (links.allSets && allSets.length === 0) errors.push(`${where} allSets but no sets`);
  if (links.rarityIndex != null && typeof links.rarityIndex !== "boolean") {
    errors.push(`${where} rarityIndex not boolean`);
  }
}

const codesInData = new Set();
for (const cardSet of allSets) {
  for (const card of cardSet.cards) {
    if (card.rarity) codesInData.add(card.rarity);
  }
}
for (const code of codesInData) {
  const covered = glossary.some(
    (term) => term.links?.rarities?.includes(code) || term.term === code || term.aliases?.includes(code),
  );
  if (!covered) errors.push(`rarity ${code} missing from glossary`);
}
for (const slug of ["irochi", "sealed", "sar", "hit", "ex", "mega", "ur", "fur"]) {
  if (!glossary.some((term) => term.slug === slug)) errors.push(`missing glossary term ${slug}`);
}

function slugsFor(query) {
  return glossary.filter((term) => glossaryMatches(term, query)).map((term) => term.slug);
}
function mustInclude(query, slug) {
  const found = slugsFor(query);
  if (!found.includes(slug)) errors.push(`query "${query}" missed ${slug}: ${found.join(",") || "(none)"}`);
}
function mustBe(query, slugs) {
  const found = slugsFor(query);
  if (found.join(",") !== slugs.join(",")) {
    errors.push(`query "${query}" got ${found.join(",") || "(none)"}, want ${slugs.join(",")}`);
  }
}
mustBe("이로치", ["irochi"]);
mustBe("shiny", ["irochi"]);
mustBe("색이 다른", ["irochi"]);
mustBe("실드전", ["sealed"]);
mustBe("sealed play", ["sealed"]);
mustBe("사르", ["sar"]);
mustBe("SAR", ["sar"]);
mustBe("special art rare", ["sar"]);
mustInclude("힛", "hit");
mustInclude("hit", "hit");
mustBe("노힛", ["no-hit"]);
mustBe("FUR", ["fur"]);
mustBe("futuristic rare", ["fur"]);
mustBe("ex", ["ex"]);
mustInclude("MEGA", "mega");
mustInclude("메가", "mega");
mustBe("한판", ["korean-print"]);
mustBe("일판", ["japanese-print"]);
mustBe("영판", ["english-print"]);
mustBe("포케카", ["pokeca"]);
mustBe("슬랩", ["slab"]);
mustInclude("시크릿", "secret");
mustBe("박스깡", ["box-break"]);
mustInclude("미개봉", "unopened");
mustInclude("UR", "ur");
mustBe("zzzz-not-a-term", []);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `ok m6 ${set.cards.length} cards, ${files.length} webp; m6a ${m6a.cards.length} cards, ${m6aFiles.length} webp; glossary ${glossary.length} terms`,
);
