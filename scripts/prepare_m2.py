#!/usr/bin/env python3
"""Build the Korean Inferno X dataset from official card pages.

Korean names, collector numbers, rarities, categories, types, regulation marks,
and images come from pokemoncard.co.kr card detail pages for
MEGA 확장팩 「인페르노X」. The detail id prefix is BS2025014.
A blank rarity field on that page stays blank. Japanese official pages are only
a cross-check and are not used to fill Korean name, number, rarity, or type.
Detail pages that return an error are left out. The regulation mark is the
single-letter symbol image on each official detail page.
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
OUT_JSON = ROOT / "src" / "data" / "sets" / "m2.json"
IMG_DIR = ROOT / "public" / "images" / "cards" / "m2"
FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
UA = "Mozilla/5.0 (compatible; pokecard-kr-dataset/1.0; +https://blog.naver.com/mdsd12)"
PRODUCT = "MEGA 확장팩 「인페르노X」"
ID_PREFIX = "BS2025014"
ID_MIN = 1
ID_MAX = 120

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


def regulation_from_symbols(soup: BeautifulSoup) -> str:
    """Read the regulation letter from the detail page symbol, not the set mark."""
    found = ""
    for symbol in soup.select("div.pre_info_wrap img"):
        src = (symbol.get("src") or "").split("?")[0]
        mark = src.rstrip("/").rsplit("/", 1)[-1]
        if re.fullmatch(r"[A-Z]\.png", mark):
            found = mark[0]
    return found


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
    img_match = re.search(r"/M2/M2_([A-Za-z0-9]+)", img_src)
    if img_match:
        token = img_match.group(1)
        img_num = token.zfill(3) if token.isdigit() else token
    product = text(soup.select_one("a.search_href"))
    regulation = regulation_from_symbols(soup)
    variants = []
    for el in soup.select("span.p_num"):
        rare_el = el.select_one("[id=no_wrap_by_admin]")
        rarity = text(rare_el).upper().replace(" ", "")
        # The rarity span sits inside the number, so read the number without it.
        # Stripping a trailing R would turn official codes FIR and DAR into FI and D.
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
                key = row["number"] + ("/" + row["halfKo"] if row["halfKo"] else "")
                prev = found.get(key)
                if prev is None or (row["pageHasImage"] and not prev["pageHasImage"]):
                    found[key] = row
    rows = sorted(found.values(), key=sort_key)
    return rows, missed


def sort_key(row: dict) -> tuple:
    number = row["number"]
    if number.isdigit():
        return (0, int(number), row.get("halfKo") or "")
    return (1, number, row.get("halfKo") or "")


def image_exists(n: int) -> bool:
    url = (
        "https://pokemoncard.co.kr/public-assets/home/data/cards.image_www/data/"
        f"images/MEGA/M2/M2_{n:03d}.png"
    )
    status, raw = fetch(url)
    return status == 200 and len(raw) > 1000


def fetch_jp_cards() -> list[dict]:
    ids = []
    seen = set()
    for page in range(1, 8):
        query = urllib.parse.urlencode(
            {
                "keyword": "",
                "se_ta": "",
                "regulation_sidebar_form": "all",
                "regulation": "all",
                "pg": "M2",
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
            same_number = [jp for jp in options if jp["jpNumber"] == kr["number"]]
            if kr["hp"] and same_number:
                options = same_number
            elif not kr["hp"] and not kr["typeKo"]:
                # No HP and no type, so a shared illustrator is not the same card.
                kr["jp"] = None
                kr["jpAmbiguous"] = [f"{jp['jpNumber']}:{jp['jpName']}" for jp in options]
                continue
            elif same_number:
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
    # Rarity stays empty when the Korean detail page prints nothing.
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
    print("fetch korean cards")
    kr_rows, missed = fetch_kr()
    print("korean", len(kr_rows), "unparsed ids", len(missed))
    print("check images for unparsed ids")
    for row in missed:
        match = re.search(r"(\d{3})$", row["id"])
        n = int(match.group(1)) if match else 0
        row["image"] = image_exists(n) if match else False
        row["n"] = n
    interesting = [row for row in missed if row.get("image") or row.get("reason") or row.get("n", 0) <= 116]
    print("missing report", len(interesting))
    for row in sorted(interesting, key=lambda item: item["id"]):
        if row.get("image") or row.get("reason") or row.get("status") == 200:
            print(" ", row)
    dropped = [row for row in missed if row.get("image")]
    if dropped:
        raise SystemExit(f"official image with no open detail page: {dropped}")

    print("fetch japanese cards")
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
        if "\u00b7" in card["nameKo"] or "\u00b7" in "".join(card["tags"])
    ]
    if dotted:
        raise SystemExit(f"middle dot in name: {dotted}")
    missing_reg = [f"{card['number']} {card['nameKo']}" for card in cards if not card["regulation"]]
    if missing_reg:
        raise SystemExit(f"missing regulation mark: {missing_reg}")

    counts = Counter(card["rarity"] or "(empty)" for card in cards)
    print("rarity", dict(counts))
    printed = Counter(card["printedIn"] or "(none)" for card in cards)
    print("printedIn", dict(printed))
    print("categories", dict(Counter(card["categoryKo"] for card in cards)))
    regs = Counter(row["regulation"] or "(none)" for row in kr_rows)
    print("regulation", dict(regs))
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
    swapped = [
        f"{card['number']} jp={card['jpNumber']} {card['nameKo']} {card['nameJa']}"
        for card in cards
        if card["jpNumber"] and card["jpNumber"] != card["number"]
    ]
    print("number diffs", len(swapped))
    for line in swapped:
        print(" ", line)
    disagree = [
        f"{card['number']} ko={card['rarity'] or '-'} jp={card['jpRarity']} {card['nameKo']}"
        for card in cards
        if card["jpRarity"] and card["rarity"] and card["rarity"] != card["jpRarity"]
    ]
    print("rarity disagree", disagree)

    if __import__("os").environ.get("SKIP_IMAGES") == "1":
        print("skip images")
    else:
        print("download images")
        download_images(kr_rows)

    numeric_printed = [int(card["printedIn"]) for card in cards if card["printedIn"].isdigit()]
    if not numeric_printed:
        raise SystemExit("no printed total on official pages")
    printed_total = Counter(numeric_printed).most_common(1)[0][0]
    regulation_marks = sorted({row["regulation"] for row in kr_rows if row["regulation"]})
    if not regulation_marks:
        raise SystemExit("no regulation mark on official pages")
    payload = {
        "id": "m2",
        "slug": "inferno-x",
        "nameKo": "인페르노X",
        "nameJa": "インフェルノX",
        "productNameKo": PRODUCT,
        "productNameJa": "ポケモンカードゲーム MEGA 拡張パック「インフェルノX」",
        "series": "MEGA",
        "regulation": ", ".join(regulation_marks),
        "expansionMark": "M2",
        "releaseDateKr": "2025-11-28",
        "releaseDateJp": "2025-09-26",
        "packPriceKr": 1000,
        "boxPriceKr": 30000,
        "cardsPerPack": 5,
        "packsPerBox": 30,
        "printedTotal": printed_total,
        "cardCount": len(cards),
        "krProductUrl": "https://pokemoncard.co.kr/card/838",
        "jpSetUrl": "https://www.pokemon-card.com/ex/m2/",
        "notes": [
            "카드 이름, 번호, 레어도, 타입은 한국 공식 카드 상세에 적힌 것만 넣었다.",
            "레어도 칸이 비어 있는 카드는 레어도를 비워 두었다.",
            "레귤레이션 마크는 각 카드 상세의 기호 이미지를 따랐다.",
            "상세 페이지가 열리지 않는 카드는 넣지 않았다.",
            "076번, 077번, 078번과 SR 105번, 106번, 107번, 그리고 101번, 102번은 일본판 번호와 다르다.",
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
        "regulation": dict(regs),
        "matched": matched,
        "japanese": len(jp_rows),
        "noJp": no_jp,
        "ambiguous": ambiguous,
        "numberDiffs": swapped,
        "disagree": disagree,
    }
    Path("/tmp/m2-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("wrote", OUT_JSON)


if __name__ == "__main__":
    main()
