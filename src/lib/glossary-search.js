const FIELD = " | ";

export function normalizeGlossaryQuery(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function fields(term) {
  return [term.term, term.english, ...(term.aliases ?? [])]
    .filter((field) => typeof field === "string" && field.trim())
    .map((field) => normalizeGlossaryQuery(field));
}

export function glossaryHaystack(term) {
  return fields(term).join(FIELD);
}

function coversWholeTokens(tokens, needle) {
  for (let start = 0; start < tokens.length; start++) {
    let joined = "";
    const bounds = [];
    for (let end = start; end < tokens.length; end++) {
      bounds.push(joined.length);
      joined += tokens[end];
      let from = 0;
      while (from <= joined.length - needle.length) {
        const at = joined.indexOf(needle, from);
        if (at < 0) break;
        const stop = at + needle.length;
        let partialCross = false;
        for (let index = 0; index < bounds.length; index++) {
          const tokenStart = bounds[index];
          const tokenEnd = index + 1 < bounds.length ? bounds[index + 1] : joined.length;
          if (tokenEnd <= at || tokenStart >= stop) continue;
          const partial = tokenStart < at || tokenEnd > stop;
          if (!partial) continue;
          const touchesAnother = bounds.some((otherStart, other) => {
            if (other === index) return false;
            const otherEnd = other + 1 < bounds.length ? bounds[other + 1] : joined.length;
            return otherEnd > at && otherStart < stop;
          });
          if (touchesAnother) partialCross = true;
        }
        if (!partialCross) return true;
        from = at + 1;
      }
    }
  }
  return false;
}

function fieldMatches(field, query) {
  const haystack = normalizeGlossaryQuery(field);
  const needle = normalizeGlossaryQuery(query);
  if (!needle) return true;
  if (haystack.includes(needle)) return true;
  const compact = needle.replace(/ /g, "");
  if (!compact) return false;
  return coversWholeTokens(haystack.split(" ").filter(Boolean), compact);
}

export function haystackMatches(haystack, query) {
  const needle = normalizeGlossaryQuery(query);
  if (!needle) return true;
  return String(haystack)
    .split(FIELD)
    .some((field) => fieldMatches(field, needle));
}

export function glossaryMatches(term, query) {
  return haystackMatches(glossaryHaystack(term), query);
}
