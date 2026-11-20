#!/usr/bin/env python3
"""Build the Korean Super Electric Breaker dataset from official card pages.

Korean names, collector numbers, rarities, categories, types, regulation
marks, and images come from pokemoncard.co.kr card detail pages for
Super Electric Breaker, set id sv8. Japanese official pages supply
jpNumber and jpUrl only. A detail page that does not open is left out.
"""

from __future__ import annotations

import json
import os
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
SET_ID = "sv8"
OUT_JSON = ROOT / "src" / "data" / "sets" / f"{SET_ID}.json"
IMG_DIR = ROOT / "public" / "images" / "cards" / SET_ID
FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
UA = "Mozilla/5.0 (compatible; pokecard-kr-dataset/1.0; +https://blog.naver.com/mdsd12)"

PRODUCT = "스칼렛&바이올렛 확장팩 「초전브레이커」"
ID_PREFIX = "BS2024017"
ID_MIN = 1
ID_MAX = 138
IMG_MARK = "SV8"
JP_PG = "SV8"

SET_META = {
    "id": SET_ID,
    "slug": "super-electric-breaker",
    "nameKo": "초전브레이커",
    "nameJa": "超電ブレイカー",
    "productNameKo": PRODUCT,
    "productNameJa": "ポケモンカードゲーム スカーレット&バイオレット 拡張パック「超電ブレイカー」",
    "series": "스칼렛&바이올렛",
    "expansionMark": "SV8",
    "releaseDateKr": "2024-11-27",
    "releaseDateJp": "2024-10-18",
    "packPriceKr": 1000,
    "boxPriceKr": 30000,
    "cardsPerPack": 5,
    "packsPerBox": 30,
    "krProductUrl": "https://pokemoncard.co.kr/card/675",
    "jpSetUrl": "https://www.pokemon-card.com/ex/sv8/",
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
    "ace": "ACE",
    "acespec": "ACE",
    "ace_spec": "ACE",
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
    "기본 포켓몬 ex": "たね",
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
        "기본 포켓몬 ex": ("pokemon", "basic"),
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
    img_num = ""
    img_match = re.search(rf"{re.escape(IMG_MARK)}_([A-Za-z0-9]+)", img_src)
    if img_match:
        token = img_match.group(1)
        img_num = token.zfill(3) if token.isdigit() else token
    product = text(soup.select_one("a.search_href"))
    regulation = ""
    set_symbol = ""
    for symbol in soup.select("div.pre_info_wrap img"):
        src = symbol.get("src") or ""
        mark = src.rstrip("/").rsplit("/", 1)[-1]
        if re.fullmatch(r"[A-Z]\.png", mark):
            regulation = mark[0]
        elif mark.lower().endswith(".png"):
            set_symbol = mark[:-4]
    variants = []
    for el in soup.select("span.p_num"):
        rare_el = el.select_one("[id=no_wrap_by_admin]")
        rarity = text(rare_el).upper().replace(" ", "")
        # The rarity span sits inside the number, so read the number without it.
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
                "setSymbol": set_symbol,
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
    with ThreadPoolExecutor(max_workers=8) as pool:
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
    rows = sorted(found.values(), key=lambda row: (row["number"], row["krCardId"]))
    return rows, missed


def fetch_jp_cards() -> list[dict]:
    ids = []
    seen = set()
    page = 1
    hit_count = None
    while page <= 40:
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
        if data.get("hitCnt") not in (None, ""):
            hit_count = int(data["hitCnt"])
        batch = data.get("cardList") or []
        if not batch:
            break
        for card in batch:
            if card["cardID"] not in seen:
                seen.add(card["cardID"])
                ids.append(card["cardID"])
        if page >= int(data.get("maxPage") or page):
            break
        page += 1
    else:
        raise RuntimeError(f"jp search for {JP_PG} did not finish")
    if hit_count is not None and len(ids) != hit_count:
        raise RuntimeError(f"jp search for {JP_PG} returned {len(ids)} of {hit_count}")

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
    value = re.sub(r"\s+", " ", value or "").strip().lower()
    # 0313 and 313 are the same credit. The pages print different padding.
    if re.fullmatch(r"0+\d+", value):
        value = str(int(value))
    return value


def average_hash(raw: bytes) -> tuple[bool, ...]:
    """Hash the illustration, ignoring the name line and the card frame."""
    with Image.open(BytesIO(raw)) as im:
        image = im.convert("L")
        width, height = image.size
        art = image.crop((int(width * 0.12), int(height * 0.14), int(width * 0.88), int(height * 0.58)))
        small = art.resize((16, 16))
        pixels = list(small.get_flattened_data())
    average = sum(pixels) / len(pixels)
    return tuple(pixel > average for pixel in pixels)


def hash_distance(left: tuple[bool, ...], right: tuple[bool, ...]) -> int:
    return sum(a != b for a, b in zip(left, right))


_HASHES: dict[str, tuple[bool, ...] | None] = {}


def image_hash(url: str) -> tuple[bool, ...] | None:
    if not url:
        return None
    if url in _HASHES:
        return _HASHES[url]
    try:
        status, raw = fetch(url)
        if status != 200 or len(raw) < 1000:
            raise RuntimeError(f"{status}")
        digest = average_hash(raw)
    except Exception:
        digest = None
    _HASHES[url] = digest
    return digest


def jp_image_url(src: str) -> str:
    if not src:
        return ""
    if src.startswith("http"):
        return src
    if src.startswith("//"):
        return "https:" + src
    if src.startswith("/"):
        return "https://www.pokemon-card.com" + src
    return src


def choose_by_image(kr: dict, options: list[dict], best_limit: int = 40, margin: int = 30) -> dict | None:
    """Pick a Japanese card when the artwork is clearly the same picture."""
    kr_hash = image_hash(clean_image_url(kr["imageSrc"]))
    if kr_hash is None:
        return None
    scored = []
    for jp in options:
        digest = image_hash(jp_image_url(jp.get("jpImage") or ""))
        if digest is None:
            continue
        scored.append((hash_distance(kr_hash, digest), jp))
    if not scored:
        return None
    scored.sort(key=lambda item: item[0])
    best, winner = scored[0]
    second = scored[1][0] if len(scored) > 1 else 999
    if best <= best_limit and second >= best + margin:
        return winner
    return None


def match_jp(kr_rows: list[dict], jp_rows: list[dict]) -> None:
    used: set[int] = set()

    def same_card(kr: dict, jp: dict, illustrator: str) -> bool:
        kr_ill = norm_illust(kr["illustrator"])
        jp_ill = norm_illust(jp["jpIllustrator"])
        if illustrator == "strict":
            if kr_ill or jp_ill:
                if kr_ill != jp_ill:
                    return False
            elif not (kr["typeKo"] and jp["jpTypeKo"] and kr["typeKo"] == jp["jpTypeKo"]):
                return False
        elif illustrator == "loose" and kr_ill and jp_ill and kr_ill != jp_ill:
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

    def take(kr: dict, chosen: dict, how: str) -> None:
        used.add(id(chosen))
        kr["jp"] = chosen
        kr["jpMatch"] = how

    pending = list(kr_rows)
    guard = 0
    while pending and guard <= len(kr_rows):
        guard += 1
        progress = False
        rest = []
        for kr in pending:
            strict = [jp for jp in jp_rows if id(jp) not in used and same_card(kr, jp, "strict")]
            chosen = None
            how = ""
            if len(strict) == 1:
                chosen = strict[0]
                how = "strict"
            elif len(strict) > 1:
                chosen = choose_by_image(kr, strict)
                how = "image"
            if chosen is None:
                rest.append(kr)
                continue
            take(kr, chosen, how)
            progress = True
        pending = rest
        if not progress:
            break

    for kr in pending:
        loose = [jp for jp in jp_rows if id(jp) not in used and same_card(kr, jp, "loose")]
        chosen = choose_by_image(kr, loose) if loose else None
        if chosen is not None:
            take(kr, chosen, "image")
    pending = [kr for kr in pending if not kr.get("jp")]

    # Last resort when the two sites credit the same picture to different names.
    for kr in pending:
        wide = [jp for jp in jp_rows if id(jp) not in used and same_card(kr, jp, "wide")]
        chosen = choose_by_image(kr, wide, best_limit=28, margin=40) if wide else None
        if chosen is not None:
            take(kr, chosen, "image")
    for kr in pending:
        if kr.get("jp"):
            continue
        kr["jp"] = None
        strict = [jp for jp in jp_rows if id(jp) not in used and same_card(kr, jp, "strict")]
        if len(strict) > 1:
            kr["jpAmbiguous"] = [f"{jp['jpNumber']}:{jp['jpName']}" for jp in strict]


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
            if done % 20 == 0 or done == len(cards):
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
    card = {
        "number": kr["number"],
        "printedIn": kr["printedIn"],
        "nameKo": kr["nameKo"],
        "nameStatus": "verified-kr",
        "nameJa": jp.get("jpName") or None,
        "rarity": rarity,
        "regulation": kr["regulation"],
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
        "image": f"{kr['number']}.webp",
        "thumb": f"{kr['number']}-thumb.webp",
    }
    return card


def main() -> None:
    print("fetch korean cards", SET_ID)
    kr_rows, missed = fetch_kr()
    print("korean", len(kr_rows), "missed", len(missed))
    for row in sorted(missed, key=lambda item: item["id"]):
        print(" ", row)
    if missed:
        raise SystemExit(f"{SET_ID}: detail pages did not all open")

    print("fetch japanese cards", JP_PG)
    jp_rows = fetch_jp_cards()
    print("japanese", len(jp_rows))
    match_jp(kr_rows, jp_rows)
    matched = sum(1 for row in kr_rows if row.get("jp"))
    print("matched", matched)
    cards = [build_card(row) for row in kr_rows]
    numbers = [card["number"] for card in cards]
    dupes = [num for num, count in Counter(numbers).items() if count > 1]
    if dupes:
        raise SystemExit(f"duplicate numbers: {dupes}")
    wanted = [f"{n:03d}" for n in range(1, len(cards) + 1)]
    if numbers != wanted:
        raise SystemExit(f"numbers are not 001-{len(cards):03d}: {numbers[:5]}...{numbers[-5:]}")
    unknown_type = [
        f"{card['number']} {card['nameKo']} {card['categoryKo']}"
        for card in cards
        if card["category"] == "pokemon" and not card["type"]
    ]
    if unknown_type:
        raise SystemExit(f"pokemon missing type: {unknown_type}")
    missing_hp = [
        f"{card['number']} {card['nameKo']}"
        for card in cards
        if card["category"] == "pokemon" and not card["hp"]
    ]
    if missing_hp:
        raise SystemExit(f"pokemon missing hp: {missing_hp}")
    missing_reg = [f"{card['number']} {card['nameKo']}" for card in cards if not card["regulation"]]
    if missing_reg:
        raise SystemExit(f"missing regulation mark: {missing_reg}")
    bad_symbol = [
        f"{row['number']} {row['setSymbol']}"
        for row in kr_rows
        if row["setSymbol"] and row["setSymbol"] != IMG_MARK
    ]
    if bad_symbol:
        raise SystemExit(f"unexpected set symbol: {bad_symbol}")
    dotted = [
        card["number"] + " " + card["nameKo"]
        for card in cards
        if "\u00b7" in card["nameKo"] or "\u00b7" in (card["nameJa"] or "")
    ]
    if dotted:
        raise SystemExit(f"middle dot in name: {dotted}")

    counts = Counter(card["rarity"] or "(empty)" for card in cards)
    print("rarity", dict(counts))
    printed = Counter(card["printedIn"] or "(none)" for card in cards)
    print("printedIn", dict(printed))
    if len(printed) != 1 or "(none)" in printed:
        raise SystemExit(f"printed total is not uniform: {dict(printed)}")
    print("categories", dict(Counter(card["categoryKo"] for card in cards)))
    regs = Counter(row["regulation"] or "(none)" for row in kr_rows)
    print("regulation", dict(regs))
    image_matches = [
        f"{row['number']} {row['nameKo']} -> {row['jp']['jpNumber']} {row['jp']['jpName']}"
        for row in kr_rows
        if row.get("jpMatch") == "image" and row.get("jp")
    ]
    print("image matches", len(image_matches))
    for line in image_matches:
        print(" ", line)
    no_jp = [f"{row['number']} {row['nameKo']} illust={row['illustrator']}" for row in kr_rows if not row.get("jp")]
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
    number_diffs = [
        f"{card['number']} jp={card['jpNumber']} {card['nameKo']} / {card['nameJa']}"
        for card in cards
        if card["jpNumber"] and card["jpNumber"] != card["number"]
    ]
    print("number diffs", len(number_diffs))
    for line in number_diffs:
        print(" ", line)

    if os.environ.get("SKIP_IMAGES") == "1":
        print("skip images")
    else:
        print("download images")
        download_images(kr_rows)

    printed_total = int(next(iter(printed)))
    regulation_marks = sorted({row["regulation"] for row in kr_rows if row["regulation"]})
    notes = [
        "카드 이름, 번호, 레어도, 종류, 타입, 레귤레이션 마크는 한국 공식 카드 상세에 적힌 것만 넣었다.",
        "상세 페이지가 열리지 않는 카드는 넣지 않았다.",
    ]
    if number_diffs:
        notes.append("일본판과 번호가 다른 카드는 한국 공식 상세의 번호를 따른다.")
    payload = {
        **SET_META,
        "regulation": ", ".join(regulation_marks),
        "printedTotal": printed_total,
        "cardCount": len(cards),
        "notes": notes,
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
        "noJp": no_jp,
        "ambiguous": ambiguous,
        "disagree": disagree,
        "numberDiffs": number_diffs,
        "regulation": dict(regs),
    }
    Path(f"/tmp/{SET_ID}-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("wrote", OUT_JSON)


if __name__ == "__main__":
    main()
