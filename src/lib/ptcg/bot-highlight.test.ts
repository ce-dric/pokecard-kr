import assert from "node:assert/strict";
import test from "node:test";
import { boardHighlights, flashClass } from "./bot-highlight.ts";
import type { FaceCard, GameView, SideView } from "./view.ts";

const card = (name: string, extras: Partial<FaceCard> = {}): FaceCard => ({
  name,
  nameKo: name,
  image: null,
  fullImage: null,
  hp: 60,
  maxHp: 60,
  energies: [],
  kind: "포켓몬",
  typeLabel: null,
  ...extras,
});

function side(active: FaceCard[], bench: FaceCard[] = [], extras: Partial<SideView> = {}): SideView {
  return {
    active,
    bench,
    hand: null,
    handCount: 5,
    prizeCount: 6,
    discard: [],
    discardCount: 0,
    deckCount: 40,
    conditions: [],
    ...extras,
  };
}

function view(opp: SideView, you: SideView = side([card("나")]), stadium: FaceCard | null = null): GameView {
  return {
    phase: "choose",
    prompt: "x",
    minCount: 0,
    maxCount: 0,
    options: [],
    log: ["상대 턴", "상대 부착 기본 물 에너지"],
    you,
    opp,
    turn: 2,
    resultText: null,
    stadium,
  };
}

test("boardHighlights marks opponent active and energy changes", () => {
  const before = view(side([card("이브이")]));
  const after = view(side([card("이브이", { energies: ["water"] })]));
  const marks = boardHighlights(before, after);
  assert.ok(marks.some((row) => row.side === "opp" && row.zone === "active"));
  assert.equal(flashClass(marks, "opp", "active").includes("ptcg-flash"), true);
  assert.equal(flashClass(marks, "opp", "hand").includes("ptcg-flash"), false);
});

test("boardHighlights marks a newly filled bench slot", () => {
  const before = view(side([card("배틀")], []));
  const after = view(side([card("배틀")], [card("벤치")]));
  const marks = boardHighlights(before, after);
  assert.deepEqual(
    marks.filter((row) => row.zone === "bench"),
    [{ side: "opp", zone: "bench", index: 0 }],
  );
});

test("boardHighlights marks stadium changes on the table", () => {
  const before = view(side([card("배틀")]));
  const after = view(side([card("배틀")]), side([card("나")]), card("스타디움"));
  const marks = boardHighlights(before, after);
  assert.ok(marks.some((row) => row.side === "table" && row.zone === "stadium"));
});
