// 쇼핑몰 데이터 호출. 비회원(client_id)으로 상품을 조회한다.
import { apiBase, clientId, credentials, tokens, saveTokens, clearTokens } from "./config.js";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

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

/** 취소 수정 — PUT /order/cancel/{cno} (운영자). 보낸 필드만 갱신.
 *  can_state=2 로 바꾸면 실제 취소완료(환불) 처리가 실행됨. 이미 완료(2)면 상태변경 불가. */
export const updateCancel = (cno, body) => putById("order/cancel", cno, body, "취소 수정 실패");

/** 취소 철회 — DELETE /order/cancel/{cno} (운영자). 접수된 취소를 되돌린다. 완료(2)건은 철회 불가. */
export const rejectCancel = (cno) => deleteById("order/cancel", cno, "취소 철회 실패");

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
/** 반품 수정 — PUT /order/refund/{rno} (운영자). 본문은 중첩 구조: { refund:{ref_state,ref_ct,...},
 *  addressInfo:{ref_ret_*, 회수 운송장 등} }. 보낸 필드만 갱신. */
export const updateRefund = (rno, body) => putById("order/refund", rno, body, "반품 수정 실패");
/** 반품 거부 — DELETE /order/refund/{rno}. */
export const rejectRefund = (rno) => deleteById("order/refund", rno, "반품 거부 실패");

/** 교환내역 조회 — GET /order/exchange (운영자). */
export const listExchanges = (params = {}) => getJson("order/exchange", params, "교환내역 조회 실패");
/** 교환 접수 — POST /order/exchange. body:{ono, items:[{prno,quantity}], exc_ct(사유), exc_content?} */
export const createExchange = (body) => postJson("order/exchange", body, "교환 접수 실패");
/** 교환 수정 — PUT /order/exchange/{eno} (운영자). 본문 중첩: { exchange:{exc_state,exc_ct,...},
 *  addressInfo:{exc_ret_*, 회수 운송장 등} }. 보낸 필드만 갱신. */
export const updateExchange = (eno, body) => putById("order/exchange", eno, body, "교환 수정 실패");
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

// ── 상품·부가정보 관리(운영자) — CRUD/업로드 공통 ─────────────────────────────
// 목록·단건 조회(GET)는 백엔드가 isClient() 라 client_id 헤더로, 생성·수정·삭제는
// isToken() 라 Bearer 로 호출한다. (connect 로 client_id, login 으로 Bearer 가 준비됨)
async function getClient(path, params = {}, fallback) {
  const u = new URL(`${apiBase()}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  }
  const res = await fetch(u, { headers: authHeaders() });
  return jsonOrThrow(res, fallback);
}
async function putById(path, id, body, fallback) {
  const res = await fetch(`${apiBase()}/${path}/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: await bearerHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res, fallback);
}
// multipart 업로드(운영자). fields(일반 폼값) + filePaths(로컬 경로) 를 FormData 로 전송.
// 백엔드는 $_FILES 를 키 이름 무관하게 순회하므로 file0,file1.. 로 붙인다. Content-Type 은
// fetch 가 boundary 와 함께 자동 설정(직접 지정 금지).
async function uploadFiles(path, fields, filePaths, fallback) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields || {})) {
    if (v !== undefined && v !== null && v !== "") form.append(k, String(v));
  }
  const paths = filePaths == null ? [] : Array.isArray(filePaths) ? filePaths : [filePaths];
  let i = 0;
  for (const p of paths) {
    let buf;
    try { buf = await readFile(p); }
    catch { throw new Error(`${fallback}: 파일을 읽을 수 없습니다 (${p})`); }
    form.append(`file${i++}`, new Blob([buf]), basename(p));
  }
  const res = await fetch(`${apiBase()}/${path}`, { method: "POST", headers: await bearerHeaders(), body: form });
  return jsonOrThrow(res, fallback);
}

// 상품(관리) — 조회는 기존 listProducts/getProduct(client). 등록·수정·삭제는 운영자.
export const createProduct = (body) => postJson("products", body, "상품 등록 실패");
export const updateProduct = (id, body) => putById("products", id, body, "상품 수정 실패");
export const deleteProduct = (id) => deleteById("products", id, "상품 삭제 실패");
/** 주문옵션 상세 — GET /products/options/{id}. 옵션 유니크키로 단건 조회. */
export const getProductOption = (id) => getClient(`products/options/${encodeURIComponent(id)}`, {}, "주문옵션 조회 실패");
/** 상품 이미지 업로드 — POST /products/images. field=대상(file_photo 등), files=로컬경로(최대 10). */
export const uploadProductImages = (field, files) => uploadFiles("products/images", { field }, files, "상품 이미지 업로드 실패");

// 카테고리
export const listCategories = (params = {}) => getClient("categories", params, "카테고리 조회 실패");
export const createCategory = (body) => postJson("categories", body, "카테고리 등록 실패");
export const updateCategory = (id, body) => putById("categories", id, body, "카테고리 수정 실패");
export const deleteCategory = (id) => deleteById("categories", id, "카테고리 삭제 실패");

// 공급자
export const listSuppliers = (params = {}) => getClient("supplier", params, "공급자 조회 실패");
export const createSupplier = (body) => postJson("supplier", body, "공급자 등록 실패");
export const updateSupplier = (id, body) => putById("supplier", id, body, "공급자 수정 실패");
export const deleteSupplier = (id) => deleteById("supplier", id, "공급자 삭제 실패");

// 브랜드 (+이미지)
export const listBrands = (params = {}) => getClient("brand", params, "브랜드 조회 실패");
export const createBrand = (body) => postJson("brand", body, "브랜드 등록 실패");
export const updateBrand = (id, body) => putById("brand", id, body, "브랜드 수정 실패");
export const deleteBrand = (id) => deleteById("brand", id, "브랜드 삭제 실패");
/** 브랜드 이미지 업로드 — POST /brand/images. 단일 파일. 응답 items[0].id 를 createBrand 의 image 로. */
export const uploadBrandImage = (file) => uploadFiles("brand/images", {}, file, "브랜드 이미지 업로드 실패");
export const deleteBrandImage = (id) => deleteById("brand/images", id, "브랜드 이미지 삭제 실패");

// 추가주문옵션
export const listAddoptions = (params = {}) => getClient("addoptions", params, "추가주문옵션 조회 실패");
export const createAddoption = (body) => postJson("addoptions", body, "추가주문옵션 등록 실패");
export const updateAddoption = (id, body) => putById("addoptions", id, body, "추가주문옵션 수정 실패");
export const deleteAddoption = (id) => deleteById("addoptions", id, "추가주문옵션 삭제 실패");

// 필터 색상 — 등록은 items:[{title,color}] 묶음, 수정은 단건(title/color)
export const listColors = (params = {}) => getClient("colors", params, "필터 색상 조회 실패");
export const createColors = (items) => postJson("colors", { items }, "필터 색상 등록 실패");
export const updateColor = (id, body) => putById("colors", id, body, "필터 색상 수정 실패");
export const deleteColor = (id) => deleteById("colors", id, "필터 색상 삭제 실패");

// 필터 사이즈 — 등록은 새 그룹(ct) 또는 기존 그룹(group)에 items:[제목..] 추가, 수정은 단건(title)
export const listSizes = (params = {}) => getClient("sizes", params, "필터 사이즈 조회 실패");
export const createSizes = (body) => postJson("sizes", body, "필터 사이즈 등록 실패");
export const updateSize = (id, body) => putById("sizes", id, body, "필터 사이즈 수정 실패");
export const deleteSize = (id) => deleteById("sizes", id, "필터 사이즈 삭제 실패");

// 아이콘 — 등록·수정은 multipart(ct/title/onoff + 이미지). 수정은 POST /icons/{id}(백엔드 내부 PUT).
export const listIcons = (params = {}) => getClient("icons", params, "아이콘 조회 실패");
export const createIcon = (fields, file) => uploadFiles("icons", fields, file, "아이콘 등록 실패");
export const updateIcon = (id, fields, file) => uploadFiles(`icons/${encodeURIComponent(id)}`, fields, file, "아이콘 수정 실패");
export const deleteIcon = (id) => deleteById("icons", id, "아이콘 삭제 실패");

// 공통 템플릿(상세내용 서식: 배송/교환반품/AS 등)
export const listTemplates = (params = {}) => getClient("products/template", params, "템플릿 조회 실패");
export const createTemplate = (body) => postJson("products/template", body, "템플릿 등록 실패");
export const updateTemplate = (id, body) => putById("products/template", id, body, "템플릿 수정 실패");
export const deleteTemplate = (id) => deleteById("products/template", id, "템플릿 삭제 실패");

// 서식(상품정보제공고시) — 목록 조회만 제공(등록/수정/삭제 미지원). 응답 키는 informations.
export const listInformation = (params = {}) => getClient("products/information", params, "서식 조회 실패");

// ── 문의(상품문의·고객문의) 운영자 관리 ─────────────────────────────────────────
// 백엔드 조회는 isToken(["user"]) 지만 운영자 토큰은 admin scope 라 mid 필터가 적용되지 않아
// 전체 문의를 보고, user/guest 전용 파라미터 제한도 받지 않아 답변(reply_*)을 쓸 수 있다.
// 답변자(reply_mid)는 관리자 등급(level>=101) 회원이어야 하므로 운영자 본인 mid 를 채운다.
let _operatorMid = null;
/** 로그인한 운영자 본인의 회원번호(mid). 답변 등록 시 reply_mid 로 쓴다. 한 번 조회 후 캐시. */
export async function operatorMid() {
  if (_operatorMid) return _operatorMid;
  const res = await fetch(`${apiBase()}/user/account`, { headers: await bearerHeaders() });
  const data = await jsonOrThrow(res, "운영자 계정 조회 실패");
  const mid = data?.data?.origin?.mid;
  if (!mid) throw new Error("운영자 회원번호(mid)를 확인할 수 없습니다. 다시 login 후 시도하세요.");
  _operatorMid = mid;
  return mid;
}

// 상품문의 — 답변은 update 로 reply_content 를 보낸다(reply_mid 자동).
export const listProductInquiries = (params = {}) => getJson("inquiry/product", params, "상품문의 조회 실패");
export const createProductInquiry = (body) => postJson("inquiry/product", body, "상품문의 등록 실패");
export const updateProductInquiry = (id, body) => putById("inquiry/product", id, body, "상품문의 수정 실패");
export const deleteProductInquiry = (id) => deleteById("inquiry/product", id, "상품문의 삭제 실패");

// 고객문의 — 회원 전용 게시판. 설정(카테고리·업로드 제한) 조회 + 파일 업로드 지원.
export const listCustomerInquiries = (params = {}) => getJson("inquiry/customer", params, "고객문의 조회 실패");
export const createCustomerInquiry = (body) => postJson("inquiry/customer", body, "고객문의 등록 실패");
export const updateCustomerInquiry = (id, body) => putById("inquiry/customer", id, body, "고객문의 수정 실패");
export const deleteCustomerInquiry = (id) => deleteById("inquiry/customer", id, "고객문의 삭제 실패");
export const getCustomerInquirySetup = () => getJson("inquiry/customer/setup", {}, "고객문의 설정 조회 실패");
/** 고객문의 첨부파일 업로드 — POST /inquiry/customer/upload(최대 3). items[].id 를 create/update 의 files 로. */
export const uploadCustomerInquiryFiles = (files) => uploadFiles("inquiry/customer/upload", {}, files, "고객문의 파일 업로드 실패");

// ── 상품평(리뷰) 운영자 관리 ───────────────────────────────────────────────────
// 문의와 동일: admin scope 라 mid 필터·파라미터 제한이 적용되지 않아 전체 리뷰 조회 + 답변(reply_*) 가능.
// 답변자(reply_mid)는 관리자 등급(level>=101) 회원 → 운영자 본인 mid(operatorMid) 사용.
export const listReviews = (params = {}) => getJson("review", params, "상품평 조회 실패");
export const createReview = (body) => postJson("review", body, "상품평 등록 실패");
export const updateReview = (id, body) => putById("review", id, body, "상품평 수정 실패");
export const deleteReview = (id) => deleteById("review", id, "상품평 삭제 실패");
export const getReviewSetup = () => getJson("review/setup", {}, "상품평 설정 조회 실패");
/** 상품평 첨부파일 업로드 — POST /review/upload(최대 5). items[].id 를 create/update 의 files 로. */
export const uploadReviewFiles = (files) => uploadFiles("review/upload", {}, files, "상품평 파일 업로드 실패");

// ── 공지사항 / FAQ (운영자 게시판) ─────────────────────────────────────────────
// 목록 조회는 client_id 인증(공개성), 등록·수정·삭제·업로드·설정은 isToken()=admin 전용.
// 등록 시 작성자 mid 필수 → 운영자 본인 mid(operatorMid)를 채운다.
export const listNotices = (params = {}) => getClient("notice", params, "공지사항 조회 실패");
export const createNotice = (body) => postJson("notice", body, "공지사항 등록 실패");
export const updateNotice = (id, body) => putById("notice", id, body, "공지사항 수정 실패");
export const deleteNotice = (id) => deleteById("notice", id, "공지사항 삭제 실패");
export const getNoticeSetup = () => getJson("notice/setup", {}, "공지사항 설정 조회 실패");
export const uploadNoticeFiles = (files) => uploadFiles("notice/upload", {}, files, "공지사항 파일 업로드 실패");

export const listFaqs = (params = {}) => getClient("faq", params, "FAQ 조회 실패");
export const createFaq = (body) => postJson("faq", body, "FAQ 등록 실패");
export const updateFaq = (id, body) => putById("faq", id, body, "FAQ 수정 실패");
export const deleteFaq = (id) => deleteById("faq", id, "FAQ 삭제 실패");
export const getFaqSetup = () => getJson("faq/setup", {}, "FAQ 설정 조회 실패");
export const uploadFaqFiles = (files) => uploadFiles("faq/upload", {}, files, "FAQ 파일 업로드 실패");

/** 스킨 조회 — GET /design/skin (운영자). device(pc/m)·skin(종류) 의 스킨 이름 목록. */
export const listSkins = (device, skin) => getJson("design/skin", { device, skin }, "스킨 조회 실패");

// ── 회원계정 (운영자 조회 전용) ────────────────────────────────────────────────
// 모두 isToken()=admin. 운영자 조회라 PII(name/hp/email/주소/계좌)가 복호화되어 반환된다 — 취급 주의.
// 등록(POST /member)은 client 인증 회원가입이라 운영자 도구로 넣지 않는다. PUT/DELETE 는 미구현(405).
export const listMembers = (params = {}) => getJson("member", params, "회원 조회 실패");
export const getMember = (id, expand) => getJson(`member/${encodeURIComponent(id)}`, expand ? { expand } : {}, "회원 상세 조회 실패");
export const listDormantMembers = (params = {}) => getJson("member/dormant", params, "휴면회원 조회 실패");
export const listDropoutMembers = (params = {}) => getJson("member/dropout", params, "탈퇴회원 조회 실패");

// ── 회원등급 (운영자 CRUD) ─────────────────────────────────────────────────────
// 모두 isToken()=admin. 본문은 중첩: levelup{use,order,price}/discount{type,price,max}/point{...}/coupon[{id,quantity}].
export const listLevels = (params = {}) => getJson("level", params, "회원등급 조회 실패");
export const createLevel = (body) => postJson("level", body, "회원등급 등록 실패");
export const updateLevel = (id, body) => putById("level", id, body, "회원등급 수정 실패");
export const deleteLevel = (id) => deleteById("level", id, "회원등급 삭제 실패");

// ── 쿠폰 / 쿠폰발급 / 포인트 (운영자) — 모두 isToken()=admin ───────────────────────
// 쿠폰 설정(템플릿) CRUD + 디자인 조회
export const listCoupons = (params = {}) => getJson("coupon", params, "쿠폰 조회 실패");
export const createCoupon = (body) => postJson("coupon", body, "쿠폰 등록 실패");
export const updateCoupon = (id, body) => putById("coupon", id, body, "쿠폰 수정 실패");
export const deleteCoupon = (id) => deleteById("coupon", id, "쿠폰 삭제 실패");
export const listCouponDesigns = (params = {}) => getJson("coupon/design", params, "쿠폰 디자인 조회 실패");

// 쿠폰 발급(회원에게 지급) — 1회 호출당 회원 1명. 발급내역 조회/삭제.
export const listCouponIssues = (params = {}) => getJson("coupon/issue", params, "쿠폰 발급내역 조회 실패");
export const issueCoupon = (body) => postJson("coupon/issue", body, "쿠폰 발급 실패");
export const deleteCouponIssue = (id) => deleteById("coupon/issue", id, "발급 쿠폰 삭제 실패");

// 포인트 — point 부호로 지급(+)/차감(-). 수정은 content(사유)만. id 는 목록의 id 값 그대로.
export const listPoints = (params = {}) => getJson("point", params, "포인트 조회 실패");
export const createPoint = (body) => postJson("point", body, "포인트 지급/차감 실패");
export const updatePoint = (id, body) => putById("point", id, body, "포인트 내역 수정 실패");
export const deletePoint = (id) => deleteById("point", id, "포인트 내역 삭제 실패");

// ── 쇼핑몰 기본정보(회사정보) (운영자) — isToken()=admin ────────────────────────
/** 기본정보 조회 — GET /shop/company. 상호·고객센터·사업자정보·주소 등. */
export const getShopCompany = () => getJson("shop/company", {}, "기본정보 조회 실패");
/** 기본정보 수정 — PUT /shop/company. 본문은 { data: {...} } 중첩, 보낸 필드만 갱신.
 *  변경 시 푸터(shop/footer) 캐시가 무효화된다. */
export async function updateShopCompany(data) {
  const res = await fetch(`${apiBase()}/shop/company`, {
    method: "PUT",
    headers: await bearerHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ data }),
  });
  return jsonOrThrow(res, "기본정보 수정 실패");
}

// ── 통합 게시판(board_type=1) (운영자) — isToken()=admin ────────────────────────
// 쇼핑몰 설정 board_type=1 일 때 공지/1:1문의/FAQ/상품문의/구매후기가 단일 테이블로 통합된다.
// board_type 코드: notice|qna|faq|inquiry|review. (board_type=0 기본형은 기존 개별 도구 사용)
export const listBoard = (params = {}) => getJson("board", params, "게시판 조회 실패");
export const getBoardPost = (id) => getJson(`board/${encodeURIComponent(id)}`, {}, "게시글 조회 실패");
export const createBoardPost = (body) => postJson("board", body, "게시글 등록 실패");
export const updateBoardPost = (id, body) => putById("board", id, body, "게시글 수정 실패");
export const deleteBoardPost = (id) => deleteById("board", id, "게시글 삭제 실패");
/** 운영자 답변(댓글) 등록 — POST /board/reply. 작성자는 토큰 운영자. 게시글을 답변완료로. */
export const replyBoardPost = (body) => postJson("board/reply", body, "답변 등록 실패");
export const deleteBoardReply = (id) => deleteById("board/reply", id, "답변 삭제 실패");
/** 게시판 설정 조회 — GET /board/setup. 5개 게시판 정의·카테고리·기능 사용여부. */
export const getBoardSetup = () => getJson("board/setup", {}, "게시판 설정 조회 실패");
/** 게시판 첨부 업로드 — POST /board/upload(최대 5). items[].id 를 photo(콤마구분)로 연결. */
export const uploadBoardFiles = (files) => uploadFiles("board/upload", {}, files, "게시판 파일 업로드 실패");

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
