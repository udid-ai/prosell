# Prosell Storefront (starter)

Prosell 쇼핑몰 API(`/api/v2/*`) 기반 **Next.js(App Router) 스토어프론트 스타터**.
비회원 상품 조회부터 회원 로그인·장바구니·주문·마이페이지까지 실제 쇼핑몰 흐름을 담고 있으며,
AI(MCP)가 이걸 토대로 페이지를 확장·재디자인한다.

## 주요 기능

- **상품** — 목록(홈/카테고리/검색, 경량 expand), 상세(옵션·추가옵션·쿠폰·타임세일·배송정보·동영상/오디오),
  등급가(show_\*)·성인(19)·등급열람(level_view)·가격공개(open_price) 가드, 목록 호버 빠른주문 모달.
- **카테고리/검색** — 패싯 필터(브랜드·색상·사이즈·아이콘·가격·품절), 정렬/개수, 통합 검색 랜딩.
- **장바구니/주문** — 서버 장바구니(그룹·쿠폰·적립금), 바로구매, oid 세션 체크아웃(PG/무통장/전액포인트),
  국내/해외 배송지, 주문완료·영수증.
- **마이페이지(`/account`)** — 내 정보·수정·비밀번호, 주문내역/취소·교환·반품, 개인결제, 관심상품·최근본상품,
  상품리뷰(작성 가능/작성한), 쿠폰·적립금, 배송지 관리(국내+해외), 회원탈퇴.
- **인증** — 비회원(client_id) / 회원 로그인(앱키 토큰) / 소셜 로그인·가입(네이버·카카오·구글·페이스북) /
  본인확인(PASS)·SMS·이메일 인증 / 다단계 회원가입.
- **CS** — 공지·FAQ·1:1문의·약관·정보 페이지.
- **페이스북 데이터 삭제 콜백**(`/api/facebook/deletion`) — signed_request 검증 후 회원탈퇴 처리.

## 시작

```bash
npm install
npm run setup     # ~/.prosell-mcp/config.json(연결 자격증명) → .env.local 자동 생성
npm run dev       # http://localhost:3000
```

`setup` 없이 수동 설정하려면 `.env.example` 을 `.env.local` 로 복사해 채운다.

```bash
npm run build      # 프로덕션 빌드
npm run start      # 프로덕션 실행
npm run typecheck  # tsc --noEmit
```

## 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `PROSELL_API_BASE` | ✅ | 쇼핑몰 API base (예: `https://{쇼핑몰아이디}.prosell.kr`) |
| `PROSELL_CLIENT_ID` | ✅ | 비회원 상품 조회·앱 식별 (`X-App-Client-Id`) |
| `PROSELL_CLIENT_SECRET` | ✅ | 앱키 — 회원 로그인/토큰 발급·소셜 처리. **서버 전용(브라우저 노출 금지)** |
| `PROSELL_AUTH_BASE` | | 브라우저가 닿는 base 가 API base 와 다를 때(로컬 도커 등) |
| `PROSELL_IMAGE_BASE` | | 로컬 도커 이미지 호스트 치환 (운영은 비워둠) |
| `NEXT_PUBLIC_SITE_NAME` | | 사이트명(메타/헤더 표기) |
| `NEXT_PUBLIC_PRODUCT_IMAGE_RATE` | | 상품 이미지 비율(쇼핑몰 `design.image_rate`: 1=정사각형, 1.25=세로형 등, 기본 1) |

## 인증 방식

- **비회원**: `PROSELL_CLIENT_ID` 만으로 상품·검색·카테고리 즉시 동작(`X-App-Client-Id`).
- **회원 로그인**: 아이디/비밀번호를 서버 라우트(`/auth/login/submit`)가 앱키로 토큰 교환 →
  `access/refresh` 토큰을 **HttpOnly 쿠키**로 저장. 비밀번호는 클라이언트에서 RSA 암호화 후 전송(ISMS).
- **소셜 로그인/가입**: `/auth/social/{provider}/start` → provider authorize → `/auth/social/{provider}` 콜백.
  기존 회원이면 로그인, **신규는 `member_wait` 임시저장 후 가입 랜딩(`/auth/join/social`)** 에서
  약관·본인확인을 거쳐 가입 완료(레거시 소셜 가입 흐름과 동일).
- 토큰은 모두 서버(HttpOnly 쿠키)에서 관리하며, 앱키/시크릿은 서버 라우트에서만 사용한다.

## 소셜 로그인 설정

각 provider 콘솔의 **Redirect URI** 에 이 앱의 콜백을 등록한다.

```
https://<이 앱 도메인>/auth/social/naver
https://<이 앱 도메인>/auth/social/kakao
https://<이 앱 도메인>/auth/social/google
https://<이 앱 도메인>/auth/social/facebook
```

**페이스북 데이터 삭제(필수)** — 앱 대시보드 → Facebook Login →
**Data Deletion Callback URL** 에 아래를 등록한다(회원탈퇴 처리, `{url, confirmation_code}` 응답).

```
https://<이 앱 도메인>/api/facebook/deletion
```

## 구조

```
app/
  (main)/                     스토어 크롬(헤더/푸터/모바일 네비)
    page.tsx                  홈(상품 목록)
    products/[id]/            상품 상세 (+ 리뷰/문의 탭, 동영상)
    category/ · search/       카테고리 · 통합검색(패싯 필터)
    cart/ · order/            장바구니 · 체크아웃(oid 세션)/완료
    account/                  마이페이지(정보·주문·클레임·리뷰·쿠폰·적립금·배송지·탈퇴 …)
    auth/                     로그인 · 다단계 회원가입 · 소셜 · 본인확인(verify)
    faq/ notice/ qna/ terms/ pages/   CS·약관·정보
    leave/facebook/[code]/    페이스북 데이터 삭제 상태 안내
  api/                        서버 라우트(장바구니/주문/리뷰/업로드/페이스북 삭제 등)
components/                   재사용 UI(ProductCard·필터·모달·폼 …)
lib/prosell.ts                API 래퍼(인증 분기·expand·가격/썸네일 추출·ISR 캐시)
```

## 캐시

- 비회원(토큰 없음) 요청은 운영에서 **ISR + 태그**로 공유 캐시(`isrOpt`), 개발은 짧은 revalidate.
- 회원 토큰 요청은 개인화라 `no-store`.
- 푸시 알림으로 목록에 수만 명이 동시 접속하는 상황을 대비해 패싯/목록을 캐시 친화적으로 구성.
