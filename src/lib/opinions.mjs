const SENTIMENTS = {
  positive: "호평",
  negative: "불만",
  mixed: "엇갈림",
  neutral: "중립",
};

const SOURCES = {
  x: "X",
  naver_cafe: "네이버 카페",
  dc: "디시",
  other: "커뮤니티",
};

export function cardOpinionId(setId, number) {
  return `${setId}-${number}`;
}

function cleanLine(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

export function quoteText(value, max = 80) {
  const text = cleanLine(value);
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, max - 3).join("")}...`;
}

function httpUrl(value) {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.href;
  } catch {
    return "";
  }
}

export function formatPostDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return "";
  return `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}

export function formatStamp(iso) {
  if (!iso || typeof iso !== "string") return "";
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

function sampleLabel(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return "";
  return `표본 ${value.toLocaleString("ko-KR")}건`;
}

function normalizePosts(posts) {
  if (!Array.isArray(posts)) return [];
  const out = [];
  for (const raw of posts) {
    try {
      const sourceLabel = SOURCES[raw?.source];
      const text = quoteText(raw?.text);
      const url = httpUrl(raw?.url);
      if (!sourceLabel || !text || !url) continue;
      out.push({
        source: raw.source,
        sourceLabel,
        text,
        url,
        dateLabel: formatPostDate(raw.date),
      });
    } catch {
      // One bad post must not drop the rest of the opinion.
    }
  }
  return out.slice(0, 5);
}

export function presentOpinion(file, id, bucket) {
  const entry = file?.[bucket]?.[id];
  if (!entry || typeof entry !== "object") return null;
  const summary = cleanLine(entry.summary);
  const sentiment = Object.hasOwn(SENTIMENTS, entry.sentiment) ? entry.sentiment : "";
  const posts = normalizePosts(entry.posts);
  if (!summary && posts.length === 0) return null;
  return {
    summary,
    sentiment,
    sentimentLabel: sentiment ? SENTIMENTS[sentiment] : "",
    sampleLabel: sampleLabel(entry.sampleSize),
    stamp: formatStamp(file?.updatedAt),
    posts,
  };
}

export function presentSetOpinion(file, setId) {
  return presentOpinion(file, setId, "sets");
}

export function presentCardOpinion(file, setId, number) {
  return presentOpinion(file, cardOpinionId(setId, number), "cards");
}
