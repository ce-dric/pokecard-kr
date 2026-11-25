import assert from "node:assert/strict";
import test from "node:test";
import {
  OFFICIAL_REGULATION_PDF,
  OFFICIAL_REGULATION_QNA,
  STANDARD_MARKS,
  cardRegulation,
  isStandardLegal,
  regulationStatus,
} from "./regulation.mjs";

const middleDot = "\u00b7";

test("official Standard marks are H, I, and J only", () => {
  assert.deepEqual([...STANDARD_MARKS], ["H", "I", "J"]);
});

test("cite official Korean regulation sources without a middle dot", () => {
  assert.equal(OFFICIAL_REGULATION_QNA, "https://pokemoncard.co.kr/card/play_qna");
  assert.match(OFFICIAL_REGULATION_PDF, /battle_regulation_2026/);
  assert.equal(OFFICIAL_REGULATION_QNA.includes(middleDot), false);
  assert.equal(OFFICIAL_REGULATION_PDF.includes(middleDot), false);
});

test("cardRegulation prefers the per-card mark, including a blank official mark", () => {
  assert.equal(cardRegulation({ regulation: "I" }, { regulation: "J" }), "I");
  assert.equal(cardRegulation({ regulation: "" }, { regulation: "J" }), "");
  assert.equal(cardRegulation({ regulation: null }, { regulation: "J" }), null);
});

test("cardRegulation falls back to a single set mark when the card field is missing", () => {
  assert.equal(cardRegulation({}, { regulation: "J" }), "J");
  assert.equal(cardRegulation({}, { regulation: "I, J" }), null);
  assert.equal(cardRegulation({}, { regulation: "G, H" }), null);
});

test("H I J marks are Standard legal for the Korean printing", () => {
  assert.equal(isStandardLegal({ regulation: "H", nameKo: "아무개" }, { regulation: "H" }), true);
  assert.equal(isStandardLegal({ regulation: "I", nameKo: "아무개" }, { regulation: "I" }), true);
  assert.equal(isStandardLegal({ regulation: "J", nameKo: "아무개" }, { regulation: "J" }), true);
});

test("older marks are legal only when named on the official exception list", () => {
  assert.equal(
    isStandardLegal({ regulation: "G", nameKo: "포켓몬 교체", category: "trainer" }, { regulation: "G" }),
    true,
  );
  assert.equal(
    isStandardLegal({ regulation: "G", nameKo: "용기의부적", category: "trainer" }, { regulation: "G" }),
    false,
  );
  assert.equal(
    isStandardLegal({ regulation: "G", nameKo: "보스의 지령", category: "trainer" }, { regulation: "G" }),
    true,
  );
});

test("basic Grass Fire Water Lightning Psychic Fighting Darkness Metal Energy are exception-legal", () => {
  for (const [type, nameKo] of [
    ["grass", "기본 풀 에너지"],
    ["fire", "기본 불꽃 에너지"],
    ["water", "기본 물 에너지"],
    ["electric", "기본 번개 에너지"],
    ["psychic", "기본 초 에너지"],
    ["fighting", "기본 격투 에너지"],
    ["dark", "기본 악 에너지"],
    ["steel", "기본 강철 에너지"],
  ]) {
    assert.equal(
      isStandardLegal(
        { regulation: "", nameKo, type, category: "energy", stage: "basic-energy", categoryKo: "기본 에너지" },
        { regulation: "J" },
      ),
      true,
      nameKo,
    );
  }
  assert.equal(
    isStandardLegal(
      {
        regulation: "",
        nameKo: "기본 페어리 에너지",
        type: "fairy",
        category: "energy",
        stage: "basic-energy",
        categoryKo: "기본 에너지",
      },
      { regulation: "J" },
    ),
    false,
  );
});

test("unknown marks stay unverified and never get a legal badge", () => {
  const status = regulationStatus({}, { regulation: "I, J" });
  assert.equal(status.mark, null);
  assert.equal(status.known, false);
  assert.equal(status.standardLegal, false);
  assert.equal(status.labelKo, "미확인");
});

test("blank official marks are known empty, not guessed", () => {
  const status = regulationStatus(
    { regulation: "", nameKo: "기본 풀 에너지", type: "grass", category: "energy", stage: "basic-energy" },
    { regulation: "J" },
  );
  assert.equal(status.mark, "");
  assert.equal(status.known, true);
  assert.equal(status.standardLegal, true);
  assert.equal(status.labelKo, "없음");
});

test("Korean status labels never use a middle dot", () => {
  const legal = regulationStatus({ regulation: "J", nameKo: "헤라크로스" }, { regulation: "J" });
  assert.equal(legal.standardLegal, true);
  assert.equal(legal.badgeKo.includes(middleDot), false);
  assert.equal(legal.citeKo.includes(middleDot), false);
});
