import type { FaceCard, GameView } from "./view.ts";

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
  if (!path || !/^(?:images\/cards\/[a-z0-9-]+\/[A-Za-z0-9.-]+|game\/cards\/\d+(?:-thumb)?\.webp)$/.test(path)) return null;
  const base = import.meta.env?.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return new URL(path, origin + root).href;
}

function zoomButton(src: string, full: string, label: string, width: number, height: number): string {
  return `<button type="button" class="ptcg-zoom-image" data-zoom-open data-full="${esc(full)}" data-alt="${label}" aria-label="${label} 확대"><img src="${esc(src)}" alt="" width="${width}" height="${height}" loading="lazy" decoding="async" /></button>`;
}

function cardHtml(card: FaceCard, caption: boolean): string {
  if (card.hidden) return `<div class="ptcg-card"><div class="ptcg-back" aria-label="뒷면"></div></div>`;
  const src = imageSrc(card.image);
  const full = imageSrc(card.fullImage || card.image);
  const name = esc(card.name);
  const hp = card.hp != null && card.maxHp != null ? `${card.hp}/${card.maxHp}` : "";
  const energies = card.energies
    .map((energy) => `<i class="swatch ${ENERGY_CLASS[energy] || "swatch-colorless"}"></i>`)
    .join("");
  const body =
    src && full
      ? zoomButton(src, full, name, 120, 168)
      : src
        ? `<img src="${esc(src)}" alt="${name}" width="120" height="168" loading="lazy" decoding="async" />`
        : `<div class="ptcg-textcard"><span>${esc(card.typeLabel || card.kind || "카드")}</span><strong>${name}</strong><span>${hp ? `HP ${esc(hp.split("/")[1] || hp)}` : ""}</span></div>`;
  const meta = caption ? `<span class="ptcg-caption">${name}${hp ? ` ${esc(hp)}` : ""}</span>${energies ? `<span class="ptcg-energies">${energies}</span>` : ""}` : "";
  return `<div class="ptcg-card">${body}${meta}</div>`;
}

function emptySlot(label: string): string {
  return `<div class="ptcg-card"><div class="ptcg-empty ptcg-slot" aria-label="${esc(label)}">${esc(label)}</div></div>`;
}

function prizeGrid(count: number): string {
  const capped = Math.max(0, Math.min(6, count));
  const cells = Array.from({ length: 6 }, (_, index) => {
    if (index < capped) {
      return `<div class="ptcg-card ptcg-prize-card"><div class="ptcg-back" aria-hidden="true"></div></div>`;
    }
    return `<div class="ptcg-card ptcg-prize-card ptcg-prize-card--gone"><div class="ptcg-empty" aria-hidden="true"></div></div>`;
  }).join("");
  return `<div class="ptcg-prize-grid" aria-label="프라이즈 ${capped}">${cells}</div>`;
}

function benchSlots(cards: FaceCard[]): string {
  return Array.from({ length: 5 }, (_, index) => {
    const card = cards[index];
    return card ? cardHtml(card, true) : emptySlot("빈자리");
  }).join("");
}

function pileLayers(depth: number): string {
  const n = Math.max(0, Math.min(depth, 3));
  return Array.from({ length: n }, (_, index) => `<span class="ptcg-pile-layer" style="--pile-i:${index + 1}" aria-hidden="true"></span>`).join("");
}

function faceThumb(card: FaceCard): string {
  const src = imageSrc(card.image);
  const name = esc(card.name);
  if (src) return `<img src="${esc(src)}" alt="" width="120" height="168" loading="lazy" decoding="async" />`;
  return `<div class="ptcg-textcard"><strong>${name}</strong></div>`;
}

function trashPile(side: GameView["you"], role: "you" | "opp"): string {
  const id = `pile-${role}-trash`;
  const count = side.discard.length;
  if (!count) {
    return `<div class="ptcg-cards"><div class="ptcg-card"><div class="ptcg-empty">없음</div></div></div>`;
  }
  const top = side.discard[count - 1];
  const body = side.discard.map((card) => cardHtml(card, true)).join("");
  return `<div class="ptcg-cards ptcg-pile-wrap">
    <button type="button" class="ptcg-pile ptcg-pile--trash" data-pile-open="${id}" aria-label="트래쉬 ${count}장">
      ${pileLayers(Math.min(count - 1, 3))}
      <span class="ptcg-pile-top ptcg-card">${faceThumb(top)}</span>
      <span class="ptcg-pile-badge">${count}</span>
    </button>
  </div>
  <template data-pile-body="${id}" data-pile-title="트래쉬 (${count})">${body}</template>`;
}

function deckPile(count: number, role: "you" | "opp"): string {
  const id = `pile-${role}-deck`;
  if (!count) {
    return `<div class="ptcg-cards"><div class="ptcg-card"><div class="ptcg-empty">없음</div></div></div>`;
  }
  return `<div class="ptcg-cards ptcg-pile-wrap">
    <button type="button" class="ptcg-pile ptcg-pile--deck" data-pile-open="${id}" aria-label="덱 ${count}장">
      ${pileLayers(Math.min(3, Math.max(1, Math.ceil(count / 20))))}
      <span class="ptcg-pile-top ptcg-card"><span class="ptcg-back" aria-hidden="true"><span class="ptcg-stack-count">${count}</span></span></span>
      <span class="ptcg-pile-badge">${count}</span>
    </button>
  </div>
  <template data-pile-body="${id}" data-pile-title="덱 (${count})"><p class="ptcg-pile-note">덱 ${count}장 (뒷면)</p></template>`;
}

function prizePile(count: number, role: "you" | "opp"): string {
  const id = `pile-${role}-prizes`;
  const capped = Math.max(0, Math.min(6, count));
  return `<div class="ptcg-cards ptcg-pile-wrap">
    <button type="button" class="ptcg-pile ptcg-pile--prizes" data-pile-open="${id}" aria-label="프라이즈 ${capped}장">
      ${pileLayers(capped > 0 ? Math.min(capped, 3) : 0)}
      <span class="ptcg-pile-top ptcg-card">${capped ? `<span class="ptcg-back" aria-hidden="true"></span>` : `<span class="ptcg-empty">없음</span>`}</span>
      <span class="ptcg-pile-badge">${capped}</span>
    </button>
  </div>
  <template data-pile-body="${id}" data-pile-title="프라이즈 (${capped})">${prizeGrid(capped)}</template>`;
}

function handKey(card: FaceCard): string {
  if (card.id != null) return `id:${card.id}`;
  return `name:${card.name}|${card.image || ""}`;
}

export function groupHandCards(cards: FaceCard[]): { card: FaceCard; count: number }[] {
  const groups: { card: FaceCard; count: number }[] = [];
  const indexByKey = new Map<string, number>();
  for (const card of cards) {
    const key = handKey(card);
    const existing = indexByKey.get(key);
    if (existing == null) {
      indexByKey.set(key, groups.length);
      groups.push({ card, count: 1 });
    } else {
      groups[existing].count += 1;
    }
  }
  return groups;
}

function handStackLayers(count: number): string {
  const depth = Math.min(Math.max(count - 1, 0), 3);
  return Array.from({ length: depth }, (_, index) => {
    const i = depth - index;
    return `<span class="ptcg-hand-stack-layer" style="--stack-i:${i}" aria-hidden="true"></span>`;
  }).join("");
}

function oppHandBacks(count: number): string {
  const n = Math.max(0, Math.min(count, 10));
  const backs = Array.from({ length: Math.min(n, 5) }, () => `<div class="ptcg-card ptcg-hand-back"><div class="ptcg-back" aria-hidden="true"></div></div>`).join("");
  return `<div class="ptcg-opp-hand" aria-label="상대 패 ${count}"><div class="ptcg-cards ptcg-hand ptcg-hand--backs">${backs || `<div class="ptcg-card"><div class="ptcg-empty">없음</div></div>`}</div><span class="ptcg-count">패 ${count}</span></div>`;
}

function fanHand(cards: FaceCard[]): string {
  if (!cards.length) {
    return `<div class="ptcg-cards ptcg-hand ptcg-hand--fan" aria-label="패 0"><div class="ptcg-card"><div class="ptcg-empty">없음</div></div></div>`;
  }
  const groups = groupHandCards(cards);
  const mid = (groups.length - 1) / 2;
  const items = groups
    .map((group, index) => {
      const offset = index - mid;
      const rotate = offset * 4.5;
      const lift = Math.abs(offset) * 2;
      const badge = group.count > 1 ? `<span class="ptcg-hand-stack-badge">x${group.count}</span>` : "";
      const layers = handStackLayers(group.count);
      return `<div class="ptcg-fan-card ptcg-hand-stack" data-card-id="${group.card.id ?? ""}" data-count="${group.count}" style="--fan-i:${offset};--fan-rot:${rotate}deg;--fan-lift:${lift}px">${layers}${cardHtml(group.card, false)}${badge}</div>`;
    })
    .join("");
  return `<div class="ptcg-cards ptcg-hand ptcg-hand--fan" aria-label="패 ${cards.length}">${items}</div>`;
}

function sideHtml(title: string, side: GameView["you"], role: "you" | "opp"): string {
  const status = side.conditions.length ? side.conditions.join(" ") : "";
  const active =
    side.active.map((card) => cardHtml(card, true)).join("") ||
    `<div class="ptcg-card"><div class="ptcg-empty">없음</div></div>`;
  const handBlock =
    role === "opp"
      ? `<div class="ptcg-zone ptcg-zone--hand"><span class="ptcg-zone-label">패</span>${oppHandBacks(side.handCount)}</div>`
      : "";
  return `<section class="ptcg-playmat ptcg-playmat--${role}" aria-label="${esc(title)}">
    <header class="ptcg-playmat-head"><h2>${esc(title)}</h2>${status ? `<p class="ptcg-status">${esc(status)}</p>` : ""}</header>
    ${handBlock}
    <div class="ptcg-zone ptcg-zone--prizes"><span class="ptcg-zone-label">프라이즈</span>${prizePile(side.prizeCount, role)}</div>
    <div class="ptcg-zone ptcg-zone--bench"><span class="ptcg-zone-label">벤치</span><div class="ptcg-cards ptcg-bench">${benchSlots(side.bench)}</div></div>
    <div class="ptcg-zone ptcg-zone--deck"><span class="ptcg-zone-label">덱</span>${deckPile(side.deckCount, role)}</div>
    <div class="ptcg-zone ptcg-zone--active"><span class="ptcg-zone-label">배틀필드</span><div class="ptcg-cards">${active}</div></div>
    <div class="ptcg-zone ptcg-zone--trash"><span class="ptcg-zone-label">트래쉬</span>${trashPile(side, role)}</div>
  </section>`;
}

function optionHtml(option: GameView["options"][number]): string {
  const src = imageSrc(option.image);
  const full = imageSrc(option.fullImage || option.image);
  const label = esc(option.label);
  const select = `<button type="button" data-option="${option.index}"><span>${label}</span></button>`;
  if (!src || !full) return select;
  const image = zoomButton(src, full, label, 72, 100);
  const zoom = `<button type="button" class="ptcg-enlarge" data-zoom-open data-full="${esc(full)}" data-alt="${label}" aria-label="${label} 확대">확대</button>`;
  return `<div class="ptcg-option">${image}${select}${zoom}</div>`;
}

export function turnOwnerLabel(view: GameView): string {
  if (view.phase === "over") return "종료";
  if (view.prompt === "상대가 고르는 중") return "상대 턴";
  return "내 턴";
}

function endTurnOption(view: GameView): GameView["options"][number] | null {
  return view.options.find((option) => option.label === "턴 종료") || null;
}

function battleBoardHtml(view: GameView, note: string): string {
  const endTurn = endTurnOption(view);
  const options = view.options
    .filter((option) => !endTurn || option.index !== endTurn.index)
    .map((option) => optionHtml(option))
    .join("");
  const multi = view.phase === "choose" && view.maxCount >= 1 && !(view.maxCount === 1 && view.minCount >= 1);
  const confirm = multi
    ? `<button type="button" data-confirm${view.minCount > 0 ? " disabled" : ""}>${view.minCount === 0 ? "넘기기" : "결정"}</button>`
    : "";
  const banner = view.resultText ? `<p class="ptcg-result" role="status">${esc(view.resultText)}</p>` : "";
  const log = view.log.map((line) => `<li>${esc(line)}</li>`).join("");
  const stadium = view.stadium
    ? `<div class="ptcg-stadium"><span class="ptcg-zone-label">스타디움</span><div class="ptcg-cards">${cardHtml(view.stadium, true)}</div></div>`
    : `<div class="ptcg-stadium ptcg-stadium--empty" aria-hidden="true"><span class="ptcg-zone-label">스타디움</span></div>`;
  const myHand = view.you.hand ? fanHand(view.you.hand) : `<p class="ptcg-count">패 ${view.you.handCount}</p>`;
  const endTurnBtn = endTurn
    ? `<button type="button" class="ptcg-hud-end" data-option="${endTurn.index}">턴 종료</button>`
    : `<button type="button" class="ptcg-hud-end" disabled>턴 종료</button>`;
  const actions =
    view.phase === "over"
      ? `<p class="ptcg-actions"><button type="button" data-restart>다시 하기</button> <button type="button" data-decks>덱 고르기</button></p>`
      : "";

  return `<div class="ptcg-battle" data-battle>
    <div class="ptcg-battle-hud" role="toolbar" aria-label="대전 정보">
      <button type="button" class="ptcg-hud-exit" data-exit>나가기</button>
      <div class="ptcg-hud-meta">
        <span class="ptcg-hud-turn">턴 ${view.turn}</span>
        <span class="ptcg-hud-who">${esc(turnOwnerLabel(view))}</span>
        <span class="ptcg-hud-prizes">프라이즈 나 ${view.you.prizeCount} / 상대 ${view.opp.prizeCount}</span>
      </div>
      ${endTurnBtn}
      <button type="button" class="ptcg-hud-log" data-log-open aria-expanded="false" aria-controls="ptcg-log-drawer">기록</button>
    </div>
    ${banner}
    <div class="ptcg-battle-stage">
      <div class="ptcg-battle-board">
        <div class="ptcg-table">
          ${sideHtml("상대", view.opp, "opp")}
          ${stadium}
          ${sideHtml("나", view.you, "you")}
        </div>
        <div class="ptcg-zone ptcg-zone--hand ptcg-zone--my-hand"><span class="ptcg-zone-label">패</span>${myHand}</div>
      </div>
    </div>
    <div class="ptcg-controls ptcg-battle-controls">
      <p class="ptcg-prompt" role="status">${esc(note || view.prompt)}</p>
      <div class="ptcg-options" role="group" aria-label="선택">${options}${confirm}</div>
      ${actions}
    </div>
    <aside id="ptcg-log-drawer" class="ptcg-log-drawer" data-log-drawer hidden>
      <div class="ptcg-log-drawer-head">
        <h2 class="ptcg-log-title">기록</h2>
        <button type="button" class="ptcg-log-close" data-log-close>닫기</button>
      </div>
      <ol class="ptcg-log">${log}</ol>
    </aside>
    <dialog class="ptcg-pile-sheet" data-pile-sheet aria-label="카드 더미">
      <div class="ptcg-pile-sheet-head">
        <h2 class="ptcg-pile-sheet-title" data-pile-sheet-title>더미</h2>
        <button type="button" class="ptcg-pile-sheet-close" data-pile-sheet-close>닫기</button>
      </div>
      <div class="ptcg-pile-sheet-body" data-pile-sheet-body></div>
    </dialog>
  </div>`;
}

export function boardHtml(view: GameView, note = ""): string {
  return battleBoardHtml(view, note);
}

export function setBattleChrome(active: boolean): void {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("ptcg-battle-active", active);
  document.documentElement.classList.toggle("ptcg-battle-active", active);
}

export function openLogDrawer(root: Element): void {
  const drawer = root.querySelector("[data-log-drawer]");
  if (!(drawer instanceof HTMLElement)) return;
  drawer.hidden = false;
  root.querySelector("[data-log-open]")?.setAttribute("aria-expanded", "true");
  const log = drawer.querySelector(".ptcg-log");
  if (log) log.scrollTop = log.scrollHeight;
}

export function closeLogDrawer(root: Element): void {
  const drawer = root.querySelector("[data-log-drawer]");
  if (!(drawer instanceof HTMLElement)) return;
  drawer.hidden = true;
  root.querySelector("[data-log-open]")?.setAttribute("aria-expanded", "false");
}

export function openPileSheet(root: Element, pileId: string): void {
  const source = root.querySelector(`template[data-pile-body="${pileId}"]`);
  const sheet = root.querySelector("[data-pile-sheet]");
  if (!(source instanceof HTMLTemplateElement) || !(sheet instanceof HTMLDialogElement)) return;
  const title = source.getAttribute("data-pile-title") || "더미";
  const titleEl = sheet.querySelector("[data-pile-sheet-title]");
  const bodyEl = sheet.querySelector("[data-pile-sheet-body]");
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) {
    bodyEl.innerHTML = "";
    bodyEl.append(source.content.cloneNode(true));
  }
  if (typeof sheet.showModal === "function" && !sheet.open) sheet.showModal();
}

export function closePileSheet(root: Element): void {
  const sheet = root.querySelector("[data-pile-sheet]");
  if (sheet instanceof HTMLDialogElement && sheet.open) sheet.close();
}
