import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  cardOpinionId,
  formatStamp,
  presentCardOpinion,
  presentSetOpinion,
  quoteText,
} from "./opinions.mjs";

const here = new URL(".", import.meta.url).pathname;

test("quotes stay within 80 characters", () => {
  assert.equal(quoteText("짧은 인용"), "짧은 인용");
  const long = quoteText("가".repeat(100));
  assert.equal(Array.from(long).length, 80);
  assert.equal(long.endsWith("..."), true);
  assert.equal(long.includes("·"), false);
});

test("a missing opinion renders nothing", () => {
  const file = { updatedAt: "2026-11-19T08:00:00.000Z", sets: {}, cards: {} };
  assert.equal(presentSetOpinion(file, "m6"), null);
  assert.equal(presentCardOpinion(file, "m6", "110"), null);
  assert.equal(presentCardOpinion(null, "m6", "110"), null);
  assert.equal(presentSetOpinion({ sets: { m6: { summary: "  ", posts: [] } } }, "m6"), null);
});

test("opinions keep the written summary and drop posts that are not community sources", () => {
  const file = {
    updatedAt: "2026-11-19T08:00:00.000Z",
    sets: {},
    cards: {
      "m6-110": {
        summary: "  메가레쿠쟈 ex SAR는 호평이 많습니다.  ",
        sentiment: "positive",
        sampleSize: 9,
        posts: [
          { source: "x", text: "SAR 반응이 좋습니다", url: "https://x.com/preview/status/110", date: "2026-11-19" },
          { source: "blog", text: "블로그는 빼 주세요", url: "https://blog.example/1", date: "2026-11-19" },
          { source: "x", text: "스크립트", url: "javascript:alert(1)", date: "2026-11-19" },
          { source: "naver_cafe", text: "카페 교환글이 있습니다", url: "https://cafe.naver.com/preview/110", date: "2026-11-18" },
          { source: "dc", text: "가".repeat(90), url: "https://gall.dcinside.com/preview/110", date: "2026-11-17" },
          { source: "other", text: "다른 커뮤니티", url: "https://example.com/other", date: "2026-11-16" },
          { source: "x", text: "다섯 번째 인용입니다", url: "https://x.com/preview/status/extra", date: "2026-11-15" },
          { source: "naver_cafe", text: "여섯 번째 유효 글은 보여 주지 않습니다", url: "https://cafe.naver.com/preview/extra", date: "2026-11-14" },
          {
            source: "x",
            text: { toString() { throw new Error("bad post"); } },
            url: "https://x.com/preview/status/bad",
            date: "2026-11-15",
          },
        ],
      },
    },
  };
  const view = presentCardOpinion(file, "m6", "110");
  assert.equal(cardOpinionId("m6", "110"), "m6-110");
  assert.equal(view.summary, "메가레쿠쟈 ex SAR는 호평이 많습니다.");
  assert.equal(view.sentiment, "positive");
  assert.equal(view.sentimentLabel, "호평");
  assert.equal(view.sampleLabel, "표본 9건");
  assert.equal(view.stamp, "2026년 11월 19일 17시 기준");
  assert.equal(formatStamp("not-a-date"), "");
  assert.deepEqual(view.posts.map((post) => post.source), ["x", "naver_cafe", "dc", "other", "x"]);
  assert.equal(view.posts.some((post) => post.text.includes("여섯 번째")), false);
  assert.equal(view.posts[0].sourceLabel, "X");
  assert.equal(view.posts[1].sourceLabel, "네이버 카페");
  assert.equal(view.posts[2].sourceLabel, "디시");
  assert.equal(view.posts[1].dateLabel, "2026년 11월 18일");
  assert.equal(Array.from(view.posts[2].text).length, 80);
  assert.equal(view.posts.some((post) => post.url.startsWith("javascript")), false);
  assert.equal(view.posts.some((post) => post.text.includes("블로그")), false);
  assert.equal(JSON.stringify(view).includes("·"), false);
});

test("an unknown sentiment is omitted instead of invented", () => {
  const view = presentSetOpinion({
    updatedAt: null,
    sets: {
      m6: {
        summary: "시세 이야기가 많습니다.",
        sentiment: "bullish",
        sampleSize: "12",
        posts: [],
      },
    },
    cards: {},
  }, "m6");
  assert.equal(view.summary, "시세 이야기가 많습니다.");
  assert.equal(view.sentiment, "");
  assert.equal(view.sentimentLabel, "");
  assert.equal(view.sampleLabel, "");
  assert.equal(view.stamp, "");
  assert.deepEqual(view.posts, []);
});

test("the shipped file is empty and the preview fixture is separate", () => {
  const live = JSON.parse(readFileSync(join(here, "../data/community/opinions.json"), "utf8"));
  assert.equal(live.updatedAt, null);
  assert.deepEqual(live.sets, {});
  assert.deepEqual(live.cards, {});
  assert.equal(JSON.stringify(live).includes("summary"), false);

  const preview = JSON.parse(readFileSync(join(here, "../data/community/opinions.preview.json"), "utf8"));
  const pack = presentSetOpinion(preview, "m6");
  const card = presentCardOpinion(preview, "m6", "110");
  assert.ok(pack.summary);
  assert.ok(pack.posts.length >= 3 && pack.posts.length <= 5);
  assert.ok(card.posts.length >= 3 && card.posts.length <= 5);
  assert.equal(JSON.stringify(preview).includes("·"), false);

  const cardPage = readFileSync(join(here, "../pages/cards/[slug]/[number].astro"), "utf8");
  const setPage = readFileSync(join(here, "../pages/sets/[slug].astro"), "utf8");
  const component = readFileSync(join(here, "../components/OpinionLine.astro"), "utf8");
  assert.match(component, /rel="nofollow noopener"/);
  assert.match(component, /target="_blank"/);
  assert.equal(component.includes("·"), false);
  assert.match(cardPage, /OpinionLine/);
  assert.match(setPage, /OpinionLine/);
  assert.equal(cardPage.includes("opinions.preview"), false);
  assert.equal(setPage.includes("opinions.preview"), false);

  const pages = readFileSync(join(here, "../../.github/workflows/pages.yml"), "utf8");
  assert.match(pages, /pages-pr-/);
  assert.equal(pages.includes("NAVER_"), false);
  assert.equal(existsSync(join(here, "../../.github/workflows/community.yml")), false);
  assert.equal(existsSync(join(here, "../../scripts/fetch-reactions.mjs")), false);
});
