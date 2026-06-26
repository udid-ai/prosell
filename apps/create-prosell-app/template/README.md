# Prosell Storefront (starter)

Prosell 쇼핑몰 API 기반 Next.js 스토어프론트 스타터. `ai/` 참조 구현을 클라우드플레어
의존 없이 포터블하게 옮긴 것으로, AI(MCP)가 이걸 토대로 페이지를 확장한다.

## 들어있는 것

- `lib/prosell.ts` — API 래퍼. 경량 expand(`LIST_EXPAND`/`product_first`/`images_thumb`),
  가격(`priceOf`)·썸네일(`thumbOf`)·대표옵션(`optionOf`) 추출, 이미지 URL 정규화,
  비회원(client_id)/회원(Bearer) 인증 분기.
- `app/page.tsx` — 상품 목록 (경량 expand)
- `app/products/[id]/page.tsx` — 상품 상세 (로그인 시 회원가 반영)
- `app/auth/{login,callback,logout}` — OAuth 로그인 (HttpOnly 쿠키, 서버사이드 토큰 교환)

## 시작

```bash
npm install
npm run setup     # ~/.prosell-mcp/config.json(연결 자격증명) → .env.local 자동 생성
npm run dev       # http://localhost:3000
```

`setup` 없이 수동 설정하려면 `.env.example` 을 `.env.local` 로 복사해 채운다.

## 환경변수

| 변수 | 설명 |
|---|---|
| `PROSELL_API_BASE` | 쇼핑몰 API base (예: https://{쇼핑몰아이디}.prosell.kr) |
| `PROSELL_CLIENT_ID` | 비회원 상품 조회용 |
| `PROSELL_CLIENT_SECRET` | 회원 OAuth 토큰 교환용 (서버 전용) |
| `PROSELL_REDIRECT_URI` | 이 앱의 OAuth 콜백. **auth_client 등록값과 정확히 일치해야 함** |
| `PROSELL_AUTH_BASE` | (선택) 브라우저가 닿는 base 가 API base 와 다를 때 |
| `PROSELL_IMAGE_BASE` | (선택) 로컬 도커 이미지 호스트 치환 |

## 비회원 vs 회원

- **비회원(상품 조회 등)**: `client_id` 만으로 즉시 동작.
- **회원(로그인/장바구니/주문)**: OAuth 필요. `PROSELL_REDIRECT_URI` 가 쇼핑몰의
  `auth_client.redirect_uri` 와 일치해야 authorize 가 통과한다(완전일치 검사).

> MCP `connect` 가 이 앱의 콜백(`app_redirect_uri`, 기본 `http://localhost:3000/auth/callback`)을
> auth_client 에 등록하고, `npm run setup` 이 그 값을 `PROSELL_REDIRECT_URI` 로 채운다.
> 따라서 별도 조정 없이 회원 로그인이 동작한다. (콜백 호스트를 바꾸면 connect 시
> `app_redirect_uri` 를 그 값으로 지정하면 된다.)
