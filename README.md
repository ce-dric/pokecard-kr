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

## 커뮤니티 반응

카드 페이지와 팩 페이지의 "최근 커뮤니티 반응"은 네이버 검색 결과의 제목, 짧은 요약, 링크만 보여 줍니다. 본문은 저장하지 않습니다.

수집은 [NAVER API HUB](https://api.ncloud-docs.com/docs/naver-api-hub-overview) 검색 API를 사용합니다. 주소는 `https://naverapihub.apigw.ntruss.com` 이고, 카드마다 블로그(`/search/v1/blog`)와 카페글(`/search/v1/cafearticle`)을 봅니다. 팩은 여기에 뉴스(`/search/v1/news`)를 더하고, 그 뉴스 중 카드 이름이 들어간 기사는 해당 카드 페이지에도 보여 줍니다. 웹문서 검색은 쇼핑몰과 공식 페이지가 많이 섞여 커뮤니티 반응에서는 쓰지 않습니다.

검색어에는 카드 이름, `포켓몬카드`, 팩 이름(예: 스톰에메랄다)을 넣고, 포켓몬고, 유나이트, 애니메이션은 제외합니다. 같은 이름의 상위 레어도(SR, SAR, MUR 등)는 검색어와 결과 필터로 기본 카드와 나눕니다. 메가레쿠쟈캡처럼 이름이 겹치는 카드는 결과에서 다시 걸러 냅니다.

호출은 한 번 실행에 최대 480회입니다. 팩 검색을 먼저 하고, 남는 횟수로는 아직 안 모았거나 가장 오래된 카드부터 갱신합니다. 지금 세트 하나(113장)는 한 번에 모두 갱신됩니다. 세트가 늘어 한도를 넘으면 카드 일부는 다음 실행으로 넘기고, 실패한 카드는 이전 결과를 유지합니다. 키가 없거나 API가 실패해도 빌드는 기존 `src/data/community/reactions.json` 으로 계속됩니다.

GitHub Actions 시크릿 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` 이 필요합니다. 로컬에서 다시 모으려면 같은 값을 환경 변수로 두고 `npm run reactions` 를 실행합니다.

예약 워크플로 `.github/workflows/community.yml` 은 6시간마다 수집한 뒤 사이트를 빌드하고 Pages에 배포합니다. 저장소 커밋은 수집 시각이 바뀐 뒤 최소 24시간이 지났을 때만 하므로, 배포는 자주 되어도 커밋은 하루 한 번 이하입니다. 직전 성공본은 Actions 캐시에 두어, 다음 실행이 실패해도 방금 모은 데이터를 잃지 않습니다. `main` 푸시 빌드도 키가 있으면 같은 수집을 시도하고, 실패해도 배포는 계속됩니다. 풀 리퀘스트에서는 API를 호출하지 않습니다.

화면 확인용 목 데이터는 `src/data/community/preview.json` 입니다. 기본 빌드는 이 파일을 읽지 않습니다.

## GitHub Pages

워크플로는 `main`에 푸시되면 빌드하고 Pages에 배포합니다. 풀 리퀘스트에서는 빌드만 합니다.

저장소 설정에서 한 번 켜야 합니다.

1. Settings, Pages
2. Build and deployment의 Source를 GitHub Actions로 선택

사용자 도메인을 쓰면 워크플로의 `SITE_URL`, `BASE_PATH`를 바꾼 뒤, Pages 설정에 그 도메인을 추가합니다.
