import type { FaceCard } from "./view.ts";

const ENERGY_CLASS: Record<string, string> = {
  colorless: "swatch-colorless",
  grass: "swatch-grass",
  fire: "swatch-fire",
  water: "swatch-water",
  electric: "swatch-electric",
  psychic: "swatch-psychic",
  fighting: "swatch-fighting",
  dark: "swatch-dark",
  steel: "swatch-steel",
  dragon: "swatch-dragon",
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function imageSrc(path: string | null): string | null {
  if (!path || !/^(?:images\/cards\/[a-z0-9-]+\/[A-Za-z0-9.-]+|game\/cards\/\d+(?:-thumb)?\.webp)$/.test(path)) {
    return null;
  }
  const base = import.meta.env?.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return new URL(path, origin + root).href;
}

function zoomButton(src: string, full: string, label: string, width: number, height: number): string {
  return `<button type="button" class="ptcg-zoom-image" data-zoom-open data-full="${esc(full)}" data-alt="${label}" aria-label="${label} 확대"><img src="${esc(src)}" alt="" width="${width}" height="${height}" loading="lazy" decoding="async" /></button>`;
}

/** Physical-game tilt for special conditions on the active Pokemon. */
export function rotateClassForConditions(conditions: string[]): string {
  if (conditions.includes("잠듦")) return "ptcg-card--tilt-sleep";
  if (conditions.includes("마비")) return "ptcg-card--tilt-paralyze";
  if (conditions.includes("혼란")) return "ptcg-card--tilt-confuse";
  return "";
}

function energyStrip(energies: string[]): string {
  if (!energies.length) return "";
  const icons = energies
    .map((energy) => `<i class="swatch ${ENERGY_CLASS[energy] || "swatch-colorless"}" aria-hidden="true"></i>`)
    .join("");
  return `<span class="ptcg-energies" aria-label="에너지 ${energies.length}">${icons}</span>`;
}

function overlays(card: FaceCard, active: boolean): string {
  const parts: string[] = [];
  if (card.hp != null && card.maxHp != null) {
    parts.push(`<span class="ptcg-hp" data-hp-badge aria-label="HP ${card.hp}">${card.hp}</span>`);
    const damage = Math.max(0, card.maxHp - card.hp);
    if (damage > 0) {
      parts.push(`<span class="ptcg-damage" data-damage aria-label="데미지 ${damage}">${damage}</span>`);
    }
    const pct = card.maxHp > 0 ? Math.max(0, Math.min(100, (card.hp / card.maxHp) * 100)) : 0;
    parts.push(
      `<span class="ptcg-hp-bar" aria-hidden="true"><span class="ptcg-hp-bar__fill" style="width:${pct.toFixed(1)}%"></span></span>`,
    );
  }
  parts.push(energyStrip(card.energies));
  for (const tool of card.tools) {
    parts.push(`<span class="ptcg-tool" data-tool>${esc(tool)}</span>`);
  }
  if (card.prizeValue != null && (card.ex || card.megaEx)) {
    const mark = card.megaEx ? "메가 ex" : "ex";
    parts.push(
      `<span class="ptcg-prize-mark" data-prize aria-label="${mark} 프라이즈 ${card.prizeValue}"><span class="ptcg-prize-mark__tag">${mark}</span><span class="ptcg-prize-mark__value">프라이즈 ${card.prizeValue}</span></span>`,
    );
  }
  if (active && card.conditions.length) {
    const badges = card.conditions
      .map((condition) => `<span class="ptcg-condition" data-condition="${esc(condition)}">${esc(condition)}</span>`)
      .join("");
    parts.push(`<span class="ptcg-conditions">${badges}</span>`);
  }
  return parts.filter(Boolean).join("");
}

/** Active or bench Pokemon with HP, damage, energy, tool, and status overlays. */
export function playCardHtml(card: FaceCard, options: { active: boolean }): string {
  if (card.hidden) {
    return `<div class="ptcg-card"><div class="ptcg-back" aria-label="뒷면"></div></div>`;
  }
  const src = imageSrc(card.image);
  const full = imageSrc(card.fullImage || card.image);
  const name = esc(card.name);
  const body =
    src && full
      ? zoomButton(src, full, name, 120, 168)
      : src
        ? `<img src="${esc(src)}" alt="${name}" width="120" height="168" loading="lazy" decoding="async" />`
        : `<div class="ptcg-textcard"><span>${esc(card.typeLabel || card.kind || "카드")}</span><strong>${name}</strong></div>`;
  const tilt = options.active ? rotateClassForConditions(card.conditions) : "";
  const classes = ["ptcg-card", "ptcg-card--play", tilt].filter(Boolean).join(" ");
  const caption = `<span class="ptcg-caption">${name}</span>`;
  return `<div class="${classes}"><div class="ptcg-card__face">${body}${overlays(card, options.active)}</div>${caption}</div>`;
}
