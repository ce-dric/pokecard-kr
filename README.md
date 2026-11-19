# 포켓몬 카드 한국판

한국판 포켓몬 카드 게임의 세트별 카드 리스트입니다. 세트 페이지와 카드 페이지를 각각 만들어 검색 엔진이 개별 주소로 찾을 수 있게 했습니다.

예상 주소: https://ce-dric.github.io/pokecard-kr/

포켓몬 공식 사이트가 아닙니다.

## 로컬에서 보기

```bash
npm install
npm run dev
```

빌드:

```bash
npm run build
npm run preview
```

주소와 하위 경로는 환경 변수로 바꿉니다.

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `SITE_URL` | `https://ce-dric.github.io` | 사이트 원점. canonical, sitemap, Open Graph에 사용 |
| `BASE_PATH` | `/pokecard-kr` | 저장소 Pages 주소의 하위 경로. 사용자 도메인이면 `/` |

예:

```bash
SITE_URL=https://cards.example.com BASE_PATH=/ npm run build
```

GitHub Actions에서도 같은 두 값을 `.github/workflows/pages.yml`의 `env`에서 바꿉니다.

## 데이터

카드 데이터는 `src/data/sets/*.json` 입니다. 사이트는 이 폴더의 JSON을 모두 읽어 세트 페이지와 카드 페이지를 만듭니다. 새 세트를 코드 수정 없이 추가하려면 같은 형식의 JSON과 이미지를 넣으면 됩니다.

스톰에메랄다(`m6.json`) 기준:

- 한국 이름, 번호, 레어도, 종류, 타입: [포켓몬 카드 게임 공식 카드 검색](https://pokemoncard.co.kr/cards) 상세 페이지 `BS2026005001`부터 `BS2026005113`
- 제품 정보: [MEGA 확장팩 「스톰에메랄다」](https://pokemoncard.co.kr/card/938)
- 일본판 이름, 번호, 레어도 대조: [포켓몬 카드 공식 카드 검색](https://www.pokemon-card.com/card-search/index.php?pg=M6), 세트 안내 [M6](https://www.pokemon-card.com/ex/m6/)
- 065-076과 그 카드의 SR 재록(102, 103)은 한국판 번호가 일본판과 다릅니다. 페이지에 보이는 번호는 한국판입니다.
- 짝 스타디움 072, 074, 076의 개별 상세 주소는 공식 사이트가 500을 반환합니다. 이름과 번호는 좌측 카드 페이지에 함께 적힌 공식 표기를 사용했습니다.
- 확인하지 못한 한국 이름은 `nameStatus`를 `ja-fallback`으로 두고, 화면에는 일본판 이름과 "일본판 기준"을 표시합니다.

이미지를 다시 받으려면:

```bash
python3 scripts/prepare_m6.py
```

스크립트는 공식 이미지를 받아 WebP로 줄이고, 구석에 `세드릭`과 `blog.naver.com/mdsd12`를 넣습니다. 결과 이미지는 `public/images/cards/<세트id>/`에 둡니다. 빌드 때는 다시 받지 않습니다.

## 세트를 추가하는 방법

1. `src/data/sets/m6.json`을 보고 `src/data/sets/<세트id>.json`을 만듭니다.
2. `id`, `slug`, 한국어 상품명, 발매일, 가격, `cards` 배열을 채웁니다.
3. 카드마다 `number`, `nameKo`, `nameStatus`, `rarity`, `type`, `category`, `stage`, `categoryKo`, `image`, `thumb`, 공식 URL을 넣습니다.
4. `public/images/cards/<세트id>/`에 `001.webp`와 `001-thumb.webp`처럼 번호 파일을 넣습니다. 모든 이미지에 같은 워터마크를 넣습니다.
5. `npm run check`를 그 세트에 맞게 확장한 뒤 `npm run build`로 확인합니다.

홈의 "스톰에메랄다" 메뉴는 첫 세트용 고정 링크입니다. 세트가 늘면 `src/components/Header.astro`의 링크를 데이터 기준으로 바꾸는 것이 좋습니다.

## 여론 한 줄

카드 페이지와 팩 페이지의 "여론 한 줄"은 `src/data/community/opinions.json` 만 읽습니다. 이 파일은 X와 커뮤니티 글을 볼 수 있는 외부 수집기가 요약해서 커밋합니다. 사이트 빌드와 GitHub Actions는 검색 API를 호출하지 않고, 비밀 키를 페이지에 넣지 않습니다. 항목이 없으면 그 칸은 렌더하지 않으며, 없는 문장을 만들지 않습니다.

카드 키는 `{세트id}-{번호}` 입니다. 스톰에메랄다 110번은 `m6-110`, 30th CELEBRATION 124번은 `m6a-124` 입니다. 두 세트 모두 같은 칸을 쓰며, 없는 항목은 비웁니다.

```json
{
  "updatedAt": "2026-11-19T08:00:00.000Z",
  "sets": {
    "m6": {
      "summary": "한 줄 요약",
      "sentiment": "positive",
      "sampleSize": 12,
      "posts": [
        {
          "source": "x",
          "text": "80자 이하로 줄인 인용",
          "url": "https://x.com/example/status/1",
          "date": "2026-11-19"
        }
      ]
    }
  },
  "cards": {
    "m6-110": {
      "summary": "한 줄 요약",
      "sentiment": "mixed",
      "sampleSize": 4,
      "posts": []
    }
  }
}
```

`sentiment` 는 `positive`, `mixed`, `negative`, `neutral` 중 하나입니다. 화면에서는 호평, 엇갈림, 불만, 중립으로 보여 줍니다. `sampleSize` 는 요약에 쓴 표본 수이고, 화면에는 "표본 N건"으로 적습니다. `posts` 는 3개에서 5개까지 보여 주며, `source` 는 `x`, `naver_cafe`, `dc`, `other` 만 받습니다. 인용은 80자를 넘기면 잘라 냅니다. 링크는 새 창이고 `rel="nofollow noopener"` 입니다. 블로그와 뉴스는 대표 인용으로 쓰지 않습니다.

화면 확인용 목 데이터는 `src/data/community/opinions.preview.json` 입니다. 페이지는 이 파일을 읽지 않습니다.

## GitHub Pages

워크플로는 `main`에 푸시되면 빌드하고 Pages에 배포합니다. 풀 리퀘스트에서는 빌드만 합니다.

저장소 설정에서 한 번 켜야 합니다.

1. Settings, Pages
2. Build and deployment의 Source를 GitHub Actions로 선택

사용자 도메인을 쓰면 워크플로의 `SITE_URL`, `BASE_PATH`를 바꾼 뒤, Pages 설정에 그 도메인을 추가합니다.
