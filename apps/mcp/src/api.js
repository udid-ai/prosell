// 쇼핑몰 데이터 호출. 비회원(client_id)으로 상품을 조회한다.
import { apiBase, clientId } from "./config.js";

/** 목록용 경량 expand — 이미지/옵션 전체 fetch 회피 (api-spec/llms.txt 의 성능 규칙) */
export const LIST_EXPAND = "origin,benefit,images_thumb,product_first";
export const DETAIL_EXPAND = "origin,benefit,images,content,product";

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
