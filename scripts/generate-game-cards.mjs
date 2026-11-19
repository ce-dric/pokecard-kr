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
  });
}

const index = new Map();
const setDir = new URL("./src/data/sets/", root);
for (const name of readdirSync(setDir).filter((file) => file.endsWith(".json")).sort()) {
  const set = JSON.parse(readFileSync(new URL(name, setDir), "utf8"));
  for (const card of set.cards) {
    if (!card.jpNumber) continue;
    const key = `${set.expansionMark}\0${normNumber(card.jpNumber)}`;
    const list = index.get(key) || [];
    list.push({ set, card });
    index.set(key, list);
  }
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

const decks = JSON.parse(readFileSync(new URL("./src/lib/ptcg/decks.json", root), "utf8"));
const wanted = new Set();
for (const deck of decks) for (const id of deck.cards) wanted.add(id);
for (const row of engineById.values()) {
  const key = `${row.setCode}\0${normNumber(row.number)}`;
  if (index.has(key)) wanted.add(row.id);
}

const cards = {};
for (const id of [...wanted].sort((a, b) => a - b)) {
  const row = engineById.get(id) || { id, setCode: "", number: "", nameJa: null };
  const key = `${row.setCode}\0${normNumber(row.number)}`;
  const matches = index.get(key);
  cards[String(id)] = {
    id,
    setCode: row.setCode,
    number: row.number,
    nameJa: row.nameJa,
    link: matches ? pickLink(matches) : null,
  };
}

const output = {
  source: {
    repo: "https://github.com/nikephorosphokas99/ptcg-ai-sim",
    commit: COMMIT,
    csv: CSV_PATH,
  },
  cards,
};
const dest = new URL("./src/data/game-cards.json", root);
writeFileSync(dest, `${JSON.stringify(output, null, 2)}\n`);
const linked = Object.values(cards).filter((card) => card.link).length;
console.log(`wrote ${Object.keys(cards).length} cards, ${linked} linked to our sets`);
