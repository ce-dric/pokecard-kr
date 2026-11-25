import type { GameView, SideView } from "./view.ts";

export type FxSide = "you" | "opp";

export type FxEvent =
  | { kind: "turn"; side: FxSide }
  | { kind: "draw"; side: FxSide }
  | { kind: "play"; side: FxSide }
  | { kind: "trash"; side: FxSide }
  | { kind: "prize"; side: FxSide }
  | { kind: "attack"; side: FxSide }
  | { kind: "damage"; side: FxSide; amount: number }
  | { kind: "ko"; side: FxSide }
  | { kind: "coin"; head: boolean }
  | { kind: "result"; outcome: "win" | "lose" | "draw"; text: string };

export type SfxKind = "draw" | "attack" | "damage" | "ko" | "coin" | "turn" | "win" | "lose";

export type ZoneFx = {
  youActive: string[];
  oppActive: string[];
  youHand: string[];
  oppHand: string[];
  youTrash: string[];
  oppTrash: string[];
  youBench: string[];
  oppBench: string[];
  youPrizes: string[];
  oppPrizes: string[];
  youDeck: string[];
  oppDeck: string[];
};

const MUTE_KEY = "ptcg-sfx-muted";

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function sideFromWho(who: string): FxSide | null {
  if (who === "나" || who === "내") return "you";
  if (who === "상대") return "opp";
  return null;
}

export function newLogLines(prev: string[], next: string[]): string[] {
  if (!prev.length) return next.slice();
  if (next.length >= prev.length && prev.every((line, index) => line === next[index])) {
    return next.slice(prev.length);
  }
  return next.slice();
}

export function eventsFromLogLines(lines: string[]): FxEvent[] {
  const events: FxEvent[] = [];
  for (const line of lines) {
    if (line === "내 턴") {
      events.push({ kind: "turn", side: "you" });
      continue;
    }
    if (line === "상대 턴") {
      events.push({ kind: "turn", side: "opp" });
      continue;
    }
    if (line === "코인 앞") {
      events.push({ kind: "coin", head: true });
      continue;
    }
    if (line === "코인 뒤") {
      events.push({ kind: "coin", head: false });
      continue;
    }
    const draw = line.match(/^(나|상대) 드로우(?:\s|$)/);
    if (draw) {
      const side = sideFromWho(draw[1]);
      if (side) events.push({ kind: "draw", side });
      continue;
    }
    const attack = line.match(/^(나|상대) 공격(?:\s|$)/);
    if (attack) {
      const side = sideFromWho(attack[1]);
      if (side) events.push({ kind: "attack", side });
      continue;
    }
    const play = line.match(/^(나|상대) (사용|부착|진화|교체)(?:\s|$)/);
    if (play) {
      const side = sideFromWho(play[1]);
      if (side) events.push({ kind: "play", side });
      continue;
    }
    const hp = line.match(/HP\s+(\d+)\s*$/);
    if (hp) {
      const remaining = Number(hp[1]);
      if (Number.isFinite(remaining)) {
        // Log value is remaining HP; the numeric popup comes from the board diff.
        events.push({ kind: "damage", side: "opp", amount: 0 });
        if (remaining === 0) events.push({ kind: "ko", side: "opp" });
      }
      continue;
    }
    if (line.includes("트래쉬")) {
      events.push({ kind: "trash", side: "opp" });
      continue;
    }
  }
  return events;
}

function boardDiff(prev: SideView | undefined, next: SideView, side: FxSide): FxEvent[] {
  if (!prev) return [];
  const events: FxEvent[] = [];
  if (next.deckCount < prev.deckCount && next.handCount > prev.handCount) {
    events.push({ kind: "draw", side });
  }
  if (next.prizeCount < prev.prizeCount) {
    events.push({ kind: "prize", side });
  }
  if (next.discardCount > prev.discardCount) {
    events.push({ kind: "trash", side });
  }
  const prevHp = prev.active[0]?.hp;
  const nextHp = next.active[0]?.hp;
  if (prevHp != null && nextHp != null && nextHp < prevHp) {
    events.push({ kind: "damage", side, amount: prevHp - nextHp });
    if (nextHp <= 0) events.push({ kind: "ko", side });
  }
  const prevBoard = prev.bench.length + (prev.active[0] && !prev.active[0].hidden ? 1 : 0);
  const nextBoard = next.bench.length + (next.active[0] && !next.active[0].hidden ? 1 : 0);
  if (nextBoard > prevBoard || (next.handCount < prev.handCount && nextBoard >= prevBoard && next.discardCount === prev.discardCount)) {
    events.push({ kind: "play", side });
  }
  return events;
}

export function resultOutcome(text: string | null | undefined): "win" | "lose" | "draw" {
  if (!text) return "lose";
  if (text.startsWith("이겼습니다")) return "win";
  if (text.startsWith("무승부")) return "draw";
  return "lose";
}

function resultEvent(view: GameView): FxEvent | null {
  if (view.phase !== "over" || !view.resultText) return null;
  return { kind: "result", outcome: resultOutcome(view.resultText), text: view.resultText };
}

function dedupe(events: FxEvent[]): FxEvent[] {
  const seen = new Set<string>();
  const out: FxEvent[] = [];
  for (const event of events) {
    const key =
      event.kind === "damage"
        ? `${event.kind}:${event.side}:${event.amount}`
        : event.kind === "coin"
          ? `${event.kind}:${event.head}`
          : event.kind === "result"
            ? `${event.kind}:${event.outcome}`
            : `${event.kind}:${"side" in event ? event.side : ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }
  return out;
}

export function collectFxEvents(prev: GameView | null, next: GameView): FxEvent[] {
  // First paint should not replay the whole log as motion.
  if (!prev) {
    const result = resultEvent(next);
    return result ? [result] : [];
  }
  const fromLogs = eventsFromLogLines(newLogLines(prev.log, next.log));
  const fromYou = boardDiff(prev.you, next.you, "you");
  const fromOpp = boardDiff(prev.opp, next.opp, "opp");
  const result = resultEvent(next);
  // Only announce a result when the match just ended.
  const endedNow = prev.phase !== "over" && next.phase === "over";
  return dedupe([...fromLogs, ...fromYou, ...fromOpp, ...(endedNow && result ? [result] : [])]);
}

export function prefersReducedMotion(media?: { matches: boolean } | null): boolean {
  if (media) return media.matches;
  if (typeof matchMedia === "undefined") return false;
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function sfxMutedDefault(storage: { getItem(key: string): string | null } | null): boolean {
  if (!storage) return true;
  const raw = storage.getItem(MUTE_KEY);
  if (raw === "0") return false;
  if (raw === "1") return true;
  return true;
}

export function writeSfxMuted(muted: boolean, storage: { setItem(key: string, value: string): void }): void {
  storage.setItem(MUTE_KEY, muted ? "1" : "0");
}

export function zoneFxClasses(events: FxEvent[], reduced: boolean): ZoneFx {
  const empty = (): string[] => [];
  const zones: ZoneFx = {
    youActive: empty(),
    oppActive: empty(),
    youHand: empty(),
    oppHand: empty(),
    youTrash: empty(),
    oppTrash: empty(),
    youBench: empty(),
    oppBench: empty(),
    youPrizes: empty(),
    oppPrizes: empty(),
    youDeck: empty(),
    oppDeck: empty(),
  };
  if (reduced) return zones;
  for (const event of events) {
    if (event.kind === "attack") {
      const key = event.side === "you" ? "youActive" : "oppActive";
      zones[key].push("ptcg-fx-lunge");
      const hit = event.side === "you" ? "oppActive" : "youActive";
      zones[hit].push("ptcg-fx-hit");
    }
    if (event.kind === "ko") {
      const key = event.side === "you" ? "youActive" : "oppActive";
      zones[key].push("ptcg-fx-shake");
    }
    if (event.kind === "draw") {
      const hand = event.side === "you" ? "youHand" : "oppHand";
      const deck = event.side === "you" ? "youDeck" : "oppDeck";
      zones[hand].push("ptcg-fx-draw");
      zones[deck].push("ptcg-fx-deal");
    }
    if (event.kind === "play") {
      const bench = event.side === "you" ? "youBench" : "oppBench";
      const active = event.side === "you" ? "youActive" : "oppActive";
      zones[bench].push("ptcg-fx-play");
      zones[active].push("ptcg-fx-play");
    }
    if (event.kind === "trash") {
      const key = event.side === "you" ? "youTrash" : "oppTrash";
      zones[key].push("ptcg-fx-trash");
    }
    if (event.kind === "prize") {
      const prizes = event.side === "you" ? "youPrizes" : "oppPrizes";
      const hand = event.side === "you" ? "youHand" : "oppHand";
      zones[prizes].push("ptcg-fx-prize");
      zones[hand].push("ptcg-fx-draw");
    }
  }
  return zones;
}

export function fxOverlayHtml(events: FxEvent[], reduced: boolean): string {
  const parts: string[] = [];
  const turn = [...events].reverse().find((event) => event.kind === "turn");
  if (turn && turn.kind === "turn") {
    parts.push(
      `<div class="ptcg-fx-banner" role="status">${turn.side === "you" ? "내 턴" : "상대 턴"}</div>`,
    );
  }
  const coin = [...events].reverse().find((event) => event.kind === "coin");
  if (coin && coin.kind === "coin") {
    parts.push(
      `<div class="ptcg-fx-coin${reduced ? "" : " ptcg-fx-coin--spin"}" role="status"><span>${coin.head ? "앞" : "뒤"}</span></div>`,
    );
  }
  const damage = [...events].reverse().find((event) => event.kind === "damage");
  if (damage && damage.kind === "damage" && damage.amount > 0) {
    parts.push(
      `<div class="ptcg-fx-damage ptcg-fx-damage--${damage.side}" role="status">-${damage.amount}</div>`,
    );
  }
  if (!parts.length) return "";
  return `<div class="ptcg-fx-overlay${reduced ? " ptcg-fx-reduced" : ""}" aria-live="polite">${parts.join("")}</div>`;
}

export function resultScreenHtml(text: string, outcome: "win" | "lose" | "draw"): string {
  return `<div class="ptcg-fx-result ptcg-fx-result--${outcome}" role="status">
    <p class="ptcg-fx-result-title">${esc(text)}</p>
    <p class="ptcg-actions ptcg-fx-result-actions">
      <button type="button" data-restart>다시 하기</button>
      <button type="button" data-decks>덱 고르기</button>
    </p>
  </div>`;
}

export function muteToggleHtml(muted: boolean): string {
  const label = muted ? "소리 켜기" : "소리 끄기";
  return `<button type="button" class="ptcg-fx-mute" data-sfx-mute aria-pressed="${muted ? "true" : "false"}">${label}</button>`;
}

export function sfxForEvents(events: FxEvent[]): SfxKind[] {
  const kinds: SfxKind[] = [];
  for (const event of events) {
    if (event.kind === "draw" || event.kind === "prize") kinds.push("draw");
    else if (event.kind === "attack") kinds.push("attack");
    else if (event.kind === "damage") kinds.push("damage");
    else if (event.kind === "ko") kinds.push("ko");
    else if (event.kind === "coin") kinds.push("coin");
    else if (event.kind === "turn") kinds.push("turn");
    else if (event.kind === "result") kinds.push(event.outcome === "win" ? "win" : "lose");
  }
  return [...new Set(kinds)];
}

function tone(ctx: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain = 0.04): void {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export function playSfx(kinds: SfxKind[], muted: boolean): void {
  if (muted || !kinds.length) return;
  if (typeof window === "undefined") return;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const now = ctx.currentTime;
  for (const kind of kinds) {
    if (kind === "draw") tone(ctx, 660, now, 0.08, "triangle");
    if (kind === "attack") tone(ctx, 180, now, 0.12, "square", 0.05);
    if (kind === "damage") tone(ctx, 140, now + 0.05, 0.14, "sawtooth", 0.035);
    if (kind === "ko") {
      tone(ctx, 120, now, 0.1, "square", 0.05);
      tone(ctx, 80, now + 0.1, 0.18, "triangle", 0.045);
    }
    if (kind === "coin") {
      tone(ctx, 880, now, 0.05, "sine", 0.03);
      tone(ctx, 1320, now + 0.06, 0.06, "sine", 0.025);
    }
    if (kind === "turn") tone(ctx, 520, now, 0.1, "sine", 0.03);
    if (kind === "win") {
      tone(ctx, 523, now, 0.1, "sine", 0.04);
      tone(ctx, 659, now + 0.1, 0.1, "sine", 0.04);
      tone(ctx, 784, now + 0.2, 0.16, "sine", 0.04);
    }
    if (kind === "lose") tone(ctx, 200, now, 0.28, "triangle", 0.04);
  }
  window.setTimeout(() => {
    void ctx.close();
  }, 600);
}

export function applyZoneClasses(board: ParentNode, zones: ZoneFx): void {
  const map: Array<[string, string[]]> = [
    [".ptcg-playmat--you .ptcg-zone--active", zones.youActive],
    [".ptcg-playmat--opp .ptcg-zone--active", zones.oppActive],
    [".ptcg-playmat--you .ptcg-zone--hand", zones.youHand],
    [".ptcg-playmat--opp .ptcg-zone--hand", zones.oppHand],
    [".ptcg-playmat--you .ptcg-zone--trash", zones.youTrash],
    [".ptcg-playmat--opp .ptcg-zone--trash", zones.oppTrash],
    [".ptcg-playmat--you .ptcg-zone--bench", zones.youBench],
    [".ptcg-playmat--opp .ptcg-zone--bench", zones.oppBench],
    [".ptcg-playmat--you .ptcg-zone--prizes", zones.youPrizes],
    [".ptcg-playmat--opp .ptcg-zone--prizes", zones.oppPrizes],
    [".ptcg-playmat--you .ptcg-zone--deck", zones.youDeck],
    [".ptcg-playmat--opp .ptcg-zone--deck", zones.oppDeck],
  ];
  for (const [selector, classes] of map) {
    if (!classes.length) continue;
    const node = board.querySelector(selector);
    if (!node) continue;
    node.classList.add(...classes);
  }
}

export function applyBoardFx(
  board: Element,
  events: FxEvent[],
  opts: { reduced: boolean; muted: boolean },
): void {
  if (!events.length) return;
  const zones = zoneFxClasses(events, opts.reduced);
  applyZoneClasses(board, zones);
  const overlay = fxOverlayHtml(events, opts.reduced);
  if (overlay) board.insertAdjacentHTML("afterbegin", overlay);
  const result = events.find((event) => event.kind === "result");
  if (result && result.kind === "result") {
    const existing = board.querySelector(".ptcg-fx-result");
    if (!existing) board.insertAdjacentHTML("afterbegin", resultScreenHtml(result.text, result.outcome));
  }
  playSfx(sfxForEvents(events), opts.muted);
}
