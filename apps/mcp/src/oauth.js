// 중앙 OAuth 인가서버(AS) façade — 2단계: 쇼핑몰 OAuth 페더레이션.
//
// 클로드(원격 MCP 클라이언트)는 ai.prosell.kr 한 곳에 OAuth 한다. 중앙 AS 는
// 실제 자격증명 검증을 각 {shop}.prosell.kr 의 기존 OAuth 로 "위임(federate)"하고,
// 클로드에는 shop 이 인코딩된 합성 토큰( {shop}~{쇼핑몰토큰} )을 발급한다.
//
// 흐름:
//   클로드 → /authorize(쇼핑몰 아이디 입력 폼) → 그 쇼핑몰 /oauth/authorize 로 302
//   운영자가 쇼핑몰에서 로그인·동의 → 쇼핑몰이 /federation/callback 으로 code + shop_id 반환
//   중앙: 입력 shop ↔ 반환 shop_id 일치검증 → 쇼핑몰 /oauth/token 교환 → 중앙 code 발급
//   클로드 → /token (PKCE) → 합성 토큰 발급. 이후 /mcp 호출은 gateway 가 프록시.
//
// 백엔드 PHP 무변경. 단, 각 쇼핑몰에 "중앙 façade" 를 auth_client 로 등록해야 한다
// (client_id/secret + redirect_uri = {GATEWAY_BASE}/federation/callback).
//   설정: PROSELL_FED_CLIENT_ID / PROSELL_FED_CLIENT_SECRET (모든 쇼핑몰 공통일 때)
//        또는 PROSELL_FED_CLIENTS = {"pro260519":{"id":"...","secret":"..."}} (쇼핑몰별)
//   공개 base: PROSELL_GATEWAY_BASE (예: https://ai.prosell.kr). 미설정 시 요청 host 로 추론.
//
// ⚠️ PoC: 코드/대기 상태를 인메모리에 둔다(재시작 시 소실, 단일 인스턴스). 운영은 공유 저장소로.

import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// ── 설정 ────────────────────────────────────────────────────────────────
function gatewayBase(req) {
  const env = process.env.PROSELL_GATEWAY_BASE;
  if (env) return env.replace(/\/$/, "");
  const proto = req.headers["x-forwarded-proto"] || "http";
  return `${proto}://${req.headers.host}`;
}
// 입력 쇼핑몰(아이디/호스트/URL) → 정규 shop_id. {id}.prosell.kr 패턴 가정.
// (setup.shop_id 대조 + 합성토큰 prefix 에 사용)
function shopIdOf(shop) {
  let s = String(shop || "").trim().replace(/\/$/, "");
  if (!s) return null;
  let host = s;
  if (/^https?:\/\//i.test(s)) { try { host = new URL(s).host; } catch { return null; } }
  return host.split(":")[0].split(".")[0] || null;
}
// 쇼핑몰 아이디 → base 오버라이드 (커스텀 도메인/스테이징/테스트).
// 예: PROSELL_SHOP_BASES = {"pro260519":"https://shop.example.com"}
function shopBaseOverride(idOrHost) {
  try {
    const map = JSON.parse(process.env.PROSELL_SHOP_BASES || "{}");
    return map[idOrHost] || null;
  } catch { return null; }
}
function shopToBase(shop) {
  const s = String(shop || "").trim().replace(/\/$/, "");
  if (!s) return null;
  const ov = shopBaseOverride(s) || shopBaseOverride(shopIdOf(s));
  if (ov) return ov.replace(/\/$/, "");
  if (/^https?:\/\//i.test(s)) return s;
  if (s.includes(".")) return `https://${s}`;
  return `https://${s}.prosell.kr`;
}
// 쇼핑몰별 페더레이션 클라이언트 자격증명.
//   우선순위: 런타임 스토어(first-run provisioning 으로 자동 획득) → env 맵 → env 단일.
//   영속화: 파일에 저장해 게이트웨이 재시작(블루-그린 재배포)에도 유지한다. 이게 없으면
//   재배포 때마다 fed 클라이언트가 소실 → refresh_token 갱신 실패 → 기존 연결이 EXPIRE 로 깨진다.
//   경로: PROSELL_FED_STORE(절대경로) 또는 기본 ~/.prosell-gw/fed-clients.json (호스트 고정).
const FED_STORE_PATH = process.env.PROSELL_FED_STORE || join(homedir(), ".prosell-gw", "fed-clients.json");
const fedClientStore = new Map(); // shopId → { client_id, client_secret }
(function loadFedStore() {
  try {
    const obj = JSON.parse(readFileSync(FED_STORE_PATH, "utf8"));
    for (const [k, v] of Object.entries(obj || {})) if (v?.client_id) fedClientStore.set(k, v);
  } catch { /* 첫 실행/파일 없음 — 무시 */ }
})();
function saveFedStore() {
  try {
    mkdirSync(dirname(FED_STORE_PATH), { recursive: true });
    writeFileSync(FED_STORE_PATH, JSON.stringify(Object.fromEntries(fedClientStore), null, 2), { mode: 0o600 });
  } catch (e) { if (process.env.PROSELL_GW_LOG) console.error("[gw] fedStore 저장 실패:", e.message); }
}
// fedClientStore.set 대신 이걸 써서 저장까지 함께 한다.
function setFedClient(key, val) { fedClientStore.set(key, val); saveFedStore(); }
// 쇼핑몰에서 앱(클라이언트)이 삭제돼 캐시가 무효해졌을 때 비운다(재등록 유도). loginBase·canonical 별칭 모두 정리.
function clearFedClient(key) {
  let changed = fedClientStore.delete(key);
  const cid = shopIdOf(key);
  if (cid && fedClientStore.delete(cid)) changed = true;
  if (changed) saveFedStore();
  return changed;
}
function fedClient(shopId) {
  if (fedClientStore.has(shopId)) return fedClientStore.get(shopId);
  const map = (() => { try { return JSON.parse(process.env.PROSELL_FED_CLIENTS || "{}"); } catch { return {}; } })();
  const per = map[shopId];
  const client_id = per?.id || process.env.PROSELL_FED_CLIENT_ID || null;
  const client_secret = per?.secret || process.env.PROSELL_FED_CLIENT_SECRET || null;
  return client_id ? { client_id, client_secret } : null;
}
const FED_SCOPE = process.env.PROSELL_FED_SCOPE || "user"; // 운영자 계정 로그인 시 admin 토큰

// ── 인메모리 상태 ──────────────────────────────────────────────────────────
const pendingAuth = new Map();      // fedState → { claude params, shop, ts }
const pendingProvision = new Map(); // provState → { cp(claude params), shopId, shopBase, ts }
const authCodes = new Map();        // centralCode → { shop tokens, pkce, claudeRedirect, ts }
const clients = new Map();          // client_id → { redirect_uris }
const PENDING_TTL = 10 * 60 * 1000;
const CODE_TTL = 5 * 60 * 1000;
function sweep(map, ttl) { const now = Date.now(); for (const [k, v] of map) if (now - v.ts > ttl) map.delete(k); }

function s256(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

// ── 응답 헬퍼 ──────────────────────────────────────────────────────────────
function json(res, status, obj, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(obj));
}
function html(res, status, body) {
  // 완성된 문서(폼)는 그대로, 짧은 안내(<p>…</p>)는 친근한 카드로 감싼다.
  const full = /^\s*<!doctype/i.test(body) ? body : errorShell(body);
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(full);
}
// 에러/안내용 간단한 스타일 셸 (폼과 같은 톤, 다크모드 지원).
function errorShell(inner) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Prosell 연결</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#0f1115;--sub:#5b6470;--line:#e4e7ec;--ring:#6366f1;--shadow:0 1px 2px rgba(16,24,40,.04),0 8px 24px rgba(16,24,40,.08)}
@media(prefers-color-scheme:dark){:root{--bg:#0b0d10;--card:#14171c;--text:#f3f5f7;--sub:#9aa3af;--line:#262b32;--ring:#818cf8;--shadow:0 1px 2px rgba(0,0,0,.4),0 12px 32px rgba(0,0,0,.45)}}
*{box-sizing:border-box}html,body{margin:0}
body{min-height:100dvh;display:grid;place-items:center;padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;background:var(--bg);color:var(--text)}
.card{width:100%;max-width:440px;background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);padding:28px}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:14px;font-weight:650}
.logo{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--ring);color:#fff;font-weight:800}
.card p{margin:.4rem 0;line-height:1.6}.card .sub{color:var(--sub);font-size:.85rem}
a.btn{display:inline-block;margin-top:14px;padding:11px 16px;border-radius:11px;background:var(--text);color:var(--bg);text-decoration:none;font-weight:650;font-size:.95rem}
</style></head><body><main class="card" role="main">
<div class="brand"><span class="logo">P</span>Prosell</div>
${inner}
</main></body></html>`;
}
function redirect(res, location) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}
async function readForm(req) { return new URLSearchParams(await readBody(req)); }
async function readJson(req) { try { return JSON.parse(await readBody(req) || "{}"); } catch { return {}; }
}

// ── 메타데이터 ─────────────────────────────────────────────────────────────
export function protectedResourceMetadataUrl(req) {
  return `${gatewayBase(req)}/.well-known/oauth-protected-resource`;
}
function protectedResourceMetadata(req) {
  const base = gatewayBase(req);
  return { resource: `${base}/mcp`, authorization_servers: [base] };
}
function authServerMetadata(req) {
  const base = gatewayBase(req);
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["user"],
  };
}

// ── /authorize ────────────────────────────────────────────────────────────
function authorizeForm(req, p) {
  // 쇼핑몰 아이디 입력 폼. 클로드가 준 OAuth 파라미터는 hidden 으로 보존.
  const hidden = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource", "response_type"]
    .map((k) => `<input type="hidden" name="${k}" value="${esc(p.get(k))}">`).join("\n");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Prosell 연결 — 쇼핑몰 선택</title>
<style>
:root{
  --bg:#f6f7f9; --card:#fff; --text:#0f1115; --sub:#5b6470; --line:#e4e7ec;
  --accent:#111827; --accent-fg:#fff; --ring:#6366f1; --field:#fff; --shadow:0 1px 2px rgba(16,24,40,.04),0 8px 24px rgba(16,24,40,.08);
}
@media (prefers-color-scheme:dark){
  :root{--bg:#0b0d10; --card:#14171c; --text:#f3f5f7; --sub:#9aa3af; --line:#262b32;
  --accent:#f3f5f7; --accent-fg:#0b0d10; --ring:#818cf8; --field:#0f1216; --shadow:0 1px 2px rgba(0,0,0,.4),0 12px 32px rgba(0,0,0,.45);}
}
*{box-sizing:border-box}
html,body{margin:0}
body{min-height:100dvh;display:grid;place-items:center;padding:24px;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;
  background:radial-gradient(1200px 600px at 50% -10%,color-mix(in srgb,var(--ring) 12%,var(--bg)),var(--bg));
  color:var(--text);-webkit-font-smoothing:antialiased}
.card{width:100%;max-width:440px;background:var(--card);border:1px solid var(--line);border-radius:18px;
  box-shadow:var(--shadow);padding:30px 28px}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:20px;font-weight:650;letter-spacing:-.01em}
.logo{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:var(--ring);color:#fff;font-weight:800}
h1{font-size:1.3rem;line-height:1.25;margin:0 0 6px;letter-spacing:-.02em}
.lead{margin:0 0 20px;color:var(--sub);font-size:.92rem;line-height:1.55}
.steps{display:flex;gap:8px;margin:0 0 22px;padding:0;list-style:none}
.steps li{flex:1;font-size:.72rem;color:var(--sub);text-align:center;padding-top:9px;border-top:2px solid var(--line);position:relative}
.steps li.active{color:var(--text);border-top-color:var(--ring);font-weight:600}
label{display:block;font-weight:600;font-size:.88rem;margin:0 0 7px}
.field{position:relative}
input[type=text]{width:100%;padding:13px 14px;font-size:1rem;color:var(--text);background:var(--field);
  border:1px solid var(--line);border-radius:11px;outline:none;transition:border-color .15s,box-shadow .15s}
input[type=text]::placeholder{color:color-mix(in srgb,var(--sub) 70%,transparent)}
input[type=text]:focus{border-color:var(--ring);box-shadow:0 0 0 4px color-mix(in srgb,var(--ring) 22%,transparent)}
.hint{margin:9px 2px 0;color:var(--sub);font-size:.8rem;line-height:1.5}
button{margin-top:20px;width:100%;padding:13px 16px;font-size:.98rem;font-weight:650;cursor:pointer;
  color:var(--accent-fg);background:var(--accent);border:0;border-radius:11px;transition:transform .04s,opacity .15s;
  display:inline-flex;align-items:center;justify-content:center;gap:8px}
button:hover{opacity:.92}
button:active{transform:translateY(1px)}
.foot{margin:18px 2px 0;display:flex;align-items:center;gap:7px;color:var(--sub);font-size:.76rem;line-height:1.4}
.foot svg{flex:none;opacity:.8}
</style></head><body>
<main class="card" role="main">
  <div class="brand"><span class="logo">P</span>Prosell</div>
  <h1>내 쇼핑몰 연결하기</h1>
  <p class="lead">AI가 내 쇼핑몰을 도와드릴 수 있게 연결할게요. 쇼핑몰 주소를 넣고, 평소 쓰던 관리자 계정으로 로그인하면 끝이에요.</p>
  <ol class="steps">
    <li class="active">주소 입력</li>
    <li>로그인</li>
    <li>연결 완료</li>
  </ol>
  <form method="POST" action="/authorize" autocomplete="off">
    ${hidden}
    <label for="shop">쇼핑몰 주소</label>
    <div class="field">
      <input type="text" id="shop" name="shop" placeholder="https://내쇼핑몰주소/"
             autofocus required autocapitalize="off" autocorrect="off" spellcheck="false"
             inputmode="url" aria-describedby="shop-hint">
    </div>
    <p class="hint" id="shop-hint">내 쇼핑몰 주소를 입력하세요 (예: https://demo.prosell.kr/). 다음 화면에서 평소 쓰던 관리자 계정으로 로그인하면 돼요.</p>
    <button type="submit">다음 — 로그인하기
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
    </button>
  </form>
  <p class="foot">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    로그인은 내 쇼핑몰에서 직접 이뤄지고, 비밀번호는 저장되지 않아요. 연결은 언제든 해제할 수 있어요.
  </p>
</main>
</body></html>`;
}

// 클로드가 보낸 OAuth 파라미터를 정규화해 보관(provisioning 을 거쳐도 동일하게 이어가기 위함).
function claudeParamsOf(p) {
  return {
    clientId: p.get("client_id") || "",
    redirect: p.get("redirect_uri") || "",
    state: p.get("state") || "",
    codeChallenge: p.get("code_challenge") || "",
    codeChallengeMethod: p.get("code_challenge_method") || "plain",
    scope: p.get("scope") || FED_SCOPE,
    resource: p.get("resource") || "",
  };
}

function startFederation(req, res, p) {
  const shopInput = p.get("shop");
  // loginBase = 운영자가 로그인/승인할 도메인. 아이디면 {id}.prosell.kr, 도메인(scheme 포함)이면 그대로.
  const loginBase = shopToBase(shopInput);
  if (!loginBase) return html(res, 400, "<p>쇼핑몰 주소가 올바르지 않습니다. (예: https://demo.prosell.kr/)</p>");
  const cp = claudeParamsOf(p);
  if (!cp.redirect) return html(res, 400, "<p>연결 정보가 올바르지 않아요.</p><p class=\"sub\">처음 화면에서 다시 연결해 주세요.</p>");

  // 페더레이션 클라이언트는 loginBase(도메인) 기준으로 캐시/조회한다(아직 canonical shop_id 모름).
  const fed = fedClient(loginBase);
  // first-run: façade 클라이언트가 아직 없으면 provisioning(자동 등록) 먼저.
  if (!fed) return beginProvision(req, res, cp, loginBase);
  return beginAuthorizeDelegation(req, res, cp, loginBase, fed);
}

// 쇼핑몰 기존 OAuth(authorize)로 위임 — 토큰 발급용. canonical shop_id 는 콜백의 setup.shop_id 로 확정한다.
function beginAuthorizeDelegation(req, res, cp, loginBase, fed) {
  sweep(pendingAuth, PENDING_TTL);
  const fedState = randomUUID();
  pendingAuth.set(fedState, {
    ts: Date.now(),
    loginBase,
    fed, // 콜백에서 토큰 교환 + canonical id 로 alias 저장에 사용
    claudeClientId: cp.clientId,
    claudeRedirect: cp.redirect,
    claudeState: cp.state,
    codeChallenge: cp.codeChallenge,
    codeChallengeMethod: cp.codeChallengeMethod,
    resource: cp.resource,
  });
  const authorize = new URL(`${loginBase}/api/v2/oauth/authorize`);
  authorize.searchParams.set("client_id", fed.client_id);
  authorize.searchParams.set("redirect_uri", `${gatewayBase(req)}/federation/callback`);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", cp.scope);
  authorize.searchParams.set("state", fedState);
  return redirect(res, authorize.toString());
}

// first-run: 쇼핑몰 앱 자동 등록(provisioning) 동의로 위임. façade 콜백을 auth_client 에 등록.
function beginProvision(req, res, cp, loginBase) {
  sweep(pendingProvision, PENDING_TTL);
  const provState = randomUUID();
  pendingProvision.set(provState, { ts: Date.now(), cp, loginBase });
  const base = gatewayBase(req);
  const consent = new URL(`${loginBase}/adm/apps/connect`);
  consent.searchParams.set("app_name", "Prosell MCP (ai.prosell.kr)");
  consent.searchParams.set("redirect_uri", `${base}/provision/callback`);   // provision_code 수신(중앙)
  consent.searchParams.set("app_redirect_uri", `${base}/federation/callback`); // auth_client 에 등록될 콜백
  consent.searchParams.set("state", provState);
  return redirect(res, consent.toString());
}

// provisioning 완료 콜백: provision_code → 자격증명 교환·중앙 저장 → 곧바로 authorize 로 이어감.
async function provisionCallback(req, res, url) {
  const q = url.searchParams;
  const provState = q.get("state");
  const pend = provState ? pendingProvision.get(provState) : null;
  if (!pend) return html(res, 400, "<p>시간이 지나 연결이 끊겼어요.</p><p class=\"sub\">처음 화면에서 다시 연결해 주세요.</p>");
  pendingProvision.delete(provState);
  const error = q.get("error");
  if (error) return html(res, 400, `<p>연결 승인이 취소되었거나 문제가 생겼어요.</p><p class="sub">다시 시도해 주세요. (사유: ${esc(error)})</p>`);
  const code = q.get("code");
  if (!code) return html(res, 400, "<p>연결 정보를 받지 못했어요.</p><p class=\"sub\">처음 화면에서 다시 시도해 주세요.</p>");

  let fed;
  try {
    const r = await fetch(`${pend.loginBase}/api/v2/oauth/register/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ provision_code: code }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.client_id) throw new Error(data?.error?.message || `자격증명 교환 실패(${r.status})`);
    fed = { client_id: data.client_id, client_secret: data.client_secret };
    setFedClient(pend.loginBase, fed); // loginBase(도메인) 기준 캐시(+영속화)
  } catch (e) {
    return html(res, 502, `<p>쇼핑몰과 연결을 마치지 못했어요.</p><p class="sub">잠시 후 다시 시도해 주세요. (${esc(e.message)})</p>`);
  }

  // 등록 완료 → 같은 운영자 세션으로 authorize 위임(재로그인 없음).
  return beginAuthorizeDelegation(req, res, pend.cp, pend.loginBase, fed);
}

// ── /federation/callback ───────────────────────────────────────────────────
async function federationCallback(req, res, url) {
  const q = url.searchParams;
  const error = q.get("error");
  const fedState = q.get("state");
  const pend = fedState ? pendingAuth.get(fedState) : null;
  if (!pend) return html(res, 400, "<p>시간이 지나 연결이 끊겼어요.</p><p class=\"sub\">처음 화면에서 다시 연결해 주세요.</p>");
  pendingAuth.delete(fedState);
  if (error) {
    // 자가 치유: 캐시된 페더레이션 클라이언트가 쇼핑몰에서 삭제된 경우(관리자가 앱을 지움 등)
    //   authorize 가 "등록되지 않은 클라이언트(NONEXISTENT/invalid_client)" 로 실패한다.
    //   → 캐시를 비우고 곧바로 재등록(provisioning)으로 이어가 새 앱을 등록한다(같은 관리자 세션).
    const desc = q.get("error_description") || "";
    const staleClient = /NONEXISTENT|invalid_client|unauthorized_client/i.test(error) || /등록되지\s*않은\s*클라이언트/.test(desc);
    if (staleClient && pend.loginBase) {
      clearFedClient(pend.loginBase);
      const cp = {
        clientId: pend.claudeClientId, redirect: pend.claudeRedirect, state: pend.claudeState,
        codeChallenge: pend.codeChallenge, codeChallengeMethod: pend.codeChallengeMethod,
        scope: FED_SCOPE, resource: pend.resource,
      };
      if (cp.redirect) return beginProvision(req, res, cp, pend.loginBase);
    }
    return html(res, 400, `<p>로그인이 취소되었거나 문제가 생겼어요.</p><p class="sub">다시 시도해 주세요. (사유: ${esc(error)})</p>`);
  }

  const code = q.get("code");
  if (!code) return html(res, 400, "<p>연결 정보를 받지 못했어요.</p><p class=\"sub\">처음 화면에서 다시 시도해 주세요.</p>");

  // ★ canonical shop_id: 백엔드가 redirect 에 붙여주는 setup.shop_id 를 권위값으로 채택한다.
  //   (입력은 도메인일 수 있으므로, 라우팅은 항상 이 shop_id 의 기본 도메인 {id}.prosell.kr 로 한다.)
  //   fallback: shop_id 가 없으면 loginBase 가 {id}.prosell.kr 형태일 때 그 라벨을 쓴다.
  const canonicalShop = q.get("shop_id") || shopIdOf(pend.loginBase);
  if (!canonicalShop) {
    return html(res, 400, "<p>쇼핑몰을 확인할 수 없습니다. 기본 쇼핑몰 주소(예: https://demo.prosell.kr/)로 다시 시도하세요.</p>");
  }

  // 쇼핑몰 /oauth/token 으로 위임 교환 (로그인한 도메인 = loginBase 에서)
  const fed = pend.fed || fedClient(pend.loginBase);
  const redirectUri = `${gatewayBase(req)}/federation/callback`;
  let tok;
  try {
    const r = await fetch(`${pend.loginBase}/api/v2/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: fed.client_id,
        client_secret: fed.client_secret || "",
        code,
        redirect_uri: redirectUri,
        state: fedState,
      }),
    });
    tok = await r.json().catch(() => ({}));
    if (!r.ok || !tok.access_token) throw new Error(tok?.message || `토큰 교환 실패(${r.status})`);
  } catch (e) {
    return html(res, 502, `<p>쇼핑몰 로그인 확인에 실패했어요.</p><p class="sub">잠시 후 다시 시도해 주세요. (${esc(e.message)})</p>`);
  }

  // refresh(grant=refresh_token)는 합성 토큰의 canonical id 만 갖고 들어온다.
  // 그때 fed 자격증명을 찾을 수 있도록 canonical id 로도 alias 해 둔다.
  setFedClient(canonicalShop, fed);

  sweep(authCodes, CODE_TTL);
  const centralCode = randomBytes(24).toString("base64url");
  authCodes.set(centralCode, {
    ts: Date.now(),
    shop: canonicalShop,
    access: tok.access_token,
    refresh: tok.refresh_token || "",
    expiresIn: Number(tok.expires_in) || 10800,
    refreshExpiresIn: Number(tok.refresh_token_expires_in) || 0,
    scope: tok.scope || "",
    codeChallenge: pend.codeChallenge,
    codeChallengeMethod: pend.codeChallengeMethod,
    claudeRedirect: pend.claudeRedirect,
  });

  const back = new URL(pend.claudeRedirect);
  back.searchParams.set("code", centralCode);
  if (pend.claudeState) back.searchParams.set("state", pend.claudeState);
  back.searchParams.set("iss", gatewayBase(req));
  return redirect(res, back.toString());
}

// ── /token ──────────────────────────────────────────────────────────────────
async function tokenEndpoint(req, res) {
  const form = await readForm(req);
  const grant = form.get("grant_type");

  if (grant === "authorization_code") {
    const code = form.get("code");
    const rec = code ? authCodes.get(code) : null;
    if (!rec || Date.now() - rec.ts > CODE_TTL) {
      authCodes.delete(code);
      return json(res, 400, { error: "invalid_grant", error_description: "코드가 없거나 만료되었습니다." });
    }
    authCodes.delete(code); // 일회용
    if (form.get("redirect_uri") && form.get("redirect_uri") !== rec.claudeRedirect) {
      return json(res, 400, { error: "invalid_grant", error_description: "redirect_uri 불일치" });
    }
    // PKCE 검증
    if (rec.codeChallenge) {
      const verifier = form.get("code_verifier") || "";
      const ok = rec.codeChallengeMethod === "S256" ? s256(verifier) === rec.codeChallenge : verifier === rec.codeChallenge;
      if (!ok) return json(res, 400, { error: "invalid_grant", error_description: "PKCE 검증 실패" });
    }
    return json(res, 200, {
      access_token: `${rec.shop}~${rec.access}`,
      token_type: "Bearer",
      expires_in: rec.expiresIn,
      refresh_token: rec.refresh ? `${rec.shop}~${rec.refresh}` : undefined,
      scope: rec.scope || undefined,
    });
  }

  if (grant === "refresh_token") {
    const composite = form.get("refresh_token") || "";
    const i = composite.indexOf("~");
    if (i <= 0) return json(res, 400, { error: "invalid_grant", error_description: "refresh_token 형식 오류" });
    const shop = composite.slice(0, i);
    const shopRefresh = composite.slice(i + 1);
    const shopBase = shopToBase(shop);
    const fed = fedClient(shop);
    if (!fed) return json(res, 400, { error: "invalid_request", error_description: "페더레이션 클라이언트 없음" });
    try {
      const r = await fetch(`${shopBase}/api/v2/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: fed.client_id,
          client_secret: fed.client_secret || "",
          refresh_token: shopRefresh,
        }),
      });
      const tok = await r.json().catch(() => ({}));
      if (!r.ok || !tok.access_token) throw new Error(tok?.message || `갱신 실패(${r.status})`);
      return json(res, 200, {
        access_token: `${shop}~${tok.access_token}`,
        token_type: "Bearer",
        expires_in: Number(tok.expires_in) || 10800,
        refresh_token: `${shop}~${tok.refresh_token || shopRefresh}`,
        scope: tok.scope || undefined,
      });
    } catch (e) {
      return json(res, 502, { error: "server_error", error_description: e.message });
    }
  }

  return json(res, 400, { error: "unsupported_grant_type" });
}

// ── /register (DCR, RFC 7591) ────────────────────────────────────────────────
async function registerEndpoint(req, res) {
  const body = await readJson(req);
  const client_id = `mcp-${randomBytes(12).toString("base64url")}`;
  const redirect_uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  clients.set(client_id, { redirect_uris });
  return json(res, 201, {
    client_id,
    redirect_uris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_name: body.client_name || "MCP Client",
  });
}

// ── 라우터 ────────────────────────────────────────────────────────────────
// gateway.js 에서 /mcp 처리 전에 호출. 처리했으면 true.
export async function handleOAuth(req, res, url) {
  const path = url.pathname;
  if (path === "/.well-known/oauth-protected-resource") { json(res, 200, protectedResourceMetadata(req)); return true; }
  if (path === "/.well-known/oauth-authorization-server") { json(res, 200, authServerMetadata(req)); return true; }
  // 일부 클라이언트는 OIDC 디스커버리 경로를 먼저 시도한다.
  if (path === "/.well-known/openid-configuration") { json(res, 200, authServerMetadata(req)); return true; }

  if (path === "/authorize") {
    if (req.method === "GET") {
      const p = url.searchParams;
      if (!p.get("shop")) { html(res, 200, authorizeForm(req, p)); return true; }
      startFederation(req, res, p); return true;
    }
    if (req.method === "POST") { startFederation(req, res, await readForm(req)); return true; }
    json(res, 405, { error: "method_not_allowed" }); return true;
  }
  if (path === "/provision/callback") { await provisionCallback(req, res, url); return true; }
  if (path === "/federation/callback") { await federationCallback(req, res, url); return true; }
  if (path === "/token") {
    if (req.method !== "POST") { json(res, 405, { error: "method_not_allowed" }); return true; }
    await tokenEndpoint(req, res); return true;
  }
  if (path === "/register") {
    if (req.method !== "POST") { json(res, 405, { error: "method_not_allowed" }); return true; }
    await registerEndpoint(req, res); return true;
  }
  return false;
}
