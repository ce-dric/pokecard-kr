#!/usr/bin/env python3
"""Download official Japanese card images for unmatched engine cards.

Images are resized and watermarked with scripts/prepare_m6.py, the same
pipeline the set pages use, then stored under public/game/cards/.
The site build does not run this script.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAPPING = ROOT / "src" / "data" / "game-cards.json"
OUT = ROOT / "public" / "game" / "cards"
THUMB = 200
FULL = 480
THUMB_LIMIT = 35000
FULL_LIMIT = 80000

spec = importlib.util.spec_from_file_location("prepare_m6", Path(__file__).with_name("prepare_m6.py"))
prepare_m6 = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(prepare_m6)


def search(mark: str, keyword: str, page: int) -> dict:
    query = urllib.parse.urlencode(
        {
            "keyword": keyword,
            "se_ta": "",
            "regulation_sidebar_form": "all",
            "regulation": "all",
            "pg": mark,
            "illust": "",
            "sm_and_keyword": "true",
            "page": str(page),
        }
    )
    raw = prepare_m6.fetch("https://www.pokemon-card.com/card-search/resultAPI.php?" + query)
    return json.loads(raw.decode("utf-8"))


def norm_pair(value: str) -> tuple[int, int] | None:
    match = re.search(r"(\d+)\s*/\s*(\d+)", value or "")
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def read_detail(card_id: str) -> tuple[str, tuple[int, int] | None, str]:
    url = f"https://www.pokemon-card.com/card-search/details.php/card/{card_id}/regu/all"
    html = prepare_m6.fetch(url).decode("utf-8", "replace")
    soup = prepare_m6.BeautifulSoup(html, "html.parser")
    sub = soup.select_one("div.subtext")
    text = sub.get_text(" ", strip=True) if sub else ""
    logo = soup.select_one("img.img-regulation")
    mark = (logo.get("alt") or "").strip() if logo else ""
    image = soup.select_one("img.fit")
    src = image.get("src") if image else ""
    if src.startswith("/"):
        src = "https://www.pokemon-card.com" + src
    return mark, norm_pair(text), src


def find_image(mark: str, number: str, name: str) -> tuple[str, str] | None:
    wanted = norm_pair(number)
    if not wanted or not mark or not name:
        return None
    keyword = name.replace("【", "").replace("】", "").strip()
    seen: set[str] = set()
    page = 1
    max_page = 1
    while page <= max_page and page <= 4:
        data = search(mark, keyword, page)
        max_page = int(data.get("maxPage") or 1)
        for card in data.get("cardList") or []:
            card_id = str(card.get("cardID") or "")
            if not card_id or card_id in seen:
                continue
            seen.add(card_id)
            found_mark, found_number, src = read_detail(card_id)
            if found_number == wanted and found_mark == mark and src:
                page_url = f"https://www.pokemon-card.com/card-search/details.php/card/{card_id}/regu/all"
                return page_url, src
            time.sleep(0.05)
        page += 1
    return None


def tighten(path: Path, limit: int) -> None:
    """Keep the watermarked pixels and only lower WebP quality if a file is still large."""
    if path.stat().st_size <= limit:
        return
    from PIL import Image

    with Image.open(path) as image:
        image = image.convert("RGB")
        for quality in (70, 62, 54, 46):
            image.save(path, "WEBP", quality=quality, method=6)
            if path.stat().st_size <= limit:
                return


def write_pair(card_id: int, raw: bytes) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    full = OUT / f"{card_id}.webp"
    thumb = OUT / f"{card_id}-thumb.webp"
    prepare_m6.save_webp(raw, full, FULL, "")
    prepare_m6.save_webp(raw, thumb, THUMB, "")
    tighten(full, FULL_LIMIT)
    tighten(thumb, THUMB_LIMIT)


def main() -> None:
    payload = json.loads(MAPPING.read_text(encoding="utf-8"))
    force = "--force" in sys.argv
    saved = 0
    failed: list[str] = []
    for key, card in payload["cards"].items():
        if card.get("link"):
            card["picture"] = None
            continue
        card_id = int(card["id"])
        thumb = OUT / f"{card_id}-thumb.webp"
        full = OUT / f"{card_id}.webp"
        prior = card.get("picture") or {}
        if (
            not force
            and prior.get("page")
            and thumb.exists()
            and full.exists()
            and thumb.stat().st_size > 800
            and full.stat().st_size > 800
        ):
            saved += 1
            continue
        print(f"fetch {card_id} {card.get('setCode')} {card.get('number')} {card.get('nameJa')}", flush=True)
        found = find_image(card.get("setCode") or "", card.get("number") or "", card.get("nameJa") or "")
        if not found:
            card["picture"] = None
            failed.append(f"{card_id} {card.get('setCode')} {card.get('number')} {card.get('nameJa')}")
            continue
        page_url, image_url = found
        write_pair(card_id, prepare_m6.fetch(image_url))
        card["picture"] = {
            "thumb": f"game/cards/{card_id}-thumb.webp",
            "full": f"game/cards/{card_id}.webp",
            "page": page_url,
        }
        saved += 1
        print(f"saved {card_id} {card.get('setCode')} {card.get('number')} thumb={thumb.stat().st_size} full={full.stat().st_size}")
        time.sleep(0.05)
    MAPPING.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    text_only = sum(1 for card in payload["cards"].values() if not card.get("link") and not card.get("picture"))
    print(f"jp images {saved}; text fallback {text_only}")
    if failed:
        print("missing")
        for line in failed:
            print(" ", line)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
