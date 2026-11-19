import {
  createPhotoLoad,
  defaultGuides,
  detectCardGuides,
  estimateCenteringGrade,
  formatPair,
  measureGuides,
  moveGuide,
} from "./centering.mjs";

const LINES = [
  { key: "outerLeft", axis: "x" },
  { key: "outerRight", axis: "x" },
  { key: "outerTop", axis: "y" },
  { key: "outerBottom", axis: "y" },
  { key: "innerLeft", axis: "x" },
  { key: "innerRight", axis: "x" },
  { key: "innerTop", axis: "y" },
  { key: "innerBottom", axis: "y" },
];

export function mountCenteringTool(doc) {
  const root = doc.querySelector("[data-centering]");
  if (!root) return;

  const canvas = root.querySelector("[data-canvas]");
  const empty = root.querySelector("[data-empty]");
  const stage = root.querySelector("[data-stage]");
  const status = root.querySelector("[data-status]");
  const state = {
    side: "front",
    drag: null,
    front: { bitmap: null, guides: null },
    back: { bitmap: null, guides: null },
  };

  const current = () => state[state.side];

  const setStatus = (text) => {
    if (status) status.textContent = text;
  };

  const release = (side) => {
    if (side.bitmap && typeof side.bitmap.close === "function") side.bitmap.close();
    side.bitmap = null;
    side.guides = null;
  };

  const paint = () => {
    const side = current();
    const show = Boolean(side.bitmap);
    canvas.hidden = !show;
    if (empty) empty.hidden = show;
    if (!show) return;
    const maxW = Math.max(280, stage.clientWidth || 640);
    const maxH = Math.max(280, Math.round(window.innerHeight * 0.72));
    const scale = Math.min(maxW / side.bitmap.width, maxH / side.bitmap.height);
    const cssW = Math.max(1, Math.round(side.bitmap.width * scale));
    const cssH = Math.max(1, Math.round(side.bitmap.height * scale));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nextW = Math.round(cssW * dpr);
    const nextH = Math.round(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    if (canvas.width !== nextW || canvas.height !== nextH) {
      canvas.width = nextW;
      canvas.height = nextH;
    }
    const ctx = canvas.getContext("2d");
    ctx.drawImage(side.bitmap, 0, 0, canvas.width, canvas.height);
    if (side.guides) drawGuides(ctx, canvas, side.guides, state.drag || canvas.dataset.active || null);
  };

  const updateReadout = () => {
    const front = state.front.guides ? measureGuides(state.front.guides) : null;
    const back = state.back.guides ? measureGuides(state.back.guides) : null;
    const active = state.side === "front" ? front : back;
    const lr = root.querySelector('[data-readout="lr"]');
    const tb = root.querySelector('[data-readout="tb"]');
    const lrWords = root.querySelector('[data-readout="lr-words"]');
    const tbWords = root.querySelector('[data-readout="tb-words"]');
    const sideEl = root.querySelector('[data-readout="side"]');
    const overallEl = root.querySelector('[data-readout="overall"]');
    const detail = root.querySelector('[data-readout="detail"]');

    if (!active) {
      lr.textContent = "측정 전";
      tb.textContent = "측정 전";
      lrWords.textContent = "";
      tbWords.textContent = "";
      sideEl.textContent = "측정 전";
    } else {
      lr.textContent = formatPair(active.horizontal);
      tb.textContent = formatPair(active.vertical);
      lrWords.textContent = `왼쪽 ${active.horizontal.first}, 오른쪽 ${active.horizontal.second}`;
      tbWords.textContent = `위 ${active.vertical.first}, 아래 ${active.vertical.second}`;
      const sideGrade = estimateCenteringGrade(
        state.side === "front" ? active : null,
        state.side === "back" ? active : null,
      );
      sideEl.textContent = sideGrade ? `추정 PSA ${sideGrade.grade} (${sideGrade.label})` : "측정 전";
    }

    const overall = estimateCenteringGrade(front, back);
    if (!overall) {
      overallEl.textContent = "측정 전";
      detail.textContent = "앞면이나 뒷면 사진을 고르면 센터링 기준의 추정 등급을 계산합니다.";
      return;
    }
    overallEl.textContent = `추정 PSA ${overall.grade} (${overall.label})`;
    if (overall.frontOnly) {
      detail.textContent = "뒷면이 없어 앞면만으로 추정했습니다. 뒷면 허용치는 아직 반영되지 않았습니다.";
    } else if (overall.backOnly) {
      detail.textContent = "앞면이 없어 뒷면만으로 추정했습니다.";
    } else {
      detail.textContent = `앞면 추정 PSA ${overall.frontGrade}, 뒷면 추정 PSA ${overall.backGrade}. 종합은 더 낮은 등급입니다.`;
    }
  };

  const clearSelection = () => {
    state.drag = null;
    delete canvas.dataset.active;
  };

  const showSide = (sideName) => {
    state.side = sideName;
    clearSelection();
    for (const button of root.querySelectorAll("[data-side]")) {
      button.setAttribute("aria-pressed", button.dataset.side === sideName ? "true" : "false");
    }
    paint();
    updateReadout();
    const side = current();
    if (side.bitmap) setStatus("안내선을 끌어 카드 가장자리와 안쪽 프레임에 맞춥니다.");
    else setStatus(sideName === "front" ? "앞면 사진을 고르면 안내선이 나타납니다." : "뒷면 사진은 없어도 됩니다.");
  };

  const applyGuides = (bitmap) => {
    const sample = scaledCopy(bitmap, 520);
    const detected = detectCardGuides(sample);
    if (detected && measureGuides(detected)) return detected;
    return defaultGuides();
  };

  const loadPhoto = createPhotoLoad();

  const loadFile = async (file) => {
    const sideName = state.side;
    if (state.side === sideName) setStatus("사진을 읽는 중");
    const outcome = await loadPhoto(sideName, () => bitmapFromFile(file));
    if (outcome.stale) return;
    if (outcome.error || !outcome.bitmap) {
      if (state.side === sideName) setStatus("이 브라우저에서 열 수 없는 사진입니다. JPG나 PNG로 바꿔 주세요.");
      return;
    }
    const fitted = fitBitmap(outcome.bitmap, 1600);
    const side = state[sideName];
    release(side);
    side.bitmap = fitted;
    side.guides = applyGuides(fitted);
    updateReadout();
    if (state.side !== sideName) return;
    clearSelection();
    paint();
    setStatus("안내선을 끌어 카드 가장자리와 안쪽 프레임에 맞춥니다.");
  };

  for (const button of root.querySelectorAll("[data-side]")) {
    button.addEventListener("click", () => showSide(button.dataset.side));
  }
  for (const name of ["file", "camera"]) {
    const input = root.querySelector(`[data-input="${name}"]`);
    root.querySelector(`[data-pick="${name}"]`).addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      input.value = "";
      if (file) void loadFile(file);
    });
  }
  root.querySelector('[data-action="redetect"]').addEventListener("click", () => {
    const side = current();
    if (!side.bitmap) return;
    side.guides = applyGuides(side.bitmap);
    paint();
    updateReadout();
  });
  root.querySelector('[data-action="clear"]').addEventListener("click", () => {
    release(current());
    clearSelection();
    paint();
    updateReadout();
    setStatus("이 면의 사진을 지웠습니다. 기기에만 있던 사진이라 서버에는 없습니다.");
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (!current().guides) return;
    const hit = hitTest(canvas, current().guides, event);
    if (!hit) return;
    state.drag = hit;
    canvas.dataset.active = hit;
    canvas.focus();
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    paint();
  });
  canvas.addEventListener("pointermove", (event) => {
    const guides = current().guides;
    if (!guides) return;
    const hit = state.drag || hitTest(canvas, guides, event);
    canvas.style.cursor = hit ? (axisOf(hit) === "x" ? "ew-resize" : "ns-resize") : "crosshair";
    if (!state.drag) return;
    const rect = canvas.getBoundingClientRect();
    const fraction = axisOf(state.drag) === "x"
      ? (event.clientX - rect.left) / rect.width
      : (event.clientY - rect.top) / rect.height;
    current().guides = moveGuide(guides, state.drag, fraction);
    paint();
    updateReadout();
  });
  const endDrag = () => {
    if (!state.drag) return;
    state.drag = null;
    paint();
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("keydown", (event) => {
    const guides = current().guides;
    const key = state.drag || canvas.dataset.active;
    if (!guides || !key) return;
    const axis = axisOf(key);
    const step = event.shiftKey ? 0.001 : 0.004;
    let next = null;
    if (axis === "x" && event.key === "ArrowLeft") next = guides[key] - step;
    if (axis === "x" && event.key === "ArrowRight") next = guides[key] + step;
    if (axis === "y" && event.key === "ArrowUp") next = guides[key] - step;
    if (axis === "y" && event.key === "ArrowDown") next = guides[key] + step;
    if (next == null) return;
    event.preventDefault();
    current().guides = moveGuide(guides, key, next);
    paint();
    updateReadout();
  });
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      if (!state.drag) paint();
    });
    observer.observe(stage);
  } else {
    window.addEventListener("resize", () => paint());
  }

  showSide("front");
}

function axisOf(key) {
  return LINES.find((line) => line.key === key)?.axis;
}

function hitTest(canvas, guides, event) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let best = null;
  let bestDist = 26;
  for (const line of LINES) {
    const pos = line.axis === "x" ? guides[line.key] * rect.width : guides[line.key] * rect.height;
    const dist = Math.abs((line.axis === "x" ? x : y) - pos);
    const along = line.axis === "x" ? y : x;
    const start = line.axis === "x" ? guides.outerTop * rect.height : guides.outerLeft * rect.width;
    const end = line.axis === "x" ? guides.outerBottom * rect.height : guides.outerRight * rect.width;
    if (along < start - 16 || along > end + 16) continue;
    if (dist <= bestDist) {
      bestDist = dist;
      best = line.key;
    }
  }
  return best;
}

function drawGuides(ctx, canvas, guides, active) {
  const x = (value) => value * canvas.width;
  const y = (value) => value * canvas.height;
  const outer = {
    left: x(guides.outerLeft),
    right: x(guides.outerRight),
    top: y(guides.outerTop),
    bottom: y(guides.outerBottom),
  };
  const inner = {
    left: x(guides.innerLeft),
    right: x(guides.innerRight),
    top: y(guides.innerTop),
    bottom: y(guides.innerBottom),
  };
  ctx.save();
  ctx.fillStyle = "rgba(198, 165, 106, 0.24)";
  ctx.fillRect(outer.left, outer.top, outer.right - outer.left, inner.top - outer.top);
  ctx.fillRect(outer.left, inner.bottom, outer.right - outer.left, outer.bottom - inner.bottom);
  ctx.fillRect(outer.left, inner.top, inner.left - outer.left, inner.bottom - inner.top);
  ctx.fillRect(inner.right, inner.top, outer.right - inner.right, inner.bottom - inner.top);
  stroke(ctx, outer.left, outer.top, outer.left, outer.bottom, "#f3e6c4", active === "outerLeft");
  stroke(ctx, outer.right, outer.top, outer.right, outer.bottom, "#f3e6c4", active === "outerRight");
  stroke(ctx, outer.left, outer.top, outer.right, outer.top, "#f3e6c4", active === "outerTop");
  stroke(ctx, outer.left, outer.bottom, outer.right, outer.bottom, "#f3e6c4", active === "outerBottom");
  stroke(ctx, inner.left, inner.top, inner.left, inner.bottom, "#9fd0ff", active === "innerLeft");
  stroke(ctx, inner.right, inner.top, inner.right, inner.bottom, "#9fd0ff", active === "innerRight");
  stroke(ctx, inner.left, inner.top, inner.right, inner.top, "#9fd0ff", active === "innerTop");
  stroke(ctx, inner.left, inner.bottom, inner.right, inner.bottom, "#9fd0ff", active === "innerBottom");
  const rect = canvas.getBoundingClientRect();
  const handle = Math.max(6, (13 * canvas.width) / (rect.width || canvas.width));
  grip(ctx, (outer.left + outer.right) / 2, outer.top, "#f3e6c4", handle);
  grip(ctx, (outer.left + outer.right) / 2, outer.bottom, "#f3e6c4", handle);
  grip(ctx, outer.left, (outer.top + outer.bottom) / 2, "#f3e6c4", handle);
  grip(ctx, outer.right, (outer.top + outer.bottom) / 2, "#f3e6c4", handle);
  grip(ctx, (inner.left + inner.right) / 2, inner.top, "#9fd0ff", handle);
  grip(ctx, (inner.left + inner.right) / 2, inner.bottom, "#9fd0ff", handle);
  grip(ctx, inner.left, (inner.top + inner.bottom) / 2, "#9fd0ff", handle);
  grip(ctx, inner.right, (inner.top + inner.bottom) / 2, "#9fd0ff", handle);
  ctx.restore();
}

function stroke(ctx, x1, y1, x2, y2, color, active) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = "rgba(8, 10, 8, 0.85)";
  ctx.lineWidth = active ? 8 : 5;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = active ? 3 : 2;
  ctx.stroke();
}

function grip(ctx, x, y, color, size) {
  ctx.fillStyle = color;
  ctx.strokeStyle = "#14120e";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(x - size, y - size, size * 2, size * 2);
  ctx.fill();
  ctx.stroke();
}

async function bitmapFromFile(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Some browsers reject the file type here and accept it via an image element.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fitBitmap(source, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  if (scale === 1) return source;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  if (typeof source.close === "function") source.close();
  return canvas;
}

function scaledCopy(source, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
