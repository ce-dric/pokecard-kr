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

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok m6 ${set.cards.length} cards, ${files.length} webp; m6a ${m6a.cards.length} cards, ${m6aFiles.length} webp`);
console.log(`ok mee ${mee.cards.length} cards, ${meeFiles.length} webp`);
