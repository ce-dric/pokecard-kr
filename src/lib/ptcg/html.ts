/** Shared HTML helpers for /game UI modules. */

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

export function imageSrc(path: string | null): string | null {
  if (!path || !/^(?:images\/cards\/[a-z0-9-]+\/[A-Za-z0-9.-]+|game\/cards\/\d+(?:-thumb)?\.webp)$/.test(path)) {
    return null;
  }
  const base = import.meta.env?.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return new URL(path, origin + root).href;
}

export function fullFromThumb(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.endsWith("-thumb.webp")) return path.replace(/-thumb\.webp$/, ".webp");
  return path;
}
