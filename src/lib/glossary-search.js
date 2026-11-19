export function normalizeGlossaryQuery(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, "");
}

export function glossaryHaystack(term) {
  return normalizeGlossaryQuery([term.term, term.english, ...(term.aliases ?? [])].join(" "));
}

export function glossaryMatches(term, query) {
  const needle = normalizeGlossaryQuery(query);
  if (!needle) return true;
  return glossaryHaystack(term).includes(needle);
}
