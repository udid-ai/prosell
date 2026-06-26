// 쇼핑몰 데이터 호출. 비회원(client_id)으로 상품을 조회한다.
import { apiBase, clientId, credentials, tokens, saveTokens, clearTokens } from "./config.js";

/** 목록용 경량 expand — 이미지/옵션 전체 fetch 회피 (api-spec/llms.txt 의 성능 규칙) */
export const LIST_EXPAND = "origin,benefit,images_thumb,product_first";
export const DETAIL_EXPAND = "origin,benefit,images,content,product";

/** 백엔드 에러 메시지 추출 — 구조 {error:{code,message}} 우선, 코드도 함께. */
function apiErr(data, status, fallback) {
  const e = data?.error;
  if (e?.message) return `${fallback}: ${e.message}${e.code ? ` (${e.code})` : ""}`;
  return data?.message || data?.errorMessage || `${fallback}: HTTP ${status}`;
}

/** 응답을 파싱하고 실패면 백엔드 메시지로 throw. 성공이면 json 반환. */
async function jsonOrThrow(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErr(data, res.status, fallback));
  return data;
}

function authHeaders() {
  const h = { Accept: "application/json" };
  const cid = clientId();
  if (cid) h["X-App-Client-Id"] = cid; // 비회원 클라이언트 인증
  return h;
}

export async function listProducts(params = {}) {
  const u = new URL(`${apiBase()}/products`);
  const merged = {
    expand: LIST_EXPAND,
    period_start: "2000-01-01",
    period_end: "2999-12-31",
    ...params,
  };
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  }
  const res = await fetch(u, { headers: authHeaders() });
  if (!res.ok) throw new Error(`상품 목록 조회 실패: HTTP ${res.status}`);
  return res.json();
}

export async function getProduct(id, expand = DETAIL_EXPAND) {
  const u = new URL(`${apiBase()}/products/${encodeURIComponent(id)}`);
  u.searchParams.set("expand", expand);
  const res = await fetch(u, { headers: authHeaders() });
  if (!res.ok) throw new Error(`상품 조회 실패: HTTP ${res.status}`);
  return res.json();
}

// ── 운영자 토큰(주문 관리) ───────────────────────────────────────────────
/** 유효한 운영자 access_token 반환. 만료 시 refresh_token 으로 자동 갱신. */
export async function accessToken() {
  const t = tokens();
  if (!t) throw new Error("운영자 로그인이 필요합니다. 먼저 `login` 도구를 실행하세요.");
  if (Date.now() < t.access_expires_at) return t.access_token;
  if (t.refresh_token && Date.now() < t.refresh_expires_at) {
    return (await refreshTokens(t.refresh_token)).access_token;
  }
  clearTokens();
  throw new Error("로그인 세션이 만료됐습니다. `login` 도구로 다시 로그인하세요.");
}

/** authorization_code → 토큰 교환 (POST /oauth/token, login 플로우용).
 *  백엔드는 authorize 의 state 를 토큰 교환에서도 검증하므로 함께 전달한다. */
export async function exchangeAuthCode(code, redirect_uri, state) {
  const creds = credentials();
  if (!creds) throw new Error("자격증명이 없습니다. 먼저 `connect` 로 연결하세요.");
  const params = {
    grant_type: "authorization_code",
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    code,
    redirect_uri,
  };
  if (state) params.state = state;
  const res = await fetch(`${apiBase()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(apiErr(data, res.status, "토큰 발급 실패"));
  return data; // { access_token, refresh_token, expires_in, refresh_token_expires_in, ... }
}

/** refresh_token 으로 토큰 갱신 (POST /oauth/token grant_type=refresh_token) */
export async function refreshTokens(refresh_token) {
  const creds = credentials();
  if (!creds) throw new Error("자격증명이 없습니다. 먼저 `connect` 로 연결하세요.");
  const res = await fetch(`${apiBase()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(apiErr(data, res.status, "토큰 갱신 실패"));
  saveTokens(data);
  return data;
}

/** Bearer 인증 헤더(운영자). 호출 시 토큰 유효성 보장(필요 시 갱신). */
async function bearerHeaders(extra = {}) {
  return { Accept: "application/json", Authorization: `Bearer ${await accessToken()}`, ...extra };
}

/** 주문 목록 조회 — GET /order/search (운영자) */
export async function listOrders(params = {}) {
  const u = new URL(`${apiBase()}/order/search`);
  const merged = { expand: "order,payment", ...params };
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  }
  const res = await fetch(u, { headers: await bearerHeaders() });
  return jsonOrThrow(res, "주문 목록 조회 실패");
}

/** 주문 상세 조회 — GET /order/{ono} (운영자) */
export async function getOrder(ono, expand = "order,payment,product,delivery,tracking") {
  const u = new URL(`${apiBase()}/order/${encodeURIComponent(ono)}`);
  if (expand) u.searchParams.set("expand", expand);
  const res = await fetch(u, { headers: await bearerHeaders() });
  return jsonOrThrow(res, "주문 조회 실패");
}

/** 발송 처리 — POST /order/delivering. 상품주문번호(prno)들을 배송중으로(운송장 필수). */
export async function shipOrders(items) {
  const res = await fetch(`${apiBase()}/order/delivering`, {
    method: "POST",
    headers: await bearerHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ items }),
  });
  return jsonOrThrow(res, "발송 처리 실패"); // { timestamp, success_prno_ids, fail_prno_error? }
}

/** 무통장 입금확인 → 결제완료 (POST /order/banking/confirm). 주문(ono) 단위, 최대 50.
 *  신규 라우터로, BankUpdate 가 주문 전체(상품상태·결제내역·재고·완료메시지)를 일괄 결제완료한다.
 *  무통장(pay_method=300)·입금대기(pay_state 1,2) 건에만 적용된다. */
export async function confirmBankPayment(onoIds) {
  const ono_ids = Array.isArray(onoIds) ? onoIds.join(",") : String(onoIds);
  const res = await fetch(`${apiBase()}/order/banking/confirm`, {
    method: "POST",
    headers: await bearerHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ono_ids }),
  });
  return jsonOrThrow(res, "결제완료 처리 실패"); // { success_ono_ids, fail_ono_error }
}

/** 운송장 수정 — PUT /order/delivering. 이미 발송된 건의 송장 정보 변경. */
export async function updateTracking(items) {
  const res = await fetch(`${apiBase()}/order/delivering`, {
    method: "PUT",
    headers: await bearerHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ items }),
  });
  return jsonOrThrow(res, "운송장 수정 실패");
}

/** provision_code → 클라이언트 자격증명 교환 (서버↔서버, 일회성) */
export async function exchangeProvisionCode(code) {
  const res = await fetch(`${apiBase()}/oauth/register/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ provision_code: code }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.client_id) {
    throw new Error(data?.error?.message || `자격증명 교환 실패: HTTP ${res.status}`);
  }
  return data; // { client_id, client_secret, redirect_uri, client_name }
}
