# 원격 MCP (A-1: 중앙 ai.prosell.kr) 확정 설계안

작성 2026-06-30. 근거: 백엔드 OAuth/테넌트 코드 확인 + MCP 원격 커넥터/OAuth 사양 확인.

## 0. 한 줄 요약

이용자는 **커넥터 URL `https://ai.prosell.kr/mcp` 한 줄**만 등록하고, OAuth 로그인 화면에서
**쇼핑몰 아이디 + 운영자 로그인**만 하면 끝(Node 설치·JSON 편집 없음, 웹/데스크탑 공통).
중앙 서버는 **per-request로 쇼핑몰을 해석해 `{shop}.prosell.kr/api/v2`로 프록시**한다.
**백엔드 PHP/DB는 사실상 무변경**(기존 per-shop OAuth를 페더레이션으로 재사용).

## 1. 결정적 제약 (코드로 확인)

- 테넌트(쇼핑몰)는 **요청 HOST → per-shop DB**로 결정. 토큰에 shop 식별자 없음.
  - `Core/Database.php:70-82` (`/home/shop/database.php` include), `Core/Configure.php:75-108` (HTTP_HOST)
  - `auth_client/auth_code/auth_access_token/auth_refresh_token` 모두 **그 쇼핑몰 DB 안**, `shop_id` 컬럼 없음 (`db/basic/table.sql`)
  - `BaseAPI.php:194-257` `isToken()`는 현재 호스트 DB에서만 토큰 조회·검증(`mid`만 보유)
- 따라서 **중앙은 토큰만으로 shop을 못 정함** → shop을 별도로 알아야 하고, 검증은 그 쇼핑몰에 위임해야 함.
- 이미 `Oauth/Authorize.php:62`가 redirect에 `&shop_id=` 부착 → "클라이언트가 shop을 들고 다니는" 모델이 설계 전제.

## 2. 사양 확인 (MCP 원격 커넥터 / OAuth)

- 트랜스포트: **Streamable HTTP** 단일 엔드포인트 `/mcp`(POST + SSE). 로컬 stdio는 데스크탑 전용.
- OAuth: **2.1 + PKCE(S256)**. 발견 = 첫요청 401 → `WWW-Authenticate` → `/.well-known/oauth-protected-resource`
  → 인가서버 메타데이터(`/.well-known/oauth-authorization-server`) → authorize. 콜백 고정 `https://claude.ai/api/mcp/auth_callback`.
- **authorize 페이지는 우리가 띄우는 일반 웹페이지** → 거기서 **쇼핑몰 아이디 입력 + 로그인 + 동의** 수집 가능. (← A-1 핵심)
- 커넥터 URL **쿼리파라미터(`?shop=`)는 비권장**(resource 정규 URI 일치 요구). 테넌트는 OAuth 흐름에서 처리.
- **웹·데스크탑 모두 원격 커넥터 지원.** 단 원격 연결은 **Anthropic 클라우드에서 출발** → ai.prosell.kr는 **공개 인터넷 접근 가능**해야 함(사내망 불가).
- DCR(RFC 7591)이 요구될 수 있음 → 중앙 AS가 `/register` 제공.

## 3. 최종 아키텍처

```
┌─ 이용자(클로드 웹/데스크탑) ── 커넥터 URL: https://ai.prosell.kr/mcp ─┐
│                                                                      │
│  (1) /mcp 첫 호출 → 401 + WWW-Authenticate                           │
│  (2) /.well-known/oauth-protected-resource → AS = auth.prosell.kr    │
│  (3) /authorize 웹페이지: [쇼핑몰 아이디] + [운영자 로그인] + [동의]   │
│         └─ 내부적으로 {shop}.prosell.kr/api/v2/oauth/authorize 위임   │
│  (4) code → /token → {shop} /api/v2/oauth/token 위임으로 실토큰 획득   │
│         └─ 클로드에는 "shop이 인코딩된" 토큰 발급                      │
│  (5) 이후 /mcp 호출: Authorization: Bearer <token-with-shop>          │
└──────────────────────────────────────────────────────────────────────┘
                              │  토큰에서 shop 해석
                              ▼
            중앙 MCP 게이트웨이(Node, index.js 재사용)
              per-request apiBase = https://{shop}.prosell.kr/api/v2
              실토큰을 Authorization 헤더로 그대로 전달
                              │
                              ▼
            {shop}.prosell.kr  ──  isToken()이 자기 DB로 검증 (무변경)
```

**구성요소**
- **중앙 MCP 게이트웨이** (신규, Node): 기존 `apps/mcp` 도구 로직(index.js/api.js)을 **stdio 대신 Streamable HTTP**로 노출.
  핵심 변경 = `apiBase()`/bearer를 **전역 env가 아니라 요청별(shop, token) 컨텍스트**에서 해석.
- **중앙 인가서버(AS) façade** (신규, 같은 Node 서비스에 통합 가능): authorize/token/register + .well-known.
  실제 자격증명 검증은 **각 쇼핑몰 OAuth로 위임**(페더레이션). 쇼핑몰 백엔드는 그대로.

## 4. OAuth 페더레이션 흐름 (상세)

1. 클로드 → `GET ai.prosell.kr/mcp` (무토큰) → `401` + `WWW-Authenticate: resource_metadata=...`.
2. 클로드 → `GET ai.prosell.kr/.well-known/oauth-protected-resource` → `{ authorization_servers:["https://auth.prosell.kr"] }`.
3. 클로드 → `GET auth.prosell.kr/.well-known/oauth-authorization-server` → authorize/token/register 엔드포인트.
4. (DCR) 클로드 → `POST auth.prosell.kr/register` → client_id 발급(또는 사전등록).
5. 클로드 → 브라우저로 `auth.prosell.kr/authorize?...&code_challenge=...&resource=https://ai.prosell.kr/mcp`.
6. **우리 authorize 페이지**: 쇼핑몰 아이디(입력값 `shop_in`) 입력 + 운영자 로그인 + 동의.
   - 내부적으로 해당 `{shop_in}.prosell.kr/api/v2/oauth/authorize`로 위임해 **그 쇼핑몰의 auth code** 획득
     (운영자 자격은 그 쇼핑몰 DB에서 검증 — 기존 로직 그대로).
   - 위임 redirect는 `&shop_id=`(= 그 쇼핑몰 DB **`setup` 테이블의 shop_id**, `Configure->setup['shop_id']`, Authorize.php:62)를 권위있게 돌려줌.
   - **★정합성 검증**: 돌아온 `setup.shop_id` 가 이용자가 입력한 `shop_in` 과 **일치하는지 확인**. 불일치 시 즉시 거부(교차테넌트 차단).
7. authorize → `https://claude.ai/api/mcp/auth_callback?code=<중앙code>&iss=https://auth.prosell.kr`.
8. 클로드 → `POST auth.prosell.kr/token` (PKCE verifier).
   - 중앙이 `{shop_in}.prosell.kr/api/v2/oauth/token`으로 위임 교환 → **쇼핑몰 access/refresh 토큰** 획득.
   - 토큰 교환 응답/검증으로 shop_id를 한 번 더 확인(setup 기준)한 뒤, 클로드에는 **그 검증된 shop이 인코딩된 토큰** 발급(§5).
9. 클로드 → `POST ai.prosell.kr/mcp` `Authorization: Bearer <token>` → 게이트웨이가 shop 해석 후 프록시.

## 5. 토큰 → 테넌트 처리 (두 가지 선택지)

> 여기서 쓰는 `shop`은 추측값이 아니라 **§4-6에서 setup.shop_id로 검증·확정된 값**이다(입력 shop_in == setup.shop_id).

**옵션 T1 — 합성(stateless) 토큰 [권장·v1]**
- 클로드에 주는 토큰 = `"{shop}~{shop의 실제 access_token}"` 형태(불투명 문자열, 클라이언트는 내부구조 모름).
- 게이트웨이: `~` 앞부분=shop, 뒷부분=실토큰 → `{shop}.prosell.kr`에 실토큰 전달. **중앙 저장소 불필요.**
- refresh도 합성 refresh 토큰으로 동일 처리(중앙 /token이 위임 갱신).
- 보안: shop 아이디는 서브도메인으로 이미 공개정보라 노출 위험 낮음. 토큰은 HTTPS/Bearer로만 이동.

**옵션 T2 — 중앙 매핑 저장소**
- 중앙이 자체 토큰 발급 + `{중앙토큰 → (shop, 쇼핑몰토큰)}` 매핑을 중앙 DB/KV에 저장.
- 장점: 토큰 폐기·관측 용이. 단점: 중앙 상태 저장소 운영 필요.

→ **v1은 T1**(무상태, 백엔드/중앙DB 불필요), 규모/감사 요구 생기면 T2로 승급.

## 6. 작업 목록

### 신규 (중앙 Node 서비스 = ai.prosell.kr)
- [ ] Streamable HTTP MCP 엔드포인트 `/mcp` (POST+SSE, 세션, Bearer 필수)
- [ ] 도구 컨텍스트 리팩터: `config.js`의 전역 `apiBase()/tokens()` → **요청별 컨텍스트 주입**
      (index.js/api.js 도구 로직 자체는 재사용)
- [ ] `/.well-known/oauth-protected-resource` (resource → AS 광고)
- [ ] 중앙 AS: `/.well-known/oauth-authorization-server`, `/authorize`(쇼핑몰 입력 UI), `/token`, `/register`(DCR)
- [ ] 페더레이션 클라이언트: 각 `{shop}.prosell.kr/api/v2/oauth/{authorize,token}` 위임 호출
- [ ] 합성 토큰 인코딩/디코딩(T1) + refresh 위임
- [ ] 배포: 공개 HTTPS, 헬스체크, 레이트리밋

### 백엔드(PHP) — 최소
- [ ] (등록만) 각 쇼핑몰 DB에 **중앙 façade용 auth_client 1행**(redirect_uri=중앙 콜백). 기존 `connect` 메커니즘으로 자동 시드 가능. → 코드 변경 아님.
- [ ] (검토) authorize 위임 시 중앙 콜백 redirect_uri 완전일치 통과 확인.
- [ ] 코드 변경은 원칙적으로 **불필요**(isToken/토큰검증/DB선택 모두 현행 유지).

### 클라이언트/문서
- [ ] 이용자 안내: "커넥터에 `https://ai.prosell.kr/mcp` 추가 → 로그인 화면에서 쇼핑몰 아이디 입력".
- [ ] 기존 stdio `npx prosell` 방식은 로컬 파일 업로드 등 고급용으로 병행 유지(데스크탑 전용).

## 7. 스타터 통합 입장

- 스타터는 **이미 per-shop 직결**(자기 `PROSELL_API_BASE` + per-shop OAuth)이라 **테넌트 문제 없음** → A-1 때문에 바꿀 필요 없음.
- 통일을 원하면, 위 **중앙 AS façade를 스타터 OAuth에도 재사용** 가능(스타터 redirect_uri를 중앙 AS로). 그러나 v1 범위 밖 — **스타터는 현행 유지** 권장.

## 8. 단계별 로드맵

1. **PoC ✅ 완료(2026-06-30)**: Streamable HTTP `/mcp` + Bearer/shop 컨텍스트 동작 확인(인증 위임 없이 토큰 직접 주입).
   - 구현: `src/gateway.js`(신규), `src/config.js`(AsyncLocalStorage `runWithContext`/`getContext`),
     `src/index.js`(`export function buildServer()` 팩토리 + `PROSELL_MCP_HTTP=1` stdio 가드).
   - 실행: `npm run start:http` (PORT 기본 8787). 인증 헤더 = `Authorization: Bearer {shop}~{token}` 또는 `Bearer {token}`+`X-Prosell-Shop`.
   - 검증: `/healthz` 200, 무인증 `/mcp` 401, `initialize` → serverInfo 정상, stdio 모드 회귀 정상(누수 없음).
   - 함정 기록: ESM 은 import 를 먼저 평가 → gateway 는 index.js 를 **동적 import** 해야 stdio 가드가 적용됨.
2. **AS façade ✅ 완료(2026-06-30)**: OAuth 페더레이션 구현(`src/oauth.js`).
   - 엔드포인트: `/.well-known/oauth-protected-resource`·`/.well-known/oauth-authorization-server`(+`openid-configuration`),
     `/authorize`(쇼핑몰 아이디 입력 폼→그 쇼핑몰 `/api/v2/oauth/authorize` 302 위임), `/federation/callback`(shop code 교환),
     `/token`(authorization_code+refresh_token, **PKCE S256**, 합성토큰 발급), `/register`(DCR, public client).
   - 합성 토큰 T1: access=`{shop}~{쇼핑몰access}`, refresh=`{shop}~{쇼핑몰refresh}`. gateway `/mcp` 가 prefix 로 shop 해석.
   - **shop_id 정합성 검증**: 입력 쇼핑몰 ≠ 콜백 `shop_id`(setup.shop_id) → 거부.
   - 401 `/mcp` 에 `WWW-Authenticate: Bearer resource_metadata=...` 부착(클로드 OAuth 발견).
   - 신규 설정: `PROSELL_GATEWAY_BASE`(공개 base), `PROSELL_FED_CLIENT_ID/SECRET`(또는 `PROSELL_FED_CLIENTS` 쇼핑몰별),
     `PROSELL_FED_SCOPE`(기본 user), `PROSELL_SHOP_BASES`(아이디→base 오버라이드: 커스텀도메인/스테이징/테스트).
   - 검증: 목(mock) 쇼핑몰로 전체 흐름 E2E — 합성토큰 발급/PKCE 거부/refresh 위임/shop_id 불일치 거부 4/4 통과.
   - ✅ **first-run provisioning 체이닝(2026-06-30)**: 쇼핑몰 façade 클라이언트가 없으면 `/authorize` 가 먼저
     `{shop}/adm/apps/connect`(provisioning) 로 위임 → `/provision/callback` 에서 `register/exchange` 로 client_id/secret 획득·중앙 저장
     → 같은 운영자 세션으로 곧바로 authorize. **운영자는 로그인 1회**로 등록+토큰을 모두 끝낸다. 다음 이용자부터는 provisioning 스킵.
     백엔드 검증: `app_redirect_uri` 외부 **HTTPS 허용**(Connect.php:58-73), authorize 가 admin 세션 재사용→재로그인 없음(Authorize.php:70-101).
     E2E: 1회차 provisioning→토큰 / 2회차 스킵 9/9 통과. ⚠️ provisioning 은 HTTPS 콜백 필수(운영 ai.prosell.kr 는 HTTPS).
   - ⚠️ 남은 운영 작업: 인메모리 자격증명/상태 → **영속 저장소**(다중 인스턴스/재시작 대비; 첫 연결 1회면 충분).
3. **DCR + 웹**: claude.ai 웹/데스크탑 커넥터 실연결 E2E, .well-known 정비, 토큰 폐기.
4. **멀티테넌트 굳히기**: 여러 쇼핑몰 동시, 레이트리밋, 로깅, 토큰 폐기.
5. (선택) T2 매핑 저장소, 스타터 통합.

## 9. 오픈 이슈 / 리스크

- **auth_client 페더레이션 등록**: 중앙 façade를 각 쇼핑몰에 클라이언트로 등록해야 함(자동화 필요). 쇼핑몰 수 만큼 1행씩.
- **redirect_uri 완전일치**: 위임 단계와 클로드 콜백 두 군데 redirect_uri 체인을 정확히 맞춰야 함.
- **공개 노출**: ai.prosell.kr는 인터넷 공개 필수(사내망 불가) — WAF/레이트리밋 권장.
- **refresh 수명**: 쇼핑몰 토큰(access 3h/refresh 30d)을 중앙이 위임 갱신 — 합성 refresh 만료 정책 정렬.
- **운영자 스코프**: 위임 authorize가 운영자 권한 스코프를 정확히 전달하는지(스타터=회원, MCP=운영자) 확인.
- **shop_id 정합성**: 입력 `shop_in` 과 위임결과 `setup.shop_id` 불일치 시 거부(§4-6). 이용자 오타/혼동/교차테넌트 사고를 인증 단계에서 차단.
