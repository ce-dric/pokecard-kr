const RARITY_ORDER = ["C", "U", "R", "RR", "AR", "SR", "SAR", "MUR"];
const NEGATABLE = new Set(["RR", "AR", "SR", "SAR", "MUR"]);
const QUERY_BLOCKS = ["포켓몬고", "유나이트", "애니메이션"];
const TEXT_BLOCKS = ["포켓몬고", "포켓몬go", "pokemongo", "유나이트", "애니메이션", "극장판"];
const LATIN_RARITIES = ["MUR", "SAR", "RR", "SR", "AR"];
const KOREAN_RARITIES = [
  ["SAR", "스페셜아트레어"],
  ["MUR", "메가울트라레어"],
  ["SR", "슈퍼레어"],
  ["AR", "아트레어"],
  ["RR", "더블레어"],
  ["SAR", "사레"],
];
const SOURCE_LABELS = { blog: "블로그", cafe: "카페", news: "뉴스" };
const SOURCE_PATHS = { blog: "blog", cafe: "cafearticle", news: "news" };
const CARD_SOURCES = ["blog", "cafe"];
const PACK_SOURCES = ["blog", "cafe", "news"];
const CARD_LIMITS = { blog: 3, cafe: 3, news: 2 };
const PACK_LIMITS = { blog: 4, cafe: 3, news: 2 };

export function emptySnapshot() {
  return {
    version: 1,
    updatedAt: null,
    note: "네이버 검색 API에서 모은 제목과 짧은 요약입니다. 본문은 저장하지 않습니다.",
    sets: {},
  };
}

export function cardHeadingFrom(card) {
  const verified = card.nameStatus === "verified-kr" && card.nameKo;
  const name = verified ? card.nameKo : card.nameJa || card.nameKo || "이름 미확인";
  return card.halfKo ? `${name} ${card.halfKo}` : name;
}

export function compact(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s·・.&'’"“”]+/g, "");
}

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function stripHtml(value) {
  let text = String(value ?? "");
  for (let pass = 0; pass < 2; pass += 1) {
    text = decodeEntities(text).replace(/<[^>]*>/g, "");
  }
  return text.replace(/\s+/g, " ").trim();
}

export function truncate(text, max = 140) {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, max).join("").trimEnd()}...`;
}

function rarityRank(code) {
  const index = RARITY_ORDER.indexOf(code);
  return index === -1 ? 99 : index;
}

function baseRarity(siblings) {
  return [...siblings].sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity))[0].rarity;
}

export function buildCardQuery(set, card, siblings) {
  const terms = [cardHeadingFrom(card)];
  const base = baseRarity(siblings);
  if (card.rarity !== base) terms.push(card.rarity);
  terms.push("포켓몬카드", set.nameKo);
  if (card.rarity === base) {
    const higher = [...new Set(siblings.map((item) => item.rarity))]
      .filter((rarity) => NEGATABLE.has(rarity) && rarityRank(rarity) > rarityRank(base))
      .sort((a, b) => rarityRank(a) - rarityRank(b));
    for (const rarity of higher) terms.push(`-${rarity}`);
  }
  for (const word of QUERY_BLOCKS) terms.push(`-${word}`);
  return terms.join(" ");
}

export function buildPackQuery(set) {
  return [set.nameKo, "포켓몬카드", ...QUERY_BLOCKS.map((word) => `-${word}`)].join(" ");
}

export function mentionsName(text, name, names) {
  const haystack = compact(text);
  const needle = compact(name);
  if (!needle || !haystack.includes(needle)) return false;
  const longer = names
    .map((item) => compact(item))
    .filter((item) => item.length > needle.length && item.includes(needle));
  let reduced = haystack;
  for (const item of longer) reduced = reduced.split(item).join(" ");
  return reduced.includes(needle);
}

export function mentionedRarities(text) {
  const found = new Set();
  const upper = String(text || "").toUpperCase();
  for (const token of LATIN_RARITIES) {
    if (new RegExp(`(?:^|[^A-Z])${token}(?=[^A-Z]|$)`).test(upper)) found.add(token);
  }
  let hangul = compact(text);
  for (const [code, word] of KOREAN_RARITIES) {
    if (!hangul.includes(word)) continue;
    found.add(code);
    hangul = hangul.split(word).join("");
  }
  return LATIN_RARITIES.filter((token) => found.has(token));
}

function mentionsCardGame(text) {
  const normalized = compact(text);
  return ["포켓몬카드", "포카", "확장팩", "카드게임"].some((word) => normalized.includes(word));
}

function mentionsPack(text, packName) {
  return compact(text).includes(compact(packName));
}

function isBlocked(text) {
  const normalized = compact(text);
  return TEXT_BLOCKS.some((word) => normalized.includes(compact(word)));
}

export function rarityFits(text, card, siblings) {
  const mentioned = new Set(mentionedRarities(text));
  const base = baseRarity(siblings);
  if (card.rarity !== base) return mentioned.has(card.rarity);
  const higher = new Set(siblings.map((item) => item.rarity).filter((rarity) => rarity !== base));
  for (const rarity of mentioned) {
    if (higher.has(rarity)) return false;
  }
  return true;
}

export function isRelevantCardPost(post, { card, siblings, packName, names }) {
  const text = `${post.title} ${post.description}`;
  if (!mentionsName(text, cardHeadingFrom(card), names)) return false;
  if (!mentionsPack(text, packName)) return false;
  if (!mentionsCardGame(text)) return false;
  if (isBlocked(text)) return false;
  return rarityFits(text, card, siblings);
}

export function isRelevantPackPost(post, packName) {
  const text = `${post.title} ${post.description}`;
  if (!mentionsPack(text, packName)) return false;
  if (!mentionsCardGame(text)) return false;
  return !isBlocked(text);
}

function httpUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

export function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compactDate = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (compactDate) return `${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(parsed)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function parseSearchItem(raw, source) {
  if (!raw || typeof raw !== "object") return null;
  const title = truncate(stripHtml(raw.title || ""), 180);
  const description = truncate(stripHtml(raw.description || ""), 140);
  const link = httpUrl(source === "news" ? raw.originallink : "") || httpUrl(raw.link);
  if (!title || !link) return null;
  return {
    source,
    title,
    description,
    link,
    date: normalizeDate(raw.postdate || raw.pubDate || ""),
    origin: stripHtml(raw.bloggername || raw.cafename || ""),
  };
}

export function formatCount(value) {
  return `${Number(value || 0).toLocaleString("ko-KR")}건`;
}

export function formatPostDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return "";
  return `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}

export function formatStamp(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}년 ${Number(parts.month)}월 ${Number(parts.day)}일 ${Number(parts.hour)}시 기준`;
}

function postMeta(post) {
  return [formatPostDate(post.date), post.origin].filter(Boolean).join(", ");
}

function sortPosts(posts) {
  return posts
    .map((post, index) => ({ post, index }))
    .sort((a, b) => {
      const left = a.post.date || "";
      const right = b.post.date || "";
      if (left !== right) {
        if (!left) return 1;
        if (!right) return -1;
        return right.localeCompare(left);
      }
      return a.index - b.index;
    })
    .map((row) => row.post);
}

export function visibleGroups(posts, limits) {
  return ["blog", "cafe", "news"].flatMap((source) => {
    const items = sortPosts((posts || []).filter((post) => post.source === source))
      .slice(0, limits[source] || 0)
      .map((post) => ({
        title: post.title,
        description: post.description,
        link: post.link,
        meta: postMeta(post),
      }));
    if (!items.length) return [];
    return [{ source, label: SOURCE_LABELS[source], posts: items }];
  });
}

export function rankCards(set, block) {
  if (!block?.cards) return [];
  const rows = [];
  for (const card of set.cards || []) {
    const entry = block.cards[card.number];
    if (!entry?.mentions) continue;
    rows.push({
      number: card.number,
      name: cardHeadingFrom(card),
      rarity: card.rarity,
      collector: `${card.number}/${card.printedIn}`,
      mentions: entry.mentions,
    });
  }
  rows.sort(
    (a, b) => b.mentions - a.mentions || rarityRank(b.rarity) - rarityRank(a.rarity) || a.number.localeCompare(b.number),
  );
  return rows;
}

const EMPTY_LABEL = "아직 모은 커뮤니티 반응이 없습니다. 몇 시간마다 네이버 검색으로 갱신합니다.";
const FILTERED_LABEL = "이 조건에 맞는 최신 글이 없습니다.";

export function presentCard(snapshot, set, card) {
  const block = snapshot?.sets?.[set.id];
  const entry = block?.cards?.[card.number];
  const ready = Boolean(entry);
  const names = (set.cards || []).map(cardHeadingFrom);
  const siblings = (set.cards || []).filter((item) => cardHeadingFrom(item) === cardHeadingFrom(card));
  const news = (block?.posts || []).filter(
    (post) => post.source === "news" && isRelevantCardPost(post, { card, siblings, packName: set.nameKo, names }),
  );
  const groups = visibleGroups([...(entry?.posts || []), ...news], CARD_LIMITS);
  return {
    ready,
    mentions: entry?.mentions || 0,
    countLabel: ready ? `최근 언급 ${formatCount(entry.mentions || 0)}` : "",
    stamp: formatStamp(entry?.updatedAt || null),
    groups,
    emptyLabel: ready ? FILTERED_LABEL : EMPTY_LABEL,
  };
}

export function presentPack(snapshot, set) {
  const block = snapshot?.sets?.[set.id];
  const ready = Boolean(block);
  return {
    ready,
    mentions: block?.mentions || 0,
    countLabel: ready ? `최근 언급 ${formatCount(block.mentions || 0)}` : "",
    stamp: formatStamp(block?.updatedAt || null),
    groups: visibleGroups(block?.posts || [], PACK_LIMITS),
    ranking: rankCards(set, block)
      .slice(0, 10)
      .map((row) => ({ ...row, countLabel: formatCount(row.mentions) })),
    emptyLabel: ready ? FILTERED_LABEL : EMPTY_LABEL,
  };
}

function staleScore(previous, setId, number) {
  const updated = previous?.sets?.[setId]?.cards?.[number]?.updatedAt;
  if (!updated) return 0;
  const time = Date.parse(updated);
  return Number.isFinite(time) ? time : 0;
}

export function planJobs(sets, previous, maxCalls) {
  const packJobs = [];
  const cardJobs = [];
  for (const set of sets) {
    packJobs.push({
      kind: "pack",
      setId: set.id,
      set,
      query: buildPackQuery(set),
      sources: PACK_SOURCES,
      display: 30,
      cardNumbers: [],
    });
    const groups = new Map();
    for (const card of set.cards || []) {
      const siblings = set.cards.filter((item) => cardHeadingFrom(item) === cardHeadingFrom(card));
      const query = buildCardQuery(set, card, siblings);
      if (!groups.has(query)) groups.set(query, []);
      groups.get(query).push(card.number);
    }
    for (const [query, numbers] of groups) {
      cardJobs.push({
        kind: "card",
        setId: set.id,
        set,
        query,
        sources: CARD_SOURCES,
        display: 15,
        cardNumbers: numbers,
        staleAt: Math.min(...numbers.map((number) => staleScore(previous, set.id, number))),
      });
    }
  }
  cardJobs.sort((a, b) => a.staleAt - b.staleAt || a.cardNumbers[0].localeCompare(b.cardNumbers[0]));
  const selected = [];
  let budget = maxCalls;
  for (const job of [...packJobs, ...cardJobs]) {
    if (job.sources.length > budget) continue;
    selected.push(job);
    budget -= job.sources.length;
  }
  return selected;
}

function citations(items, source, accept) {
  const posts = [];
  for (const raw of items || []) {
    const post = parseSearchItem(raw, source);
    if (!post || (accept && !accept(post))) continue;
    posts.push(post);
  }
  return posts;
}

function limitStored(posts) {
  const unique = [];
  const seen = new Set();
  for (const post of posts) {
    if (!post?.link || seen.has(post.link)) continue;
    seen.add(post.link);
    unique.push(post);
  }
  const stored = [];
  for (const source of ["blog", "cafe", "news"]) {
    stored.push(...sortPosts(unique.filter((post) => post.source === source)).slice(0, 6));
  }
  return stored;
}

function mentionTotal(sources) {
  return (sources?.blog?.total || 0) + (sources?.cafe?.total || 0);
}

function ensureBlock(snapshot, setId) {
  if (!snapshot.sets[setId]) {
    snapshot.sets[setId] = { updatedAt: null, query: "", mentions: 0, posts: [], sources: {}, cards: {} };
  }
  const block = snapshot.sets[setId];
  block.posts ||= [];
  block.sources ||= {};
  block.cards ||= {};
  return block;
}

function ensureCard(block, number) {
  if (!block.cards[number]) {
    block.cards[number] = { updatedAt: null, query: "", mentions: 0, posts: [], sources: {} };
  }
  const entry = block.cards[number];
  entry.posts ||= [];
  entry.sources ||= {};
  return entry;
}

function applyResult(entity, source, result, posts, now) {
  entity.sources[source] = { total: Number(result.total) || 0, ok: true };
  entity.posts = limitStored([...(entity.posts || []).filter((post) => post.source !== source), ...posts]);
  entity.mentions = mentionTotal(entity.sources);
  entity.updatedAt = now;
}

export async function collectReactions({
  sets,
  previous,
  search,
  now = new Date(),
  maxCalls = 480,
}) {
  const next = structuredClone(previous && previous.version === 1 ? previous : emptySnapshot());
  next.version = 1;
  next.note = emptySnapshot().note;
  next.sets ||= {};
  const liveIds = new Set(sets.map((set) => set.id));
  for (const id of Object.keys(next.sets)) {
    if (!liveIds.has(id)) delete next.sets[id];
  }
  const jobs = planJobs(sets, next, maxCalls);
  const errors = [];
  let calls = 0;
  let halted = false;
  let changed = false;
  const nowIso = now.toISOString();

  for (const job of jobs) {
    if (halted) break;
    const names = (job.set.cards || []).map(cardHeadingFrom);
    const targets =
      job.kind === "card"
        ? job.cardNumbers.map((number) => job.set.cards.find((card) => card.number === number)).filter(Boolean)
        : [];
    const sample = targets[0];
    const siblings = sample
      ? job.set.cards.filter((card) => cardHeadingFrom(card) === cardHeadingFrom(sample))
      : [];
    for (const source of job.sources) {
      if (halted) break;
      calls += 1;
      let result;
      try {
        result = await search({ source, query: job.query, display: job.display });
      } catch {
        result = { ok: false, status: 0 };
      }
      if (!result?.ok) {
        errors.push({ query: job.query, source, status: result?.status || 0 });
        if (result?.halt) halted = true;
        continue;
      }
      const posts = citations(result.items, source, (post) =>
        job.kind === "pack"
          ? isRelevantPackPost(post, job.set.nameKo)
          : isRelevantCardPost(post, { card: sample, siblings, packName: job.set.nameKo, names }),
      );
      if (job.kind === "pack") {
        const block = ensureBlock(next, job.setId);
        block.query = job.query;
        applyResult(block, source, result, posts, nowIso);
      } else {
        const block = ensureBlock(next, job.setId);
        for (const number of job.cardNumbers) {
          const entry = ensureCard(block, number);
          entry.query = job.query;
          applyResult(entry, source, result, posts, nowIso);
        }
      }
      changed = true;
    }
  }

  if (changed) next.updatedAt = nowIso;
  return { snapshot: next, calls, errors, halted };
}

export async function refreshSnapshot({ sets, previous, env = {}, search, now = new Date(), maxCalls = 480 }) {
  const snapshot = previous || emptySnapshot();
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    return { snapshot, calls: 0, errors: [], halted: false, skipped: "no-key" };
  }
  const result = await collectReactions({ sets, previous: snapshot, search, now, maxCalls });
  return { ...result, skipped: null };
}

export function createNaverSearch({
  fetchImpl = globalThis.fetch,
  clientId,
  clientSecret,
  pause = async () => {},
  timeoutMs = 12000,
} = {}) {
  return async function search({ source, query, display }) {
    const path = SOURCE_PATHS[source] || source;
    const url = new URL(`/search/v1/${path}`, "https://naverapihub.apigw.ntruss.com");
    url.searchParams.set("query", query);
    url.searchParams.set("display", String(display));
    url.searchParams.set("start", "1");
    url.searchParams.set("sort", "date");
    url.searchParams.set("format", "json");
    let lastStatus = 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt > 0) await pause(1200);
      try {
        const response = await fetchImpl(url, {
          headers: {
            "X-NCP-APIGW-API-KEY-ID": clientId,
            "X-NCP-APIGW-API-KEY": clientSecret,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        lastStatus = response.status;
        if (response.status === 429) {
          if (attempt === 0) continue;
          return { ok: false, status: 429, halt: true };
        }
        if (response.status >= 500 && attempt === 0) continue;
        const text = await response.text();
        let body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = null;
        }
        if (!response.ok || !body || body.error || body.errorCode || body.errMsg) {
          return { ok: false, status: response.status };
        }
        await pause(150);
        return {
          ok: true,
          total: Number(body.total) || 0,
          items: Array.isArray(body.items) ? body.items : [],
        };
      } catch {
        if (attempt === 0) continue;
        return { ok: false, status: lastStatus || 0 };
      }
    }
    return { ok: false, status: lastStatus || 0, halt: lastStatus === 429 };
  };
}
