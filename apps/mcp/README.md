# prosell

Prosell 쇼핑몰 MCP 서버. 이용자 PC에서 실행되며, AI(예: Claude)가 쇼핑몰 API 를
발견하고 호출해 **말로 주문·상품을 관리**할 수 있게 한다(공식 가이드의 "선택 ①").
쇼핑몰 화면 디자인(선택 ②)은 별도의 스타터(`create-prosell-app`)가 담당한다.

## 노출하는 것

- **resources** — API 명세(병합 OpenAPI) + AI 가이드(llms.txt). AI 가 읽어 API 형태를 파악.
  공식 guide 사이트가 서빙하는 `/openapi.json`·`/llms.txt` 를 fetch 한다.
  `PROSELL_SPEC_BASE` 로 출처 지정(로컬 dev: `http://localhost:3001`).
- **tools**
  - `status` — 쇼핑몰 URL / 연결(자격증명) / 로그인 상태
  - `connect` — 운영자 동의로 OAuth 앱 자동 등록 → 자격증명 저장 (복붙 불필요)
  - `list_products` — 상품 목록 (경량 expand 기본)
  - `get_product` — 상품 단건
  - `login` — 운영자 로그인(OAuth) → 주문 관리용 access/refresh 토큰 발급·저장
  - `list_orders` — 주문 목록 (기간·상태·페이지 필터) · 운영자
  - `get_order` — 주문 단건(상품·배송·운송장 포함) · 운영자
  - `ship_order` — 발송 처리: 상품주문번호(prno)들을 배송중으로 + 운송장 등록 (최대 50) · 운영자
  - `update_tracking` — 이미 발송된 건의 운송장 수정 (최대 50) · 운영자

  > 주문 관리 도구는 `connect`(앱 등록) → `login`(운영자 토큰) 을 먼저 끝내야 한다.
  > access_token 만료 시 refresh_token 으로 자동 갱신된다.

## 설정

이용자는 **쇼핑몰 URL 만** 주면 된다. client_id/secret 은 `connect` 가 자동 발급.

```jsonc
// AI 클라이언트 MCP 설정 예시 (npm 의 prosell 패키지를 npx 로 실행)
{
  "mcpServers": {
    "prosell": {
      "command": "npx",
      "args": ["-y", "prosell"],
      "env": { "PROSELL_SHOP": "https://{쇼핑몰아이디}.prosell.kr" }
    }
  }
}
```

> 로컬에서 소스로 직접 돌릴 때만 `"command": "node", "args": ["/path/to/mcp/src/index.js"]` 형태를 쓴다.

자격증명은 `~/.prosell-mcp/config.json` (권한 600)에 저장된다.

## connect 흐름

`connect` 호출 → 브라우저가 `{shop}/adm/apps/connect` 동의 페이지를 연다 →
운영자 어드민 로그인 + 동의 → 쇼핑몰이 loopback(`http://localhost:PORT/callback`)으로
일회성 code 전달 → MCP 가 `/api/v2/oauth/register/exchange` 로 자격증명 교환·저장.

> 쇼핑몰 측 백엔드·동의 페이지(`/adm/apps/connect`)·approve·exchange·auth_provision
> 모두 구현 완료. 운영자 어드민 로그인 세션만 있으면 끝까지 동작한다.

## 연결 테스트 (관리자 앱 승인 검증)

테스터가 초기에 "관리자 앱 승인" 흐름이 정상인지 한 번에 확인하는 harness.
실제 `connect` 와 동일한 loopback 핸드셰이크를 돌리되 각 단계에 단언을 건다.

```bash
# {쇼핑몰아이디} 만 내 것으로 바꾼다
PROSELL_SHOP=https://{쇼핑몰아이디}.prosell.kr npm run test:connect
```

브라우저가 동의 페이지를 연다 → **어드민 로그인 + [동의하고 연결]** 클릭(사람) →
나머지는 자동 검증: ① state 왕복 일치(CSRF) ② provision_code 교환·자격증명 완전성
③ 동일 code 재교환 차단(일회성) ④ 발급된 `auth_client` 가 OAuth authorize 에서
유효 + redirect_uri 완전일치. 마지막에 통과/실패 요약을 출력한다.
환경변수: `APP_NAME`, `APP_REDIRECT`, `TIMEOUT_SEC`.

## 개발

```bash
npm install
npm run check   # 구문 검사 (connect-test 포함)
npm start       # stdio 서버 (보통 AI 클라이언트가 spawn)
```
