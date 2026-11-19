export function externalLinks(set) {
  const raw = set && set.externalLinks;
  if (!Array.isArray(raw)) return [];
  const links = [];
  for (const link of raw) {
    if (!link || typeof link.label !== "string" || typeof link.href !== "string") continue;
    const label = link.label.trim();
    const href = link.href.trim();
    if (!label || !/^https?:\/\//i.test(href)) continue;
    links.push({ label, href });
  }
  return links;
}
