#!/usr/bin/env python3
"""Build special-engine Korean product datasets from official card pages.

Usage: python3 scripts/prepare_engine_set.py <set-id>

Korean names, collector numbers, rarities, categories, types, regulation
marks, and images come only from pokemoncard.co.kr detail pages. Japanese
pages supply jpNumber and jpUrl only. Detail pages that do not open are
left out. Unknown Korean fields stay empty. Do not invent names.
"""

from __future__ import annotations

import json
import os
import re
import sys
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
FONT_PATH = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
UA = "Mozilla/5.0 (compatible; pokecard-kr-dataset/1.0; +https://blog.naver.com/mdsd12)"

ENERGY_ORDER = ["GRA", "FIR", "WAT", "LIG", "PSY", "FIG", "DAR", "MET"]

# Official Korean product titles and id ranges confirmed on pokemoncard.co.kr.
CONFIGS: dict[str, dict] = {
    "svod": {
        "slug": "steven-beldum-metagross",
        "nameKo": "성호의 메탕&메타그로스 ex",
        "nameJa": "ダイゴのダンバル＆メタグロスex",
        "productNameKo": "스칼렛&바이올렛 스타터 세트 ex 「성호의 메탕&메타그로스 ex」",
        "productNameJa": "ポケモンカードゲーム スカーレット&バイオレット スターターセットex ダイゴのダンバル＆メタグロスex",
        "series": "스칼렛&바이올렛",
        "expansionMark": "SVOD",
        "releaseDateKr": "2025-04-25",
        "releaseDateJp": "2025-02-21",
        "packPriceKr": 12000,
        "boxPriceKr": 0,
        "cardsPerPack": 60,
        "packsPerBox": 1,
        "krProductUrl": "https://pokemoncard.co.kr/card/759",
        "jpSetUrl": "https://www.pokemon-card.com/products/sv/svo.html",
        "idPrefix": "BS2025003",
        "idMin": 1,
        "idMax": 30,
        "imgMark": "SVOD",
        "jpPg": "SVOD",
        "notesExtra": [
            "이 제품은 카드 60장 구축 덱이다. 목록은 상세 페이지가 열린 서로 다른 카드만 모았다.",
        ],
    },
    "svom": {
        "slug": "marnie-morpeko-grimmsnarl",
        "nameKo": "마리의 모르페코&오롱털 ex",
        "nameJa": "マリィのモルペコ＆オーロンゲex",
        "productNameKo": "스칼렛&바이올렛 스타터 세트 ex 「마리의 모르페코&오롱털 ex」",
        "productNameJa": "ポケモンカードゲーム スカーレット&バイオレット スターターセットex マリィのモルペコ＆オーロンゲex",
        "series": "스칼렛&바이올렛",
        "expansionMark": "SVOM",
        "releaseDateKr": "2025-04-25",
        "releaseDateJp": "2025-02-21",
        "packPriceKr": 12000,
        "boxPriceKr": 0,
        "cardsPerPack": 60,
        "packsPerBox": 1,
        "krProductUrl": "https://pokemoncard.co.kr/card/760",
        "jpSetUrl": "https://www.pokemon-card.com/products/sv/svo.html",
        "idPrefix": "BS2025004",
        "idMin": 1,
        "idMax": 30,
        "imgMark": "SVOM",
        "jpPg": "SVOM",
        "notesExtra": [
            "이 제품은 카드 60장 구축 덱이다. 목록은 상세 페이지가 열린 서로 다른 카드만 모았다.",
        ],
    },
    "svn": {
        "slug": "battle-partners-deck-build-box",
        "nameKo": "배틀 강화 BOX 「배틀파트너즈」",
        "nameJa": "デッキビルドBOX バトルパートナーズ",
        "productNameKo": "스칼렛&바이올렛 배틀 강화 BOX 「배틀파트너즈」",
        "productNameJa": "ポケモンカードゲーム スカーレット&バイオレット デッキビルドBOX バトルパートナーズ",
        "series": "스칼렛&바이올렛",
        "expansionMark": "SVN",
        "releaseDateKr": "2025-03-28",
        "releaseDateJp": "2025-01-24",
        "packPriceKr": 0,
        "boxPriceKr": 34000,
        "cardsPerPack": 0,
        "packsPerBox": 1,
        "krProductUrl": "https://pokemoncard.co.kr/card/740",
        "jpSetUrl": "https://www.pokemon-card.com/products/sv/svn.html",
        "idPrefix": "BS2025002",
        "idMin": 1,
        "idMax": 60,
        "imgMark": "SVN",
        "jpPg": "SVN",
        "notesExtra": [
            "엔진 코드 SVN 카드가 이 공식 제품 상세에 있다.",
            "목록은 상세 페이지가 열린 서로 다른 카드만 모았다.",
        ],
    },
    "svm": {
        "slug": "generations-random-start-deck",
        "nameKo": "랜덤 스타트 덱 Generations",
        "nameJa": "スタートデッキ Generations",
        "productNameKo": "스칼렛&바이올렛 랜덤 스타트 덱 Generations",
        "productNameJa": "ポケ몬カードゲーム スカーレット&バイオレット スタートデッキ Generations",
        "series": "스칼렛&바이올렛",
        "expansionMark": "SVM",
        "releaseDateKr": "2024-12-20",
        "releaseDateJp": "2024-11-22",
        "packPriceKr": 9000,
        "boxPriceKr": 0,
        "cardsPerPack": 60,
        "packsPerBox": 1,
        "krProductUrl": "https://pokemoncard.co.kr/card/692",
        "jpSetUrl": "https://www.pokemon-card.com/ex/svm/",
        "idPrefix": "BS2024018",
        "idMin": 1,
        "idMax": 200,
        "imgMark": "SVM",
        "jpPg": "SVM",
        "notesExtra": [
            "이 제품은 60장 덱이 랜덤으로 1종 들어 있다. 목록은 상세 페이지가 열린 서로 다른 카드만 모았다.",
        ],
    },
    "svls": {
        "slug": "stellar-ceruledge",
        "nameKo": "파라블레이즈 ex",
        "nameJa": "ソウブレイズex",
        "productNameKo": "스칼렛&바이올렛 스타터 세트 테라스탈타입:스텔라 「파라블레이즈 ex」",
        "productNameJa": "ポケモンカードゲーム スカーレット&バイオレット スターターセット テラスタイプ：ステラ ソウブレイズex",
        "series": "스칼렛&바이올렛",
        "expansionMark": "SVLS",
        "releaseDateKr": "2024-10-02",
        "releaseDateJp": "2024-08-30",
        "packPriceKr": 12000,
        "boxPriceKr": 0,
        "cardsPerPack": 60,
        "packsPerBox": 1,
        "krProductUrl": "https://pokemoncard.co.kr/card/664",
        "jpSetUrl": "https://www.pokemon-card.com/products/sv/svl.html",
        "idPrefix": "BS2024015",
        "idMin": 1,
        "idMax": 40,
        "imgMark": "SVLS",
        "jpPg": "SVLS",
        "notesExtra": [
            "이 제품은 카드 60장 구축 덱이다. 목록은 상세 페이지가 열린 서로 다른 카드만 모았다.",
        ],
    },
    "svln": {
        "slug": "stellar-sylveon",
        "nameKo": "님피아 ex",
        "nameJa": "ニンフィアex",
        "productNameKo": "스칼렛&바이올렛 스타터 세트 테라스탈타입:스텔라 「님피아 ex」",
        "productNameJa": "ポケ몬カードゲーム スカーレット&バイオレット スターターセット テラスタイプ：ステラ ニンフィアex",
        "series": "스칼렛&바이올렛",
        "expansionMark": "SVLN",
        "releaseDateKr": "2024-10-02",
        "releaseDateJp": "2024-08-30",
        "packPriceKr": 12000,
        "boxPriceKr": 0,
        "cardsPerPack": 60,
        "packsPerBox": 1,
        "krProductUrl": "https://pokemoncard.co.kr/card/665",
        "jpSetUrl": "https://www.pokemon-card.com/products/sv/svl.html",
        "idPrefix": "BS2024014",
        "idMin": 1,
        "idMax": 40,
        "imgMark": "SVLN",
        "jpPg": "SVLN",
        "notesExtra": [
            "이 제품은 카드 60장 구축 덱이다. 목록은 상세 페이지가 열린 서로 다른 카드만 모았다.",
        ],
    },
    "svhm": {
        "slug": "future-miraidon-starter-build",
        "nameKo": "미래의 미라이돈 ex",
        "nameJa": "未来のミライドンex",
        "productNameKo": "스칼렛&바이올렛 스타터 덱&강화 세트 「미래의 미라이돈 ex」",
        "productNameJa": "ポケモンカードゲーム スカーレット&バイオレット スターターデッキ＆ビルドセット「未来のミライドンex」",
        "series": "스칼렛&바이올렛",
        "expansionMark": "SVHM",
        "releaseDateKr": "2024-02-24",
        "releaseDateJp": "2024-01-26",
        "packPriceKr": 0,
        "boxPriceKr": 30000,
        "cardsPerPack": 0,
        "packsPerBox": 1,
        "krProductUrl": "https://pokemoncard.co.kr/card/612",
        "jpSetUrl": "https://www.pokemon-card.com/products/sv/svh.html",
        "idPrefix": "BS2024003",
        "idMin": 1,
        "idMax": 70,
        "imgMark": "SVHM",
        "jpPg": "SVHM",
        "notesExtra": [
            "목록은 상세 페이지가 열린 서로 다른 카드만 모았다.",
        ],
    },
    "svi": {
        "slug": "battle-academy",
        "nameKo": "배틀 아카데미",
        "nameJa": "バトルアカデミー",
        "productNameKo": "스칼렛&바이올렛 「배틀 아카데미」",
        "productNameJa": "ポケモンカードゲーム スカーレット&バイオレット バトルアカデミー",
        "series": "스칼렛&바이올렛",
        "expansionMark": "SVI",
        "releaseDateKr": "2024-04-20",
        "releaseDateJp": "",
        "packPriceKr": 0,
        "boxPriceKr": 45000,
        "cardsPerPack": 0,
        "packsPerBox": 1,
        "krProductUrl": "https://pokemoncard.co.kr/card/628",
        "jpSetUrl": "https://www.pokemon-card.com/ex/svi/",
        "idPrefix": "BS2024006",
        "idMin": 1,
        "idMax": 90,
        "imgMark": "SVI",
        "jpPg": "SVI",
        "notesExtra": [
            "같은 콜렉터 번호에 덱별 일러스트가 있으면 공식 상세가 열린 번호당 한 장만 넣었다.",
            "목록은 상세 페이지가 열린 서로 다른 카드만 모았다.",
        ],
    },
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
        except Exception as exc:  # noqa: BLE001
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
        "기본 포켓몬/찬란한 포켓몬": ("pokemon", "basic"),
        "기본 포켓몬 ex": ("pokemon", "basic"),
        "1진화 포켓몬": ("pokemon", "stage1"),
        "1진화 포켓몬 ex": ("pokemon", "stage1"),
        "2진화 포켓몬": ("pokemon", "stage2"),
        "2진화 포켓몬 ex": ("pokemon", "stage2"),
        "포켓몬 V": ("pokemon", "basic"),
        "포켓몬 VSTAR": ("pokemon", "basic"),
        "포켓몬 VMAX": ("pokemon", "basic"),
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


def number_sort_key(number: str) -> tuple:
    if number.isdigit():
        return (0, int(number), "")
    if number in ENERGY_ORDER:
        return (1, ENERGY_ORDER.index(number), number)
    return (2, 0, number)


def parse_kr(card_id: str, html: str, img_mark: str) -> list[dict]:
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
    img_match = re.search(rf"{re.escape(img_mark)}_([A-Za-z0-9]+)", img_src)
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
                "pageHasImage": number == img_num or not img_num or not number.isdigit(),
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


def fetch_kr(cfg: dict) -> tuple[list[dict], list[dict]]:
    product = cfg["productNameKo"]
    prefix = cfg["idPrefix"]
    img_mark = cfg["imgMark"]

    def one(n: int) -> tuple[int, int, list[dict]]:
        card_id = f"{prefix}{n:03d}"
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
            return n, status, parse_kr(card_id, html, img_mark)
        except ValueError as exc:
            print("skip parse", exc)
            return n, status, []

    found: dict[str, dict] = {}
    missed: list[dict] = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = [pool.submit(one, n) for n in range(cfg["idMin"], cfg["idMax"] + 1)]
        for fut in as_completed(futs):
            n, status, rows = fut.result()
            if not rows:
                missed.append({"id": f"{prefix}{n:03d}", "status": status})
                continue
            for row in rows:
                if row["productNameKo"] != product:
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
                elif prev is not None and row["krCardId"] < prev["krCardId"] and row["pageHasImage"] == prev["pageHasImage"]:
                    found[row["number"]] = row
    rows = sorted(found.values(), key=lambda row: number_sort_key(row["number"]))
    return rows, missed


def fetch_jp_cards(jp_pg: str) -> list[dict]:
    ids = []
    seen = set()
    page = 1
    while page <= 40:
        query = urllib.parse.urlencode(
            {
                "keyword": "",
                "se_ta": "",
                "regulation_sidebar_form": "all",
                "regulation": "all",
                "pg": jp_pg,
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
        max_page = int(data.get("maxPage") or page)
        if page >= max_page:
            break
        page += 1

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


# Confirmed on Japanese detail pages. Used only to choose among Japanese
# cards that already share illustrator and stage.
ITEM_NAME_JA = {
    "이상한사탕": ["ふしぎなアメ"],
    "포켓몬 교체": ["ポケモンいれかえ"],
    "포켓패드": ["ポケパッド"],
    "하이퍼볼": ["ハイパーボール"],
    "몬스터볼": ["モンスターボール"],
    "슈퍼볼": ["スーパーボール"],
    "상처약": ["きずぐすり", "キズなおし"],
    "긴급 보드": ["緊急ボード"],
    "미스트 에너지": ["ミストエネルギー"],
    "재밍타워": ["ジャミングタワー"],
    "마스터볼": ["マスターボール"],
    "대단한낚싯대": ["すごいつりざお"],
    "테라스탈오브": ["テラスタルオーブ"],
    "포켓기어3.0": ["ポケギア3.0"],
    "네모": ["ネモ"],
    "네스트볼": ["ネストボール"],
    "둥지볼": ["ネストボール"],
    "곤충채집세트": ["むしとりセット"],
    "대지의 그릇": ["大地の器"],
    "밤의 들것": ["夜のタンカ"],
    "절친 포핀": ["なかよしポフィン"],
    "수퍼 에너지 회수": ["スーパーエネルギー回収"],
    "카운터 캐처": ["カウンターキャッチャー"],
    "프라임 캐처": ["プライムキャッチャー"],
    "기술머신 데볼루션": ["ワザマシン デヴォリューション"],
    "기술머신 에볼루션": ["ワザマシン エヴォリューション"],
    "카운터 게인": ["カウンターゲイン"],
    "타이트밴드": ["ガチガチバンド"],
    "박사의 연구": ["博士の研究"],
    "페퍼": ["ペパー"],
    "마을백화점": ["タウンデパート"],
    "포켓몬 캐처": ["ポケモンキャッチャー"],
    "크래시 해머": ["クラッシュハンマー"],
    "기력의머리띠": ["力のヘアバンド"],
    "반바지 꼬마": ["たんぱんこぞう"],
    "저지맨": ["ジャッジマン"],
    "피크닉걸": ["ピクニックガール"],
    "에너지 회수": ["エネルギー回収"],
    "에너지 전송": ["エネルギー転送"],
    "에너지 갈아 달기": ["エネルギーつけかえ"],
    "용기의부적": ["勇気のおまもり"],
    "드라세나": ["ドラセナ"],
    "유빈의 확신": ["マツバの確信"],
    "이수재의 전송": ["マサキの転送"],
    "종길": ["センリ"],
    "칠리": ["チリ"],
    "쿡": ["コック"],
    "일렉트릭 제너레이터": ["エレキジェネレーター"],
    "로스트스위퍼": ["ロストスイーパー"],
    "트레킹슈즈": ["トレッキングシューズ"],
    "카지": ["スグリ"],
    "태권왕의 수련": ["からておうの稽古"],
    "기력의머리띠": ["元気のハチマキ"],
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
            wanted = ITEM_NAME_JA.get(kr["nameKo"]) or []
            named = [jp for jp in options if jp["jpName"] in wanted]
            if len(named) == 1:
                options = named
            elif len(named) > 1:
                same = [jp for jp in named if jp["jpNumber"] == kr["number"]]
                pool = same or named
                # Multiple Japanese reprints of the same name/number: take one.
                uniq = {(jp["jpName"], jp["jpNumber"]) for jp in pool}
                if len(uniq) == 1:
                    options = [pool[0]]
                else:
                    options = pool
            else:
                same_number = [jp for jp in options if jp["jpNumber"] == kr["number"]]
                if same_number:
                    options = same_number
                elif not kr["hp"] and not kr["typeKo"]:
                    kr["jp"] = None
                    kr["jpAmbiguous"] = [f"{jp['jpNumber']}:{jp['jpName']}" for jp in options]
                    continue
        if len(options) != 1:
            same_number = [jp for jp in options if jp["jpNumber"] == kr["number"]]
            if len(same_number) == 1:
                options = same_number
            else:
                pool = same_number or options
                uniq = {(jp["jpName"], jp["jpNumber"]) for jp in pool}
                if len(uniq) == 1:
                    options = [pool[0]]
                else:
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


def download_images(cards: list[dict], img_dir: Path) -> None:
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
        save_webp(raw, img_dir / f"{number}.webp", 640, crop)
        save_webp(raw, img_dir / f"{number}-thumb.webp", 280, crop)
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
    return {
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


def build_set(set_id: str) -> None:
    if set_id not in CONFIGS:
        raise SystemExit(f"unknown set id: {set_id}. known: {', '.join(CONFIGS)}")
    cfg = CONFIGS[set_id]
    out_json = ROOT / "src" / "data" / "sets" / f"{set_id}.json"
    img_dir = ROOT / "public" / "images" / "cards" / set_id

    for key in ("productNameKo", "nameKo", "productNameJa", "nameJa"):
        if "\u00b7" in (cfg.get(key) or ""):
            raise SystemExit(f"middle dot in config {key}")

    print("fetch korean cards", set_id)
    kr_rows, missed = fetch_kr(cfg)
    print("korean", len(kr_rows), "unparsed ids", len(missed))
    other = [row for row in missed if row.get("reason")]
    for row in sorted(other, key=lambda item: item["id"]):
        print(" other product", row)

    print("fetch japanese cards", cfg["jpPg"])
    jp_rows = fetch_jp_cards(cfg["jpPg"])
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
        if card["stage"] == "basic-energy" and not card["type"]
    ]
    if energy_missing:
        raise SystemExit(f"basic energy missing type: {energy_missing}")
    # Basic energy pages often omit the regulation symbol. Leave those empty.
    missing_reg = [
        f"{card['number']} {card['nameKo']}"
        for card in cards
        if not card["regulation"] and card["stage"] != "basic-energy"
    ]
    if missing_reg:
        raise SystemExit(f"missing regulation mark: {missing_reg}")
    bad_symbol = [
        f"{row['number']} {row['setSymbol']}"
        for row in kr_rows
        if row["setSymbol"] and row["setSymbol"] != cfg["imgMark"]
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
    print("categories", dict(Counter(card["categoryKo"] for card in cards)))
    regs = Counter(row["regulation"] or "(none)" for row in kr_rows)
    print("regulation", dict(regs))
    no_jp = [f"{row['number']} {row['nameKo']}" for row in kr_rows if not row.get("jp")]
    print("no jp match", len(no_jp))
    for line in no_jp[:30]:
        print(" ", line)
    ambiguous = [
        f"{row['number']} {row['nameKo']} {row.get('jpAmbiguous')}"
        for row in kr_rows
        if row.get("jpAmbiguous")
    ]
    if ambiguous:
        print("ambiguous", len(ambiguous))
        for line in ambiguous[:20]:
            print(" ", line)

    if os.environ.get("SKIP_IMAGES") == "1":
        print("skip images")
    else:
        print("download images")
        download_images(kr_rows, img_dir)

    numeric_printed = [int(card["printedIn"]) for card in cards if card["printedIn"].isdigit()]
    if not numeric_printed:
        raise SystemExit("no numeric printedIn values")
    printed_total = Counter(numeric_printed).most_common(1)[0][0]
    regulation_marks = sorted({row["regulation"] for row in kr_rows if row["regulation"]})
    notes = [
        "카드 이름, 번호, 레어도, 종류, 타입, 레귤레이션 마크는 한국 공식 카드 상세에 적힌 것만 넣었다.",
        "레어도 칸이 비어 있는 카드는 레어도를 비워 두었다.",
        "상세 페이지가 열리지 않는 카드는 넣지 않았다.",
        *cfg.get("notesExtra", []),
    ]
    payload = {
        "id": set_id,
        "slug": cfg["slug"],
        "nameKo": cfg["nameKo"],
        "nameJa": cfg["nameJa"],
        "productNameKo": cfg["productNameKo"],
        "productNameJa": cfg["productNameJa"],
        "series": cfg["series"],
        "regulation": ", ".join(regulation_marks),
        "expansionMark": cfg["expansionMark"],
        "releaseDateKr": cfg["releaseDateKr"],
        "releaseDateJp": cfg["releaseDateJp"],
        "packPriceKr": cfg["packPriceKr"],
        "boxPriceKr": cfg["boxPriceKr"],
        "cardsPerPack": cfg["cardsPerPack"],
        "packsPerBox": cfg["packsPerBox"],
        "printedTotal": printed_total,
        "cardCount": len(cards),
        "krProductUrl": cfg["krProductUrl"],
        "jpSetUrl": cfg["jpSetUrl"],
        "notes": notes,
        "cards": cards,
    }
    blob = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if "\u00b7" in blob:
        raise SystemExit("middle dot in dataset")
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(blob, encoding="utf-8")
    Path(f"/tmp/{set_id}-report.json").write_text(
        json.dumps(
            {
                "cardCount": len(cards),
                "rarity": dict(counts),
                "printedIn": dict(printed),
                "matched": matched,
                "japanese": len(jp_rows),
                "noJp": no_jp,
                "ambiguous": ambiguous,
                "regulation": dict(regs),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print("wrote", out_json)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(
            "usage: python3 scripts/prepare_engine_set.py <"
            + "|".join(CONFIGS)
            + ">"
        )
    build_set(sys.argv[1].strip().lower())


if __name__ == "__main__":
    main()
