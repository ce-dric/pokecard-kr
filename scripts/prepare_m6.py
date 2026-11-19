#!/usr/bin/env python3
"""Build the Storm Emeralda dataset from official Korean and Japanese card pages.

Korean names, collector numbers, categories, and images come from
pokemoncard.co.kr card detail pages BS2026005001-BS2026005113.
Japanese official pages supply the cross-check for rarity, type, and category.
Numbers 065-076 follow the Korean pages when the two sets disagree.
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path

from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "src" / "data" / "sets" / "m6.json"
IMG_DIR = ROOT / "public" / "images" / "cards" / "m6"
FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
UA = "Mozilla/5.0 (compatible; pokecard-kr-dataset/1.0; +https://blog.naver.com/mdsd12)"

KR_IDS = [f"BS2026005{n:03d}" for n in range(1, 114)]

RARITY_FROM_FILE = [
    ("mur", "MUR"),
    ("sar", "SAR"),
    ("ssr", "SSR"),
    ("csr", "CSR"),
    ("chr", "CHR"),
    ("ar", "AR"),
    ("sr", "SR"),
    ("rr", "RR"),
    ("ur", "UR"),
    ("hr", "HR"),
    ("rrr", "RRR"),
    ("_r_", "R"),
    ("_u_", "U"),
    ("_c_", "C"),
    ("rare_r", "R"),
    ("rare_u", "U"),
    ("rare_c", "C"),
]

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


def fetch(url: str, data: bytes | None = None, timeout: int = 40) -> bytes:
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(
                url,
                data=data,
                headers={"User-Agent": UA, "Accept": "*/*", "Referer": url},
            )
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return res.read()
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
    return {
        "c": "C",
        "u": "U",
        "r": "R",
        "rr": "RR",
        "ar": "AR",
        "sr": "SR",
        "sar": "SAR",
        "mur": "MUR",
        "ur": "UR",
        "hr": "HR",
        "ssr": "SSR",
        "csr": "CSR",
        "chr": "CHR",
    }.get(token, "")


def parse_kr(card_id: str, html: str) -> list[dict]:
    """One official page can list both halves of a paired stadium."""
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
    hp_text = text(soup.select_one("span.hp_num"))
    hp_match = re.search(r"(\d+)", hp_text)
    hp = int(hp_match.group(1)) if hp_match else None
    illust = text(soup.select_one("p.illustrator")).replace("일러스트", "").strip()
    img = soup.select_one("img.feature_image")
    img_src = img["src"] if img and img.get("src") else ""
    img_num = ""
    img_match = re.search(r"M6_(\d+)", img_src)
    if img_match:
        img_num = img_match.group(1).zfill(3)
    product = text(soup.select_one("a.search_href"))
    variants = []
    for el in soup.select("span.p_num"):
        raw_num = text(el)
        match = re.search(r"(\d+)\s*/\s*(\d+)", raw_num)
        if not match:
            continue
        number, printed = match.group(1).zfill(3), match.group(2).zfill(3)
        rare_el = el.select_one("[id=no_wrap_by_admin]")
        rarity = text(rare_el).upper().replace(" ", "")
        half = "좌측" if "좌측" in raw_num else "우측" if "우측" in raw_num else ""
        # Paired stadiums are published as one wide image. Keep that file and
        # crop to the half named on the page. Separate right-half files 404.
        image_src = img_src
        image_crop = "left" if half == "좌측" else "right" if half == "우측" else ""
        own_id = f"BS2026005{number}"
        variants.append(
            {
                "krCardId": own_id,
                "krUrl": f"https://pokemoncard.co.kr/cards/detail/{own_id}",
                "verifiedOn": f"https://pokemoncard.co.kr/cards/detail/{card_id}",
                "number": number,
                "printedIn": printed,
                "halfKo": half,
                "rarityKo": rarity,
                "nameKo": name,
                "categoryKo": category_ko,
                "tags": tags,
                "typeKo": type_ko,
                "hp": hp,
                "illustrator": illust,
                "imageSrc": image_src,
                "imageCrop": image_crop,
                "productNameKo": product,
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
            if not match:
                continue
            rare_img = psoup.select_one("img[src*='rarity']")
            rarity = rarity_from_filename(rare_img["src"]) if rare_img and rare_img.get("src") else ""
            half = "좌측" if "左" in raw else "우측" if "右" in raw else ""
            chunks.append((match.group(1).zfill(3), match.group(2).zfill(3), rarity, half))
    if not chunks:
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
    if category_ko in mapping:
        group, stage = mapping[category_ko]
        return group, stage
    if "포켓몬" in category_ko:
        return "pokemon", "basic"
    if "에너지" in category_ko:
        return "energy", "special-energy"
    return "trainer", "item"


def fetch_kr_ids() -> list[dict]:
    def one(card_id: str) -> list[dict]:
        url = f"https://pokemoncard.co.kr/cards/detail/{card_id}"
        try:
            html = fetch(url).decode("utf-8", "replace")
        except Exception as exc:  # noqa: BLE001
            print("skip", card_id, exc)
            return []
        if "span class=\"p_num\"" not in html and "span class='p_num'" not in html and "p_num" not in html:
            print("skip empty", card_id)
            return []
        try:
            return parse_kr(card_id, html)
        except ValueError as exc:
            print("skip parse", exc)
            return []

    found: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = [pool.submit(one, cid) for cid in KR_IDS]
        for fut in as_completed(futs):
            for row in fut.result():
                # Prefer the page whose own image is this card. A pair page also
                # publishes the other half's number, name, and rarity.
                prev = found.get(row["number"])
                if prev is None or (row["pageHasImage"] and not prev["pageHasImage"]):
                    found[row["number"]] = row
    missing = [f"{n:03d}" for n in range(1, 114) if f"{n:03d}" not in found]
    if missing:
        raise SystemExit(f"missing korean cards: {missing}")
    return [found[f"{n:03d}"] for n in range(1, 114)]


def fetch_jp_cards() -> list[dict]:
    ids = []
    seen = set()
    for page in range(1, 4):
        query = urllib.parse.urlencode(
            {
                "keyword": "",
                "se_ta": "",
                "regulation_sidebar_form": "all",
                "regulation": "all",
                "pg": "M6",
                "illust": "",
                "sm_and_keyword": "true",
                "page": str(page),
            }
        )
        raw = fetch("https://www.pokemon-card.com/card-search/resultAPI.php?" + query)
        data = json.loads(raw.decode("utf-8"))
        for card in data.get("cardList") or []:
            if card["cardID"] not in seen:
                seen.add(card["cardID"])
                ids.append(card["cardID"])

    def one(card_id: str) -> dict:
        html = fetch(
            f"https://www.pokemon-card.com/card-search/details.php/card/{card_id}/regu/all"
        ).decode("utf-8", "replace")
        return parse_jp(card_id, html)

    rows = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = [pool.submit(one, cid) for cid in ids]
        for fut in as_completed(futs):
            rows.extend(fut.result())
    return rows


def norm_illust(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip().lower()


def match_jp(kr_rows: list[dict], jp_rows: list[dict]) -> None:
    used: set[int] = set()  # id() of matched Japanese rows

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
        same_number = [jp for jp in options if jp["jpNumber"] == kr["number"]]
        if len(options) > 1 and same_number:
            options = same_number
        if len(options) != 1:
            kr["jp"] = None
            kr["jpAmbiguous"] = [jp["jpNumber"] for jp in options]
            continue
        chosen = options[0]
        used.add(id(chosen))
        kr["jp"] = chosen


def clean_image_url(src: str) -> str:
    """Prefer the Korean original PNG over the site's pre-watermarked webp."""
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
        # Dark shadow keeps the light text readable on pale card borders.
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
            raw = fetch(url)
        except Exception:
            fallback = card["imageSrc"].split("?")[0]
            if fallback.startswith("/"):
                fallback = "https://pokemoncard.co.kr" + fallback
            raw = fetch(fallback)
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
            if done % 20 == 0:
                print(f"images {done}/{len(cards)}")


def build_card(kr: dict) -> dict:
    group, stage = category_from_ko(kr["categoryKo"])
    type_code = KO_TYPE.get(kr["typeKo"], "")
    jp = kr.get("jp") or {}
    rarity = kr["rarityKo"] or jp.get("jpRarity") or ""
    if not type_code and group == "pokemon" and jp.get("jpType"):
        type_code = jp["jpType"]
    name_status = "verified-kr" if kr["nameKo"] else "ja-fallback"
    card = {
        "number": kr["number"],
        "printedIn": kr["printedIn"],
        "nameKo": kr["nameKo"] if name_status == "verified-kr" else None,
        "nameStatus": name_status,
        "nameJa": jp.get("jpName") or None,
        "rarity": rarity,
        "type": type_code or None,
        "typeKo": kr["typeKo"] or jp.get("jpTypeKo") or None,
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
    kr_rows = fetch_kr_ids()
    print("korean", len(kr_rows))
    print("fetch japanese cards")
    jp_rows = fetch_jp_cards()
    print("japanese", len(jp_rows))
    missing_rare = [row["jpNumber"] for row in jp_rows if not row["jpRarity"]]
    if missing_rare:
        print("jp rarity missing", missing_rare)
    match_jp(kr_rows, jp_rows)
    matched = sum(1 for row in kr_rows if row.get("jp"))
    print("matched", matched)
    cards = [build_card(row) for row in sorted(kr_rows, key=lambda r: r["number"])]
    numbers = [card["number"] for card in cards]
    if numbers != [f"{n:03d}" for n in range(1, 114)]:
        raise SystemExit(f"unexpected numbers: {numbers}")
    from collections import Counter

    counts = Counter(card["rarity"] or "(empty)" for card in cards)
    print("rarity", dict(counts))
    swapped = [
        f"{card['number']} ko={card['nameKo']} jpNo={card['jpNumber']} ja={card['nameJa']}"
        for card in cards
        if card["jpNumber"] and card["jpNumber"] != card["number"]
    ]
    print("number diffs", len(swapped))
    for line in swapped:
        print(" ", line)
    missing_jp = [row["number"] + " " + row["nameKo"] for row in kr_rows if not row.get("jp")]
    print("no jp match", missing_jp)
    ambiguous = [row["number"] + " " + str(row.get("jpAmbiguous")) for row in kr_rows if row.get("jpAmbiguous")]
    if ambiguous:
        print("ambiguous", ambiguous)
    disagree = [
        f"{card['number']} ko={card['rarity']} jp={card['jpRarity']} {card['nameKo']}"
        for card in cards
        if card["jpRarity"] and card["rarity"] != card["jpRarity"]
    ]
    print("rarity disagree", disagree)
    empty_stage = [card["number"] for card in cards if not card["stage"]]
    print("empty stage", empty_stage)

    if __import__("os").environ.get("SKIP_IMAGES") == "1":
        print("skip images")
    else:
        print("download images")
        download_images(kr_rows)

    payload = {
        "id": "m6",
        "slug": "storm-emeralda",
        "nameKo": "스톰에메랄다",
        "nameJa": "ストームエメラルダ",
        "productNameKo": "MEGA 확장팩 「스톰에메랄다」",
        "productNameJa": "ポケモンカードゲーム MEGA 拡張パック「ストームエメラルダ」",
        "series": "MEGA",
        "regulation": "J",
        "expansionMark": "M6",
        "releaseDateKr": "2026-08-21",
        "releaseDateJp": "2026-07-31",
        "packPriceKr": 1500,
        "boxPriceKr": 45000,
        "cardsPerPack": 5,
        "packsPerBox": 30,
        "printedTotal": 76,
        "cardCount": 113,
        "krProductUrl": "https://pokemoncard.co.kr/card/938",
        "jpSetUrl": "https://www.pokemon-card.com/ex/m6/",
        "notes": [
            "카드 번호는 한국 공식 카드 검색 상세 페이지의 번호를 따른다.",
            "065번부터 076번까지는 일본판 수록 순서와 다르다.",
        ],
        "cards": cards,
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", OUT_JSON)


if __name__ == "__main__":
    main()
