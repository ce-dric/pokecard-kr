import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildCardQuery,
  buildPackQuery,
  cardHeadingFrom,
  collectReactions,
  createNaverSearch,
  emptySnapshot,
  formatCount,
  formatPostDate,
  formatStamp,
  isRelevantCardPost,
  isRelevantPackPost,
  mentionedRarities,
  mentionsName,
  parseSearchItem,
  presentCard,
  presentPack,
  refreshSnapshot,
  stripHtml,
  truncate,
} from "./community.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function card(partial) {
  return {
    number: "001",
    printedIn: "076",
    nameKo: "헤라크로스",
    nameStatus: "verified-kr",
    nameJa: null,
    halfKo: null,
    rarity: "C",
    ...partial,
  };
}

const hera = card({});
const ray = ["RR", "SR", "SAR", "MUR"].map((rarity, index) =>
  card({
    number: ["058", "095", "110", "113"][index],
    nameKo: "메가레쿠쟈 ex",
    rarity,
  }),
);
const cap = card({ number: "065", nameKo: "메가레쿠쟈캡", rarity: "U" });
const left = card({ number: "071", nameKo: "전설의 산정", halfKo: "좌측", rarity: "U" });
const miniSet = {
  id: "m6",
  nameKo: "스톰에메랄다",
  cards: [hera, ...ray, cap, left],
};

function token(query, word) {
  return new RegExp(`(?:^|\\s)${word}(?:\\s|$)`).test(query);
}

test("stripHtml removes search highlight tags and decodes entities", () => {
  assert.equal(stripHtml(" <b>메가레쿠쟈</b> ex &amp; &quot;SAR&quot; &#39;A&#39; "), '메가레쿠쟈 ex & "SAR" \'A\'');
  assert.equal(stripHtml("&lt;b&gt;카드&lt;/b&gt;"), "카드");
});

test("truncate keeps the summary short", () => {
  const full = "가".repeat(180);
  const cut = truncate(full, 140);
  assert.equal(Array.from(cut).length, 143);
  assert.equal(cut.endsWith("..."), true);
  assert.equal(truncate("짧은 요약", 140), "짧은 요약");
});

test("card queries anchor the pack and keep other printings out of the base card", () => {
  assert.equal(
    buildCardQuery(miniSet, hera, [hera]),
    "헤라크로스 포켓몬카드 스톰에메랄다 -포켓몬고 -유나이트 -애니메이션",
  );
  assert.equal(
    buildCardQuery(miniSet, ray[0], ray),
    "메가레쿠쟈 ex 포켓몬카드 스톰에메랄다 -SR -SAR -MUR -포켓몬고 -유나이트 -애니메이션",
  );
  assert.equal(
    buildCardQuery(miniSet, ray[2], ray),
    "메가레쿠쟈 ex SAR 포켓몬카드 스톰에메랄다 -포켓몬고 -유나이트 -애니메이션",
  );
  assert.equal(buildCardQuery(miniSet, left, [left]).startsWith("전설의 산정 좌측 "), true);
  assert.equal(token(buildCardQuery(miniSet, ray[0], ray), "RR"), false);
  assert.equal(token(buildCardQuery(miniSet, ray[2], ray), "SAR"), true);
});

test("pack query asks for the set and the card game", () => {
  assert.equal(
    buildPackQuery(miniSet),
    "스톰에메랄다 포켓몬카드 -포켓몬고 -유나이트 -애니메이션",
  );
});

test("name matching ignores spaces and does not confuse a longer card", () => {
  const names = miniSet.cards.map(cardHeadingFrom);
  assert.equal(mentionsName("메가레쿠쟈EX 뽑기", "메가레쿠쟈 ex", names), true);
  assert.equal(mentionsName("메가레쿠쟈캡 후기", "메가레쿠쟈 ex", names), false);
  assert.equal(mentionsName("전설의 산정 우측", "전설의 산정 좌측", names), false);
});

test("rarity tokens do not treat SAR as SR or AR", () => {
  assert.deepEqual(mentionedRarities("메가레쿠쟈 ex SAR 후기"), ["SAR"]);
  assert.deepEqual(mentionedRarities("스페셜아트레어만 구합니다"), ["SAR"]);
  assert.deepEqual(mentionedRarities("메가레쿠쟈 ex 개봉"), []);
});

test("card filter drops game posts, other printings, and lookalike names", () => {
  const names = miniSet.cards.map(cardHeadingFrom);
  const packName = miniSet.nameKo;
  const good = { title: "스톰에메랄다 메가레쿠쟈 ex SAR 후기", description: "포켓몬카드 뽑기" };
  const base = { title: "스톰에메랄다 메가레쿠쟈 ex 개봉", description: "포켓몬카드" };
  const game = { title: "메가레쿠쟈 ex 포켓몬고 공략", description: "스톰에메랄다" };
  const otherSet = { title: "메가레쿠쟈 ex 포켓몬카드 덱", description: "게임 파티" };
  const capPost = { title: "메가레쿠쟈캡 스톰에메랄다", description: "포켓몬카드" };
  assert.equal(isRelevantCardPost(good, { card: ray[2], siblings: ray, packName, names }), true);
  assert.equal(isRelevantCardPost(base, { card: ray[2], siblings: ray, packName, names }), false);
  assert.equal(isRelevantCardPost(good, { card: ray[0], siblings: ray, packName, names }), false);
  assert.equal(isRelevantCardPost(base, { card: ray[0], siblings: ray, packName, names }), true);
  assert.equal(isRelevantCardPost(game, { card: ray[0], siblings: ray, packName, names }), false);
  assert.equal(isRelevantCardPost(otherSet, { card: ray[0], siblings: ray, packName, names }), false);
  assert.equal(isRelevantCardPost(capPost, { card: ray[2], siblings: ray, packName, names }), false);
});

test("pack filter keeps card posts and drops unrelated emeralda hits", () => {
  assert.equal(
    isRelevantPackPost(
      { title: "스톰에메랄다 포켓몬카드 개봉", description: "박스 후기" },
      "스톰에메랄다",
    ),
    true,
  );
  assert.equal(
    isRelevantPackPost({ title: "스톰에메랄다 목걸이", description: "주얼리 매장" }, "스톰에메랄다"),
    false,
  );
  assert.equal(
    isRelevantPackPost({ title: "스톰에메랄다 포켓몬고", description: "포켓몬카드" }, "스톰에메랄다"),
    false,
  );
});

test("parseSearchItem keeps only a short citation", () => {
  const blog = parseSearchItem(
    {
      title: "<b>스톰에메랄다</b>",
      link: "https://blog.naver.com/sample/1",
      description: `<b>포켓몬카드</b> ${"본".repeat(200)}`,
      bloggername: "샘플블로그",
      bloggerlink: "https://blog.naver.com/sample",
      postdate: "20261118",
    },
    "blog",
  );
  assert.deepEqual(Object.keys(blog).sort(), ["date", "description", "link", "origin", "source", "title"]);
  assert.equal(blog.title.includes("<b>"), false);
  assert.equal(blog.description.includes("본".repeat(150)), false);
  assert.ok(Array.from(blog.description).length <= 143);
  assert.equal(blog.description.endsWith("..."), true);
  assert.equal(blog.date, "2026-11-18");
  assert.equal(blog.origin, "샘플블로그");
  assert.equal(blog.link, "https://blog.naver.com/sample/1");

  const news = parseSearchItem(
    {
      title: "스톰에메랄다 포켓몬카드",
      originallink: "https://news.example/original",
      link: "https://n.news.naver.com/1",
      description: "짧은 요약",
      pubDate: "Thu, 19 Nov 2026 10:00:00 +0900",
    },
    "news",
  );
  assert.equal(news.link, "https://news.example/original");
  assert.equal(news.date, "2026-11-19");
  assert.equal(parseSearchItem({ title: "bad", link: "javascript:alert(1)", description: "x" }, "blog"), null);
});

test("visible copy avoids the middle dot and formats Seoul time", () => {
  assert.equal(formatCount(1015), "1,015건");
  assert.equal(formatPostDate("2026-11-18"), "2026년 11월 18일");
  assert.equal(formatStamp("2026-11-19T08:00:00.000Z"), "2026년 11월 19일 17시 기준");
  assert.equal(formatStamp(null), "");
  for (const text of [formatCount(12), formatPostDate("2026-11-18"), formatStamp("2026-11-19T08:00:00.000Z")]) {
    assert.equal(text.includes("·"), false);
  }
});

test("collectReactions stores filtered citations and keeps failed sources", async () => {
  const calls = [];
  const search = async ({ source, query }) => {
    calls.push({ source, query });
    if (query === buildPackQuery(miniSet)) {
      if (source === "news") {
        return {
          ok: true,
          total: 9,
          items: [
            {
              title: "<b>스톰에메랄다</b> 포켓몬카드 출시",
              originallink: "https://news.example/1",
              link: "https://n.news.naver.com/1",
              description: "확장팩 소식",
              pubDate: "Thu, 19 Nov 2026 10:00:00 +0900",
            },
            {
              title: "스톰에메랄다 목걸이",
              originallink: "https://news.example/jewel",
              link: "https://news.example/jewel",
              description: "주얼리",
              pubDate: "Thu, 19 Nov 2026 09:00:00 +0900",
            },
          ],
        };
      }
      return {
        ok: true,
        total: source === "blog" ? 10 : 5,
        items: [
          {
            title: "<b>스톰에메랄다</b> 포켓몬카드 개봉",
            link: `https://example.com/${source}-ok`,
            description: "박스 후기",
            postdate: "20261118",
            bloggername: source === "blog" ? "샘플블로그" : "",
            cafename: source === "cafe" ? "카드카페" : "",
          },
          {
            title: "포켓몬고 스톰에메랄다",
            link: "https://example.com/go",
            description: "포켓몬카드",
            postdate: "20261118",
          },
        ],
      };
    }
    if (token(query, "SAR")) {
      return {
        ok: true,
        total: source === "blog" ? 8 : 2,
        items: [
          {
            title: "스톰에메랄다 <b>메가레쿠쟈 ex</b> SAR",
            link: `https://example.com/sar-${source}`,
            description: "포켓몬카드 후기입니다",
            postdate: "20261119",
            bloggername: "블로그",
          },
          {
            title: "메가레쿠쟈캡 스톰에메랄다 SAR",
            link: "https://example.com/cap",
            description: "포켓몬카드",
            postdate: "20261119",
          },
          {
            title: "스톰에메랄다 메가레쿠쟈 ex 개봉",
            link: "https://example.com/base-in-sar",
            description: "포켓몬카드",
            postdate: "20261117",
          },
          {
            title: "스톰에메랄다 메가레쿠쟈 ex SAR",
            link: "javascript:alert(1)",
            description: "포켓몬카드",
          },
        ],
      };
    }
    if (query.startsWith("메가레쿠쟈 ex ") && !token(query, "SR") && !token(query, "MUR")) {
      return {
        ok: true,
        total: 3,
        items: [
          {
            title: "스톰에메랄다 메가레쿠쟈 ex 개봉",
            link: `https://example.com/base-${source}`,
            description: "포켓몬카드",
            postdate: "20261118",
          },
          {
            title: "스톰에메랄다 메가레쿠쟈 ex SAR",
            link: `https://example.com/base-sar-${source}`,
            description: "포켓몬카드",
            postdate: "20261118",
          },
        ],
      };
    }
    return { ok: true, total: 0, items: [] };
  };

  const { snapshot } = await collectReactions({
    sets: [miniSet],
    previous: emptySnapshot(),
    search,
    now: new Date("2026-11-19T08:00:00.000Z"),
    maxCalls: 480,
  });

  assert.equal(snapshot.sets.m6.mentions, 15);
  assert.equal(snapshot.sets.m6.posts.some((post) => post.link.includes("jewel")), false);
  assert.equal(snapshot.sets.m6.posts.some((post) => post.link.includes("go")), false);
  assert.equal(snapshot.sets.m6.posts.find((post) => post.source === "news").link, "https://news.example/1");
  assert.equal(snapshot.sets.m6.posts.find((post) => post.source === "blog").title.includes("<"), false);
  assert.equal(snapshot.sets.m6.cards["110"].mentions, 10);
  assert.equal(snapshot.sets.m6.cards["110"].posts.every((post) => post.title.includes("SAR")), true);
  assert.equal(snapshot.sets.m6.cards["110"].posts.some((post) => post.link.startsWith("javascript")), false);
  assert.equal(snapshot.sets.m6.cards["058"].mentions, 6);
  assert.equal(snapshot.sets.m6.cards["058"].posts.some((post) => post.link.includes("base-sar")), false);
  assert.equal(snapshot.sets.m6.cards["058"].posts.some((post) => post.link.includes("base-blog")), true);

  const previous = snapshot;
  const halted = [];
  const { snapshot: kept, halted: didHalt } = await collectReactions({
    sets: [miniSet],
    previous,
    search: async ({ source, query }) => {
      halted.push({ source, query });
      if (query === buildPackQuery(miniSet) && source === "blog") {
        return {
          ok: true,
          total: 12,
          items: [
            {
              title: "스톰에메랄다 포켓몬카드 새 글",
              link: "https://example.com/new-blog",
              description: "요약",
              postdate: "20261119",
            },
          ],
        };
      }
      if (query === buildPackQuery(miniSet) && source === "cafe") {
        return { ok: false, status: 429, halt: true };
      }
      throw new Error("should not be called");
    },
    now: new Date("2026-11-19T12:00:00.000Z"),
    maxCalls: 480,
  });
  assert.equal(didHalt, true);
  assert.equal(kept.sets.m6.sources.blog.total, 12);
  assert.equal(kept.sets.m6.sources.cafe.total, 5);
  assert.equal(kept.sets.m6.mentions, 17);
  assert.equal(kept.sets.m6.posts.some((post) => post.link === "https://example.com/new-blog"), true);
  assert.equal(kept.sets.m6.posts.some((post) => post.link === "https://example.com/cafe-ok"), true);
  assert.equal(kept.sets.m6.cards["110"].posts.length, snapshot.sets.m6.cards["110"].posts.length);
  assert.equal(halted.some((call) => call.source === "news"), false);
});

test("call budget refreshes packs first and the stalest cards next", async () => {
  const previous = emptySnapshot();
  const cards = {};
  for (const item of miniSet.cards) {
    cards[item.number] = {
      updatedAt: "2026-11-19T00:00:00.000Z",
      mentions: 1,
      posts: [],
      sources: {},
    };
  }
  cards["001"].updatedAt = "2026-11-01T00:00:00.000Z";
  delete cards["071"];
  previous.sets.m6 = { mentions: 0, posts: [], sources: {}, cards };
  const queries = [];
  await collectReactions({
    sets: [miniSet],
    previous,
    search: async ({ query }) => {
      queries.push(query);
      return { ok: true, total: 0, items: [] };
    },
    now: new Date("2026-11-19T08:00:00.000Z"),
    maxCalls: 5,
  });
  assert.equal(queries[0], buildPackQuery(miniSet));
  assert.equal(queries.length, 5);
  assert.equal(queries.filter((query) => query.startsWith("전설의 산정 좌측")).length, 2);
  assert.equal(queries.some((query) => query.startsWith("헤라크로스")), false);
});

test("missing API keys keep the previous snapshot and make no calls", async () => {
  const previous = emptySnapshot();
  previous.updatedAt = "2026-11-01T00:00:00.000Z";
  let called = false;
  const result = await refreshSnapshot({
    sets: [miniSet],
    previous,
    env: {},
    search: async () => {
      called = true;
      return { ok: true, total: 1, items: [] };
    },
  });
  assert.equal(called, false);
  assert.equal(result.skipped, "no-key");
  assert.equal(result.calls, 0);
  assert.equal(result.snapshot.updatedAt, "2026-11-01T00:00:00.000Z");
});

test("search client calls the API hub and stops on the daily limit", async () => {
  const seen = [];
  let attempt = 0;
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers });
    attempt += 1;
    if (attempt < 3) return new Response("nope", { status: 500 });
    return new Response(JSON.stringify({ errorCode: "SE99", errorMessage: "System Error" }), { status: 500 });
  };
  const search = createNaverSearch({
    fetchImpl,
    clientId: "id",
    clientSecret: "secret",
    pause: async () => {},
  });
  const failed = await search({ source: "blog", query: "스톰에메랄다", display: 15 });
  assert.equal(failed.ok, false);
  const first = new URL(seen[0].url);
  assert.equal(first.origin, "https://naverapihub.apigw.ntruss.com");
  assert.equal(first.pathname, "/search/v1/blog");
  assert.equal(first.searchParams.get("query"), "스톰에메랄다");
  assert.equal(first.searchParams.get("display"), "15");
  assert.equal(first.searchParams.get("sort"), "date");
  assert.equal(first.searchParams.get("format"), "json");
  assert.equal(seen[0].headers["X-NCP-APIGW-API-KEY-ID"], "id");
  assert.equal(seen[0].headers["X-NCP-APIGW-API-KEY"], "secret");

  const limited = await createNaverSearch({
    fetchImpl: async () => new Response("slow", { status: 429 }),
    clientId: "id",
    clientSecret: "secret",
    pause: async () => {},
  })({ source: "cafearticle", query: "카드", display: 30 });
  assert.equal(limited.halt, true);
});

test("page view ranks cards and exposes polite labels", () => {
  const snapshot = {
    version: 1,
    updatedAt: "2026-11-19T08:00:00.000Z",
    sets: {
      m6: {
        updatedAt: "2026-11-19T08:00:00.000Z",
        mentions: 1015,
        posts: [
          {
            source: "blog",
            title: "스톰에메랄다 개봉",
            description: "짧은 요약",
            link: "https://blog.naver.com/sample/1",
            date: "2026-11-18",
            origin: "샘플",
          },
          {
            source: "cafe",
            title: "스톰에메랄다 시세",
            description: "카페 요약",
            link: "https://cafe.naver.com/sample/2",
            date: "",
            origin: "카드카페",
          },
        ],
        cards: {
          "113": {
            updatedAt: "2026-11-19T08:00:00.000Z",
            mentions: 40,
            posts: [],
          },
          "110": {
            updatedAt: "2026-11-19T08:00:00.000Z",
            mentions: 80,
            posts: [
              {
                source: "blog",
                title: "메가레쿠쟈 ex SAR",
                description: "요약",
                link: "https://blog.naver.com/sample/110",
                date: "2026-11-19",
                origin: "",
              },
            ],
          },
        },
      },
    },
  };
  const cardView = presentCard(snapshot, miniSet, ray[2]);
  assert.equal(cardView.countLabel, "최근 언급 80건");
  assert.equal(cardView.stamp, "2026년 11월 19일 17시 기준");
  assert.equal(cardView.groups[0].label, "블로그");
  assert.equal(cardView.groups[0].posts[0].meta, "2026년 11월 19일");
  assert.equal(JSON.stringify(cardView).includes("·"), false);

  const packView = presentPack(snapshot, miniSet);
  assert.equal(packView.ranking[0].number, "110");
  assert.equal(packView.ranking[1].number, "113");
  assert.equal(packView.groups.map((group) => group.label).join(","), "블로그,카페");
  assert.equal(packView.groups[1].posts[0].meta, "카드카페");
  assert.equal(presentCard(emptySnapshot(), miniSet, hera).countLabel, "");
});

test("reaction snapshot and preview fixture stay renderable", () => {
  const live = JSON.parse(readFileSync(join(here, "../data/community/reactions.json"), "utf8"));
  assert.equal(live.version, 1);
  assert.equal(typeof live.sets, "object");
  assert.equal(JSON.stringify(live).includes("<b>"), false);
  for (const block of Object.values(live.sets)) {
    for (const post of block.posts || []) assert.ok(Array.from(post.description || "").length <= 143);
    for (const entry of Object.values(block.cards || {})) {
      for (const post of entry.posts || []) {
        assert.ok(Array.from(post.description || "").length <= 143);
        assert.match(post.link, /^https?:\/\//);
      }
    }
  }

  const preview = JSON.parse(readFileSync(join(here, "../data/community/preview.json"), "utf8"));
  const packView = presentPack(preview, JSON.parse(readFileSync(join(here, "../data/sets/m6.json"), "utf8")));
  assert.ok(packView.groups.length >= 2);
  assert.ok(packView.ranking.length >= 5);
  const sar = preview.sets.m6.cards["110"];
  assert.ok(sar.posts.length >= 2);
  assert.equal(JSON.stringify(packView).includes("·"), false);
  assert.equal(JSON.stringify(preview).includes("·"), false);
});

test("reaction section uses safe external links and the ledger tone", () => {
  const component = readFileSync(join(here, "../components/CommunityPulse.astro"), "utf8");
  const cardPage = readFileSync(join(here, "../pages/cards/[slug]/[number].astro"), "utf8");
  const setPage = readFileSync(join(here, "../pages/sets/[slug].astro"), "utf8");
  assert.match(component, /rel="nofollow noopener"/);
  assert.match(component, /target="_blank"/);
  assert.equal(component.includes("·"), false);
  assert.match(cardPage, /CommunityPulse/);
  assert.match(setPage, /CommunityPulse/);
  assert.match(cardPage, /최근 커뮤니티 반응|CommunityPulse/);
});
