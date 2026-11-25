import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exceedsCopyLimit } from "./copy-limit.mjs";

const COMMIT = "26fd4e3df0e5a9d943560c027ddada40320059cc";
const CSV_PATH = "rl-train/engine/JP_Card_Data_R2_full.csv";
const CSV_URL = `https://raw.githubusercontent.com/nikephorosphokas99/ptcg-ai-sim/${COMMIT}/${CSV_PATH}`;
const root = new URL("../", import.meta.url);

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? "" : process.argv[index + 1] || "";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => cell !== ""));
}

function normNumber(value) {
  const head = String(value ?? "").trim().split("/")[0];
  if (/^\d+$/.test(head)) return String(Number(head)).padStart(3, "0");
  return head;
}

function clean(value) {
  if (!value) return null;
  if (value.includes("\u00b7")) return null;
  return value;
}

const csvPath = argValue("--csv");
const csvText = csvPath
  ? readFileSync(csvPath, "utf8")
  : await (await fetch(CSV_URL)).text();
const table = parseCsv(csvText);
const header = table[0];
const idCol = header.indexOf("カード ID");
const nameCol = header.indexOf("カード名");
const codeCol = header.indexOf("エキスパンションマーク");
const numberCol = header.indexOf("コレクション番号");
const stageCol = header.findIndex((name) => name.startsWith("ポケモンの進化の段階"));
const hpCol = header.indexOf("HP");
if (idCol < 0 || codeCol < 0 || numberCol < 0) {
  throw new Error("JP card CSV is missing id, set code, or number columns");
}

const engineById = new Map();
for (const cells of table.slice(1)) {
  const id = Number(cells[idCol]);
  if (!id || engineById.has(id)) continue;
  engineById.set(id, {
    id,
    setCode: (cells[codeCol] || "").trim(),
    number: (cells[numberCol] || "").trim(),
    nameJa: clean((cells[nameCol] || "").trim()),
    stage: stageCol < 0 ? "" : (cells[stageCol] || "").trim(),
    hp: hpCol < 0 ? "" : (cells[hpCol] || "").trim(),
  });
}

const ENERGY = new Set(["GRA", "FIR", "WAT", "LIG", "PSY", "FIG", "DAR", "MET"]);
const STANDARD_MARKS = new Set(["H", "I", "J", ""]);
const index = new Map();
const nameJaIndex = new Map();
const sets = [];
const setDir = new URL("./src/data/sets/", root);

function foldJa(value) {
  return String(value || "").replaceAll("【", "").replaceAll("】", "").replace(/\s+/g, "");
}

for (const name of readdirSync(setDir).filter((file) => file.endsWith(".json")).sort()) {
  const set = JSON.parse(readFileSync(new URL(name, setDir), "utf8"));
  sets.push(set);
  for (const card of set.cards) {
    const entry = { set, card };
    const keys = [];
    if (card.jpNumber) keys.push(`${set.expansionMark}\0${normNumber(card.jpNumber)}`);
    // Basic energies are stored with a blank expansion mark and the type code as the number.
    if (!card.jpNumber && card.category === "energy" && ENERGY.has(card.number)) keys.push(`\0${card.number}`);
    for (const key of keys) {
      const list = index.get(key) || [];
      list.push(entry);
      index.set(key, list);
    }
    // Official Korean rows that already carry nameJa can fill gaps when the
    // engine printing's set code + number are not paired in our set JSON yet.
    if (card.nameStatus === "verified-kr" && card.nameKo && card.nameJa) {
      const ja = foldJa(card.nameJa);
      if (!ja || ja.includes("\u00b7")) continue;
      const list = nameJaIndex.get(ja) || [];
      list.push(entry);
      nameJaIndex.set(ja, list);
    }
  }
}

function engineKey(row) {
  return `${row.setCode}\0${normNumber(row.number)}`;
}

function findMatches(row) {
  const byKey = index.get(engineKey(row));
  if (byKey?.length) return byKey;
  const ja = foldJa(row.nameJa);
  if (!ja) return [];
  return nameJaIndex.get(ja) || [];
}

function setMarksOnlyStandard(set) {
  const marks = String(set.regulation || "")
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return marks.length > 0 && marks.every((mark) => STANDARD_MARKS.has(mark) && mark !== "");
}

function standardRank(item) {
  const mark = item.card.regulation == null ? "" : String(item.card.regulation);
  if (mark === "H" || mark === "I" || mark === "J") return 0;
  if (mark === "" && item.card.category === "energy" && ENERGY.has(item.card.number)) return 0;
  if ((mark === "" || mark == null) && setMarksOnlyStandard(item.set)) return 1;
  return 2;
}

function pickLink(matches) {
  const verified = matches.filter((item) => item.card.nameStatus === "verified-kr" && item.card.nameKo);
  const pool = (verified.length ? verified : matches).slice().sort((a, b) => {
    const byMark = standardRank(a) - standardRank(b);
    if (byMark) return byMark;
    const byDate = b.set.releaseDateKr.localeCompare(a.set.releaseDateKr);
    return byDate || a.card.number.localeCompare(b.card.number);
  });
  const chosen = pool[0];
  const nameKo = chosen.card.nameStatus === "verified-kr" && chosen.card.nameKo
    ? clean(chosen.card.halfKo ? `${chosen.card.nameKo} ${chosen.card.halfKo}` : chosen.card.nameKo)
    : null;
  return {
    setId: chosen.set.id,
    slug: chosen.set.slug,
    number: chosen.card.number,
    nameKo,
    image: `images/cards/${chosen.set.id}/${chosen.card.thumb}`,
  };
}

function samePrinting(left, right) {
  return foldJa(left.nameJa) !== "" && foldJa(left.nameJa) === foldJa(right.nameJa) && left.stage === right.stage && left.hp === right.hp;
}

function preferredId(id) {
  const row = engineById.get(id);
  if (!row || findMatches(row).length) return id;
  let chosen = null;
  for (const other of engineById.values()) {
    if (other.id === id || !samePrinting(row, other) || !findMatches(other).length) continue;
    if (!chosen || other.id < chosen.id) chosen = other;
  }
  return chosen ? chosen.id : id;
}

function basicEnergyId(id) {
  const row = engineById.get(id);
  return Boolean(row && row.setCode === "" && ENERGY.has(row.number));
}

const deckPath = new URL("./src/lib/ptcg/decks.json", root);
const decks = JSON.parse(readFileSync(deckPath, "utf8"));
let swapped = 0;
const nextDecks = decks.map((deck) => {
  const cards = deck.cards.map((id) => preferredId(id));
  // The engine allows any number of one basic energy. Counting those copies
  // would discard every other remap in an energy-heavy deck.
  if (exceedsCopyLimit(cards, basicEnergyId)) return deck;
  const changes = cards.filter((id, index) => id !== deck.cards[index]).length;
  if (!changes) return deck;
  swapped += changes;
  return { ...deck, cards };
});
if (swapped) writeFileSync(deckPath, `${JSON.stringify(nextDecks, null, 2)}\n`);

const starterIds = new Set(["mee", "mem", "mez"]);
for (const set of sets) {
  if (!starterIds.has(set.id)) continue;
  const missing = set.cards.filter((card) => {
    const key = card.jpNumber
      ? `${set.expansionMark}\0${normNumber(card.jpNumber)}`
      : card.category === "energy" && ENERGY.has(card.number)
        ? `\0${card.number}`
        : "";
    if (!key) return true;
    return ![...engineById.values()].some((row) => engineKey(row) === key);
  });
  console.log(`starter ${set.id}: engine misses ${missing.length} of ${set.cards.length} printed cards`);
}

const wanted = new Set();
for (const deck of nextDecks) for (const id of deck.cards) wanted.add(id);
for (const row of engineById.values()) {
  if (findMatches(row).length) wanted.add(row.id);
}

const dest = new URL("./src/data/game-cards.json", root);
let previous = { cards: {} };
try {
  previous = JSON.parse(readFileSync(dest, "utf8"));
} catch {
  previous = { cards: {} };
}

const cards = {};
for (const id of [...wanted].sort((a, b) => a - b)) {
  const row = engineById.get(id) || { id, setCode: "", number: "", nameJa: null };
  const matches = findMatches(row);
  const prior = previous.cards?.[String(id)];
  const picture = !matches.length && prior && prior.setCode === row.setCode && prior.number === row.number ? prior.picture || null : null;
  cards[String(id)] = {
    id,
    setCode: row.setCode,
    number: row.number,
    nameJa: row.nameJa,
    link: matches.length ? pickLink(matches) : null,
    picture,
  };
}

const setIds = sets.map((set) => set.id).sort();
const matches = Object.fromEntries(setIds.map((id) => [id, 0]));
for (const row of engineById.values()) {
  const found = findMatches(row);
  for (const setId of new Set(found.map((item) => item.set.id))) {
    if (setId in matches) matches[setId] += 1;
  }
}
const linked = Object.fromEntries(setIds.map((id) => [id, 0]));
for (const card of Object.values(cards)) {
  const setId = card.link?.setId;
  if (setId && setId in linked) linked[setId] += 1;
}

const output = {
  source: {
    repo: "https://github.com/nikephorosphokas99/ptcg-ai-sim",
    commit: COMMIT,
    csv: CSV_PATH,
    matches,
    linked,
  },
  cards,
};
writeFileSync(dest, `${JSON.stringify(output, null, 2)}\n`);
const withPicture = Object.values(cards).filter((card) => card.picture).length;
const withLink = Object.values(cards).filter((card) => card.link).length;
const textOnly = Object.values(cards).filter((card) => !card.link && !card.picture).length;
console.log(`wrote ${Object.keys(cards).length} cards; linked ${withLink}; jp pictures ${withPicture}; text fallback ${textOnly}`);
console.log(`deck slots rewritten ${swapped}; linked by set ${JSON.stringify(Object.fromEntries(Object.entries(linked).filter(([, n]) => n)))}`);
