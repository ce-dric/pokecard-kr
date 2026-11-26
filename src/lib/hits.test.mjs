import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  HITS_NAV_LABEL,
  cardTitle,
  describeHit,
  existingOdds,
  groupSetsBySeries,
  hitGroups,
  hitNote,
  hitRankHighFirst,
  hitsIndexPath,
  hitsSetPath,
  isHitRarity,
  isStarterSet,
} from "./hits.mjs";

const root = join(new URL(".", import.meta.url).pathname, "../..");
const middleDot = "\u00b7";

function loadSet(id) {
  return JSON.parse(readFileSync(join(root, "src/data/sets", `${id}.json`), "utf8"));
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

const m6 = loadSet("m6");
const m6a = loadSet("m6a");
const mee = loadSet("mee");
const mem = loadSet("mem");
const mez = loadSet("mez");

test("nav label is 힛카드 without a middle dot", () => {
  assert.equal(HITS_NAV_LABEL, "\uD79B\uCE74\uB4DC");
  assert.equal(HITS_NAV_LABEL.includes(middleDot), false);
  assert.notEqual(HITS_NAV_LABEL, "\uD78B\uCE74\uB4DC");
});

test("hit rarities are the high symbols in the data, highest first", () => {
  assert.equal(isHitRarity("AR"), true);
  assert.equal(isHitRarity("SR"), true);
  assert.equal(isHitRarity("SAR"), true);
  assert.equal(isHitRarity("UR"), true);
  assert.equal(isHitRarity("MUR"), true);
  assert.equal(isHitRarity("FUR"), true);
  assert.equal(isHitRarity("ZZ"), true);
  assert.equal(isHitRarity("C"), false);
  assert.equal(isHitRarity("U"), false);
  assert.equal(isHitRarity("R"), false);
  assert.equal(isHitRarity("RR"), false);
  assert.equal(isHitRarity("RRR"), false);
  assert.equal(isHitRarity("ACE"), false);
  assert.equal(isHitRarity("TR"), false);
  assert.equal(isHitRarity(""), false);
  assert.equal(isHitRarity(null), false);

  const order = [...read("src/lib/sets.ts").matchAll(/rarityOrder = \[([^\]]+)\]/g)][0][1];
  const ranked = [...order.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const expected = ranked.filter((code) => isHitRarity(code)).reverse();
  assert.deepEqual(
    hitRankHighFirst.filter((code) => ranked.includes(code)),
    expected,
  );

  assert.deepEqual(
    hitGroups(m6).map((group) => group.code),
    ["MUR", "SAR", "SR", "AR"],
  );
  assert.deepEqual(
    hitGroups(m6).map((group) => group.cards.length),
    [1, 6, 18, 12],
  );
  assert.deepEqual(
    hitGroups(m6a).map((group) => [group.code, group.cards.length]),
    [
      ["FUR", 2],
      ["SAR", 10],
      ["AR", 20],
    ],
  );
  for (const set of [m6, m6a]) {
    for (const group of hitGroups(set)) {
      const source = set.cards.filter((card) => card.rarity === group.code).map((card) => card.number);
      assert.deepEqual(
        group.cards.map((card) => card.number),
        source,
      );
      for (const card of group.cards) {
        assert.equal(card.nameKo, set.cards.find((item) => item.number === card.number).nameKo);
      }
    }
  }
});

test("starter decks and sets without hit rarities keep a note and no cards", () => {
  for (const set of [mee, mem, mez]) {
    assert.equal(isStarterSet(set), true);
    assert.deepEqual(hitGroups(set), []);
    const note = hitNote(set);
    assert.match(note, /스타터 세트/);
    assert.match(note, /레어도 표기가 없어/);
    assert.equal(note.includes(middleDot), false);
  }
  assert.equal(hitNote(m6), "");
  assert.equal(isStarterSet(m6), false);
  assert.equal(isStarterSet(m6a), false);

  const starterWithHit = {
    ...mee,
    cards: [{ number: "001", rarity: "SAR", nameKo: "테스트", nameStatus: "verified-kr" }],
  };
  assert.deepEqual(hitGroups(starterWithHit), []);
  const starterNote = hitNote(starterWithHit);
  assert.match(starterNote, /스타터 세트/);
  assert.equal(starterNote.includes("레어도 표기가 없어"), false);

  const commonsOnly = {
    id: "xx",
    packsPerBox: 30,
    productNameKo: "확장팩",
    nameKo: "테스트",
    cards: [
      { number: "001", rarity: "RR", nameKo: "있는이름", nameStatus: "verified-kr" },
      { number: "002", rarity: "C", nameKo: "있는이름", nameStatus: "verified-kr" },
    ],
  };
  assert.deepEqual(hitGroups(commonsOnly), []);
  assert.match(hitNote(commonsOnly), /힛카드로 모을 레어도가 없습니다/);

  const blank = {
    id: "yy",
    packsPerBox: 20,
    productNameKo: "확장팩",
    nameKo: "빈레어",
    cards: [{ number: "001", rarity: "", nameKo: "있는이름", nameStatus: "verified-kr" }],
  };
  assert.match(hitNote(blank), /레어도 표기가 없어/);
  assert.equal(hitNote(blank).includes("스타터"), false);

  const extra = {
    id: "zz",
    packsPerBox: 20,
    productNameKo: "확장팩",
    nameKo: "특수",
    cards: [
      { number: "010", rarity: "AR", nameKo: "가", nameStatus: "verified-kr" },
      { number: "002", rarity: "ZZ", nameKo: "세트기호", nameStatus: "verified-kr" },
      { number: "001", rarity: "RR", nameKo: "제외", nameStatus: "verified-kr" },
    ],
  };
  assert.deepEqual(
    hitGroups(extra).map((group) => [group.code, group.cards.map((card) => card.nameKo)]),
    [
      ["AR", ["가"]],
      ["ZZ", ["세트기호"]],
    ],
  );
});

test("pull odds are copied only from existing text fields", () => {
  assert.equal(existingOdds(m6), "");
  assert.equal(existingOdds(m6a), "");
  assert.equal(existingOdds({ packPriceKr: 1500, boxPriceKr: 45000, cardsPerPack: 5 }), "");
  assert.equal(existingOdds({ odds: 0.03 }), "");
  assert.equal(existingOdds({ odds: "  " }), "");
  assert.equal(existingOdds({ pullOdds: " 데이터에 있는 문장 " }), "데이터에 있는 문장");
  for (const set of [m6, m6a, mee, mem, mez]) {
    for (const card of set.cards) assert.equal(existingOdds(card), "");
  }
});

test("dialog facts use the card fields and do not invent a name or rate", () => {
  const mur = m6.cards.find((card) => card.rarity === "MUR");
  const described = describeHit(mur, {
    rarityLabels: { MUR: "메가울트라레어", FUR: "FUR" },
    typeLabels: { colorless: "무색" },
  });
  assert.equal(described.title, mur.nameKo);
  assert.equal(described.japaneseFallback, false);
  assert.equal(described.facts.some((fact) => fact.label === "확률"), false);
  assert.equal(
    described.facts.find((fact) => fact.label === "레어도").value,
    "MUR 메가울트라레어",
  );
  assert.equal(described.facts.find((fact) => fact.label === "번호").value, `${mur.number}/${mur.printedIn}`);
  assert.equal(JSON.stringify(described).includes(middleDot), false);

  const fur = describeHit(
    { number: "134", printedIn: "103", rarity: "FUR", nameKo: "뮤츠 ex", nameStatus: "verified-kr" },
    { rarityLabels: { FUR: "FUR" } },
  );
  assert.equal(fur.facts.find((fact) => fact.label === "레어도").value, "FUR");

  const fallback = describeHit({
    number: "001",
    rarity: "AR",
    nameStatus: "ja-fallback",
    nameKo: null,
    nameJa: "ピカチュウ",
    halfKo: "좌측",
    categoryKo: "기본 포켓몬",
    type: "electric",
    typeKo: "번개",
    hp: null,
    illustrator: "  ",
    tags: [],
  }, { typeLabels: { electric: "번개" } });
  assert.equal(fallback.title, "ピカチュウ 좌측");
  assert.equal(fallback.japaneseFallback, true);
  assert.equal(cardTitle({ nameStatus: "ja-fallback", nameKo: null, nameJa: null }), "이름 미확인");
  assert.equal(fallback.facts.some((fact) => fact.label === "HP"), false);
  assert.equal(fallback.facts.some((fact) => fact.label === "일러스트"), false);
  assert.equal(fallback.facts.find((fact) => fact.label === "타입").value, "번개");

  const withOdds = describeHit({
    number: "002",
    rarity: "SR",
    nameKo: "있는이름",
    nameStatus: "verified-kr",
    illustrator: "A",
    hp: 120,
    pullRate: "데이터 문장 그대로",
  });
  assert.equal(withOdds.facts.find((fact) => fact.label === "확률").value, "데이터 문장 그대로");
  assert.equal(withOdds.facts.find((fact) => fact.label === "일러스트").value, "A");
  assert.equal(withOdds.facts.find((fact) => fact.label === "HP").value, "120");
});

test("index grouping keeps series order and routes use the set id", () => {
  const groups = groupSetsBySeries([
    { id: "a", series: "MEGA" },
    { id: "b", series: "MEGA" },
    { id: "c", series: "SV" },
  ]);
  assert.deepEqual(
    groups.map((group) => [group.series, group.sets.map((set) => set.id)]),
    [
      ["MEGA", ["a", "b"]],
      ["SV", ["c"]],
    ],
  );
  assert.equal(hitsIndexPath(), "hits/");
  assert.equal(hitsSetPath(m6), "hits/m6/");
  assert.equal(hitsSetPath(mee), "hits/mee/");
});

test("pages list 힛카드 and do not print a middle dot or a made-up rate", () => {
  const header = read("src/components/Header.astro");
  const setPage = read("src/pages/sets/[slug].astro");
  const indexPage = read("src/pages/hits/index.astro");
  const detailPage = read("src/pages/hits/[setId].astro");
  const glossary = JSON.parse(read("src/data/glossary.json"));
  const hitTerm = glossary.find((term) => term.slug === "hit");
  const pages = [header, setPage, indexPage, detailPage, JSON.stringify(hitTerm)];
  for (const source of pages) {
    assert.equal(source.includes(middleDot), false);
    assert.equal(source.includes("%"), false);
  }
  assert.match(header, /HITS_NAV_LABEL/);
  assert.equal(header.includes("\uD78B\uCE74\uB4DC"), false);
  assert.match(header, /hits\//);
  assert.match(setPage, /hitsSetPath|hits\//);
  assert.match(indexPage, /groupSetsBySeries/);
  assert.match(detailPage, /hitGroups/);
  assert.match(detailPage, /data-hit-dialog/);
  assert.match(detailPage, /cardHref|카드 페이지/);
  assert.equal(detailPage.includes("pokemoncard.co.kr"), false);
  assert.match(hitTerm.definition.join(" "), /힛카드 페이지/);
  assert.equal(hitTerm.definition.join(" ").includes("기준을 정하지 않고"), false);
});
