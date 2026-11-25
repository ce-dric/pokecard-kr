/**
 * Korean official Standard (공식 레귤레이션) helpers.
 *
 * Marks and the exception list come from:
 * - https://pokemoncard.co.kr/card/play_qna
 * - Official 2026 battle regulation PDF (filename 1.5.3, header ver.1.5.1)
 *   https://pokemoncard.co.kr/s3.php?key=home%2Fdata%2Fdata1_www%2Fbattle_regulation_2026_1.5.3_ver.pdf
 *
 * Names below are transcribed from page 2 of that PDF. Do not invent extras.
 */

export const OFFICIAL_REGULATION_QNA = "https://pokemoncard.co.kr/card/play_qna";

export const OFFICIAL_REGULATION_PDF =
  "https://pokemoncard.co.kr/s3.php?key=home%2Fdata%2Fdata1_www%2Fbattle_regulation_2026_1.5.3_ver.pdf";

/** Regulation marks legal under the current Korean official Standard. */
export const STANDARD_MARKS = Object.freeze(["H", "I", "J"]);

const STANDARD_MARK_SET = new Set(STANDARD_MARKS);

/**
 * Fixed exception reprints from the official PDF table (exact Korean names).
 * "마스터볼 (ACE SPEC)" is listed as 마스터볼 with an ACE SPEC note.
 */
export const STANDARD_EXCEPTION_NAMES = Object.freeze([
  "개조해머",
  "다크볼",
  "럭키멧",
  "마스터볼",
  "몬스터볼",
  "벌레회피스프레이",
  "보스의 지령",
  "상처약",
  "성스러운분말",
  "스크램블 스위치",
  "에너지 갈아 달기",
  "에너지 리사이클",
  "에너지 전송",
  "에너지 회수",
  "이상한사탕",
  "저지맨",
  "좋은상처약",
  "체렌",
  "축하 팡파레",
  "카운터 게인",
  "쿡",
  "크래시 해머",
  "툴스크래퍼",
  "포켓기어3.0",
  "포켓몬 교체",
  "포켓몬 캐처",
  "포켓몬 회수 사이클론",
  "포켓몬센터 직원",
  "풍선",
  "프리즘 에너지",
  "하이퍼볼",
  "하솔",
]);

const EXCEPTION_NAME_SET = new Set(STANDARD_EXCEPTION_NAMES);

/** Basic energy types named in the official exception cell. */
export const STANDARD_BASIC_ENERGY_TYPES = Object.freeze([
  "grass",
  "fire",
  "water",
  "electric",
  "psychic",
  "fighting",
  "dark",
  "steel",
]);

const BASIC_ENERGY_TYPE_SET = new Set(STANDARD_BASIC_ENERGY_TYPES);

const SINGLE_MARK = /^[A-Z]$/;

/**
 * Resolve the printed regulation mark for a Korean card.
 * Prefer the per-card field (including ""). Fall back to the set mark only when
 * the set lists a single letter shared by every card.
 */
export function cardRegulation(card, set) {
  if (card && Object.prototype.hasOwnProperty.call(card, "regulation")) {
    const value = card.regulation;
    if (value === null || value === undefined) return null;
    return String(value);
  }
  const setMark = set && typeof set.regulation === "string" ? set.regulation.trim() : "";
  if (SINGLE_MARK.test(setMark)) return setMark;
  return null;
}

function isBasicEnergyException(card) {
  if (!card) return false;
  const stage = card.stage || "";
  const categoryKo = card.categoryKo || "";
  const isBasic =
    stage === "basic-energy" || categoryKo === "기본 에너지" || /^기본 .+ 에너지$/.test(card.nameKo || "");
  if (!isBasic) return false;
  if (card.type && BASIC_ENERGY_TYPE_SET.has(card.type)) return true;
  return false;
}

function isNamedException(card) {
  const name = card && typeof card.nameKo === "string" ? card.nameKo.trim() : "";
  if (!name) return false;
  return EXCEPTION_NAME_SET.has(name);
}

/** True when the Korean printing is legal under the official H/I/J rule plus PDF exceptions. */
export function isStandardLegal(card, set) {
  const mark = cardRegulation(card, set);
  if (mark && STANDARD_MARK_SET.has(mark)) return true;
  if (isNamedException(card)) return true;
  if (isBasicEnergyException(card)) return true;
  return false;
}

/**
 * Display status for card pages.
 * Unknown marks stay unverified and never claim Standard legality.
 */
export function regulationStatus(card, set) {
  const hasField = card && Object.prototype.hasOwnProperty.call(card, "regulation");
  const mark = cardRegulation(card, set);
  const known = hasField || mark !== null;
  const standardLegal = known ? isStandardLegal(card, set) : false;
  let labelKo = "미확인";
  if (known) {
    labelKo = mark ? mark : "없음";
  }
  return {
    mark: known ? mark : null,
    known,
    standardLegal,
    labelKo,
    badgeKo: "스탠다드 사용 가능",
    citeKo: "한국 공식 레귤레이션 (H / I / J 및 예외 목록)",
  };
}
