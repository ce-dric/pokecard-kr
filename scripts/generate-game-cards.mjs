import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
const PUBLISHED = ["m6", "m6a", "mee", "mem", "mez"];
const index = new Map();
const sets = [];
const setDir = new URL("./src/data/sets/", root);
for (const name of readdirSync(setDir).filter((file) => file.endsWith(".json")).sort()) {
  const set = JSON.parse(readFileSync(new URL(name, setDir), "utf8"));
  sets.push(set);
  for (const card of set.cards) {
    const keys = [];
    if (card.jpNumber) keys.push(`${set.expansionMark}\0${normNumber(card.jpNumber)}`);
    // Basic energies are stored with a blank expansion mark and the type code as the number.
    if (!card.jpNumber && card.category === "energy" && ENERGY.has(card.number)) keys.push(`\0${card.number}`);
    for (const key of keys) {
      const list = index.get(key) || [];
      list.push({ set, card });
      index.set(key, list);
    }
  }
}

function engineKey(row) {
  return `${row.setCode}\0${normNumber(row.number)}`;
}

function pickLink(matches) {
  const verified = matches.filter((item) => item.card.nameStatus === "verified-kr" && item.card.nameKo);
  const pool = (verified.length ? verified : matches).slice().sort((a, b) => {
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
  const name = (value) => String(value || "").replaceAll("【", "").replaceAll("】", "").replace(/\s+/g, "");
  return name(left.nameJa) !== "" && name(left.nameJa) === name(right.nameJa) && left.stage === right.stage && left.hp === right.hp;
}

function preferredId(id) {
  const row = engineById.get(id);
  if (!row || index.has(engineKey(row))) return id;
  let chosen = null;
  for (const other of engineById.values()) {
    if (other.id === id || !samePrinting(row, other) || !index.has(engineKey(other))) continue;
    if (!chosen || other.id < chosen.id) chosen = other;
  }
  return chosen ? chosen.id : id;
}

const deckPath = new URL("./src/lib/ptcg/decks.json", root);
const decks = JSON.parse(readFileSync(deckPath, "utf8"));
let swapped = 0;
const nextDecks = decks.map((deck) => {
  const cards = deck.cards.map((id) => preferredId(id));
  const counts = new Map();
  for (const id of cards) counts.set(id, (counts.get(id) || 0) + 1);
  if ([...counts.values()].some((count) => count > 4)) return deck;
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
  if (index.has(engineKey(row))) wanted.add(row.id);
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
  const matches = index.get(engineKey(row));
  const prior = previous.cards?.[String(id)];
  const picture = !matches && prior && prior.setCode === row.setCode && prior.number === row.number ? prior.picture || null : null;
  cards[String(id)] = {
    id,
    setCode: row.setCode,
    number: row.number,
    nameJa: row.nameJa,
    link: matches ? pickLink(matches) : null,
    picture,
  };
}

const matches = Object.fromEntries(PUBLISHED.map((id) => [id, 0]));
for (const row of engineById.values()) {
  const found = index.get(engineKey(row)) || [];
  for (const setId of new Set(found.map((item) => item.set.id))) {
    if (setId in matches) matches[setId] += 1;
  }
}
const linked = Object.fromEntries(PUBLISHED.map((id) => [id, 0]));
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
const textOnly = Object.values(cards).filter((card) => !card.link && !card.picture).length;
console.log(`wrote ${Object.keys(cards).length} cards; linked ${JSON.stringify(linked)}; match ${JSON.stringify(matches)}`);
console.log(`deck slots rewritten ${swapped}; jp pictures kept ${withPicture}; text fallback ${textOnly}`);
