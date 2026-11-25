import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { boardHtml, EMPTY_UI } from "../src/lib/ptcg/battle-board.ts";
import type { FaceCard, GameView, SideView } from "../src/lib/ptcg/view.ts";

const SHOT_DIR = path.resolve("artifacts/issue-92");

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: false });
}

function face(name: string, id: number, extras: Partial<FaceCard> = {}): FaceCard {
  return {
    id,
    name,
    nameKo: name,
    image: "images/cards/m1s/016-thumb.webp",
    fullImage: "images/cards/m1s/016.webp",
    hp: 70,
    maxHp: 70,
    energies: ["water"],
    kind: "포켓몬",
    typeLabel: "물",
    tools: [],
    conditions: [],
    ex: false,
    megaEx: false,
    prizeValue: null,
    ...extras,
  };
}

function side(opts: {
  active: FaceCard[];
  bench: FaceCard[];
  hand: FaceCard[] | null;
  prizeCount: number;
  discard: FaceCard[];
  discardCount: number;
  deckCount: number;
}): SideView {
  return {
    active: opts.active,
    bench: opts.bench,
    hand: opts.hand,
    handCount: opts.hand ? opts.hand.length : 6,
    prizeCount: opts.prizeCount,
    discard: opts.discard,
    discardCount: opts.discardCount,
    deckCount: opts.deckCount,
    conditions: [],
  };
}

function midGameView(mode: "board" | "picker" | "bot"): GameView {
  const botTurn = mode === "bot";
  const hand = Array.from({ length: 8 }, (_, i) => face(`패${i + 1}`, 800 + i));
  const youBench = Array.from({ length: 5 }, (_, i) => face(`나벤치${i + 1}`, 720 + i));
  const oppBench = Array.from({ length: 4 }, (_, i) => face(`상대벤치${i + 1}`, 740 + i));
  return {
    phase: "choose",
    prompt: botTurn ? "상대가 고르는 중" : "할 일을 고르세요",
    context: 0,
    minCount: 1,
    maxCount: 1,
    interaction: botTurn ? "none" : mode === "picker" ? "picker" : "board",
    options: botTurn
      ? []
      : [
          {
            index: 0,
            label: "에너지 부착 기본 물 에너지",
            image: "images/cards/mem/001-thumb.webp",
            fullImage: "images/cards/mem/001.webp",
            kind: "attach",
            source: { playerIndex: 0, area: 2, index: 0 },
            target: { playerIndex: 0, area: 4, index: 0 },
          },
          {
            index: 1,
            label: "턴 종료",
            image: null,
            fullImage: null,
            kind: "end",
            source: null,
            target: null,
          },
        ],
    log: ["내 턴", "나 드로우"],
    turn: 4,
    resultText: null,
    stadium: null,
    you: side({
      active: [face("가이오가", 721)],
      bench: youBench,
      hand,
      prizeCount: 4,
      discard: [face("트래쉬", 900)],
      discardCount: 3,
      deckCount: 35,
    }),
    opp: side({
      active: [face("돌살이", 730)],
      bench: oppBench,
      hand: null,
      prizeCount: 5,
      discard: [face("상대트래쉬", 910), face("상대트래쉬2", 911)],
      discardCount: 2,
      deckCount: 38,
    }),
  };
}

function paintHtml(mode: "board" | "picker" | "bot"): string {
  const botTurn = mode === "bot";
  const html = boardHtml(midGameView(mode), "", {
    botTurn,
    ui: EMPTY_UI,
    muted: true,
  });
  // Node boardHtml resolves images against http://localhost/; preview serves under /pokecard-kr/.
  return html.replaceAll("http://localhost/", "/pokecard-kr/");
}

async function paintBattle(page: Page, mode: "board" | "picker" | "bot" = "board") {
  await page.goto("game/");
  const html = paintHtml(mode);
  await page.evaluate(
    ({ markup, bot }) => {
      const root = document.querySelector("[data-ptcg]");
      if (!(root instanceof HTMLElement)) return;
      document.documentElement.classList.add("ptcg-battle-active");
      document.body.classList.add("ptcg-battle-active");
      root.innerHTML = `<div data-board>${markup}</div>`;
      const battle = root.querySelector(".ptcg-battle");
      if (battle instanceof HTMLElement) {
        battle.style.setProperty("--safe-top", "47px");
        battle.style.setProperty("--safe-bottom", "20px");
        if (bot) battle.setAttribute("data-bot-turn", "true");
      }
      window.scrollTo(0, 0);
    },
    { markup: html, bot: mode === "bot" },
  );
}

async function assertNoOverlap(page: Page, a: string, b: string) {
  const hit = await page.evaluate(
    ({ a, b }) => {
      const left = document.querySelector(a);
      const right = document.querySelector(b);
      if (!(left instanceof HTMLElement) || !(right instanceof HTMLElement)) return true;
      const A = left.getBoundingClientRect();
      const B = right.getBoundingClientRect();
      return !(A.right <= B.left || B.right <= A.left || A.bottom <= B.top || B.bottom <= A.top);
    },
    { a, b },
  );
  expect(hit, `${a} overlaps ${b}`).toBeFalsy();
}

for (const { name, width, height } of [
  { name: "390x664", width: 390, height: 664 },
  { name: "390x750", width: 390, height: 750 },
]) {
  test.describe(`mid-game battle ${name}`, () => {
    test.use({
      viewport: { width, height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });

    test(`no overlap scroll bot sheet @ ${name}`, async ({ page }) => {
      await paintBattle(page, "board");
      await expect(page.locator(".ptcg-battle")).toBeVisible();

      const scroll = await page.evaluate(() => ({
        doc: document.documentElement.scrollHeight,
        body: document.body.scrollHeight,
        inner: window.innerHeight,
        battle: document.querySelector(".ptcg-battle")?.getBoundingClientRect().height || 0,
      }));
      expect(scroll.doc).toBeLessThanOrEqual(scroll.inner + 2);
      expect(scroll.battle).toBeGreaterThan(scroll.inner * 0.9);

      const hudTop = await page.locator(".ptcg-battle-hud").evaluate((el) => el.getBoundingClientRect().top);
      expect(hudTop).toBeGreaterThanOrEqual(0);
      const exitTop = await page.locator(".ptcg-hud-exit").evaluate((el) => el.getBoundingClientRect().top);
      expect(exitTop).toBeGreaterThanOrEqual(40);

      await assertNoOverlap(page, ".ptcg-playmat--opp .ptcg-zone--active", ".ptcg-playmat--opp .ptcg-zone--bench");
      await assertNoOverlap(page, ".ptcg-playmat--you .ptcg-zone--active", ".ptcg-playmat--you .ptcg-zone--bench");
      await assertNoOverlap(page, ".ptcg-playmat--you .ptcg-zone--bench", ".ptcg-zone--my-hand");
      await assertNoOverlap(page, ".ptcg-playmat--you .ptcg-zone--rails", ".ptcg-zone--my-hand");

      const trash = page.locator(".ptcg-playmat--you .ptcg-zone--trash, .ptcg-playmat--you .ptcg-rail-item.ptcg-zone--trash");
      await expect(trash.first()).toBeVisible();
      const trashBox = await trash.first().boundingBox();
      expect(trashBox?.height || 0).toBeGreaterThan(20);

      const handCards = page.locator(".ptcg-zone--my-hand .ptcg-fan-card, .ptcg-zone--my-hand .ptcg-card");
      await expect(handCards.first()).toBeVisible();
      const handCardBox = await handCards.first().boundingBox();
      expect(handCardBox?.height || 0).toBeGreaterThan(28);

      if (name === "390x664") await shot(page, "midgame-board-390x664");
      if (name === "390x750") await shot(page, "midgame-board-390x750");

      await paintBattle(page, "picker");
      await expect(page.locator("[data-action-sheet]:not([hidden])")).toBeVisible();
      await expect(page.locator(".ptcg-picker-card, .ptcg-option").first()).toBeVisible();
      if (name === "390x664") await shot(page, "action-sheet-390x664");

      await paintBattle(page, "bot");
      await expect(page.locator("[data-bot-turn='true']")).toBeVisible();
      await expect(page.locator(".ptcg-bot-banner")).toBeVisible();
      await expect(page.locator("[data-action-sheet]")).toBeHidden();
      const boardVisible = await page.locator(".ptcg-battle-stage").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0 && r.height > 100;
      });
      expect(boardVisible).toBeTruthy();
      if (name === "390x664") await shot(page, "bot-turn-390x664");
    });
  });
}
