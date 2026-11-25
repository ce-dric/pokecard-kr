import mappingFile from "../../data/game-cards.json" with { type: "json" };
import type { CardMapping } from "./types.ts";
import type { FaceCard, GameView, SideView } from "./view.ts";
import { cleanText } from "./view.ts";

export const TUTORIAL_STORAGE_KEY = "ptcg-tutorial-complete";
export const TUTORIAL_STEP_COUNT = 8;

const mapping = mappingFile as CardMapping;

/** Fixed tutorial card ids drawn from verified site mapping only. */
export const TUTORIAL_CARD_IDS = {
  active: 721,
  benchBasic: 722,
  energy: 3,
  trainer: 1227,
  oppActive: 344,
} as const;

export type TutorialStepId =
  | "board"
  | "draw"
  | "bench"
  | "energy"
  | "trainer"
  | "attack"
  | "bot"
  | "done";

export type TutorialStepKind = "observe" | "action" | "auto" | "done";

export type TutorialAction =
  | { type: "next" }
  | { type: "back" }
  | { type: "skip" }
  | { type: "finish" }
  | { type: "target"; id: string }
  | { type: "option"; key: string };

export interface TutorialStep {
  id: TutorialStepId;
  kind: TutorialStepKind;
  caption: string;
  highlight: string | null;
  expected?: TutorialAction;
}

export interface TutorialState {
  active: boolean;
  stepIndex: number;
  completed: boolean;
}

export interface TutorialScenarioCard {
  id: number;
  nameKo: string;
  image: string | null;
  fullImage: string | null;
}

function fullFromThumb(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.endsWith("-thumb.webp")) return path.replace(/-thumb\.webp$/, ".webp");
  return path;
}

function faceFromId(
  id: number,
  extras: Partial<FaceCard> = {},
): FaceCard {
  const row = mapping.cards[String(id)];
  const nameKo = row?.link?.nameKo ? cleanText(row.link.nameKo) : null;
  const thumb = row?.link?.image || row?.picture?.thumb || null;
  return {
    name: nameKo || `카드 ${id}`,
    nameKo,
    image: thumb,
    fullImage: fullFromThumb(row?.link?.image) || row?.picture?.full || null,
    hp: extras.hp ?? null,
    maxHp: extras.maxHp ?? null,
    energies: extras.energies ?? [],
    kind: extras.kind ?? null,
    typeLabel: extras.typeLabel ?? null,
    hidden: extras.hidden,
  };
}

export function tutorialScenarioCards(): TutorialScenarioCard[] {
  return Object.values(TUTORIAL_CARD_IDS).map((id) => {
    const face = faceFromId(id);
    return {
      id,
      nameKo: face.nameKo || face.name,
      image: face.image,
      fullImage: face.fullImage,
    };
  });
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "board",
    kind: "observe",
    caption:
      "보드를 살펴보세요. 배틀필드, 벤치, 프라이즈, 덱, 트래쉬가 내 쪽에 있습니다. 준비되면 다음을 누르세요.",
    highlight: "you-playmat",
  },
  {
    id: "draw",
    kind: "action",
    caption: "차례가 시작되면 덱에서 카드를 한 장 뽑습니다. 하이라이트된 덱을 눌러 드로우하세요.",
    highlight: "you-deck",
    expected: { type: "target", id: "you-deck" },
  },
  {
    id: "bench",
    kind: "action",
    caption: "패의 기본 포켓몬 눈쓰개를 벤치에 내세요. 하이라이트된 선택을 누르세요.",
    highlight: "option-bench",
    expected: { type: "option", key: "bench" },
  },
  {
    id: "energy",
    kind: "action",
    caption: "기본 물 에너지를 배틀필드의 가이오가에 붙이세요. 한 차례에 한 번만 붙일 수 있습니다.",
    highlight: "option-energy",
    expected: { type: "option", key: "energy" },
  },
  {
    id: "trainer",
    kind: "action",
    caption: "서포터 릴리에의 결심을 사용해 패를 보강하세요. 하이라이트된 선택을 누르세요.",
    highlight: "option-trainer",
    expected: { type: "option", key: "trainer" },
  },
  {
    id: "attack",
    kind: "action",
    caption: "공격을 골라 데미지를 주세요. 하이라이트된 공격을 누르세요.",
    highlight: "option-attack",
    expected: { type: "option", key: "attack" },
  },
  {
    id: "bot",
    kind: "auto",
    caption: "내 차례가 끝났습니다. 상대가 짧게 행동한 뒤 다시 내 차례로 돌아옵니다. 다음을 누르세요.",
    highlight: "opp-playmat",
  },
  {
    id: "done",
    kind: "done",
    caption: "튜토리얼 완료. 실제 대전을 시작하거나 놀이방법을 이어서 읽어 보세요.",
    highlight: null,
  },
];

export function createTutorialState(): TutorialState {
  return { active: true, stepIndex: 0, completed: false };
}

export function currentTutorialStep(state: TutorialState): TutorialStep | null {
  if (!state.active) return null;
  return TUTORIAL_STEPS[state.stepIndex] ?? null;
}

export function progressLabel(state: TutorialState): string {
  const index = Math.min(state.stepIndex + 1, TUTORIAL_STEP_COUNT);
  return `${index}/${TUTORIAL_STEP_COUNT}`;
}

export function isTutorialComplete(state: TutorialState): boolean {
  return state.completed;
}

function actionsMatch(expected: TutorialAction | undefined, action: TutorialAction): boolean {
  if (!expected) return false;
  if (expected.type === "target" && action.type === "target") return expected.id === action.id;
  if (expected.type === "option" && action.type === "option") return expected.key === action.key;
  return expected.type === action.type;
}

export function applyTutorialAction(state: TutorialState, action: TutorialAction): TutorialState {
  if (!state.active) return state;
  if (action.type === "skip") return { ...state, active: false };
  const step = currentTutorialStep(state);
  if (!step) return state;

  if (action.type === "back") {
    if (state.stepIndex <= 0) return state;
    return { ...state, stepIndex: state.stepIndex - 1 };
  }

  if (action.type === "finish") {
    if (step.id !== "done") return state;
    return { active: false, stepIndex: state.stepIndex, completed: true };
  }

  if (step.kind === "action") {
    if (!actionsMatch(step.expected, action)) return state;
    return { ...state, stepIndex: Math.min(state.stepIndex + 1, TUTORIAL_STEP_COUNT - 1) };
  }

  if (step.kind === "observe" || step.kind === "auto") {
    if (action.type !== "next") return state;
    return { ...state, stepIndex: Math.min(state.stepIndex + 1, TUTORIAL_STEP_COUNT - 1) };
  }

  if (step.kind === "done" && action.type === "next") {
    return { active: false, stepIndex: state.stepIndex, completed: true };
  }

  return state;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readTutorialComplete(storage: StorageLike | null | undefined): boolean {
  if (!storage) return false;
  return storage.getItem(TUTORIAL_STORAGE_KEY) === "1";
}

export function markTutorialComplete(storage: StorageLike | null | undefined): void {
  if (!storage) return;
  storage.setItem(TUTORIAL_STORAGE_KEY, "1");
}

export function shouldOfferTutorial(storage: StorageLike | null | undefined): boolean {
  return !readTutorialComplete(storage);
}

function emptySide(): SideView {
  return {
    active: [],
    bench: [],
    hand: [],
    handCount: 0,
    prizeCount: 6,
    discard: [],
    discardCount: 0,
    deckCount: 40,
    conditions: [],
  };
}

function handForStep(stepId: TutorialStepId): FaceCard[] {
  const snover = faceFromId(TUTORIAL_CARD_IDS.benchBasic, {
    hp: 90,
    maxHp: 90,
    kind: "포켓몬",
    typeLabel: "물",
  });
  const energy = faceFromId(TUTORIAL_CARD_IDS.energy, { kind: "에너지", typeLabel: "물" });
  const trainer = faceFromId(TUTORIAL_CARD_IDS.trainer, { kind: "서포터" });
  switch (stepId) {
    case "board":
    case "draw":
      return [snover, energy, trainer];
    case "bench":
      return [snover, energy, trainer, faceFromId(TUTORIAL_CARD_IDS.energy, { kind: "에너지", typeLabel: "물" })];
    case "energy":
      return [energy, trainer];
    case "trainer":
      return [trainer];
    default:
      return [];
  }
}

function youForStep(stepId: TutorialStepId): SideView {
  const kyogre = faceFromId(TUTORIAL_CARD_IDS.active, {
    hp: 150,
    maxHp: 150,
    kind: "포켓몬",
    typeLabel: "물",
    energies: stepId === "energy" || stepId === "board" || stepId === "draw" || stepId === "bench" ? [] : ["water"],
  });
  const snover = faceFromId(TUTORIAL_CARD_IDS.benchBasic, {
    hp: 90,
    maxHp: 90,
    kind: "포켓몬",
    typeLabel: "물",
  });
  const hand = handForStep(stepId);
  const benched = ["energy", "trainer", "attack", "bot", "done"].includes(stepId);
  const deckCount = stepId === "board" || stepId === "draw" ? 40 : stepId === "trainer" ? 37 : 39;
  return {
    ...emptySide(),
    active: [kyogre],
    bench: benched ? [snover] : [],
    hand,
    handCount: hand.length,
    prizeCount: 6,
    deckCount,
  };
}

function oppForStep(stepId: TutorialStepId): SideView {
  // After the tutorial attack (Wave Splash 30), the active Pokémon is at 40 HP.
  const hp = stepId === "bot" || stepId === "done" ? 40 : 70;
  return {
    ...emptySide(),
    active: [
      faceFromId(TUTORIAL_CARD_IDS.oppActive, {
        hp,
        maxHp: 70,
        kind: "포켓몬",
        typeLabel: "풀",
      }),
    ],
    hand: null,
    handCount: 5,
    prizeCount: 6,
    deckCount: 40,
  };
}

function optionsForStep(stepId: TutorialStepId): GameView["options"] {
  const snover = faceFromId(TUTORIAL_CARD_IDS.benchBasic);
  const energy = faceFromId(TUTORIAL_CARD_IDS.energy);
  const trainer = faceFromId(TUTORIAL_CARD_IDS.trainer);
  const kyogre = faceFromId(TUTORIAL_CARD_IDS.active);
  switch (stepId) {
    case "bench":
      return [
        {
          index: 0,
          label: `사용 ${snover.name}`,
          image: snover.image,
          fullImage: snover.fullImage,
        },
        { index: 1, label: "턴 종료", image: null, fullImage: null },
      ];
    case "energy":
      return [
        {
          index: 0,
          label: `에너지 부착 ${energy.name}`,
          image: energy.image,
          fullImage: energy.fullImage,
        },
        {
          index: 1,
          label: `사용 ${trainer.name}`,
          image: trainer.image,
          fullImage: trainer.fullImage,
        },
        { index: 2, label: "턴 종료", image: null, fullImage: null },
      ];
    case "trainer":
      return [
        {
          index: 0,
          label: `사용 ${trainer.name}`,
          image: trainer.image,
          fullImage: trainer.fullImage,
        },
        {
          index: 1,
          label: `공격 Wave Splash 30`,
          image: kyogre.image,
          fullImage: kyogre.fullImage,
        },
        { index: 2, label: "턴 종료", image: null, fullImage: null },
      ];
    case "attack":
      return [
        {
          index: 0,
          label: `공격 Wave Splash 30`,
          image: kyogre.image,
          fullImage: kyogre.fullImage,
        },
        { index: 1, label: "턴 종료", image: null, fullImage: null },
      ];
    default:
      return [];
  }
}

function promptForStep(stepId: TutorialStepId): string {
  switch (stepId) {
    case "bench":
      return "벤치에 낼 포켓몬을 고르세요";
    case "energy":
      return "할 일을 고르세요";
    case "trainer":
      return "할 일을 고르세요";
    case "attack":
      return "공격을 고르세요";
    case "bot":
      return "상대가 고르는 중";
    case "done":
      return "튜토리얼 완료";
    default:
      return "할 일을 고르세요";
  }
}

function logForStep(stepId: TutorialStepId): string[] {
  const base = ["내 턴"];
  if (stepId === "board" || stepId === "draw") return base;
  if (stepId === "bench") return [...base, "나 드로우"];
  if (stepId === "energy") return [...base, "나 드로우", "나 사용 눈쓰개"];
  if (stepId === "trainer") return [...base, "나 드로우", "나 사용 눈쓰개", "나 부착 기본 물 에너지"];
  if (stepId === "attack") {
    return [...base, "나 드로우", "나 사용 눈쓰개", "나 부착 기본 물 에너지", "나 사용 릴리에의 결심"];
  }
  return [
    ...base,
    "나 드로우",
    "나 사용 눈쓰개",
    "나 부착 기본 물 에너지",
    "나 사용 릴리에의 결심",
    "나 공격 Wave Splash",
    "돌살이 HP 40",
    "내 턴 끝",
    "상대 턴",
    "상대 드로우",
    "상대 턴 끝",
  ];
}

/** Scripted board view for the current tutorial step. Fixed seed scenario (no wasm shuffle). */
export function tutorialViewForStep(stepId: TutorialStepId): GameView {
  const options = optionsForStep(stepId);
  return {
    phase: stepId === "done" ? "over" : "choose",
    prompt: promptForStep(stepId),
    minCount: options.length ? 1 : 0,
    maxCount: options.length ? 1 : 0,
    options,
    log: logForStep(stepId),
    you: youForStep(stepId),
    opp: oppForStep(stepId),
    turn: stepId === "bot" || stepId === "done" ? 2 : 1,
    resultText: null,
    stadium: null,
  };
}

export function optionKeyForLabel(label: string): string | null {
  if (label.startsWith("사용 눈쓰개")) return "bench";
  if (label.startsWith("에너지 부착")) return "energy";
  if (label.startsWith("사용 릴리에의 결심")) return "trainer";
  if (label.startsWith("공격 ")) return "attack";
  return null;
}

export function overlayHtml(state: TutorialState, basePath: string): string {
  const step = currentTutorialStep(state);
  if (!step) return "";
  const progress = progressLabel(state);
  const showBack = state.stepIndex > 0 && step.kind !== "done";
  const showNext = step.kind === "observe" || step.kind === "auto";
  const done = step.kind === "done";
  const gameHref = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const rulesHref = `${gameHref}rules/`;
  const controls = done
    ? `<div class="ptcg-tutorial-actions">
        <a class="ptcg-tutorial-primary" href="${gameHref}">실제 대전</a>
        <a class="ptcg-tutorial-secondary" href="${rulesHref}">놀이방법</a>
        <button type="button" data-tutorial-finish>닫기</button>
      </div>`
    : `<div class="ptcg-tutorial-actions">
        ${showBack ? `<button type="button" data-tutorial-back>이전</button>` : ""}
        ${showNext ? `<button type="button" data-tutorial-next>다음</button>` : ""}
        <button type="button" data-tutorial-skip>건너뛰기</button>
      </div>`;
  return `<div class="ptcg-tutorial-overlay" data-tutorial-overlay data-tutorial-step="${step.id}" data-tutorial-highlight="${step.highlight || ""}">
    <div class="ptcg-tutorial-coach" role="dialog" aria-modal="true" aria-labelledby="ptcg-tutorial-caption">
      <p class="ptcg-tutorial-progress" aria-hidden="true">${progress}</p>
      <p id="ptcg-tutorial-caption" class="ptcg-tutorial-caption" aria-live="polite">${step.caption}</p>
      ${controls}
    </div>
  </div>`;
}

export function tagTutorialTargets(root: ParentNode, step: TutorialStep | null): void {
  for (const node of root.querySelectorAll("[data-tutorial-target]")) {
    if (node instanceof HTMLElement && node.dataset.tutorialZone) continue;
    node.removeAttribute("data-tutorial-active");
  }
  if (!step?.highlight) return;
  const match = root.querySelector(`[data-tutorial-target="${step.highlight}"]`);
  if (match instanceof HTMLElement) match.setAttribute("data-tutorial-active", "true");
}
