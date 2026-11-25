import type { ChoiceOption, GameView } from "./view.ts";
import type { CardSpot } from "./actions.ts";
import { playableSpots, sameSpot } from "./actions.ts";
import { imageSrc } from "./html.ts";

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

export function spotKey(spot: CardSpot): string {
  return `${spot.playerIndex}:${spot.area}:${spot.index}`;
}

export function parseSpot(value: string | null | undefined): CardSpot | null {
  if (!value) return null;
  const [playerIndex, area, index] = value.split(":").map(Number);
  if (![playerIndex, area, index].every(Number.isInteger)) return null;
  return { playerIndex, area, index };
}

export function mappedFromView(view: GameView) {
  return view.options.map((option) => ({
    optionIndex: option.index,
    kind: option.kind,
    source: option.source,
    target: option.target,
    attackId: option.attackId,
    playAs: option.playAs,
  }));
}

export function actionVerb(option: ChoiceOption): string {
  if (option.kind === "play") return option.playAs === "bench" ? "벤치에 내기" : "사용하기";
  if (option.kind === "attach") return "에너지 붙이기";
  if (option.kind === "evolve") return "진화";
  if (option.kind === "ability") return "특성";
  if (option.kind === "attack") return cleanAttackLabel(option);
  if (option.kind === "retreat") return "후퇴";
  return option.label;
}

function cleanAttackLabel(option: ChoiceOption): string {
  const damage = option.damage ? ` ${option.damage}` : "";
  const name = option.label.replace(/^공격\s+/, "");
  return `${name}${damage}`;
}

export function energySwatches(energies: string[] | undefined): string {
  return (energies || [])
    .map((energy) => `<i class="swatch ${ENERGY_CLASS[energy] || "swatch-colorless"}" aria-hidden="true"></i>`)
    .join("");
}

export function handActionMenuHtml(options: ChoiceOption[]): string {
  if (!options.length) return "";
  const unique = new Map<string, ChoiceOption>();
  for (const option of options) {
    const key = option.kind === "play" ? `play:${option.playAs || "use"}` : option.kind;
    if (!unique.has(key)) unique.set(key, option);
  }
  const buttons = [...unique.values()]
    .map((option) => {
      const needsTarget = option.kind === "attach" || option.kind === "evolve";
      const attr = needsTarget
        ? `data-hand-intent="${option.kind}" data-hand-index="${option.source?.index ?? ""}"`
        : `data-option="${option.index}"`;
      return `<button type="button" ${attr}>${esc(actionVerb(option))}</button>`;
    })
    .join("");
  return `<div class="ptcg-card-actions" role="group" aria-label="카드 행동">${buttons}<button type="button" data-clear-selection>닫기</button></div>`;
}

export function attackSheetHtml(view: GameView): string {
  const attacks = view.options.filter((option) => option.kind === "attack");
  const retreat = view.options.find((option) => option.kind === "retreat");
  const ability = view.options.filter(
    (option) => option.kind === "ability" && option.source?.area === 4 && option.source.index === 0,
  );
  const rows = attacks
    .map((option) => {
      const cost = energySwatches(option.energies);
      const damage = option.damage != null ? `${option.damage}` : "-";
      return `<button type="button" class="ptcg-attack-row" data-option="${option.index}">
        <span class="ptcg-attack-cost">${cost || '<span class="ptcg-attack-free">없음</span>'}</span>
        <span class="ptcg-attack-name">${esc(option.label.replace(/^공격\s+/, ""))}</span>
        <span class="ptcg-attack-damage">${esc(damage)}</span>
        <span class="ptcg-attack-ready">사용 가능</span>
      </button>`;
    })
    .join("");
  const abilityRows = ability
    .map((option) => `<button type="button" class="ptcg-attack-row" data-option="${option.index}"><span class="ptcg-attack-name">${esc(actionVerb(option))}</span></button>`)
    .join("");
  const retreatRow = retreat
    ? `<button type="button" class="ptcg-attack-row ptcg-attack-row--retreat" data-option="${retreat.index}">${esc(actionVerb(retreat))}</button>`
    : "";
  return `<div class="ptcg-attack-sheet" role="dialog" aria-label="공격">
    <header><h3>배틀 포켓몬</h3><button type="button" data-clear-selection>닫기</button></header>
    <div class="ptcg-attack-list">${rows || '<p class="ptcg-empty-note">쓸 수 있는 공격이 없습니다</p>'}${abilityRows}${retreatRow}</div>
  </div>`;
}

export function pickerHtml(view: GameView): string {
  const multi = view.maxCount >= 1 && !(view.maxCount === 1 && view.minCount >= 1);
  const cards = view.options
    .filter((option) => option.kind === "select" || option.source)
    .map((option) => {
      const src = imageSrc(option.image);
      const image = src
        ? `<img src="${esc(src)}" alt="" width="72" height="100" loading="lazy" decoding="async" />`
        : `<span class="ptcg-picker-fallback">${esc(option.label)}</span>`;
      return `<button type="button" class="ptcg-picker-card" data-option="${option.index}" aria-pressed="false">
        ${image}
        <span>${esc(option.label)}</span>
      </button>`;
    })
    .join("");
  const confirm = multi
    ? `<button type="button" data-confirm${view.minCount > 0 ? " disabled" : ""}>${view.minCount === 0 ? "넘기기" : "결정"}</button>`
    : "";
  const nonCard = view.options
    .filter((option) => !option.source && option.kind !== "select")
    .map((option) => `<button type="button" data-option="${option.index}">${esc(option.label)}</button>`)
    .join("");
  return `<div class="ptcg-picker" role="dialog" aria-label="카드 고르기">
    <header><h3>${esc(view.prompt)}</h3></header>
    <div class="ptcg-picker-grid">${cards || nonCard}</div>
    <div class="ptcg-picker-actions">${confirm}${nonCard && cards ? nonCard : ""}</div>
  </div>`;
}

export function quickActionsHtml(view: GameView): string {
  const end = view.options.find((option) => option.kind === "end");
  const yesNo = view.options.filter((option) => option.kind === "yes" || option.kind === "no");
  const numbers = view.options.filter((option) => option.kind === "number");
  const buttons = [...yesNo, ...numbers, ...(end ? [end] : [])]
    .map((option) => `<button type="button" data-option="${option.index}">${esc(option.label)}</button>`)
    .join("");
  return buttons ? `<div class="ptcg-quick" role="group" aria-label="빠른 선택">${buttons}</div>` : "";
}

export function fallbackOptionsHtml(view: GameView, optionHtml: (option: ChoiceOption) => string): string {
  const options = view.options.map((option) => optionHtml(option)).join("");
  const multi = view.phase === "choose" && view.maxCount >= 1 && !(view.maxCount === 1 && view.minCount >= 1);
  const confirm = multi
    ? `<button type="button" data-confirm${view.minCount > 0 ? " disabled" : ""}>${view.minCount === 0 ? "넘기기" : "결정"}</button>`
    : "";
  return `<details class="ptcg-fallback">
    <summary>텍스트로 고르기</summary>
    <div class="ptcg-options" role="group" aria-label="선택">${options}${confirm}</div>
  </details>`;
}

export function highlightClass(
  spot: CardSpot | null | undefined,
  playable: CardSpot[],
  selected: CardSpot | null,
  targets: CardSpot[],
): string {
  if (!spot) return "";
  const classes: string[] = [];
  if (playable.some((row) => sameSpot(row, spot))) classes.push("is-playable");
  if (selected && sameSpot(selected, spot)) classes.push("is-selected");
  if (targets.some((row) => sameSpot(row, spot))) classes.push("is-target");
  return classes.join(" ");
}

export function boardPlayable(view: GameView): CardSpot[] {
  return playableSpots(mappedFromView(view));
}
