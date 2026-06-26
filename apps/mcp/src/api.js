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

// 주문 응답에 주문번호(dno)를 명시한다. dno 는 주문 레벨이 아니라 배송(delivery)/상품(product)에
// 있어 AI 가 pno·ono 를 주문번호로 오인할 수 있다. 응답에서 실제 dno 를 모아 order.dno 로 올린다.
// 한 주문(ono)에 배송그룹이 여러 개면 dno 도 여러 개 → 배열로 준다. (dno 는 ono 와 다를 수 있음)
function collectDnos(entry) {
  const dnos = new Set();
  const add = (v) => { if (v !== undefined && v !== null && v !== 0 && v !== "") dnos.add(v); };
  add(entry?.delivery?.dno);
  add(entry?.product?.dno);
  if (Array.isArray(entry?.items)) for (const it of entry.items) { add(it?.delivery?.dno); add(it?.product?.dno); }
  return [...dnos];
}

function withOrderNo(data) {
  const list = Array.isArray(data?.orders) ? data.orders : Array.isArray(data?.items) ? data.items : null;
  if (list) {
    for (const e of list) {
      if (e?.order && e.order.dno == null) {
        const dnos = collectDnos(e);
        if (dnos.length === 1) e.order.dno = dnos[0];
        else if (dnos.length > 1) e.order.dno = dnos; // 복수 배송그룹 → 주문번호 여러 개
      }
    }
  }
  return data;
}

/** 주문 목록 조회 — GET /order/search (운영자). dno 확보 위해 delivery 확장 포함, order.dno 주입. */
export async function listOrders(params = {}) {
  const u = new URL(`${apiBase()}/order/search`);
  const merged = { expand: "order,payment,delivery", ...params };
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  }
  const res = await fetch(u, { headers: await bearerHeaders() });
  return withOrderNo(await jsonOrThrow(res, "주문 목록 조회 실패"));
}

/** 주문 상세 조회 — GET /order/{ono} (운영자). 응답에 order.dno(주문번호) 주입. */
export async function getOrder(ono, expand = "order,payment,product,delivery,tracking") {
  const u = new URL(`${apiBase()}/order/${encodeURIComponent(ono)}`);
  if (expand) u.searchParams.set("expand", expand);
  const res = await fetch(u, { headers: await bearerHeaders() });
  return withOrderNo(await jsonOrThrow(res, "주문 조회 실패"));
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

// 무통장 입금확인 계열 — 주문(ono) 단위 일괄(최대 50), 본문 {ono_ids}, 응답 {success_ono_ids, fail_ono_error}.
async function postOnoIds(path, onoIds, fallback) {
  const ono_ids = Array.isArray(onoIds) ? onoIds.join(",") : String(onoIds);
  const res = await fetch(`${apiBase()}/${path}`, {
    method: "POST",
    headers: await bearerHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ ono_ids }),
  });
  return jsonOrThrow(res, fallback);
}

/** 무통장 입금확인 → 결제완료 (신규 라우터 order/banking/confirm). BankUpdate 로 주문 전체
 *  (상품상태·결제내역·재고·완료메시지)를 일괄 결제완료. 무통장·입금대기(1,2) 건만. */
export const confirmBankPayment = (onoIds) => postOnoIds("order/banking/confirm", onoIds, "결제완료 처리 실패");

/** 무통장 입금대기로 변경 (order/banking/paywait). 무통장·결제보류/완료(2,10) 건만. */
export const setBankWaiting = (onoIds) => postOnoIds("order/banking/paywait", onoIds, "입금대기 처리 실패");

/** 무통장 입금보류로 변경 (order/banking/payhold). */
export const setBankHold = (onoIds) => postOnoIds("order/banking/payhold", onoIds, "입금보류 처리 실패");

// 상품주문(prno) 단위 상태변경 — 본문 {prno_ids}, 응답 {success_prno_ids, fail_prno_error}.
async function postPrnoIds(path, prnoIds, fallback) {
  const prno_ids = Array.isArray(prnoIds) ? prnoIds.join(",") : String(prnoIds);
  const res = await fetch(`${apiBase()}/${path}`, {
    method: "POST",
    headers: await bearerHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prno_ids }),
  });
  return jsonOrThrow(res, fallback);
}

/** 발주 확인 — 상품주문을 상품준비중으로 변경 (order/standby). */
export const setPreparing = (prnoIds) => postPrnoIds("order/standby", prnoIds, "발주확인(상품준비중) 처리 실패");

/** 발송 지연 — 상품주문을 발송지연으로 변경 (order/delay). */
export const setShippingDelay = (prnoIds) => postPrnoIds("order/delay", prnoIds, "발송지연 처리 실패");

/** 택배사 목록 조회 — GET /parcel. id(=ship_order 의 pro_parcel_id) + title(이름)만 경량 반환.
 *  기본 페이지(10)만 오지 않게 limit 를 크게 줘 전체를 가져온다. title 로 부분검색 가능. */
export async function listCouriers({ title } = {}) {
  const u = new URL(`${apiBase()}/parcel`);
  u.searchParams.set("limit", "1000");
  if (title) u.searchParams.set("title", title);
  const res = await fetch(u, { headers: await bearerHeaders() });
  const data = await jsonOrThrow(res, "택배사 조회 실패");
  const couriers = Array.isArray(data?.items)
    ? data.items.map((c) => ({ id: c.id, title: c.title, en_code: c.en_code, active: c.onoff }))
    : data;
  return { total_count: data?.total_count, couriers };
}

/** 택배사 등록 — POST /parcel (운영자). title 필수, 동일 title 있으면 OVERLAP. 응답 { id }. */
export async function createCourier(body) {
  const res = await fetch(`${apiBase()}/parcel`, {
    method: "POST",
    headers: await bearerHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res, "택배사 등록 실패");
}

/** 택배사 수정 — PUT /parcel/{id} (운영자). 바꿀 필드만 body 로. */
export async function updateCourier(id, body) {
  const res = await fetch(`${apiBase()}/parcel/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: await bearerHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res, "택배사 수정 실패");
}

/** 택배사 삭제 — DELETE /parcel/{id} (운영자). */
export async function deleteCourier(id) {
  const res = await fetch(`${apiBase()}/parcel/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: await bearerHeaders(),
  });
  return jsonOrThrow(res, "택배사 삭제 실패");
}

// ── 취소(Cancel) ─────────────────────────────────────────────────────────
/** 취소내역 목록 조회 — GET /order/cancel (운영자). */
export async function listCancels(params = {}) {
  const u = new URL(`${apiBase()}/order/cancel`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  }
  const res = await fetch(u, { headers: await bearerHeaders() });
  return jsonOrThrow(res, "취소내역 조회 실패");
}

/** 취소 접수 — POST /order/cancel (운영자). 배송 전 상품을 취소요청.
 *  body: { ono, items:[{prno, quantity}], can_ct(사유), can_content?, can_bank_*? } */
export async function createCancel(body) {
  const res = await fetch(`${apiBase()}/order/cancel`, {
    method: "POST",
    headers: await bearerHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res, "취소 접수 실패");
}

// ── 반품(Refund) / 교환(Exchange) — 공용 헬퍼 ───────────────────────────────
async function getJson(path, params, fallback) {
  const u = new URL(`${apiBase()}/${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  const res = await fetch(u, { headers: await bearerHeaders() });
  return jsonOrThrow(res, fallback);
}
async function postJson(path, body, fallback) {
  const res = await fetch(`${apiBase()}/${path}`, {
    method: "POST",
    headers: await bearerHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res, fallback);
}
async function deleteById(path, id, fallback) {
  const res = await fetch(`${apiBase()}/${path}/${encodeURIComponent(id)}`, { method: "DELETE", headers: await bearerHeaders() });
  return jsonOrThrow(res, fallback);
}

/** 반품내역 조회 — GET /order/refund (운영자). */
export const listRefunds = (params = {}) => getJson("order/refund", params, "반품내역 조회 실패");
/** 반품 접수 — POST /order/refund. body:{ono, items:[{prno,quantity}], ref_ct(사유), ref_content?} */
export const createRefund = (body) => postJson("order/refund", body, "반품 접수 실패");
/** 반품 거부 — DELETE /order/refund/{rno}. */
export const rejectRefund = (rno) => deleteById("order/refund", rno, "반품 거부 실패");

/** 교환내역 조회 — GET /order/exchange (운영자). */
export const listExchanges = (params = {}) => getJson("order/exchange", params, "교환내역 조회 실패");
/** 교환 접수 — POST /order/exchange. body:{ono, items:[{prno,quantity}], exc_ct(사유), exc_content?} */
export const createExchange = (body) => postJson("order/exchange", body, "교환 접수 실패");
/** 교환 거부 — DELETE /order/exchange/{eno}. */
export const rejectExchange = (eno) => deleteById("order/exchange", eno, "교환 거부 실패");

/** 클레임 사유 조회 — GET /shop/claim. 취소·반품·교환 각각의 사유 카테고리(선택지)를 반환.
 *  create_cancel/refund/exchange 의 사유(can_ct/ref_ct/exc_ct)를 여기서 골라 넣는다. */
export async function getClaimReasons() {
  const res = await fetch(`${apiBase()}/shop/claim`, { headers: await bearerHeaders() });
  return jsonOrThrow(res, "클레임 사유 조회 실패"); // { cancel:{categories}, refund:{...}, exchange:{...} }
}

/** 클레임 사유 업데이트 — PUT /shop/claim (운영자). 보낸 유형만 전체 교체.
 *  body: { cancel:[제목], refund:[{title,price}], exchange:[{title,price}] } */
export async function updateClaimReasons(body) {
  const res = await fetch(`${apiBase()}/shop/claim`, {
    method: "PUT",
    headers: await bearerHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res, "클레임 사유 업데이트 실패");
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
