#!/usr/bin/env python3
"""Build the Korean MEGA Premium Trainer Box dataset.

Korean names, collector numbers, rarities, categories, types, regulation
marks, and images come from pokemoncard.co.kr card detail pages. A blank
rarity field on that page stays blank. The regulation mark is the single
letter on the detail page's symbol image. Japanese official pages are only
a cross-check and are not used to fill Korean name, number, rarity, or type.
Detail pages that return an error are left out.
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path

from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "src" / "data" / "sets" / "ma.json"
IMG_DIR = ROOT / "public" / "images" / "cards" / "ma"
FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
UA = "Mozilla/5.0 (compatible; pokecard-kr-dataset/1.0; +https://blog.naver.com/mdsd12)"
PRODUCT = "MEGA 프리미엄 트레이너 박스 MEGA"
ID_PREFIX = "BS2025013"
ID_MIN = 1
ID_MAX = 60
IMAGE_CODE = "MA"
JP_PG = "MA"
SET_ID = "ma"
SLUG = "premium-trainer-box-mega"
NAME_KO = "프리미엄 트레이너 박스 MEGA"
NAME_JA = "プレミアムトレーナー ボックス MEGA"
PRODUCT_JA = "ポケモンカードゲーム プレミアムトレーナー ボックス MEGA"
RELEASE_KR = "2025-10-24"
RELEASE_JP = "2025-08-01"
# The product page publishes one price, 52,000 won, for the box. The box holds
# 10 packs of each expansion (20 packs, 5 cards a pack) and 172 fixed cards.
# There is no separate pack price, so both price fields use that published price.
PACK_PRICE = 52000
BOX_PRICE = 52000
CARDS_PER_PACK = 5
PACKS_PER_BOX = 20
KR_PRODUCT_URL = "https://pokemoncard.co.kr/card/826"
JP_SET_URL = "https://www.pokemon-card.com/ex/m1/"
EXPECT_COUNT = 51
JP_EXPECT_MIN = 43
EXTRA_NOTES = [
    "이 상품의 공식 가격은 52,000원이다. 구성은 확장팩 「메가브레이브」와 확장팩 「메가심포니아」 각 10팩, 카드 172장(51종)이다.",
    "목록은 상세 페이지가 열린 서로 다른 카드만 모았다.",
]
ANCHORS = {
    "001": ("쉐이미", "I"),
    "003": ("기로치 ex", "H"),
    "043": ("프리즘 에너지", "I"),
    "GRA": ("기본 풀 에너지", ""),
    "MET": ("기본 강철 에너지", ""),
}

RARITY_TOKEN = {
    "c": "C",
    "u": "U",
    "r": "R",
    "rr": "RR",
    "rrr": "RRR",
    "ar": "AR",
    "sr": "SR",
    "sar": "SAR",
    "mur": "MUR",
    "ur": "UR",
    "hr": "HR",
    "ssr": "SSR",
    "csr": "CSR",
    "chr": "CHR",
    "fur": "FUR",
}

TYPE_FROM_ICON = {
    "grass": ("grass", "풀"),
    "fire": ("fire", "불꽃"),
    "water": ("water", "물"),
    "electric": ("electric", "번개"),
    "lightning": ("electric", "번개"),
    "psychic": ("psychic", "초"),
    "fighting": ("fighting", "격투"),
    "dark": ("dark", "악"),
    "darkness": ("dark", "악"),
    "steel": ("steel", "강철"),
    "metal": ("steel", "강철"),
    "dragon": ("dragon", "드래곤"),
    "fairy": ("fairy", "페어리"),
    "none": ("colorless", "무색"),
    "colorless": ("colorless", "무색"),
}

KO_TYPE = {
    "풀": "grass",
    "불꽃": "fire",
    "물": "water",
    "번개": "electric",
    "초": "psychic",
    "격투": "fighting",
    "악": "dark",
    "강철": "steel",
    "드래곤": "dragon",
    "페어리": "fairy",
    "무색": "colorless",
}

JP_STAGE = {
    "たね": ("basic", "기본 포켓몬"),
    "1進化": ("stage1", "1진화"),
    "2進化": ("stage2", "2진화"),
    "グッズ": ("item", "아이템"),
    "ポケモンのどうぐ": ("tool", "포켓몬의 도구"),
    "サポート": ("supporter", "서포트"),
    "スタジアム": ("stadium", "스타디움"),
    "特殊エネルギー": ("special-energy", "특수 에너지"),
    "基本エネルギー": ("basic-energy", "기본 에너지"),
}

KO_TO_JP_STAGE = {
    "기본 포켓몬": "たね",
    "1진화 포켓몬": "1進化",
    "2진화 포켓몬": "2進化",
    "아이템": "グッズ",
    "포켓몬의 도구": "ポケモンのどうぐ",
    "서포트": "サポート",
    "스타디움": "スタジアム",
    "특수 에너지": "特殊エネルギー",
    "기본 에너지": "基本エネルギー",
}


def fetch(url: str, data: bytes | None = None, timeout: int = 40) -> tuple[int, bytes]:
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                url,
                data=data,
                headers={"User-Agent": UA, "Accept": "*/*", "Referer": url},
            )
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return res.status, res.read()
        except urllib.error.HTTPError as exc:
            body = exc.read()
            if exc.code >= 500 and attempt < 3:
                last = exc
                time.sleep(0.6 * (attempt + 1))
                continue
            return exc.code, body
        except Exception as exc:  # noqa: BLE001 - retry network errors
            last = exc
            time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"failed {url}: {last}")


def text(node) -> str:
    if node is None:
        return ""
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def rarity_from_filename(src: str) -> str:
    base = src.rsplit("/", 1)[-1].lower()
    match = re.search(r"ic_rare_([a-z0-9_]+)", base)
    if not match:
        return ""
    token = re.sub(r"_c$", "", match.group(1))
    return RARITY_TOKEN.get(token, "")


def norm_stage(value: str) -> str:
    return re.sub(r"\s+", "", value or "").replace("\u00a0", "")


def category_from_ko(category_ko: str) -> tuple[str, str]:
    mapping = {
        "기본 포켓몬": ("pokemon", "basic"),
        "1진화 포켓몬": ("pokemon", "stage1"),
        "2진화 포켓몬": ("pokemon", "stage2"),
        "아이템": ("trainer", "item"),
        "포켓몬의 도구": ("trainer", "tool"),
        "서포트": ("trainer", "supporter"),
        "스타디움": ("trainer", "stadium"),
        "특수 에너지": ("energy", "special-energy"),
        "기본 에너지": ("energy", "basic-energy"),
    }
    if category_ko not in mapping:
        raise ValueError(f"unknown category: {category_ko}")
    return mapping[category_ko]


def energy_type_from_ja(name_ja: str) -> tuple[str, str]:
    mapping = {
        "基本草エネルギー": ("grass", "풀"),
        "基本炎エネルギー": ("fire", "불꽃"),
        "基本水エネルギー": ("water", "물"),
        "基本雷エネルギー": ("electric", "번개"),
        "基本超エネルギー": ("psychic", "초"),
        "基本闘エネルギー": ("fighting", "격투"),
        "基本悪エネルギー": ("dark", "악"),
        "基本鋼エネルギー": ("steel", "강철"),
    }
    return mapping.get(re.sub(r"\s+", "", name_ja or ""), ("", ""))


def energy_type(name_ko: str) -> tuple[str, str]:
    match = re.fullmatch(r"기본\s+(\S+)\s+에너지", name_ko)
    if not match:
        return "", ""
    word = match.group(1)
    code = KO_TYPE.get(word, "")
    if not code:
        return "", ""
    return code, word


def image_token(src: str) -> str:
    match = re.search(rf"{re.escape(IMAGE_CODE)}_([A-Za-z0-9]+)", src or "")
    if not match:
        return ""
    token = match.group(1)
    return token.zfill(3) if token.isdigit() else token


def regulation_from_symbols(soup) -> str:
    marks = []
    for symbol in soup.select("div.pre_info_wrap img"):
        src = (symbol.get("src") or "").split("?")[0]
        mark = src.rstrip("/").rsplit("/", 1)[-1]
        if re.fullmatch(r"[A-Z]\.png", mark) and mark[0] not in marks:
            marks.append(mark[0])
    return ", ".join(marks)


def parse_kr(card_id: str, html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    name = text(soup.select_one("span.card-hp.title"))
    if not name:
        raise ValueError(f"{card_id}: missing Korean name")
    info = text(soup.select_one("div.pokemon-info"))
    info = info.replace("카드 종류 :", "").replace("카드 종류:", "").strip()
    parts = [p.strip() for p in re.split(r"\|", info) if p.strip()]
    category_ko = parts[0] if parts else ""
    tags = parts[1:]
    header = soup.select_one("div.header")
    type_ko = ""
    if header:
        icon = header.select_one("img.type_b")
        if icon and icon.get("title"):
            type_ko = icon["title"].strip()
    if not type_ko and "에너지" in category_ko:
        icon = soup.select_one("div.pokemon-abilities img[title]")
        if icon and icon.get("title"):
            type_ko = icon["title"].strip()
        if not type_ko:
            _code, type_ko = energy_type(name)
    hp_text = text(soup.select_one("span.hp_num"))
    hp_match = re.search(r"(\d+)", hp_text)
    hp = int(hp_match.group(1)) if hp_match else None
    illust = text(soup.select_one("p.illustrator")).replace("일러스트", "").strip()
    img = soup.select_one("img.feature_image")
    img_src = img["src"] if img and img.get("src") else ""
    img_num = image_token(img_src)
    product = text(soup.select_one("a.search_href"))
    regulation = regulation_from_symbols(soup)
    variants = []
    for el in soup.select("span.p_num"):
        rare_el = el.select_one("[id=no_wrap_by_admin]")
        rarity = text(rare_el).upper().replace(" ", "")
        number_node = BeautifulSoup(str(el), "html.parser").select_one("span.p_num")
        if number_node and rare_el is not None:
            for child in list(number_node.find_all(id="no_wrap_by_admin")):
                child.decompose()
        raw_num = text(number_node or el)
        half = "좌측" if "좌측" in raw_num else "우측" if "우측" in raw_num else ""
        match = re.search(r"(\d+)\s*/\s*(\d+)", raw_num)
        if match:
            number, printed = match.group(1).zfill(3), match.group(2).zfill(3)
        else:
            number = re.sub(r"\s+", "", raw_num)
            printed = ""
        if not number:
            continue
        image_crop = "left" if half == "좌측" else "right" if half == "우측" else ""
        variants.append(
            {
                "krCardId": card_id,
                "krUrl": f"https://pokemoncard.co.kr/cards/detail/{card_id}",
                "verifiedOn": f"https://pokemoncard.co.kr/cards/detail/{card_id}",
                "number": number,
                "printedIn": printed,
                "seq": img_num,
                "halfKo": half,
                "rarityKo": rarity,
                "nameKo": name,
                "categoryKo": category_ko,
                "tags": tags,
                "typeKo": type_ko,
                "hp": hp,
                "illustrator": illust,
                "imageSrc": img_src,
                "imageCrop": image_crop,
                "productNameKo": product,
                "regulation": regulation,
                "pageHasImage": number == img_num or not img_num,
            }
        )
    if not variants:
        raise ValueError(f"{card_id}: missing number")
    return variants


def parse_jp(card_id: str, html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    name = text(soup.select_one("h1"))
    stage = norm_stage(text(soup.select_one("span.type")))
    if stage not in JP_STAGE:
        for heading in soup.select("div.RightBox h2"):
            candidate = norm_stage(text(heading))
            if candidate in JP_STAGE:
                stage = candidate
                break
        else:
            stage = ""
    hp_text = text(soup.select_one("span.hp-num"))
    hp_match = re.search(r"(\d+)", hp_text)
    hp = int(hp_match.group(1)) if hp_match else None
    type_code, type_ko = "", ""
    icon = None
    top = soup.select_one("div.TopInfo")
    if top:
        icon = top.select_one("span.icon")
    if icon is None:
        box = soup.select_one("div.RightBox")
        if box:
            icon = box.select_one("span.icon")
    if icon:
        for cls in icon.get("class") or []:
            if cls.startswith("icon-") and cls != "icon":
                type_code, type_ko = TYPE_FROM_ICON.get(cls.replace("icon-", ""), ("", ""))
    if not type_code:
        type_code, type_ko = energy_type_from_ja(name)
    img = soup.select_one("img.fit")
    illust = text(soup.select_one("div.author a"))
    sub = soup.select_one("div.subtext")
    chunks = []
    if sub:
        parts = re.split(r"<br\s*/?>", str(sub), flags=re.I)
        for part in parts:
            psoup = BeautifulSoup(part, "html.parser")
            raw = psoup.get_text(" ", strip=True)
            match = re.search(r"(\d+)\s*/\s*(\d+)", raw)
            code = ""
            if match:
                number, printed = match.group(1).zfill(3), match.group(2).zfill(3)
            else:
                number, printed = "", ""
                code = re.sub(r"\s+", "", raw)
            rare_img = psoup.select_one("img[src*='rarity']")
            rarity = rarity_from_filename(rare_img["src"]) if rare_img and rare_img.get("src") else ""
            half = "좌측" if "左" in raw else "우측" if "右" in raw else ""
            if number or code:
                chunks.append((number or code, printed, rarity, half))
    if not chunks:
        if name:
            chunks.append(("", "", "", ""))
        else:
            raise ValueError(f"jp {card_id}: missing number")
    url = f"https://www.pokemon-card.com/card-search/details.php/card/{card_id}/regu/all"
    rows = []
    for index, (number, printed, rarity, half) in enumerate(chunks):
        rows.append(
            {
                "jpCardId": card_id if index == 0 else None,
                "jpUrl": url,
                "jpName": name,
                "jpNumber": number,
                "jpPrintedIn": printed,
                "jpRarity": rarity,
                "jpStage": stage,
                "jpType": type_code,
                "jpTypeKo": type_ko,
                "jpHp": hp,
                "jpIllustrator": illust,
                "jpHalf": half,
                "jpImage": img["src"] if img and img.get("src") else "",
            }
        )
    return rows


def fetch_kr() -> tuple[list[dict], list[dict]]:
    def one(n: int) -> tuple[int, int, list[dict]]:
        card_id = f"{ID_PREFIX}{n:03d}"
        url = f"https://pokemoncard.co.kr/cards/detail/{card_id}"
        try:
            status, raw = fetch(url)
        except Exception as exc:  # noqa: BLE001
            print("skip", card_id, exc)
            return n, 0, []
        html = raw.decode("utf-8", "replace")
        if status != 200 or "p_num" not in html:
            return n, status, []
        try:
            return n, status, parse_kr(card_id, html)
        except ValueError as exc:
            print("skip parse", exc)
            return n, status, []

    found: dict[str, dict] = {}
    missed: list[dict] = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = [pool.submit(one, n) for n in range(ID_MIN, ID_MAX + 1)]
        for fut in as_completed(futs):
            n, status, rows = fut.result()
            if not rows:
                missed.append({"id": f"{ID_PREFIX}{n:03d}", "status": status})
                continue
            for row in rows:
                if row["productNameKo"] != PRODUCT:
                    print("other product", row["krCardId"], row["productNameKo"])
                    missed.append(
                        {
                            "id": row["krCardId"],
                            "status": status,
                            "reason": row["productNameKo"],
                        }
                    )
                    continue
                prev = found.get(row["number"])
                if prev is None or (row["pageHasImage"] and not prev["pageHasImage"]):
                    found[row["number"]] = row

    def sort_key(row: dict) -> tuple:
        # Image sequence keeps basic energies in the official type order.
        seq = row.get("seq") or ""
        if seq.isdigit():
            return (0, int(seq))
        number = row["number"]
        if number.isdigit():
            return (0, int(number))
        return (1, number)

    rows = sorted(found.values(), key=sort_key)
    return rows, missed


def image_exists(token: str) -> bool:
    url = (
        "https://pokemoncard.co.kr/public-assets/home/data/cards.image_www/data/"
        f"images/MEGA/{IMAGE_CODE}/{IMAGE_CODE}_{token}.png"
    )
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status == 200
    except Exception:
        return False


def fetch_jp_cards() -> list[dict]:
    ids = []
    seen = set()
    for page in range(1, 6):
        query = urllib.parse.urlencode(
            {
                "keyword": "",
                "se_ta": "",
                "regulation_sidebar_form": "all",
                "regulation": "all",
                "pg": JP_PG,
                "illust": "",
                "sm_and_keyword": "true",
                "page": str(page),
            }
        )
        status, raw = fetch("https://www.pokemon-card.com/card-search/resultAPI.php?" + query)
        if status != 200:
            raise RuntimeError(f"jp search {status}")
        data = json.loads(raw.decode("utf-8"))
        batch = data.get("cardList") or []
        if not batch:
            break
        for card in batch:
            if card["cardID"] not in seen:
                seen.add(card["cardID"])
                ids.append(card["cardID"])
        if page >= int(data.get("maxPage") or page):
            break

    def one(card_id: str) -> list[dict]:
        status, raw = fetch(
            f"https://www.pokemon-card.com/card-search/details.php/card/{card_id}/regu/all"
        )
        if status != 200:
            print("skip jp", card_id, status)
            return []
        try:
            return parse_jp(card_id, raw.decode("utf-8", "replace"))
        except ValueError as exc:
            print("skip jp parse", exc)
            return []

    rows = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = [pool.submit(one, cid) for cid in ids]
        for fut in as_completed(futs):
            rows.extend(fut.result())
    return rows


def norm_illust(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip().lower()


# Used only when illustrator and category already agree and more than one
# Japanese card remains. Each pair was confirmed by reading the effect on the
# Korean detail page and the Japanese detail page. Collector number is not a
# tie-break for a card with no HP and no type.
ITEM_NAME_JA = {
    "곤충채집세트": "むしとりセット",
    "네스트볼": "ネストボール",
    "대단한낚싯대": "すごいつりざお",
    "대지의 그릇": "大地の器",
    "밤의 들것": "夜のタンカ",
    "언페어 스탬프": "アンフェアスタンプ",
    "에너지 갈아 달기": "エネルギーつけかえ",
    "이상한사탕": "ふしぎなアメ",
    "일렉트릭 제너레이터": "エレキジェネレーター",
    "절친 포핀": "なかよしポフィン",
    "원더패치": "ワンダーパッチ",
    "카운터 캐처": "カウンターキャッチャー",
    "툴스크래퍼": "ツールスクラッパー",
    "포켓몬 교체": "ポケモンいれかえ",
    "프라임 캐처": "プライムキャッチャー",
    "기술머신 데볼루션": "ワザマシン デヴォリューション",
    "기술머신 에볼루션": "ワザマシン エヴォリューション",
    "용기의부적": "勇気のおまもり",
    "카운터 게인": "カウンターゲイン",
    "타이트밴드": "ガチガチバンド",
    "펑크멧": "パンクメット",
    "풍선": "ふうせん",
    "히어로 망토": "ヒーローマント",
    "카지": "スグリ",
    "페퍼": "ペパー",
}


def match_jp(kr_rows: list[dict], jp_rows: list[dict]) -> None:
    used: set[int] = set()

    def eligible(kr: dict, jp: dict) -> bool:
        kr_ill = norm_illust(kr["illustrator"])
        jp_ill = norm_illust(jp["jpIllustrator"])
        if kr_ill or jp_ill:
            if kr_ill != jp_ill:
                return False
        elif not (kr["typeKo"] and jp["jpTypeKo"] and kr["typeKo"] == jp["jpTypeKo"]):
            return False
        if KO_TO_JP_STAGE.get(kr["categoryKo"]) != jp["jpStage"]:
            return False
        if kr["rarityKo"] and jp["jpRarity"] and kr["rarityKo"] != jp["jpRarity"]:
            return False
        if (kr.get("halfKo") or jp.get("jpHalf")) and kr.get("halfKo") != jp.get("jpHalf"):
            return False
        if kr["hp"] and jp["jpHp"] and kr["hp"] != jp["jpHp"]:
            return False
        if kr["typeKo"] and jp["jpTypeKo"] and kr["typeKo"] != jp["jpTypeKo"]:
            return False
        return True

    for kr in kr_rows:
        options = [jp for jp in jp_rows if id(jp) not in used and eligible(kr, jp)]
        if not options:
            kr["jp"] = None
            continue
        if len(options) > 1:
            wanted = ITEM_NAME_JA.get(kr["nameKo"])
            named = [jp for jp in options if wanted and jp["jpName"] == wanted]
            if len(named) == 1:
                options = named
            elif not kr["hp"] and not kr["typeKo"]:
                kr["jp"] = None
                kr["jpAmbiguous"] = [f"{jp['jpNumber']}:{jp['jpName']}" for jp in options]
                continue
            else:
                same_number = [jp for jp in options if jp["jpNumber"] == kr["number"]]
                if same_number:
                    options = same_number
        if len(options) != 1:
            kr["jp"] = None
            kr["jpAmbiguous"] = [f"{jp['jpNumber']}:{jp['jpName']}" for jp in options]
            continue
        chosen = options[0]
        used.add(id(chosen))
        kr["jp"] = chosen


def clean_image_url(src: str) -> str:
    path = src.split("?")[0]
    path = path.replace("/wmimages/", "/images/")
    path = re.sub(r"\.(webp|jpe?g)$", ".png", path, flags=re.I)
    if path.startswith("/"):
        path = "https://pokemoncard.co.kr" + path
    return path


def draw_watermark(image: Image.Image, scale: float) -> Image.Image:
    image = image.convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    size_lg = max(12, int(22 * scale))
    size_sm = max(10, int(14 * scale))
    font_lg = ImageFont.truetype(FONT_PATH, size_lg)
    font_sm = ImageFont.truetype(FONT_PATH, size_sm)
    lines = [("세드릭", font_lg), ("blog.naver.com/mdsd12", font_sm)]
    widths = []
    heights = []
    for line, font in lines:
        box = draw.textbbox((0, 0), line, font=font)
        widths.append(box[2] - box[0])
        heights.append(box[3] - box[1])
    pad = max(8, int(12 * scale))
    gap = max(1, int(2 * scale))
    block_w = max(widths)
    block_h = sum(heights) + gap
    x = image.width - block_w - pad
    y = image.height - block_h - pad
    cursor = y
    for (line, font), height in zip(lines, heights):
        draw.text((x + 1, cursor + 1), line, font=font, fill=(0, 0, 0, 120))
        draw.text((x, cursor), line, font=font, fill=(255, 255, 255, 176))
        cursor += height + gap
    return Image.alpha_composite(image, overlay).convert("RGB")


def crop_card(image: Image.Image, crop: str) -> Image.Image:
    if crop in {"left", "right"} and image.width > image.height * 1.15:
        mid = image.width // 2
        if crop == "left":
            return image.crop((0, 0, mid, image.height))
        return image.crop((mid, 0, image.width, image.height))
    return image


def save_webp(raw: bytes, dest: Path, width: int, crop: str) -> None:
    with Image.open(BytesIO(raw)) as src:
        src = crop_card(src.convert("RGBA"), crop)
        height = round(src.height * (width / src.width))
        resized = src.resize((width, height), Image.Resampling.LANCZOS)
        marked = draw_watermark(resized, width / 640)
        dest.parent.mkdir(parents=True, exist_ok=True)
        marked.save(dest, "WEBP", quality=76, method=6)


def download_images(cards: list[dict]) -> None:
    cache: dict[str, bytes] = {}

    def raw_for(card: dict) -> bytes:
        url = clean_image_url(card["imageSrc"])
        if url in cache:
            return cache[url]
        try:
            status, raw = fetch(url)
            if status != 200 or len(raw) < 1000:
                raise RuntimeError(f"{status} {len(raw)}")
        except Exception:
            fallback = card["imageSrc"].split("?")[0]
            if fallback.startswith("/"):
                fallback = "https://pokemoncard.co.kr" + fallback
            status, raw = fetch(fallback)
            if status != 200 or len(raw) < 1000:
                raise RuntimeError(f"image {card['number']} {status}")
            url = fallback
        cache[url] = raw
        return raw

    def one(card: dict) -> str:
        raw = raw_for(card)
        crop = card.get("imageCrop") or ""
        number = card["number"]
        save_webp(raw, IMG_DIR / f"{number}.webp", 640, crop)
        save_webp(raw, IMG_DIR / f"{number}-thumb.webp", 280, crop)
        return number

    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(one, card): card["number"] for card in cards}
        done = 0
        for fut in as_completed(futs):
            fut.result()
            done += 1
            if done % 10 == 0 or done == len(cards):
                print(f"images {done}/{len(cards)}")


def build_card(kr: dict) -> dict:
    group, stage = category_from_ko(kr["categoryKo"])
    type_code = KO_TYPE.get(kr["typeKo"], "")
    if not type_code and group == "energy":
        type_code, type_ko = energy_type(kr["nameKo"])
        if type_ko and not kr["typeKo"]:
            kr["typeKo"] = type_ko
    jp = kr.get("jp") or {}
    rarity = kr["rarityKo"]
    return {
        "number": kr["number"],
        "printedIn": kr["printedIn"],
        "nameKo": kr["nameKo"],
        "nameStatus": "verified-kr",
        "nameJa": jp.get("jpName") or None,
        "rarity": rarity,
        "type": type_code or None,
        "typeKo": kr["typeKo"] or None,
        "category": group,
        "stage": stage,
        "categoryKo": kr["categoryKo"],
        "halfKo": kr.get("halfKo") or None,
        "tags": kr["tags"],
        "hp": kr["hp"],
        "illustrator": kr["illustrator"] or None,
        "krCardId": kr["krCardId"],
        "krUrl": kr["krUrl"],
        "verifiedUrl": kr.get("verifiedOn") or kr["krUrl"],
        "jpCardId": jp.get("jpCardId"),
        "jpUrl": jp.get("jpUrl"),
        "jpNumber": jp.get("jpNumber") or None,
        "jpRarity": jp.get("jpRarity") or None,
        "jpStage": jp.get("jpStage") or None,
        "regulation": kr["regulation"],
        "image": f"{kr['number']}.webp",
        "thumb": f"{kr['number']}-thumb.webp",
    }


def main() -> None:
    print("fetch korean cards")
    kr_rows, missed = fetch_kr()
    print("korean", len(kr_rows), "unparsed ids", len(missed))
    print("check images for unparsed ids")
    for row in missed:
        match = re.search(r"(\d{3})$", row["id"])
        row["image"] = image_exists(match.group(1)) if match else False
    interesting = []
    for row in missed:
        match = re.search(r"(\d{3})$", row["id"])
        n = int(match.group(1)) if match else 0
        if row["image"] or (row["status"] != 200 and n <= EXPECT_COUNT):
            interesting.append(row)
    print("missing report", len(interesting))
    for row in sorted(interesting, key=lambda item: item["id"]):
        print(" ", row)

    if len(kr_rows) != EXPECT_COUNT:
        raise SystemExit(f"korean cards {len(kr_rows)} expected {EXPECT_COUNT}")
    print("fetch japanese cards")
    jp_rows = fetch_jp_cards()
    print("japanese", len(jp_rows))
    if len(jp_rows) < JP_EXPECT_MIN:
        raise SystemExit(f"japanese cards {len(jp_rows)} below {JP_EXPECT_MIN}")
    match_jp(kr_rows, jp_rows)
    matched = sum(1 for row in kr_rows if row.get("jp"))
    print("matched", matched)
    cards = [build_card(row) for row in kr_rows]
    numbers = [card["number"] for card in cards]
    dupes = [num for num, count in Counter(numbers).items() if count > 1]
    if dupes:
        raise SystemExit(f"duplicate numbers: {dupes}")
    unknown_type = [
        f"{card['number']} {card['nameKo']} {card['categoryKo']}"
        for card in cards
        if card["category"] == "pokemon" and not card["type"]
    ]
    if unknown_type:
        raise SystemExit(f"pokemon missing type: {unknown_type}")
    energy_missing = [
        f"{card['number']} {card['nameKo']}"
        for card in cards
        if card["category"] == "energy" and not card["type"]
    ]
    if energy_missing:
        raise SystemExit(f"energy missing type: {energy_missing}")
    dotted = [
        card["number"] + " " + card["nameKo"]
        for card in cards
        if "\u00b7" in card["nameKo"] or (card["nameJa"] and "\u00b7" in card["nameJa"])
    ]
    if dotted or "\u00b7" in PRODUCT:
        raise SystemExit(f"middle dot in name: {dotted}")

    counts = Counter(card["rarity"] or "(empty)" for card in cards)
    print("rarity", dict(counts))
    printed = Counter(card["printedIn"] or "(none)" for card in cards)
    print("printedIn", dict(printed))
    print("categories", dict(Counter(card["categoryKo"] for card in cards)))
    regs = Counter(row["regulation"] or "(none)" for row in kr_rows)
    print("regulation", dict(regs))
    for card in cards:
        jp = card["nameJa"] or "-"
        print(
            f"{card['number']:>4} {card['printedIn'] or '-':>3} {card['regulation'] or '-':<3} "
            f"{card['rarity'] or '-':<4} {card['nameKo']} | {jp} | {card['jpNumber'] or '-'} "
            f"{card['jpRarity'] or '-'} {card['categoryKo']} {card['typeKo'] or '-'} "
            f"hp={card['hp']} {card['illustrator'] or '-'}"
        )
    no_jp = [f"{row['number']} {row['nameKo']}" for row in kr_rows if not row.get("jp")]
    print("no jp match", len(no_jp))
    for line in no_jp:
        print(" ", line)
    ambiguous = [
        f"{row['number']} {row['nameKo']} {row.get('jpAmbiguous')}"
        for row in kr_rows
        if row.get("jpAmbiguous")
    ]
    if ambiguous:
        print("ambiguous", len(ambiguous))
        for line in ambiguous:
            print(" ", line)
    disagree = [
        f"{card['number']} ko={card['rarity'] or '-'} jp={card['jpRarity']} {card['nameKo']}"
        for card in cards
        if card["jpRarity"] and card["rarity"] and card["rarity"] != card["jpRarity"]
    ]
    print("rarity disagree", disagree)
    blank_with_jp = [
        f"{card['number']} jp={card['jpRarity']} {card['nameKo']}"
        for card in cards
        if not card["rarity"] and card["jpRarity"]
    ]
    print("blank ko rarity with jp", len(blank_with_jp))
    for line in blank_with_jp:
        print(" ", line)

    if __import__("os").environ.get("SKIP_IMAGES") == "1":
        print("skip images")
    else:
        print("download images")
        download_images(kr_rows)

    for number, (name_ko, regulation) in ANCHORS.items():
        card = next((item for item in cards if item["number"] == number), None)
        if card is None or card["nameKo"] != name_ko or card["regulation"] != regulation:
            raise SystemExit(f"anchor {number} {card}")
    basics = [row for row in kr_rows if row["categoryKo"] == "기본 에너지"]
    others = [row for row in kr_rows if row["categoryKo"] != "기본 에너지"]
    if not basics or any(row["regulation"] for row in basics):
        raise SystemExit("basic energy regulation was not blank on the detail page")
    missing_reg = [f"{row['number']} {row['nameKo']}" for row in others if not row["regulation"]]
    if missing_reg:
        raise SystemExit(f"missing regulation mark: {missing_reg}")
    numeric_printed = [int(card["printedIn"]) for card in cards if card["printedIn"].isdigit()]
    printed_total = Counter(numeric_printed).most_common(1)[0][0]
    regulation_marks = sorted({row["regulation"] for row in kr_rows if row["regulation"]})
    if not regulation_marks:
        raise SystemExit("no regulation mark on official pages")
    mark_text = ", ".join(regulation_marks)
    payload = {
        "id": SET_ID,
        "slug": SLUG,
        "nameKo": NAME_KO,
        "nameJa": NAME_JA,
        "productNameKo": PRODUCT,
        "productNameJa": PRODUCT_JA,
        "series": "MEGA",
        "regulation": mark_text,
        "expansionMark": IMAGE_CODE,
        "releaseDateKr": RELEASE_KR,
        "releaseDateJp": RELEASE_JP,
        "packPriceKr": PACK_PRICE,
        "boxPriceKr": BOX_PRICE,
        "cardsPerPack": CARDS_PER_PACK,
        "packsPerBox": PACKS_PER_BOX,
        "printedTotal": printed_total,
        "cardCount": len(cards),
        "krProductUrl": KR_PRODUCT_URL,
        "jpSetUrl": JP_SET_URL,
        "notes": [
            "카드 이름, 번호, 레어도, 타입, 레귤레이션은 한국 공식 카드 상세에 적힌 것만 넣었다.",
            "레어도 칸이 비어 있는 카드는 레어도를 비워 두었다.",
            "상세 페이지가 열리지 않는 카드는 넣지 않았다.",
            f"카드에 인쇄된 레귤레이션 마크는 {mark_text}이다. 기본 에너지는 마크가 없다.",
            *EXTRA_NOTES,
        ],
        "cards": cards,
    }
    blob = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if "\u00b7" in blob:
        raise SystemExit("middle dot in dataset")
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(blob, encoding="utf-8")
    report = {
        "cardCount": len(cards),
        "rarity": dict(counts),
        "printedIn": dict(printed),
        "matched": matched,
        "japanese": len(jp_rows),
        "missing": interesting,
        "noJp": no_jp,
        "ambiguous": ambiguous,
        "disagree": disagree,
    }
    Path(f"/tmp/{SET_ID}-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("wrote", OUT_JSON)


if __name__ == "__main__":
    main()
