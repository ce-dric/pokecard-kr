import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GRADE_LABELS,
  PSA_CENTERING_SOURCE,
  PSA_CENTERING_TABLE,
  createPhotoLoad,
  defaultGuides,
  detectCardGuides,
  estimateCenteringGrade,
  formatPair,
  measureGuides,
  moveGuide,
  pairRatio,
} from "./centering.mjs";

const middleDot = "\u00b7";

function guidesFromBorders(left, right, top, bottom) {
  return {
    outerLeft: 0,
    innerLeft: left,
    innerRight: left + 10,
    outerRight: left + 10 + right,
    outerTop: 0,
    innerTop: top,
    innerBottom: top + 10,
    outerBottom: top + 10 + bottom,
  };
}

function measure(left, right, top, bottom) {
  return measureGuides(guidesFromBorders(left, right, top, bottom));
}

function makeImage(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

test("pair ratios use the left or top share first and sum to 100", () => {
  assert.deepEqual(pairRatio(55, 45), { first: 55, second: 45, worse: 55 });
  assert.deepEqual(pairRatio(40, 60), { first: 40, second: 60, worse: 60 });
  assert.deepEqual(pairRatio(1, 1), { first: 50, second: 50, worse: 50 });
  assert.deepEqual(pairRatio(0, 8), { first: 0, second: 100, worse: 100 });
  assert.equal(pairRatio(55.4, 44.6).first, 55);
  assert.equal(pairRatio(55.5, 44.5).first, 56);
  assert.equal(pairRatio(0, 0), null);
  assert.equal(pairRatio(-1, 4), null);
  assert.equal(pairRatio(Number.NaN, 4), null);
});

test("published PSA centering limits are the grading-standards minimums", () => {
  assert.equal(PSA_CENTERING_SOURCE, "https://www.psacard.com/gradingstandards");
  assert.deepEqual(
    PSA_CENTERING_TABLE.map((row) => [row.grade, row.front, row.back, row.label]),
    [
      [10, 55, 75, "GEM-MT"],
      [9, 60, 90, "MINT"],
      [8, 65, 90, "NM-MT"],
      [7, 70, 90, "NM"],
      [6, 80, 90, "EX-MT"],
      [5, 85, 90, "EX"],
      [4, 85, 90, "VG-EX"],
      [3, 90, 90, "VG"],
      [2, 90, 90, "GOOD"],
      [1, null, null, "PR"],
    ],
  );
  assert.equal(GRADE_LABELS[10], "GEM-MT");
});

test("front centering grade follows the stricter published front limit", () => {
  const cases = [
    [50, 50, 10],
    [55, 45, 10],
    [56, 44, 9],
    [60, 40, 9],
    [61, 39, 8],
    [65, 35, 8],
    [66, 34, 7],
    [70, 30, 7],
    [71, 29, 6],
    [75, 25, 6],
    [80, 20, 6],
    [81, 19, 5],
    [85, 15, 5],
    [86, 14, 3],
    [90, 10, 3],
    [91, 9, 1],
    [100, 0, 1],
  ];
  for (const [left, right, grade] of cases) {
    const result = estimateCenteringGrade(measure(left, right, 50, 50));
    assert.equal(result.grade, grade, `${left}/${right}`);
    assert.equal(result.label, GRADE_LABELS[grade]);
    assert.equal(result.frontOnly, true);
    assert.equal(result.backGrade, null);
  }
});

test("the worse axis limits the front grade", () => {
  const centeredWidth = measure(50, 50, 70, 30);
  assert.equal(centeredWidth.horizontal.worse, 50);
  assert.equal(centeredWidth.vertical.worse, 70);
  assert.equal(centeredWidth.worse, 70);
  assert.equal(estimateCenteringGrade(centeredWidth).grade, 7);
  assert.equal(formatPair(centeredWidth.vertical), "70/30");
});

test("back centering uses the back limits, which differ from the front", () => {
  const centered = measure(50, 50, 50, 50);
  const back75 = measure(75, 25, 50, 50);
  const back76 = measure(76, 24, 50, 50);
  const back90 = measure(90, 10, 50, 50);
  const back91 = measure(91, 9, 50, 50);
  const front75 = measure(75, 25, 50, 50);

  assert.equal(estimateCenteringGrade(front75).grade, 6);
  assert.equal(estimateCenteringGrade(null, back75).grade, 10);
  assert.equal(estimateCenteringGrade(centered, back75).grade, 10);
  assert.equal(estimateCenteringGrade(centered, back76).grade, 9);
  assert.equal(estimateCenteringGrade(centered, back90).grade, 9);
  assert.equal(estimateCenteringGrade(centered, back91).grade, 1);

  const front9 = measure(58, 42, 50, 50);
  const combined = estimateCenteringGrade(front9, back75);
  assert.equal(front9.worse, 58);
  assert.equal(combined.grade, 9);
  assert.equal(combined.frontGrade, 9);
  assert.equal(combined.backGrade, 10);
  assert.equal(combined.frontOnly, false);
  assert.equal(combined.backOnly, false);
});

test("a missing or crossed measurement is not graded", () => {
  assert.equal(measureGuides(null), null);
  assert.equal(estimateCenteringGrade(null, null), null);
  const crossed = measureGuides({
    outerLeft: 0.4,
    innerLeft: 0.2,
    innerRight: 0.8,
    outerRight: 1,
    outerTop: 0,
    innerTop: 0.1,
    innerBottom: 0.9,
    outerBottom: 1,
  });
  assert.equal(crossed, null);
});

test("guide drags stay inside the neighboring lines", () => {
  const start = defaultGuides();
  const pushed = moveGuide(start, "innerLeft", 0);
  assert.ok(pushed.innerLeft > pushed.outerLeft);
  assert.ok(pushed.innerLeft < pushed.innerRight);
  const pushedRight = moveGuide(start, "outerRight", 0.2);
  assert.ok(pushedRight.outerRight > pushedRight.innerRight);
  assert.ok(pushedRight.outerRight <= 1);
  const nudged = moveGuide(start, "innerTop", start.innerTop + 0.01);
  assert.equal(nudged.innerTop, start.innerTop + 0.01);
  assert.equal(nudged.innerLeft, start.innerLeft);
});

test("a card on a plain background yields even borders when the frame is centered", () => {
  const image = makeImage(200, 280, (x, y) => {
    const onCard = x >= 30 && x < 170 && y >= 20 && y < 260;
    const onArt = x >= 42 && x < 158 && y >= 36 && y < 244;
    if (onArt) return [20, 30, 80];
    if (onCard) return [240, 210, 60];
    return [200, 200, 200];
  });
  const guides = detectCardGuides(image);
  assert.ok(guides);
  assert.ok(Math.abs(guides.outerLeft - 30 / 200) <= 1 / 200);
  assert.ok(Math.abs(guides.outerRight - 170 / 200) <= 1 / 200);
  assert.ok(Math.abs(guides.outerTop - 20 / 280) <= 1 / 280);
  assert.ok(Math.abs(guides.outerBottom - 260 / 280) <= 1 / 280);
  assert.ok(Math.abs(guides.innerLeft - 42 / 200) <= 1 / 200);
  assert.ok(Math.abs(guides.innerRight - 158 / 200) <= 1 / 200);
  assert.ok(Math.abs(guides.innerTop - 36 / 280) <= 1 / 280);
  assert.ok(Math.abs(guides.innerBottom - 244 / 280) <= 1 / 280);
  const measured = measureGuides(guides);
  assert.equal(measured.horizontal.first, 50);
  assert.equal(measured.horizontal.second, 50);
  assert.equal(measured.vertical.first, 50);
  assert.equal(measured.vertical.second, 50);
  assert.equal(estimateCenteringGrade(measured).grade, 10);
});

test("off-center inner frames keep the drawn border ratio", () => {
  const image = makeImage(200, 280, (x, y) => {
    const onCard = x >= 20 && x < 180 && y >= 10 && y < 250;
    const onArt = x >= 28 && x < 164 && y >= 18 && y < 230;
    if (onArt) return [16, 24, 70];
    if (onCard) return [236, 206, 70];
    return [180, 180, 180];
  });
  const guides = detectCardGuides(image);
  const measured = measureGuides(guides);
  assert.equal(measured.horizontal.first, 33);
  assert.equal(measured.horizontal.second, 67);
  assert.equal(measured.vertical.worse, 71);
  assert.equal(estimateCenteringGrade(measured).grade, 6);
});

test("a borderless photo keeps the content edge instead of the image bounds", () => {
  const image = makeImage(200, 280, (x, y) => {
    const onArt = x >= 12 && x < 188 && y >= 14 && y < 266;
    if (onArt) return [24, 36, 90];
    return [244, 214, 64];
  });
  const guides = detectCardGuides(image);
  assert.ok(Math.abs(guides.outerLeft - 12 / 200) <= 1 / 200);
  assert.ok(Math.abs(guides.outerRight - 188 / 200) <= 1 / 200);
  assert.ok(Math.abs(guides.outerTop - 14 / 280) <= 1 / 280);
  assert.ok(Math.abs(guides.outerBottom - 266 / 280) <= 1 / 280);
  const measured = measureGuides(guides);
  assert.equal(measured.horizontal.worse, 50);
  assert.equal(measured.vertical.worse, 50);
});

test("a tight even photo margin stays outside the card", () => {
  const image = makeImage(200, 280, (x, y) => {
    if (x >= 16 && x < 184 && y >= 22 && y < 258) return [240, 210, 60];
    return [180, 180, 180];
  });
  const guides = detectCardGuides(image);
  assert.ok(Math.abs(guides.outerLeft - 16 / 200) <= 1 / 200);
  assert.ok(Math.abs(guides.outerRight - 184 / 200) <= 1 / 200);
  assert.ok(Math.abs(guides.outerTop - 22 / 280) <= 1 / 280);
  assert.ok(Math.abs(guides.outerBottom - 258 / 280) <= 1 / 280);
  const measured = measureGuides(guides);
  assert.equal(measured.horizontal.worse, 50);
  assert.equal(measured.vertical.worse, 50);
});

test("a slower photo read cannot replace the newer one", async () => {
  const load = createPhotoLoad();
  let releaseOlder;
  let releaseNewer;
  const older = load("front", () => new Promise((resolve) => {
    releaseOlder = resolve;
  }));
  const newer = load("front", () => new Promise((resolve) => {
    releaseNewer = resolve;
  }));
  const closed = [];
  const oldBitmap = { id: "old", close() { closed.push("old"); } };
  const newBitmap = { id: "new", close() { closed.push("new"); } };
  releaseNewer(newBitmap);
  const kept = await newer;
  releaseOlder(oldBitmap);
  const dropped = await older;
  assert.equal(kept.stale, false);
  assert.equal(kept.bitmap, newBitmap);
  assert.equal(dropped.stale, true);
  assert.deepEqual(closed, ["old"]);
});

test("a replaced photo failure does not surface after a newer read", async () => {
  const load = createPhotoLoad();
  let failOlder;
  let releaseNewer;
  const older = load("back", () => new Promise((_, reject) => {
    failOlder = reject;
  }));
  const newer = load("back", () => new Promise((resolve) => {
    releaseNewer = resolve;
  }));
  const front = load("front", () => Promise.resolve({ id: "front" }));
  releaseNewer({ id: "back" });
  const kept = await newer;
  const other = await front;
  failOlder(new Error("unreadable"));
  const dropped = await older;
  assert.equal(kept.bitmap.id, "back");
  assert.equal(other.bitmap.id, "front");
  assert.equal(dropped.stale, true);
  assert.equal(dropped.error, undefined);
});

test("a solid card with no inner frame stays centered until the user drags", () => {
  const image = makeImage(200, 280, (x, y) => {
    if (x >= 40 && x < 170 && y >= 30 && y < 250) return [240, 210, 60];
    return [190, 190, 190];
  });
  const guides = detectCardGuides(image);
  assert.ok(Math.abs(guides.outerLeft - 40 / 200) <= 1 / 200);
  assert.ok(Math.abs(guides.outerRight - 170 / 200) <= 1 / 200);
  const measured = measureGuides(guides);
  assert.equal(measured.horizontal.worse, 50);
  assert.equal(measured.vertical.worse, 50);
  assert.ok(guides.innerLeft > guides.outerLeft);
  assert.ok(guides.innerRight < guides.outerRight);
});

test("a blank photo does not invent a card", () => {
  const image = makeImage(80, 100, () => [210, 210, 210]);
  assert.equal(detectCardGuides(image), null);
  assert.equal(detectCardGuides(null), null);
});

test("the centering page is Korean, local-only, and cites PSA", () => {
  const page = readFileSync(new URL("../pages/tools/centering.astro", import.meta.url), "utf8");
  const client = readFileSync(new URL("./centering-page.js", import.meta.url), "utf8");
  const header = readFileSync(new URL("../components/Header.astro", import.meta.url), "utf8");
  for (const source of [page, client, header]) {
    assert.equal(source.includes(middleDot), false);
  }
  assert.match(page, /추정/);
  assert.match(page, /PSA_CENTERING_SOURCE/);
  assert.match(page, /서버로 보내지 않습니다/);
  assert.match(page, /capture="environment"/);
  assert.match(page, /accept="image\/\*"/);
  assert.match(header, /tools\/centering\//);
  assert.equal(client.includes("fetch("), false);
  assert.equal(client.includes("XMLHttpRequest"), false);
  assert.equal(client.includes("opencv"), false);
});
