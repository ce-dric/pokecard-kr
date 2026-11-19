// Centering minimums published on https://www.psacard.com/gradingstandards
// The number is the larger border's maximum share of that axis.
// PSA 10: 55/45 front, 75/25 back.
// PSA 9: 60/40 front, 90/10 back.
// PSA 8: 65/35 front, 90/10 back.
// PSA 7: 70/30 front, 90/10 back.
// PSA 6: 80/20 front, 90/10 back.
// PSA 5 and PSA 4: 85/15 front, 90/10 back.
// PSA 3 and PSA 2: 90/10 front and back. PSA 1 states no centering minimum.
// PSA 1.5 uses the same 90/10 minimum as PSA 2 and PSA 3, so a centering-only
// estimate cannot separate them. Shared minimums stay in the table; the
// estimate returns the highest grade those borders still allow.
// The page's discretionary eye-appeal leeway is not applied.

export const PSA_CENTERING_SOURCE = "https://www.psacard.com/gradingstandards";

export const PSA_CENTERING_TABLE = [
  { grade: 10, front: 55, back: 75, label: "GEM-MT" },
  { grade: 9, front: 60, back: 90, label: "MINT" },
  { grade: 8, front: 65, back: 90, label: "NM-MT" },
  { grade: 7, front: 70, back: 90, label: "NM" },
  { grade: 6, front: 80, back: 90, label: "EX-MT" },
  { grade: 5, front: 85, back: 90, label: "EX" },
  { grade: 4, front: 85, back: 90, label: "VG-EX" },
  { grade: 3, front: 90, back: 90, label: "VG" },
  { grade: 2, front: 90, back: 90, label: "GOOD" },
  { grade: 1, front: null, back: null, label: "PR" },
];

export const GRADE_LABELS = Object.fromEntries(
  PSA_CENTERING_TABLE.map((row) => [row.grade, row.label]),
);

const FRONT_LIMITS = [
  [10, 55],
  [9, 60],
  [8, 65],
  [7, 70],
  [6, 80],
  [5, 85],
  [3, 90],
];

const BACK_LIMITS = [
  [10, 75],
  [9, 90],
];

const GUIDE_GAP = 0.004;

export function pairRatio(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return null;
  const total = a + b;
  if (total <= 0) return null;
  const first = Math.round((a / total) * 100);
  const second = 100 - first;
  return { first, second, worse: Math.max(first, second) };
}

export function formatPair(pair) {
  if (!pair) return "";
  return `${pair.first}/${pair.second}`;
}

export function measureGuides(guides) {
  if (!guides) return null;
  const fields = [
    "outerLeft",
    "innerLeft",
    "innerRight",
    "outerRight",
    "outerTop",
    "innerTop",
    "innerBottom",
    "outerBottom",
  ];
  if (fields.some((key) => !Number.isFinite(guides[key]))) return null;
  if (!(guides.outerLeft <= guides.innerLeft && guides.innerLeft < guides.innerRight && guides.innerRight <= guides.outerRight)) {
    return null;
  }
  if (!(guides.outerTop <= guides.innerTop && guides.innerTop < guides.innerBottom && guides.innerBottom <= guides.outerBottom)) {
    return null;
  }
  const horizontal = pairRatio(guides.innerLeft - guides.outerLeft, guides.outerRight - guides.innerRight);
  const vertical = pairRatio(guides.innerTop - guides.outerTop, guides.outerBottom - guides.innerBottom);
  if (!horizontal || !vertical) return null;
  return {
    horizontal,
    vertical,
    worse: Math.max(horizontal.worse, vertical.worse),
  };
}

function gradeForSide(worse, side) {
  const limits = side === "back" ? BACK_LIMITS : FRONT_LIMITS;
  for (const [grade, limit] of limits) {
    if (worse <= limit) return grade;
  }
  return 1;
}

export function estimateCenteringGrade(front, back = null) {
  const frontGrade = front && Number.isFinite(front.worse) ? gradeForSide(front.worse, "front") : null;
  const backGrade = back && Number.isFinite(back.worse) ? gradeForSide(back.worse, "back") : null;
  if (frontGrade == null && backGrade == null) return null;
  const grade = frontGrade == null ? backGrade : backGrade == null ? frontGrade : Math.min(frontGrade, backGrade);
  return {
    grade,
    label: GRADE_LABELS[grade],
    frontGrade,
    backGrade,
    frontOnly: frontGrade != null && backGrade == null,
    backOnly: backGrade != null && frontGrade == null,
  };
}

export function defaultGuides() {
  return {
    outerLeft: 0.08,
    outerRight: 0.92,
    outerTop: 0.06,
    outerBottom: 0.94,
    innerLeft: 0.14,
    innerRight: 0.86,
    innerTop: 0.11,
    innerBottom: 0.89,
  };
}

export function createPhotoLoad() {
  const tickets = { front: 0, back: 0 };
  return async function load(side, read) {
    const ticket = (tickets[side] = (tickets[side] || 0) + 1);
    let bitmap;
    try {
      bitmap = await read();
    } catch (error) {
      if (tickets[side] !== ticket) return { stale: true, side };
      return { stale: false, side, error };
    }
    if (tickets[side] !== ticket) {
      if (bitmap && typeof bitmap.close === "function") bitmap.close();
      return { stale: true, side };
    }
    return { stale: false, side, bitmap };
  };
}

export function moveGuide(guides, key, value) {
  const next = { ...guides };
  const vertical = key === "outerLeft" || key === "innerLeft" || key === "innerRight" || key === "outerRight";
  const keys = vertical
    ? ["outerLeft", "innerLeft", "innerRight", "outerRight"]
    : ["outerTop", "innerTop", "innerBottom", "outerBottom"];
  const index = keys.indexOf(key);
  if (index < 0 || !Number.isFinite(value)) return next;
  const lower = index === 0 ? 0 : next[keys[index - 1]] + GUIDE_GAP;
  const upper = index === keys.length - 1 ? 1 : next[keys[index + 1]] - GUIDE_GAP;
  next[key] = upper <= lower ? (lower + upper) / 2 : Math.min(upper, Math.max(lower, value));
  return next;
}

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function pixel(data, width, x, y) {
  const offset = (y * width + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2]];
}

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function sampleAt(data, width, height, side, pos, cursor) {
  if (side === "left" || side === "right") {
    if (pos < 0 || pos >= width || cursor < 0 || cursor >= height) return null;
    return pixel(data, width, pos, cursor);
  }
  if (pos < 0 || pos >= height || cursor < 0 || cursor >= width) return null;
  return pixel(data, width, cursor, pos);
}

function straightOuterEdge(data, width, height, side) {
  const horizontal = side === "left" || side === "right";
  const main = horizontal ? width : height;
  const cross = horizontal ? height : width;
  const forward = side === "left" || side === "top";
  const start = Math.round(cross * 0.16);
  const stop = Math.round(cross * 0.84);
  const hits = [];
  for (let cursor = start; cursor < stop; cursor += 1) {
    const begin = forward ? 1 : main - 2;
    const end = forward ? Math.round(main * 0.72) : Math.round(main * 0.28);
    for (let pos = begin; forward ? pos < end : pos > end; pos += forward ? 1 : -1) {
      const outside = pos - (forward ? 1 : -1);
      const here = sampleAt(data, width, height, side, pos, cursor);
      const there = sampleAt(data, width, height, side, outside, cursor);
      if (!here || !there || colorDistance(here, there) < 36) continue;
      hits.push(forward ? pos : pos + 1);
      break;
    }
  }
  if (hits.length < (stop - start) * 0.55) return null;
  const sorted = hits.slice().sort((a, b) => a - b);
  const spread = sorted[Math.floor(sorted.length * 0.75)] - sorted[Math.floor(sorted.length * 0.25)];
  if (spread > Math.max(10, cross * 0.06)) return null;
  return median(hits);
}

function consensusInnerEdge(data, width, height, outer, side) {
  const horizontal = side === "left" || side === "right";
  const forward = side === "left" || side === "top";
  const origin = forward ? (side === "left" ? outer.left : outer.top) : side === "right" ? outer.right : outer.bottom;
  const span = horizontal ? outer.right - outer.left : outer.bottom - outer.top;
  const cross0 = horizontal ? outer.top : outer.left;
  const cross1 = horizontal ? outer.bottom : outer.right;
  const minIn = Math.max(2, Math.round(span * 0.02));
  const maxIn = Math.max(minIn + 2, Math.round(span * 0.12));
  const start = cross0 + Math.round((cross1 - cross0) * 0.18);
  const stop = cross0 + Math.round((cross1 - cross0) * 0.82);
  const votes = new Map();
  let samples = 0;
  for (let cursor = start; cursor < stop; cursor += 2) {
    samples += 1;
    for (let step = minIn; step <= maxIn; step += 1) {
      const pos = forward ? origin + step : origin - step;
      const here = sampleAt(data, width, height, side, pos, cursor);
      const beside = sampleAt(data, width, height, side, pos - 1, cursor);
      if (!here || !beside || colorDistance(here, beside) < 48) continue;
      votes.set(pos, (votes.get(pos) || 0) + 1);
    }
  }
  let best = null;
  let bestVotes = 0;
  for (const pos of votes.keys()) {
    const pooled = (votes.get(pos) || 0) + (votes.get(pos - 1) || 0) + (votes.get(pos + 1) || 0);
    if (pooled > bestVotes) {
      bestVotes = pooled;
      best = pos;
    }
  }
  if (best == null || samples === 0 || bestVotes < samples * 0.28) return null;
  return best;
}

function evenInner(box) {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  return {
    left: box.left + w * 0.06,
    right: box.right - w * 0.06,
    top: box.top + h * 0.06,
    bottom: box.bottom - h * 0.06,
  };
}

function toFractions(width, height, outer, inner) {
  return {
    outerLeft: outer.left / width,
    outerRight: outer.right / width,
    outerTop: outer.top / height,
    outerBottom: outer.bottom / height,
    innerLeft: inner.left / width,
    innerRight: inner.right / width,
    innerTop: inner.top / height,
    innerBottom: inner.bottom / height,
  };
}

export function detectCardGuides(image) {
  if (!image?.width || !image?.height || !image.data) return null;
  const { width, height, data } = image;
  const outer = {
    left: straightOuterEdge(data, width, height, "left"),
    right: straightOuterEdge(data, width, height, "right"),
    top: straightOuterEdge(data, width, height, "top"),
    bottom: straightOuterEdge(data, width, height, "bottom"),
  };
  if (Object.values(outer).some((value) => value == null)) return null;
  if (!(outer.left < outer.right && outer.top < outer.bottom)) return null;
  if (outer.right - outer.left < width * 0.2 || outer.bottom - outer.top < height * 0.2) return null;
  const found = {
    left: consensusInnerEdge(data, width, height, outer, "left"),
    right: consensusInnerEdge(data, width, height, outer, "right"),
    top: consensusInnerEdge(data, width, height, outer, "top"),
    bottom: consensusInnerEdge(data, width, height, outer, "bottom"),
  };
  const fallback = evenInner(outer);
  const inner = {
    left: found.left ?? fallback.left,
    right: found.right ?? fallback.right,
    top: found.top ?? fallback.top,
    bottom: found.bottom ?? fallback.bottom,
  };
  if (!(outer.left < inner.left && inner.left < inner.right && inner.right < outer.right)) return null;
  if (!(outer.top < inner.top && inner.top < inner.bottom && inner.bottom < outer.bottom)) return null;
  return toFractions(width, height, outer, inner);
}
