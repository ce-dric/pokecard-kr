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

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`ok ${set.cards.length} cards, ${files.length} webp, rarities match`);
