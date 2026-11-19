export const COPY_LIMIT = 4;

export function exceedsCopyLimit(ids, unlimited) {
  const counts = new Map();
  for (const id of ids) {
    if (unlimited(id)) continue;
    const count = (counts.get(id) || 0) + 1;
    if (count > COPY_LIMIT) return true;
    counts.set(id, count);
  }
  return false;
}
