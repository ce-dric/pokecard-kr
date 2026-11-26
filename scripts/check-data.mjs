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
const m6aExpected = { "": 134, RR: 10, AR: 20, SAR: 10, FUR: 2 };
const m6aCounts = {};
if (m6a.cardCount !== 176 || m6a.cards.length !== 176) {
  errors.push(`m6a card count ${m6a.cards.length}`);
}
if (m6a.printedTotal !== 103) errors.push(`m6a printed total ${m6a.printedTotal}`);
if (m6a.krProductUrl !== "https://pokemoncard.co.kr/card/960") {
  errors.push("m6a product url");
}
const m6aAllowedStatus = new Set(["verified-kr", "kr-store", "owner-blog"]);
const m6aNumbers = new Set();
for (const card of m6a.cards) {
  m6aCounts[card.rarity] = (m6aCounts[card.rarity] || 0) + 1;
  if (!m6aAllowedStatus.has(card.nameStatus) || !card.nameKo) {
    errors.push(`m6a ${card.number} missing Korean name`);
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
  if (card.nameStatus === "verified-kr" && card.imageSource) {
    errors.push(`m6a ${card.number} verified card should not set imageSource`);
  }
  if (card.nameStatus !== "verified-kr" && !card.imageSource) {
    errors.push(`m6a ${card.number} interim card missing imageSource`);
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
if (m6aFiles.length !== 352) errors.push(`m6a webp count ${m6aFiles.length}`);
for (const code of ["119", "128", "129", "131"]) {
  if (!m6aNumbers.has(code)) errors.push(`m6a missing verified secret ${code}`);
}
for (let n = 136; n <= 165; n++) {
  const code = String(n).padStart(3, "0");
  if (!m6aNumbers.has(code)) errors.push(`m6a missing reprint ${code}`);
}
for (const code of ["R", "G", "B"]) {
  const card = m6a.cards.find((item) => item.number === code);
  if (!card || card.printedIn !== "RGB" || card.nameKo !== "뮤" || card.nameStatus !== "owner-blog") {
    errors.push(`m6a missing ${code}/RGB Mew`);
  }
}

const memFile = new URL("../src/data/sets/mem.json", import.meta.url);
const mem = JSON.parse(readFileSync(memFile, "utf8"));
const memExpected = { "": 19 };
const memCounts = {};
const memWanted = [
  ...Array.from({ length: 18 }, (_, i) => String(i + 1).padStart(3, "0")),
  "GRA",
];
if (mem.cardCount !== 19 || mem.cards.length !== 19) errors.push(`mem card count ${mem.cards.length}`);
if (mem.printedTotal !== 17) errors.push(`mem printed total ${mem.printedTotal}`);
if (mem.krProductUrl !== "https://pokemoncard.co.kr/card/968") errors.push("mem product url");
if (mem.regulation !== "I, J") errors.push(`mem regulation ${mem.regulation}`);
if (mem.packsPerBox !== 1 || mem.packPriceKr !== 17000 || mem.cardsPerPack !== 60 || mem.boxPriceKr !== 0) {
  errors.push("mem deck product facts");
}
if (mem.cards.map((card) => card.number).join() !== memWanted.join()) errors.push("mem numbers");
for (const card of mem.cards) {
  memCounts[card.rarity] = (memCounts[card.rarity] || 0) + 1;
  if (card.nameStatus !== "verified-kr" || !card.nameKo) {
    errors.push(`mem ${card.number} missing verified Korean name`);
  }
  if (!card.category || !card.stage) errors.push(`mem ${card.number} missing category`);
  if (`${card.nameKo}${card.number}${mem.productNameKo}${mem.nameKo}`.includes("·")) {
    errors.push(`mem ${card.number} contains a middle dot`);
  }
  if (!card.krUrl.startsWith("https://pokemoncard.co.kr/cards/detail/BS2026009")) {
    errors.push(`mem ${card.number} missing official url`);
  }
  if (card.rarity !== "") errors.push(`mem ${card.number} rarity is not blank`);
  const full = join("public/images/cards/mem", card.image);
  const thumb = join("public/images/cards/mem", card.thumb);
  for (const path of [full, thumb]) {
    try {
      if (statSync(path).size < 1000) errors.push(`${path} too small`);
    } catch {
      errors.push(`missing ${path}`);
    }
  }
}
const memAnchors = {
  "005": ["마스카나 ex", "マスカーニャex", "50456", "005", 320],
  "010": ["이상한사탕", "ふしぎなアメ", "50462", "011", null],
  "011": ["포켓패드", "ポケパッド", "50463", "012", null],
  "012": ["하이퍼볼", "ハイパーボール", "50461", "010", null],
  "015": ["릴리에의 결심", "リーリエの決心", "50468", "017", null],
  "017": ["빛나", "ヒカリ", "50466", "015", null],
  "018": ["나오하", "ニャオハ", "50469", "018", 70],
  GRA: ["기본 풀 에너지", null, null, null, null],
};
for (const [number, [nameKo, nameJa, jpCardId, jpNumber, hp]] of Object.entries(memAnchors)) {
  const card = mem.cards.find((item) => item.number === number);
  if (
    !card ||
    card.nameKo !== nameKo ||
    card.nameJa !== nameJa ||
    card.jpCardId !== jpCardId ||
    card.jpNumber !== jpNumber ||
    card.hp !== hp
  ) {
    errors.push(`mem ${number} official pairing`);
  }
}
for (const [code, count] of Object.entries(memExpected)) {
  if (memCounts[code] !== count) {
    errors.push(`mem rarity ${code || "(empty)"} is ${memCounts[code] ?? 0}, expected ${count}`);
  }
}
const memFiles = readdirSync("public/images/cards/mem").filter((name) => name.endsWith(".webp"));
if (memFiles.length !== 38) errors.push(`mem webp count ${memFiles.length}`);

const meeFile = new URL("../src/data/sets/mee.json", import.meta.url);
const meeRaw = readFileSync(meeFile, "utf8");
if (meeRaw.includes("\u00b7")) errors.push("mee json contains a middle dot");
const mee = JSON.parse(meeRaw);
const meeNames = {
  "001": "쥬피썬더",
  "002": "로토무",
  "003": "빠모",
  "004": "빠모트",
  "005": "빠르모트",
  "006": "미라이돈",
  "007": "켄타로스",
  "008": "이브이",
  "009": "이브이 ex",
  "010": "딜리버드",
  "011": "이상한사탕",
  "012": "포켓패드",
  "013": "하이퍼볼",
  "014": "풍선",
  "015": "가이",
  "016": "릴리에의 결심",
  "017": "보스의 지령",
  "018": "빛나",
  "019": "저지맨",
  "020": "이브이",
  LIG: "기본 번개 에너지",
};
if (mee.id !== "mee" || mee.slug !== "mega-starter-eevee") errors.push("mee id");
if (mee.productNameKo !== "MEGA 스타터 세트 ex 「이브이 ex」") errors.push("mee product name");
if (mee.krProductUrl !== "https://pokemoncard.co.kr/card/966") errors.push("mee product url");
if (mee.releaseDateKr !== "2026-09-30" || mee.packPriceKr !== 17000) errors.push("mee release or price");
if (mee.packsPerBox !== 1 || mee.cardsPerPack !== 60 || mee.boxPriceKr !== 0) {
  errors.push("mee deck product facts");
}
if (mee.regulation !== "I, J") errors.push(`mee regulation ${mee.regulation}`);
const meeJp = {
  "011": ["ふしぎなアメ", "50423", "012"],
  "012": ["ポケパッド", "50424", "013"],
  "013": ["ハイパーボール", "50422", "011"],
  "016": ["リーリエの決心", "50430", "019"],
  "017": ["ボスの指令", "50429", "018"],
  "018": ["ヒカリ", "50428", "017"],
  "019": ["ジャッジマン", "50427", "016"],
  LIG: [null, null, null],
};
for (const [number, [nameJa, jpCardId, jpNumber]] of Object.entries(meeJp)) {
  const card = mee.cards.find((item) => item.number === number);
  if (!card || card.nameJa !== nameJa || card.jpCardId !== jpCardId || card.jpNumber !== jpNumber) {
    errors.push(`mee ${number} Japanese pairing`);
  }
}
if (mee.cardCount !== 21 || mee.cards.length !== 21) errors.push(`mee card count ${mee.cards.length}`);
if (mee.printedTotal !== 19) errors.push(`mee printed total ${mee.printedTotal}`);
const meeNumbers = mee.cards.map((card) => card.number);
const meeWanted = [...Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(3, "0")), "LIG"];
if (meeNumbers.join() !== meeWanted.join()) errors.push("mee numbers are not 001-020 then LIG");
for (const card of mee.cards) {
  if (card.nameStatus !== "verified-kr" || card.nameKo !== meeNames[card.number]) {
    errors.push(`mee ${card.number} name ${card.nameKo}`);
  }
  if (card.rarity !== "") errors.push(`mee ${card.number} rarity was not on the detail page`);
  if (!card.category || !card.stage) errors.push(`mee ${card.number} missing category`);
  const idSuffix = card.number === "LIG" ? "021" : card.number;
  if (card.krCardId !== `BS2026007${idSuffix}`) errors.push(`mee ${card.number} card id`);
  if (!card.krUrl.startsWith("https://pokemoncard.co.kr/cards/detail/BS2026007")) {
    errors.push(`mee ${card.number} missing official url`);
  }
  if (card.number === "LIG") {
    if (card.printedIn !== "" || card.category !== "energy" || card.type !== "electric") {
      errors.push("mee LIG energy fields");
    }
  } else if (card.printedIn !== "019") {
    errors.push(`mee ${card.number} printedIn`);
  }
  const full = join("public/images/cards/mee", card.image);
  const thumb = join("public/images/cards/mee", card.thumb);
  for (const path of [full, thumb]) {
    try {
      if (statSync(path).size < 1000) errors.push(`${path} too small`);
    } catch {
      errors.push(`missing ${path}`);
    }
  }
}
const meeFiles = readdirSync("public/images/cards/mee").filter((name) => name.endsWith(".webp"));
if (meeFiles.length !== 42) errors.push(`mee webp count ${meeFiles.length}`);

const mezFile = new URL("../src/data/sets/mez.json", import.meta.url);
const mezRaw = readFileSync(mezFile, "utf8");
if (mezRaw.includes("\u00b7")) errors.push("mez json contains a middle dot");
const mez = JSON.parse(mezRaw);
const mezNames = {
  "001": "샤프니아",
  "002": "샤크니아",
  "003": "다크라이",
  "004": "쌔비냥",
  "005": "레파르다스",
  "006": "조로아",
  "007": "조로아크 ex",
  "008": "모르페코",
  "009": "자루도",
  "010": "딜리버드",
  "011": "크래시 해머",
  "012": "포켓패드",
  "013": "하이퍼볼",
  "014": "풍선",
  "015": "가이",
  "016": "릴리에의 결심",
  "017": "보스의 지령",
  "018": "아이리스의 투지",
  "019": "저지맨",
  "020": "조로아",
  DAR: "기본 악 에너지",
};
if (mez.id !== "mez" || mez.slug !== "mega-starter-zorua-zoroark") errors.push("mez id");
if (mez.productNameKo !== "MEGA 스타터 세트 ex 「조로아&조로아크 ex」") errors.push("mez product name");
if (mez.krProductUrl !== "https://pokemoncard.co.kr/card/967") errors.push("mez product url");
if (mez.releaseDateKr !== "2026-09-30" || mez.packPriceKr !== 17000) errors.push("mez release or price");
if (mez.packsPerBox !== 1 || mez.cardsPerPack !== 60 || mez.boxPriceKr !== 0) {
  errors.push("mez deck product facts");
}
if (mez.regulation !== "I, J") errors.push(`mez regulation ${mez.regulation}`);
const mezJp = {
  "006": ["ゾロア", "50437", "006"],
  "012": ["ポケパッド", "50444", "013"],
  "013": ["ハイパーボール", "50443", "012"],
  "015": ["ガイ", "50447", "016"],
  "016": ["リーリエの決心", "50450", "019"],
  "017": ["ボスの指令", "50449", "018"],
  "018": ["アイリスの闘志", "50446", "015"],
  "019": ["ジャッジマン", "50448", "017"],
  "020": ["ゾロア", "50451", "020"],
  DAR: [null, null, null],
};
for (const [number, [nameJa, jpCardId, jpNumber]] of Object.entries(mezJp)) {
  const card = mez.cards.find((item) => item.number === number);
  if (!card || card.nameJa !== nameJa || card.jpCardId !== jpCardId || card.jpNumber !== jpNumber) {
    errors.push(`mez ${number} Japanese pairing`);
  }
}
if (mez.cardCount !== 21 || mez.cards.length !== 21) errors.push(`mez card count ${mez.cards.length}`);
if (mez.printedTotal !== 19) errors.push(`mez printed total ${mez.printedTotal}`);
const mezNumbers = mez.cards.map((card) => card.number);
const mezWanted = [...Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(3, "0")), "DAR"];
if (mezNumbers.join() !== mezWanted.join()) errors.push("mez numbers are not 001-020 then DAR");
for (const card of mez.cards) {
  if (card.nameStatus !== "verified-kr" || card.nameKo !== mezNames[card.number]) {
    errors.push(`mez ${card.number} name ${card.nameKo}`);
  }
  if (card.rarity !== "") errors.push(`mez ${card.number} rarity was not on the detail page`);
  if (!card.category || !card.stage) errors.push(`mez ${card.number} missing category`);
  const idSuffix = card.number === "DAR" ? "021" : card.number;
  if (card.krCardId !== `BS2026008${idSuffix}`) errors.push(`mez ${card.number} card id`);
  if (!card.krUrl.startsWith("https://pokemoncard.co.kr/cards/detail/BS2026008")) {
    errors.push(`mez ${card.number} missing official url`);
  }
  if (card.number === "DAR") {
    if (card.printedIn !== "" || card.category !== "energy" || card.type !== "dark") {
      errors.push("mez DAR energy fields");
    }
  } else if (card.printedIn !== "019") {
    errors.push(`mez ${card.number} printedIn`);
  }
  const full = join("public/images/cards/mez", card.image);
  const thumb = join("public/images/cards/mez", card.thumb);
  for (const path of [full, thumb]) {
    try {
      if (statSync(path).size < 1000) errors.push(`${path} too small`);
    } catch {
      errors.push(`missing ${path}`);
    }
  }
}
const mezEx = mez.cards.find((card) => card.number === "007");
if (!mezEx || !mezEx.tags.includes("포켓몬 ex")) errors.push("mez 007 tag");
const mezFiles = readdirSync("public/images/cards/mez").filter((name) => name.endsWith(".webp"));
if (mezFiles.length !== 42) errors.push(`mez webp count ${mezFiles.length}`);

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
mustBe("RR", ["rr"]);
mustBe("SR", ["sr"]);
mustBe("specialart", ["sar"]);
mustBe("nohit", ["no-hit"]);
mustBe("zzzz-not-a-term", []);

const megaTerm = glossary.find((term) => term.slug === "mega");
const megaText = (megaTerm?.definition ?? []).join(" ");
if (!megaText.includes("확장팩") || !megaText.includes("스타터 세트")) {
  errors.push("glossary mega should say product names vary between 확장팩 and 스타터 세트");
}
if (megaText.includes("MEGA 확장팩이라고 적혀")) {
  errors.push("glossary mega still says every Korean product name is MEGA 확장팩");
}
if (!(megaTerm?.links?.setSeries ?? []).includes("MEGA")) errors.push("glossary mega missing MEGA series link");
for (const id of ["m6", "m6a", "mee", "mem", "mez"]) {
  const cardSet = allSets.find((item) => item.id === id);
  if (!cardSet || cardSet.series !== "MEGA") errors.push(`glossary mega series missing ${id}`);
}

const exTags = glossary.find((term) => term.slug === "ex")?.links?.tags ?? [];
for (const id of ["mee", "mem", "mez"]) {
  const cardSet = allSets.find((item) => item.id === id);
  const tagged = cardSet?.cards.filter((card) => exTags.some((tag) => card.tags.includes(tag))) ?? [];
  if (!tagged.length) errors.push(`glossary ex matched no ${id} cards`);
}

if (!glossary.find((term) => term.slug === "secret")?.links?.abovePrinted) {
  errors.push("glossary secret missing abovePrinted");
}
for (const id of ["mee", "mem", "mez"]) {
  const cardSet = allSets.find((item) => item.id === id);
  const extra =
    cardSet?.cards.filter((card) => {
      const number = Number(card.number);
      return Number.isFinite(number) && number > cardSet.printedTotal;
    }) ?? [];
  if (!extra.length) errors.push(`glossary secret matched no ${id} cards`);
}
for (const slug of ["korean-print", "japanese-print"]) {
  if (!glossary.find((term) => term.slug === slug)?.links?.allSets) {
    errors.push(`${slug} should link every set, including the starter sets`);
  }
}

const sealedHref = glossary.find((term) => term.slug === "sealed")?.external?.[0]?.href ?? "";
if (!sealedHref.includes("/menu830")) errors.push(`glossary sealed href ${sealedHref || "(none)"}`);
if (sealedHref.includes("menu785")) errors.push("glossary sealed still cites menu785");

const gameCards = JSON.parse(readFileSync(new URL("../src/data/game-cards.json", import.meta.url), "utf8"));
const gameDecks = JSON.parse(readFileSync(new URL("../src/lib/ptcg/decks.json", import.meta.url), "utf8"));
const setsById = new Map(allSets.map((item) => [item.id, item]));
const basicEnergy = new Set(["GRA", "FIR", "WAT", "LIG", "PSY", "FIG", "DAR", "MET"]);
const standardMarks = new Set(["H", "I", "J"]);
const gameDeckIds = new Set();
for (const deck of gameDecks) {
  if (deck.cards.length !== 60) errors.push(`game deck ${deck.id} has ${deck.cards.length} cards`);
  if (`${deck.titleKo}${deck.faceEn}`.includes("\u00b7")) errors.push(`game deck ${deck.id} contains a middle dot`);
  for (const id of deck.cards) {
    gameDeckIds.add(id);
    const row = gameCards.cards?.[String(id)];
    if (!row) {
      errors.push(`game deck ${deck.id} missing mapping for ${id}`);
      continue;
    }
    if (!row.link?.nameKo || !row.link.image) {
      errors.push(`game deck ${deck.id} card ${id} missing Korean link`);
      continue;
    }
    if (row.link.nameKo.includes("\u00b7")) errors.push(`game card ${id} Korean name has a middle dot`);
    const linkedSet = setsById.get(row.link.setId);
    const linkedCard = linkedSet?.cards.find((card) => card.number === row.link.number);
    if (!linkedSet || !linkedCard || linkedCard.nameStatus !== "verified-kr" || linkedCard.nameKo !== row.link.nameKo) {
      errors.push(`game card ${id} link is not a verified Korean name`);
      continue;
    }
    const basic = !row.setCode && basicEnergy.has(row.number);
    const mark = linkedCard.regulation == null ? "" : String(linkedCard.regulation);
    const setMarks = String(linkedSet.regulation || "")
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const setOk = setMarks.length > 0 && setMarks.every((item) => standardMarks.has(item));
    if (!(basic || standardMarks.has(mark) || ((mark === "" || mark == null) && setOk))) {
      errors.push(`game deck card ${id} is not Standard H/I/J (${mark || linkedSet.regulation})`);
    }
  }
}
if (gameDeckIds.size < 20) errors.push(`game decks cover too few unique cards (${gameDeckIds.size})`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `ok m6 ${set.cards.length} cards, ${files.length} webp; m6a ${m6a.cards.length} cards, ${m6aFiles.length} webp; mem ${mem.cards.length} cards, ${memFiles.length} webp; mee ${mee.cards.length} cards, ${meeFiles.length} webp; mez ${mez.cards.length} cards, ${mezFiles.length} webp; glossary ${glossary.length} terms; game decks ${gameDecks.length}`,
);
