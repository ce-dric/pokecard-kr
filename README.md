# pokecard-kr

Static Korean Pokemon TCG card list. Astro builds one URL per set and per card from `src/data/sets/*.json`. This is not an official Pokemon site.

Live origin: `https://ce-dric.github.io/pokecard-kr/`

## Commands

```bash
npm ci
npm run dev
npm test
npm run check
npm run build
npm run preview
```

`npm test` runs the `node:test` files named in `package.json`. `npm run check` validates set JSON, required image files, and a few fixed card pairings. `npm run build` does not download images.

| Env | Default | Use |
| --- | --- | --- |
| `SITE_URL` | `https://ce-dric.github.io` | canonical, sitemap, Open Graph |
| `BASE_PATH` | `/pokecard-kr` | site subpath. Use `/` on a custom domain |

The same two values are in `.github/workflows/pages.yml`. A push to `main` builds and deploys GitHub Pages. A pull request only builds. Pages source must be GitHub Actions.

## Layout

- `src/pages/` routes. Home is `src/pages/index.astro`.
- `src/data/sets/<id>.json` is one set. The site loads every file in that directory.
- `src/data/community/opinions.json` is optional opinion copy. Pages do not read `opinions.preview.json`.
- `public/images/cards/<id>/` holds `<number>.webp` and `<number>-thumb.webp`.
- `public/images/boxes/<id>.webp` is the home-row package image.
- `scripts/prepare_<id>.py` rebuilds one set from official pages.
- `scripts/prepare_boxes.py` rebuilds every package image.

Home passes `useBox` to `SetRow`. Other lists keep the card thumbnail. The visible home headline is not the SEO `<title>` or meta description. Do not sync them unless asked.

## Data rules

- Korean name, collector number, rarity, type, category, and the card image come only from that card's `pokemoncard.co.kr` detail page.
- Japanese pages may fill `jpNumber`, `jpUrl`, and cross-checks. Do not fill a Korean name, number, rarity, or type from a Japanese page.
- A blank rarity on the Korean page stays `""`.
- If the Korean name is not on that page, set `nameStatus` to `ja-fallback` and show the Japanese name. Do not invent a Korean name.
- Do not write U+00B7 (middle dot) in data, page copy, comments, or commit messages.
- Card images: save WebP and watermark the bottom-right with `draw_watermark` in the prepare scripts. The mark is `세드릭` plus a smaller `blog.naver.com/mdsd12`. Full images are about 640px wide. Thumbs are about 280px wide.
- Package images: `python3 scripts/prepare_boxes.py`. It reads `krProductUrl`, takes the `poster_wrap` image, trims transparent padding, writes `public/images/boxes/<id>.webp` at 300px wide, and uses the same watermark. No poster: do not leave a file; the home row uses the card thumbnail.

Opinion entries are keyed by set id, or `{setId}-{number}` for a card. Missing keys render nothing. Do not invent a sentence. `sentiment` is `positive`, `mixed`, `negative`, or `neutral`. `posts` has 3 to 5 items. `source` is `x`, `naver_cafe`, `dc`, or `other`. Quotes over 80 characters are cut. Links use `rel="nofollow noopener"`. Do not use a blog or a news post as the sample quote.

## Add a set

1. Add `src/data/sets/<id>.json` in the same shape as an existing set: `id`, `slug`, Korean product fields, dates, prices, `krProductUrl`, `cards`.
2. Each card needs `number`, `nameKo`, `nameStatus`, `rarity`, `type`, `category`, `stage`, `categoryKo`, `image`, `thumb`, and the official detail URL.
3. Put watermarked files in `public/images/cards/<id>/`.
4. Run `python3 scripts/prepare_boxes.py`.
5. Extend `scripts/check-data.mjs` for that set's count, official URL, and image files.
6. Run `npm run check`, `npm test`, and `npm run build`.

Do not hard-code the new set into the header. Home rows come from the JSON.
