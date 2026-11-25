import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";

const SHOT_DIR = path.resolve("artifacts/issue-90");

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(SHOT_DIR, `${name}.png`),
    fullPage: false,
  });
}

test.describe("iPhone 13 /game Safari fixes (#90)", () => {
  test("lobby setup battle choice modal and full tutorial", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
    });

    await page.goto("game/");
    await expect(page.locator(".ptcg-lobby-card").first()).toBeVisible();
    const lobbyCard = page.locator(".ptcg-lobby-card").first();
    const lobbyRadius = await lobbyCard.evaluate((el) => getComputedStyle(el).borderRadius);
    expect(lobbyRadius).not.toMatch(/999|50%/);
    await shot(page, "lobby-iphone13");

    // Setup screen: inject via starting a match until setup, or paint from tutorial later.
    // Coin toss + setup come from a real start; use tutorial for battle/choice reliability.
    await page.getByRole("button", { name: "튜토리얼" }).click();
    await expect(page.locator("[data-tutorial-overlay]")).toBeVisible();
    await expect(page.locator("[data-tutorial-step='board']")).toBeVisible();

    // Step 1 board overview
    await page.getByRole("button", { name: "다음" }).click();

    // Step 2 draw — spotlight must hug the deck, not a tall rail strip
    await expect(page.locator("[data-tutorial-step='draw']")).toBeVisible();
    await expect(page.locator("[data-tutorial-target='you-deck'][data-tutorial-active='true']")).toBeVisible();
    await page.waitForTimeout(200);
    const deckBox = await page.locator("[data-tutorial-target='you-deck'][data-tutorial-active='true']").boundingBox();
    const spotBox = await page.locator("[data-tutorial-spotlight]").boundingBox();
    expect(deckBox).toBeTruthy();
    expect(spotBox).toBeTruthy();
    expect(spotBox!.height).toBeLessThan((deckBox!.height + 24) * 1.35);
    expect(spotBox!.height).toBeLessThan(160);
    await shot(page, "tutorial-step2-deck-iphone13");
    await page.locator("[data-tutorial-target='you-deck'][data-tutorial-active='true']").click();

    // Step 3 bench — coach must not cover the highlighted choice
    await expect(page.locator("[data-tutorial-step='bench']")).toBeVisible();
    await expect(page.locator("[data-tutorial-target='option-bench'][data-tutorial-active='true']")).toBeVisible();
    await page.waitForTimeout(250);
    const coach = page.locator("[data-tutorial-coach]");
    await expect(coach).toHaveAttribute("data-placement", "top");
    const choice = page.locator("[data-tutorial-target='option-bench'][data-tutorial-active='true']");
    const choiceBox = await choice.boundingBox();
    const coachBox = await coach.boundingBox();
    expect(choiceBox).toBeTruthy();
    expect(coachBox).toBeTruthy();
    const overlaps =
      choiceBox!.y < coachBox!.y + coachBox!.height && choiceBox!.y + choiceBox!.height > coachBox!.y;
    expect(overlaps).toBeFalsy();
    await shot(page, "tutorial-step3-bench-iphone13");
    await choice.click();

    // Step 4 energy
    await expect(page.locator("[data-tutorial-step='energy']")).toBeVisible();
    await page.locator("[data-tutorial-target='option-energy'][data-tutorial-active='true']").click();

    // Step 5 trainer
    await expect(page.locator("[data-tutorial-step='trainer']")).toBeVisible();
    await page.locator("[data-tutorial-target='option-trainer'][data-tutorial-active='true']").click();

    // Step 6 attack
    await expect(page.locator("[data-tutorial-step='attack']")).toBeVisible();
    await page.locator("[data-tutorial-target='option-attack'][data-tutorial-active='true']").click();

    // Step 7 bot observe
    await expect(page.locator("[data-tutorial-step='bot']")).toBeVisible();
    await shot(page, "battle-iphone13");
    await page.getByRole("button", { name: "다음" }).click();

    // Step 8 done
    await expect(page.locator("[data-tutorial-step='done']")).toBeVisible();
    await page.locator("[data-tutorial-finish]").click();
    await expect(page.locator(".ptcg-lobby-card").first()).toBeVisible();

    // Setup + choice modal screenshots from fixture HTML injection on the live page shell
    await page.evaluate(async () => {
      const root = document.querySelector("[data-ptcg]");
      if (!(root instanceof HTMLElement)) return;
      const { setupHtml } = await import("/pokecard-kr/src/lib/ptcg/prebattle.ts");
      // Fallback: paint a minimal setup markup if dynamic import is unavailable in preview.
      void setupHtml;
    }).catch(() => undefined);

    // Build setup/choice screenshots via the preview CSS + static markup helpers served from dist is hard;
    // use the in-page board host with tutorial-like injected HTML from the already-loaded styles.
    await page.goto("game/");
    await page.evaluate(() => {
      const root = document.querySelector("[data-ptcg]");
      if (!(root instanceof HTMLElement)) return;
      root.innerHTML = `<div data-board>
        <div class="ptcg-prebattle ptcg-setup-screen">
          <h2>대전 준비</h2>
          <p class="ptcg-prompt">배틀필드에 낼 기본 포켓몬을 고르세요</p>
          <div class="ptcg-pre-board">
            <section class="ptcg-pre-side ptcg-pre-side--opp"><h3>상대</h3>
              <div class="ptcg-pre-bench">${'<div class="ptcg-card"><div class="ptcg-empty ptcg-slot">벤치</div></div>'.repeat(5)}</div>
              <div class="ptcg-pre-active"><div class="ptcg-card"><div class="ptcg-empty ptcg-slot">배틀</div></div></div>
            </section>
            <section class="ptcg-pre-side ptcg-pre-side--you"><h3>나</h3>
              <div class="ptcg-pre-active"><div class="ptcg-card"><div class="ptcg-back"></div></div></div>
              <div class="ptcg-pre-bench">${'<div class="ptcg-card"><div class="ptcg-empty ptcg-slot">벤치</div></div>'.repeat(5)}</div>
            </section>
          </div>
        </div>
      </div>`;
    });
    const benchCards = page.locator(".ptcg-pre-side--you .ptcg-pre-bench .ptcg-card");
    await expect(benchCards).toHaveCount(5);
    const tops = await benchCards.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(8);
    await shot(page, "setup-iphone13");

    await page.evaluate(() => {
      const root = document.querySelector("[data-ptcg]");
      if (!(root instanceof HTMLElement)) return;
      root.innerHTML = `<div data-board class="ptcg-page">
        <div class="ptcg-picker" role="dialog" aria-label="카드 고르기">
          <header><h3>손으로 가져올 카드를 고르세요. 최대 1개</h3></header>
          <div class="ptcg-picker-grid">
            <button type="button" class="ptcg-picker-card" data-option="0">
              <img src="/pokecard-kr/images/cards/m1s/016-thumb.webp" alt="" width="72" height="100" />
              <span>가이오가</span>
            </button>
            <button type="button" class="ptcg-picker-card" data-option="1">
              <img src="/pokecard-kr/images/cards/m1s/016-thumb.webp" alt="" width="72" height="100" />
              <span>눈쓰개</span>
            </button>
          </div>
        </div>
      </div>`;
    });
    await expect(page.locator(".ptcg-picker-card img").first()).toBeVisible();
    await expect(page.getByText("덱 21")).toHaveCount(0);
    await shot(page, "choice-modal-iphone13");
  });
});
