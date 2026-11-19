import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const setsDir = new URL("../data/sets/", import.meta.url);

function read(url) {
  return readFileSync(url, "utf8");
}

function rarityTables() {
  const source = read(new URL("./sets.ts", import.meta.url));
  const orderMatch = source.match(/export const rarityOrder = \[([^\]]+)\]/);
  const labelMatch = source.match(/export const rarityLabel: Record<string, string> = \{([^}]+)\}/);
  assert.ok(orderMatch, "rarityOrder");
  assert.ok(labelMatch, "rarityLabel");
  const order = [...orderMatch[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
  const labels = {};
  for (const item of labelMatch[1].matchAll(/([A-Z]+):\s*"([^"]*)"/g)) {
    labels[item[1]] = item[2];
  }
  return { order, labels };
}

function rarityCounts(set, order) {
  return order
    .map((code) => ({
      code,
      count: set.cards.filter((card) => card.rarity === code).length,
    }))
    .filter((row) => row.count > 0);
}

test("every printed rarity is listed in rarityOrder and rarityLabel", () => {
  const { order, labels } = rarityTables();
  assert.deepEqual(Object.keys(labels).sort(), [...order].sort());
  const names = readdirSync(setsDir).filter((name) => name.endsWith(".json"));
  assert.ok(names.includes("m2a.json"));
  for (const name of names) {
    const set = JSON.parse(read(new URL(name, setsDir)));
    const printed = [...new Set(set.cards.map((card) => card.rarity).filter(Boolean))];
    for (const code of printed) {
      assert.ok(order.includes(code), `${set.id} ${code} missing from rarityOrder`);
      assert.equal(typeof labels[code], "string", `${set.id} ${code} missing from rarityLabel`);
    }
  }
});

test("MEGA Dream ex MA cards reach the rarity index, glossary link, and set filter", () => {
  const { order, labels } = rarityTables();
  const set = JSON.parse(read(new URL("m2a.json", setsDir)));
  const ma = set.cards.filter((card) => card.rarity === "MA").map((card) => card.number);
  assert.deepEqual(ma, ["223", "224", "225", "226", "227", "228", "229", "230", "231", "232"]);
  assert.equal(labels.MA, "MA");
  assert.deepEqual(
    rarityCounts(set, order).find((row) => row.code === "MA"),
    { code: "MA", count: 10 },
  );

  const glossary = JSON.parse(read(new URL("../data/glossary.json", import.meta.url)));
  const term = glossary.find((item) => item.slug === "ma");
  assert.deepEqual(term.links.rarities, ["MA"]);

  const rarityPage = read(new URL("../pages/rarity.astro", import.meta.url));
  const setPage = read(new URL("../pages/sets/[slug].astro", import.meta.url));
  const glossaryPage = read(new URL("../pages/glossary/[slug].astro", import.meta.url));
  const glossaryLib = read(new URL("./glossary.ts", import.meta.url));
  assert.ok(rarityPage.includes("rarityCounts(set)"));
  assert.ok(rarityPage.includes("id={`${set.id}-${row.code}`}"));
  assert.ok(setPage.includes("const rarities = rarityCounts(set)"));
  assert.ok(setPage.includes("data-value={row.code}"));
  assert.ok(glossaryPage.includes("linkedRarities(term)"));
  assert.ok(glossaryLib.includes("#${set.id}-${code}"));
});
