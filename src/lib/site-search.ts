export interface SearchItem {
  k: "card" | "set" | "term";
  t: string;
  s: string;
  m: string;
  h: string;
  i: string;
  q: string;
}

export function fold(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

export function matchSearch(items: SearchItem[], query: string, limit = 8): SearchItem[] {
  const needle = fold(query.trim());
  if (!needle) return [];
  const hits: { item: SearchItem; score: number }[] = [];
  for (const item of items) {
    const title = fold(item.t);
    let score = 0;
    if (title === needle) score = 300;
    else if (title.startsWith(needle)) score = 200;
    else if (title.includes(needle)) score = 120;
    else if (item.q.includes(needle)) score = 60;
    else continue;
    if (item.k === "set") score += 20;
    else if (item.k === "term") score += 8;
    hits.push({ item, score });
  }
  hits.sort((a, b) => b.score - a.score || a.item.t.localeCompare(b.item.t, "ko"));
  const strong = hits.filter((hit) => hit.score >= 120);
  const pool = strong.length > 0 ? strong : hits;
  return pool.slice(0, limit).map((hit) => hit.item);
}
