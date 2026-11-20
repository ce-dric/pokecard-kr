#!/usr/bin/env python3
"""Rebuild home-page product images from official product pages.

Reads src/data/sets/*.json. For each set, downloads the package image in
div.poster_wrap on krProductUrl (pokemoncard.co.kr), trims transparent
padding, resizes to 300px wide, and writes
public/images/boxes/<setId>.webp.

Watermark with prepare_m6.draw_watermark. A set with no poster is skipped
so the home page can keep the card thumbnail. The build does not download
images.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from prepare_m6 import draw_watermark  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SET_DIR = ROOT / "src" / "data" / "sets"
OUT_DIR = ROOT / "public" / "images" / "boxes"
UA = "Mozilla/5.0 (compatible; pokecard-kr-dataset/1.0; +https://blog.naver.com/mdsd12)"
WIDTH = 300
POSTER_RE = re.compile(
    r'class="[^"]*\bposter_wrap\b[^"]*"[\s\S]{0,800}?<img[^>]+src=["\']([^"\']+)["\']',
    re.I,
)


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=40) as response:
        return response.read()


def absolute_url(src: str) -> str:
    if src.startswith("//"):
        return "https:" + src
    if src.startswith("http://") or src.startswith("https://"):
        return src
    if src.startswith("/"):
        return "https://pokemoncard.co.kr" + src
    return "https://pokemoncard.co.kr/" + src


def poster_url(html: str) -> str | None:
    match = POSTER_RE.search(html)
    if not match:
        return None
    return absolute_url(match.group(1))


def save_box(raw: bytes, dest: Path) -> tuple[int, int]:
    with Image.open(BytesIO(raw)) as src:
        image = src.convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox:
        image = image.crop(bbox)
    if image.width < 20 or image.height < 20:
        raise ValueError("poster has no visible pixels")
    flat = Image.new("RGBA", image.size, (255, 255, 255, 255))
    image = Image.alpha_composite(flat, image)
    height = max(1, round(image.height * (WIDTH / image.width)))
    resized = image.resize((WIDTH, height), Image.Resampling.LANCZOS)
    marked = draw_watermark(resized, WIDTH / 640)
    dest.parent.mkdir(parents=True, exist_ok=True)
    marked.save(dest, "WEBP", quality=76, method=6)
    return marked.size


def one(set_id: str, page_url: str) -> tuple[str, str]:
    dest = OUT_DIR / f"{set_id}.webp"
    try:
        html = fetch(page_url).decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return set_id, f"fetch failed: {error}"
    image_url = poster_url(html)
    if not image_url:
        if dest.exists():
            dest.unlink()
        return set_id, "no poster"
    try:
        raw = fetch(image_url)
        size = save_box(raw, dest)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
        return set_id, f"image failed: {error}"
    return set_id, f"wrote {dest.relative_to(ROOT)} {size[0]}x{size[1]}"


def main() -> None:
    sets = []
    for path in sorted(SET_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        set_id = data.get("id") or path.stem
        page = data.get("krProductUrl") or ""
        if not page:
            print(f"{set_id} no product url")
            continue
        sets.append((set_id, page))
    failures = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(one, set_id, page) for set_id, page in sets]
        for future in as_completed(futures):
            set_id, message = future.result()
            print(f"{set_id} {message}")
            if message.startswith("fetch failed") or message.startswith("image failed"):
                failures.append(set_id)
    known = {f"{set_id}.webp" for set_id, _page in sets}
    if OUT_DIR.exists():
        for path in OUT_DIR.glob("*.webp"):
            if path.name not in known:
                path.unlink()
                print("removed", path.name)
    if failures:
        raise SystemExit(f"failed: {', '.join(sorted(failures))}")


if __name__ == "__main__":
    main()
