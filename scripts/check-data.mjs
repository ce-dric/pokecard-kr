import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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
if (mem.packsPerBox !== 0 || mem.packPriceKr !== 17000 || mem.cardsPerPack !== 60) {
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

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `ok m6 ${set.cards.length} cards, ${files.length} webp; m6a ${m6a.cards.length} cards, ${m6aFiles.length} webp; mem ${mem.cards.length} cards, ${memFiles.length} webp`,
);
