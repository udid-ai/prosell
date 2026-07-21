import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { renderContent } from "./sanitize";

// 쿠키 키 (HttpOnly — 브라우저 JS 접근 불가)
export const AT = "pa_at"; // access token
export const RT = "pa_rt"; // refresh token
export const GUEST_TOKEN_COOKIE = "gt"; // 비회원 주문조회 guest 액세스 토큰
export const ST = "pa_state"; // oauth state (일회용)
// 만료 힌트(비-HttpOnly): 실제 AT 만료 epoch(ms). 브라우저 JS 가 읽어 «선제 갱신» 스케줄에 사용.
// 토큰 자체가 아니므로 노출돼도 안전(타임스탬프). RT 수명만큼 유지해 AT 사후에도 갱신 시점 판단.
export const EXP = "pa_exp";

// 선제 갱신 skew: AT 쿠키 수명을 실제 토큰 수명보다 이만큼 짧게 둔다.
// → 실제 만료 SKEW 초 전에 브라우저가 AT 쿠키를 삭제 → 다음 요청에서 미들웨어가 선제 갱신.
export const AT_SKEW = 300; // 5분
const RT_MAXAGE_FALLBACK = 2592000; // 30일
// expires_in(초)으로 AT 쿠키 maxAge 산출. 폴백 10800(3h). 최소 60초 보장.
export function atCookieMaxAge(expiresIn?: number): number {
  const ttl = typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : 10800;
  return Math.max(60, ttl - AT_SKEW);
}

/**
 * AT/RT/EXP 쿠키를 한 번에 세팅(로그인·가입·소셜·갱신 모든 발급 지점 공통).
 *  · AT: httpOnly, maxAge = 실제만료 − SKEW (기존과 동일한 조기만료 유지)
 *  · RT: httpOnly, 회전 시에만 갱신(refresh_token 없으면 기존 유지 위해 미설정)
 *  · EXP: 비-httpOnly, 실제 AT 만료 epoch(ms) — 클라이언트 SessionKeeper 스케줄용
 */
export function setAuthCookies(
  res: NextResponse,
  t: { access_token: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number },
  secure: boolean,
): void {
  const ttl = typeof t.expires_in === "number" && t.expires_in > 0 ? t.expires_in : 10800;
  const rtMaxAge = typeof t.refresh_token_expires_in === "number" && t.refresh_token_expires_in > 0 ? t.refresh_token_expires_in : RT_MAXAGE_FALLBACK;
  res.cookies.set(AT, t.access_token, { httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: Math.max(60, ttl - AT_SKEW) });
  if (t.refresh_token) {
    res.cookies.set(RT, t.refresh_token, { httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: rtMaxAge });
  }
  res.cookies.set(EXP, String(Date.now() + ttl * 1000), { httpOnly: false, path: "/", sameSite: "lax", secure, maxAge: rtMaxAge });
}

type Env = {
  PROSELL_API_BASE: string; // 예: https://{쇼핑몰아이디}.prosell.kr
  PROSELL_AUTH_BASE?: string; // 브라우저가 닿는 base (로컬 도커처럼 호스트가 갈릴 때)
  PROSELL_CLIENT_ID: string;
  PROSELL_CLIENT_SECRET: string; // 앱키 — 서버에서만 사용(로그인 토큰 발급). 브라우저 노출 금지.
  PROSELL_IMAGE_BASE?: string; // 로컬 도커 이미지 호스트 치환용 (운영은 미설정)
};

export function env(): Env {
  return process.env as unknown as Env;
}

/** 현재 로그인 회원의 access token (없으면 undefined = 비회원) */
export async function getToken(): Promise<string | undefined> {
  const c = await cookies();
  return c.get(AT)?.value;
}

/** 비회원 주문조회로 발급된 guest 토큰. 회원 미로그인 상태의 주문 관련 조회에 사용. */
export async function getGuestToken(): Promise<string | undefined> {
  const c = await cookies();
  return c.get(GUEST_TOKEN_COOKIE)?.value;
}

/** 주문 자원 조회용 토큰 — 회원(AT) 우선, 없으면 비회원 주문조회 guest 토큰. */
export async function getOrderToken(): Promise<string | undefined> {
  return (await getToken()) || (await getGuestToken());
}

function authHeaders(token?: string): Record<string, string> {
  const e = env();
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`; // 회원: 등급 할인 반영
  else h["X-App-Client-Id"] = e.PROSELL_CLIENT_ID; // 비회원: 클라이언트 인증
  return h;
}

// 비회원 공통 데이터(상품/카테고리/푸터/쿠폰/디자인페이지 등)의 ISR 캐시 주기(초).
// 배포: 600초(10분, 백엔드 부하 최소화) ISR.
const STATIC_REVALIDATE = 600;
const IS_PROD = process.env.NODE_ENV === "production";

// 공용(비회원 공유) 데이터의 캐시 옵션.
//  · 배포: STATIC_REVALIDATE ISR 공유 캐시(DB 부하↓ — 초당 100건도 주기당 1회로 수렴).
//  · 개발: no-store(항상 최신). dev 온디스크 ISR 재검증이 불안정해 stale 이 남는 문제를 근본 제거하고
//         '개발은 수정 즉시 반영' 의도를 확실히 지킨다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isrOpt(tags?: string[]): any {
  if (!IS_PROD) return { cache: "no-store" };
  return { next: { revalidate: STATIC_REVALIDATE, ...(tags && tags.length ? { tags } : {}) } };
}

// 상품 GET 캐시 정책(토큰 인지).
//  · 회원(토큰) 응답은 등급가 개인화라 절대 공유 금지 → no-store (개인 데이터 유출 방지).
//  · 비회원은 공용 isrOpt (배포 ISR / 개발 no-store).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cacheOpt(token?: string): any {
  return token ? { cache: "no-store" } : isrOpt();
}

/** 옵션(상품) 1건. product / product_first expand 의 항목 형태. */
export type ProductOption = {
  id: number;
  title?: string | null;
  name?: string | null;
  price?: number;
  discount_price?: number;
  standard_size?: string | null;
  standard_color?: string | null;
};

export type ProductItem = {
  // 목록 카드 출력 필드(레거시 category 스킨 items.*): 상태 뱃지·브랜드·성인/판매중지.
  origin?: { id: number; title?: string | null; category?: string | null; soldout?: number; brand?: number | string | null; brand_title?: string | null; adult?: number; productoff?: number; onoff?: number; level_view?: number; level_order?: number; option_type?: number; addoption?: string | null };
  // 리뷰·판매량(레거시 review_cnt/review_percent/sale_quantity) — 카드 하단 표기.
  report?: { review_cnt?: number; review_score?: number; review_percent?: number; sale_quantity?: number; order_cnt?: number };
  // 배송(무료배송/유료 뱃지) — parcel_basic_price=0 무료 / parcel_free_price>0 N원이상 무료 / 그 외 배송수단+배송료.
  delivery?: { delivery_use?: number; parcel_basic_price?: number; parcel_free_price?: number; parcel_type?: number; courier_type?: number; direct_type?: number; visit_type?: string | null; country_type?: number };
  // 실서버 price 의미: low_price=현재 판매가(할인 반영), product_low_price=원가(정가).
  //                    discount_price/low_discount_price=할인 "금액"(가격 아님), discount=할인여부.
  benefit?: {
    price?: number;
    discount_price?: number;
    low_price?: number;
    high_price?: number;
    low_discount_price?: number;
    low_discount_percent?: number;
    product_low_price?: number;   // 원가(정가)
    product_high_price?: number;
    discount?: number;            // 1=할인 적용
    // 노출 가격(레거시 show_*) — 타임세일·등급할인 반영. low_price 는 시간창 타임세일 미반영이라 이쪽이 권위값.
    show_price?: number;          // 정가(할인 전)
    show_sale_price?: number;     // 최종 판매가
    show_discount_percent?: number; // 할인율(%)
    show_point_price?: number;    // 적립 예정
    sale_onoff?: number;          // 1=타임세일 사용
    price_open?: number;          // 가격 공개 여부(0=open_price 등급 미달 → 가격 미공개)
    order_open?: number;          // 주문 가능 여부(0=level_order 등급 미달 → 장바구니·구매 불가). 가격 공개와 별개
    view_open?: number;           // 접근 권한(0=level_view 등급 미달 → 목록에서 상품 가림)
    level_view_name?: string | null; // 열람 가능 최소 등급명(view_open=0 안내용)
  };
  images?: { field?: string | null; thumb?: string | null; src?: string | null; url?: string | null }[]; // 전체 이미지 (상세용)
  images_thumb?: { field?: string | null; thumb?: string | null; src?: string | null; url?: string | null }[]; // 대표/목록 이미지만 (목록 경량용)
  content?: { detail?: string | null };
  product?: ProductOption[]; // 전체 옵션 (상세용)
  product_first?: ProductOption | null; // 대표(0번째) 옵션 (목록 경량용)
};

/** 목록용 경량 expand: 이미지는 대표/목록만, 옵션은 대표 1건만 — 전체 fetch 회피.
 *  report=리뷰/판매량, delivery=무료배송 뱃지용 배송비/무료기준. */
export const LIST_EXPAND = "origin,benefit,images_thumb,product_first,report,delivery";
export const DETAIL_EXPAND = "origin,benefit,images,content,product";

// viewer.adult=1 이면 뷰어가 성인 권한 보유(관리자/성인인증 회원) → 성인상품 이미지 노출 허용(레거시 web.adult).
export type ProductList = { total_count: number; items: ProductItem[]; viewer?: { adult?: number } };

/** 상품 목록 조회 */
export async function fetchProducts(
  params: Record<string, string> = {},
  token?: string
): Promise<ProductList> {
  const e = env();
  // 설정(.env) 전이거나 통신 실패해도 throw 하지 않고 빈 결과 → 호출부의 데모 폴백이 화면을 채운다.
  if (!e.PROSELL_API_BASE) return { total_count: 0, items: [] };
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/products`);
    for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
    if (!u.searchParams.has("expand")) u.searchParams.set("expand", LIST_EXPAND);
    if (!u.searchParams.has("period_start")) u.searchParams.set("period_start", "2000-01-01");
    if (!u.searchParams.has("period_end")) u.searchParams.set("period_end", "2999-12-31");
    // 판매중(onoff=1) 상품만 목록 노출 — onoff=0(판매중지/숨김)은 제외(레거시 공개 목록과 동일).
    if (!u.searchParams.has("onoff")) u.searchParams.set("onoff", "1");

    let res = await fetch(u.toString(), { headers: authHeaders(token), ...cacheOpt(token) });
    // 만료·무효 회원 토큰(예: 백엔드 재설치/토큰폐기 후 남은 쿠키)로 실패하면 비회원(client-id)으로 재시도 →
    // «로그인된 것처럼 보이지만 실제로는 무효»한 상태에서도 상품 목록이 반드시 노출되도록 한다.
    if (token && !res.ok) {
      res = await fetch(u.toString(), { headers: authHeaders(undefined), ...cacheOpt(undefined) });
    }
    if (!res.ok) return { total_count: 0, items: [] };
    return (await res.json()) as ProductList;
  } catch {
    return { total_count: 0, items: [] };
  }
}

/** 상품 단건 조회 (상세) */
export async function fetchProduct(id: string, token?: string): Promise<ProductItem | null> {
  const e = env();
  if (!e.PROSELL_API_BASE) return null;
  try {
    const u = `${e.PROSELL_API_BASE}/api/v2/products/${id}?expand=${DETAIL_EXPAND}`;
    const res = await fetch(u, { headers: authHeaders(token), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: ProductItem[] } & ProductItem;
    // 단건은 items[0] 또는 객체 자체로 올 수 있어 방어적으로 처리
    if (Array.isArray(data.items)) return data.items[0] ?? null;
    return data.origin ? data : null;
  } catch {
    return null;
  }
}

// ── 상품 필터 패싯(공개·공통 데이터) ───────────────────────────
// 브랜드·색상·사이즈 목록. 회원 무관 공통값 → ISR 공유 캐시(isrOpt, Redis 캐시핸들러로 대체 가능).
// 목록 푸시알림 등 대량 동시접속 시에도 백엔드 호출은 캐시 주기당 1회로 수렴.
export type FacetOption = { id: number; title: string; color?: string | null; count?: number };
export type ProductFacets = { brands: FacetOption[]; colors: FacetOption[]; sizes: FacetOption[]; icons: FacetOption[] };

async function fetchFacetList(path: string, tag: string): Promise<FacetOption[]> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return [];
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/${path}?limit=1000&order=1`, {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      ...isrOpt([tag]),
    });
    if (!res.ok) return [];
    const j = (await res.json().catch(() => null)) as { items?: { id: number; title?: string | null; color?: string | null }[] } | null;
    return (j?.items ?? [])
      .filter((r) => r && r.id && r.title)
      .map((r) => ({ id: r.id, title: String(r.title), color: r.color ?? null }));
  } catch { return []; }
}

/** 색상 목록(필터용, color=HEX). ISR 캐시. */
export const fetchColors = () => fetchFacetList("colors", "colors");


/** 상품 패싯(브랜드·규격) — /api/v2/products/facets.
 *  브랜드=상품이 1개 이상 있는 것만(+count, category 스코프), 규격=카테고리 설정(pc_standard)의 표준그룹만.
 *  레거시 getFilters 와 동일 정책. ISR 공유 캐시(카테고리별 URL 캐시). */
export async function fetchProductsFacetApi(category?: string): Promise<{ brands: FacetOption[]; icons: FacetOption[]; sizes: FacetOption[] }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return { brands: [], icons: [], sizes: [] };
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/products/facets`);
    if (category) u.searchParams.set("category", category);
    const res = await fetch(u.toString(), {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      ...isrOpt(["product-facets"]),
    });
    if (!res.ok) return { brands: [], icons: [], sizes: [] };
    const j = (await res.json().catch(() => null)) as {
      brands?: { id: number; title?: string | null; count?: number }[];
      icons?: { id: number; title?: string | null; count?: number }[];
      sizes?: { id: number; title?: string | null }[];
    } | null;
    const map = (arr?: { id: number; title?: string | null; count?: number }[]) =>
      (arr ?? []).filter((r) => r && r.id && r.title).map((r) => ({ id: r.id, title: String(r.title), count: r.count ?? 0 }));
    const sizes = (j?.sizes ?? []).filter((r) => r && r.id && r.title).map((r) => ({ id: r.id, title: String(r.title) }));
    return { brands: map(j?.brands), icons: map(j?.icons), sizes };
  } catch { return { brands: [], icons: [], sizes: [] }; }
}

/** 상품 필터 패싯 일괄 조회. 브랜드·아이콘·규격=facets API(카테고리 스코프), 색상=전체 목록. 전부 ISR 캐시. */
export async function fetchProductFacets(category?: string): Promise<ProductFacets> {
  const [facet, colors] = await Promise.all([fetchProductsFacetApi(category), fetchColors()]);
  return { brands: facet.brands, colors, sizes: facet.sizes, icons: facet.icons };
}

/** 로그인 회원 기본정보 */
export type AccountField = string | number | null | undefined;
export type Account = {
  origin: Record<string, AccountField>; // 핵심 회원정보(uid/name/email/hp/주소/등급/포인트/일자…)
  info: Record<string, AccountField>;   // 부가(은행/관심/소개/본인확인) + 활동(주문/쿠폰/리뷰/문의) 집계
  files: unknown[];                      // 업로드 파일(photo/file1/file2)
};

/** 로그인 회원의 전체 계정정보(origin/info/files)를 가져온다. */
export async function fetchAccount(token: string): Promise<Account | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/user/account`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null; // 무효/만료 토큰이면 null → 호출부는 «비회원»으로 취급
    const j = (await res.json().catch(() => null)) as { data?: Partial<Account> } | null;
    const d = j?.data ?? {};
    return { origin: d.origin ?? {}, info: d.info ?? {}, files: Array.isArray(d.files) ? d.files : [] };
  } catch {
    return null;
  }
}

export type AccountUpdate = {
  nick?: string; name?: string; email?: string; hp?: string; tel?: string;
  birth?: string; gender?: number;
  email_receive?: boolean; hp_receive?: boolean;
  zipcode?: string; addr1?: string; addr2?: string; admcode?: string; place?: string;
  bank?: number; banknum?: string; bankholder?: string; interest?: string; profile?: string;
  current_upw?: string; new_upw?: string;
  // 휴대폰/이메일 변경 시 인증 참조값(회원가입과 동일)
  send_hp_id?: number; hp_code?: string; send_email_id?: number; email_code?: string;
  certify_id?: string; // 본인확인 재실행(휴대폰/실명 갱신)
};

/** 회원정보 수정 — 회원 토큰으로 본인 정보 수정. (PUT /api/v2/user/account) 서버사이드 전용. */
export async function updateAccount(token: string, input: AccountUpdate): Promise<{ ok: boolean; account?: Account; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE) return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/user/account`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as { data?: Partial<Account>; error?: { message?: string } };
    if (!res.ok) return { ok: false, error: d?.error?.message || "수정에 실패했습니다." };
    const data = d?.data ?? {};
    return { ok: true, account: { origin: data.origin ?? {}, info: data.info ?? {}, files: Array.isArray(data.files) ? data.files : [] } };
  } catch {
    return { ok: false, error: "통신 오류가 발생했습니다." };
  }
}

/** 현재 비밀번호 확인(정보수정 재인증). (POST /api/v2/user/account) 소셜계정은 서버가 자동 통과. 서버사이드 전용. */
export async function verifyCurrentPassword(token: string, currentUpw: string): Promise<{ ok: boolean; social?: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/user/account`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ current_upw: currentUpw }),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as { verified?: boolean; social?: boolean; error?: { message?: string } };
    if (!res.ok || !d?.verified) return { ok: false, error: d?.error?.message || "비밀번호가 일치하지 않습니다." };
    return { ok: true, social: !!d.social };
  } catch { return { ok: false, error: "통신 오류가 발생했습니다." }; }
}

// ── 회원 탈퇴 ────────────────────────────────────────────────
export type DropoutReason = { code: string; label: string; group: number };
export type DropoutInfo = { needs_password: boolean; dropout_day: number; reasons: DropoutReason[] };

/** 탈퇴 폼 데이터(사유 목록/비밀번호 필요 여부/유예일). (GET /api/v2/user/dropout) 서버사이드 전용. */
export async function fetchDropoutInfo(token: string): Promise<DropoutInfo | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/user/dropout`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    if (!res.ok) return null;
    const d = (await res.json()) as Partial<DropoutInfo>;
    return { needs_password: !!d.needs_password, dropout_day: Number(d.dropout_day || 0), reasons: Array.isArray(d.reasons) ? d.reasons : [] };
  } catch { return null; }
}

/** 회원 탈퇴 신청. (POST /api/v2/user/dropout) 서버사이드 전용. */
export async function dropoutAccount(
  token: string,
  input: { dropout_ct: string; assent: boolean; current_upw?: string }
): Promise<{ ok: boolean; dropout_day?: number; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/user/dropout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as { dropout?: boolean; dropout_day?: number; error?: { message?: string } };
    if (!res.ok || !d?.dropout) return { ok: false, error: d?.error?.message || "탈퇴 처리에 실패했습니다." };
    return { ok: true, dropout_day: Number(d.dropout_day || 0) };
  } catch { return { ok: false, error: "통신 오류가 발생했습니다." }; }
}

/** 저장된 배송지 1건 (기본/최근). PII 는 서버에서 복호화돼 내려온다. */
export type SavedAddress = {
  id: number;
  mode: number;        // 0=기본, 2=최근/추가
  is_default: boolean;
  name: string;
  tel: string;
  hp: string;
  zipcode: string;
  addr1: string;
  addr2: string;
  admcode: string;
  place: string;
};

/** 로그인 회원 본인의 저장된 배송지 목록(기본+최근). (GET /api/v2/user/address) 서버사이드 전용. */
export async function fetchAddresses(token: string): Promise<SavedAddress[]> {
  const e = env();
  if (!e.PROSELL_API_BASE) return [];
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/user/address`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    // result()는 키를 최상위로 펼친다(items) — data 래핑 여부에 관계없이 둘 다 허용.
    const j = (await res.json().catch(() => null)) as { data?: { items?: SavedAddress[] }; items?: SavedAddress[] } | null;
    const items = j?.data?.items ?? j?.items;
    return Array.isArray(items) ? (items as SavedAddress[]) : [];
  } catch {
    return [];
  }
}

export type AddressInput = {
  id?: number; name: string; hp: string; tel?: string;
  zipcode: string; addr1: string; addr2?: string; admcode?: string; place?: string;
  is_default?: boolean;
};

/** 배송지 추가/수정 — id 있으면 수정(PUT), 없으면 추가(POST). 서버사이드 전용. */
export async function saveAddress(token: string, input: AddressInput): Promise<{ ok: boolean; address?: SavedAddress; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/user/address`, {
      method: input.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as { data?: SavedAddress; error?: { message?: string } };
    if (!res.ok || !d?.data) return { ok: false, error: d?.error?.message || "배송지 저장에 실패했습니다." };
    return { ok: true, address: d.data };
  } catch { return { ok: false, error: "통신 오류가 발생했습니다." }; }
}

/** 배송지 삭제. (DELETE /api/v2/user/address { id }) 기본 배송지는 삭제 불가. 서버사이드 전용. */
export async function deleteAddress(token: string, id: number): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/user/address`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as { deleted?: boolean; error?: { message?: string } };
    if (!res.ok || !d?.deleted) return { ok: false, error: d?.error?.message || "배송지 삭제에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "통신 오류가 발생했습니다." }; }
}

// ── 해외 배송지(mode=1, 회원당 1개) ──────────────────────────
export type CountryAddress = { id: number; mode: number; name: string; hp: string; country: string; postcode: string; state: string; city: string; detail: string };
export type CountryOption = { code: string; name_kr: string; name_us: string; num: string };
// 주소 관리 페이지용 통합 응답: 국내 목록 + 해외배송 사용여부 + 해외 배송지 + 국가 목록.
export type AddressBook = { items: SavedAddress[]; country_onoff: number; country: CountryAddress | null; countries: CountryOption[] };

/** 주소 관리 데이터(국내 목록 + 해외 배송지/국가/사용여부). (GET /api/v2/user/address) 서버사이드 전용. */
export async function fetchAddressBook(token: string): Promise<AddressBook> {
  const e = env();
  const empty: AddressBook = { items: [], country_onoff: 0, country: null, countries: [] };
  if (!e.PROSELL_API_BASE || !token) return empty;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/user/address`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    if (!res.ok) return empty;
    const j = (await res.json().catch(() => null)) as { data?: Partial<AddressBook> } | null;
    const d = j?.data ?? {};
    return {
      items: Array.isArray(d.items) ? (d.items as SavedAddress[]) : [],
      country_onoff: Number(d.country_onoff ?? 0),
      country: (d.country as CountryAddress) ?? null,
      countries: Array.isArray(d.countries) ? (d.countries as CountryOption[]) : [],
    };
  } catch { return empty; }
}

export type CountryAddressInput = { name: string; hp: string; country: string; postcode: string; state?: string; city: string; detail: string };

/** 해외 배송지 저장(upsert, 회원당 1개). (POST /api/v2/user/address {type:country}) 서버사이드 전용. */
export async function saveCountryAddress(token: string, input: CountryAddressInput): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/user/address`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: "country", ...input }),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as { data?: CountryAddress; error?: { message?: string } };
    if (!res.ok || !d?.data) return { ok: false, error: d?.error?.message || "해외 배송지 저장에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "통신 오류가 발생했습니다." }; }
}

/** 해외 배송지 삭제. (DELETE /api/v2/user/address {type:country}) 서버사이드 전용. */
export async function deleteCountryAddress(token: string): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/user/address`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: "country" }),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as { deleted?: boolean; error?: { message?: string } };
    if (!res.ok || !d?.deleted) return { ok: false, error: d?.error?.message || "해외 배송지 삭제에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "통신 오류가 발생했습니다." }; }
}

export type SignupInput = {
  uid: string; upw: string; name?: string; email?: string; hp?: string; nick?: string;
  // 회원정보 (설정에 따라 노출/필수)
  birth?: string; gender?: number; tel?: string;
  zipcode?: string; addr1?: string; addr2?: string; admcode?: string; place?: string;
  bank?: number; banknum?: string; bankholder?: string;
  interest?: string; profile?: string; recommend?: string;
  // 약관 동의 — 이용약관/개인정보/만14세(필수)
  agree_service?: boolean; agree_privacy?: boolean; agree_age?: boolean;
  // 수신 동의 (선택) — 정보 메일 / 정보 메시지
  email_receive?: boolean; hp_receive?: boolean;
  // 본인인증 필요 쇼핑몰(req_*_real)에서: verify 로 받은 send_id + 입력 코드
  send_hp_id?: number; hp_code?: string; send_email_id?: number; email_code?: string;
  // join_certify(PASS 본인확인) 쇼핑몰: 본인확인 팝업이 돌려준 certify_id
  certify_id?: string;
};

export type MemberConfig = {
  uid_is_email: boolean;
  // 필드별 노출/필수 레벨 (0=숨김, 1=선택, 2이상=필수)
  fields: Record<string, number>;
  overlap?: { hp: boolean; email: boolean };
  required: Record<string, boolean>;
  verify: { hp: boolean; email: boolean; certify: boolean };
  options?: {
    gender: { value: number; label: string }[];
    bank: { value: number; label: string }[];
    interest: { code: string; name: string }[];
  };
  interest_min?: number;
  interest_max?: number;
};

/** 가입 폼 요구사항(설정) 조회 — 필수 필드 + 휴대폰/이메일/본인확인 필요 여부 */
export async function fetchMemberConfig(): Promise<MemberConfig | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/member/config`, {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as MemberConfig;
  } catch {
    return null;
  }
}

export type CertifyProfile = { name: string; hp: string; birth: string; gender: number };

/** 본인확인으로 인증된 프로필(이름/휴대폰/생일/성별) 조회 — readonly 폼 프리필용. 서버사이드 전용. */
export async function fetchCertifyProfile(certifyId: string): Promise<CertifyProfile | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !certifyId) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/member/certify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      body: JSON.stringify({ action: "profile", certify_id: certifyId }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const d = (await res.json()) as Partial<CertifyProfile>;
    return { name: d.name || "", hp: d.hp || "", birth: d.birth || "", gender: Number(d.gender || 0) };
  } catch {
    return null;
  }
}

/** 미소비 임시 본인확인 데이터 폐기 — 가입 포기/재진입 시 PII 정리. 멱등. 서버사이드 전용. */
export async function discardCertify(certifyId: string): Promise<boolean> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !certifyId) return false;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/member/certify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      body: JSON.stringify({ action: "discard", certify_id: certifyId }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 본인확인(PASS) 팝업 launch URL 생성.
 * 쇼핑몰의 v2 본인확인 페이지를 window.open 하면 Danal 인증창으로 자동 전환되고,
 * 인증 완료 후 쇼핑몰이 opener(스토어)로 postMessage({certify_id}) 한다.
 * redirectUri = 스토어 콜백(=동일 origin). 인증 결과는 이 origin 으로만 postMessage 된다.
 */
export function certifyLaunchUrl(redirectUri: string, state: string): string {
  const e = env();
  if (!e.PROSELL_API_BASE) throw new Error("쇼핑몰 연결 설정이 필요합니다.");
  const qs = new URLSearchParams({ redirect_uri: redirectUri, state });
  return `${e.PROSELL_API_BASE}/api/v2/member/certify?${qs.toString()}`;
}

/** 약관 본문 조회. id=service|privacy(가입) / order_service|order_privacy|order_entrust|order_guest(주문) */
export type TermsId = "service" | "privacy" | "order_service" | "order_privacy" | "order_entrust" | "order_guest";
export async function fetchTerms(id: TermsId): Promise<string> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return "";
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/member/terms?id=${id}`, {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      cache: "no-store",
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { content?: string };
    return data.content || "";
  } catch {
    return "";
  }
}
export type SignupResult = { ok: true; mid: number; uid: string } | { ok: false; error: string };

type VerifyChannel = "sms" | "email";

async function verifyApi(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) throw new Error("쇼핑몰 연결 설정이 필요합니다.");
  const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/member/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(((data.error as { message?: string })?.message) || "인증 요청 실패");
  return data;
}

/** 인증번호 발송. state=1 이면 인증 불필요, state=2 면 send_id 반환. */
export function requestVerify(channel: VerifyChannel, target: string) {
  return verifyApi({ channel, action: "send", [channel === "sms" ? "hp" : "email"]: target });
}

/** 인증번호 확인 → { verified: true }. */
export function confirmVerify(channel: VerifyChannel, sendId: number, code: string, target: string) {
  return verifyApi({ channel, action: "confirm", send_id: sendId, code, [channel === "sms" ? "hp" : "email"]: target });
}

// ── 아이디/비밀번호 찾기 (POST /api/v2/member/find, client_id 인증) — 서버사이드 전용 ──

type FindChannel = "hp" | "email"; // 아이디찾기 item / 비번찾기 channel(sms↔hp 매핑은 백엔드가 처리)
export type FoundId = { mid: number; uid: string; dt: string };

async function findApi(body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/member/find`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID, ...ipHeader(String(body.__ip || "") || undefined) },
      body: JSON.stringify((() => { const b = { ...body }; delete b.__ip; return b; })()),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: ((d.error as { message?: string })?.message) || "요청에 실패했습니다." };
    return { ok: true, data: d };
  } catch {
    return { ok: false, error: "통신 오류가 발생했습니다." };
  }
}

/** 아이디 찾기 — 이름 + (휴대폰|이메일) 일치 회원의 마스킹 아이디 목록. */
export async function findMemberId(input: { name: string; channel: FindChannel; contact: string; clientIp?: string }): Promise<{ ok: true; item: string; items: FoundId[] } | { ok: false; error: string }> {
  const r = await findApi({ action: "find_id", name: input.name, item: input.channel, [input.channel]: input.contact, __ip: input.clientIp });
  if (!r.ok) return r;
  const items = Array.isArray(r.data.items) ? (r.data.items as FoundId[]) : [];
  return { ok: true, item: String(r.data.item || input.channel), items };
}

/** 전체 아이디 SMS/이메일 발송. */
export async function sendFullMemberId(input: { mid: number; channel: FindChannel; name: string; contact: string; clientIp?: string }): Promise<{ ok: boolean; error?: string }> {
  const r = await findApi({ action: "id_send", mid: input.mid, item: input.channel, name: input.name, [input.channel]: input.contact, __ip: input.clientIp });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** 비밀번호 찾기 — 인증번호 발송. */
export async function pwFindSend(input: { uid: string; channel: FindChannel; contact: string; clientIp?: string }): Promise<{ ok: true; send_id: number; target: string } | { ok: false; error: string }> {
  const r = await findApi({ action: "pw_send", uid: input.uid, channel: input.channel === "hp" ? "sms" : "email", [input.channel]: input.contact, __ip: input.clientIp });
  if (!r.ok) return r;
  return { ok: true, send_id: Number(r.data.send_id || 0), target: String(r.data.target || "") };
}

/** 비밀번호 찾기 — 인증번호 확인. */
export async function pwFindConfirm(input: { uid: string; channel: FindChannel; contact: string; sendId: number; code: string; clientIp?: string }): Promise<{ ok: true; mid: number; reqUpw: number } | { ok: false; error: string }> {
  const r = await findApi({ action: "pw_confirm", uid: input.uid, channel: input.channel === "hp" ? "sms" : "email", [input.channel]: input.contact, send_id: input.sendId, code: input.code, __ip: input.clientIp });
  if (!r.ok) return r;
  return { ok: true, mid: Number(r.data.mid || 0), reqUpw: Number(r.data.req_upw || 0) };
}

/** 비밀번호 찾기 — 새 비밀번호로 변경(인증 재확인 포함). upw 는 평문(서버 라우트에서 복호화 후 전달). */
export async function pwFindReset(input: { uid: string; channel: FindChannel; contact: string; sendId: number; code: string; upw: string; clientIp?: string }): Promise<{ ok: boolean; error?: string }> {
  const r = await findApi({ action: "pw_reset", uid: input.uid, channel: input.channel === "hp" ? "sms" : "email", [input.channel]: input.contact, send_id: input.sendId, code: input.code, upw: input.upw, __ip: input.clientIp });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** 프록시 요청 헤더에서 실제 사용자 IP 추출 (XFF 첫 항목 → x-real-ip). 라우트에서 req.headers 로 호출. */
export function clientIpFromHeaders(h: Headers): string {
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return h.get("x-real-ip") || "";
}

// 실제 사용자 IP 를 백엔드로 전달하는 헤더. 백엔드 getClientIP 가 X-Forwarded-For 를 REMOTE_ADDR 보다 우선 사용한다.
// (서버사이드 BFF 호출이라 안 보내면 스타터 서버 IP 가 저장됨)
function ipHeader(clientIp?: string): Record<string, string> {
  return clientIp ? { "X-Forwarded-For": clientIp } : {};
}

/** 아이디 중복확인 — 비회원(client_id). (GET /api/v2/member/check) 서버사이드 전용.
 *  실패 시 available:true 로 처리(거짓 경고 방지 — 실제 중복은 가입 시 최종 검증). */
export async function checkUid(uid: string): Promise<{ available: boolean; uid: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !uid) return { available: true, uid };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/member/check?uid=${encodeURIComponent(uid)}`, {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      cache: "no-store",
    });
    if (!res.ok) return { available: true, uid };
    const d = (await res.json().catch(() => ({}))) as { available?: boolean; uid?: string };
    return { available: d.available !== false, uid: String(d.uid || uid) };
  } catch {
    return { available: true, uid };
  }
}

export type FooterBank = { code: string | null; name: string | null; num: string | null; holder: string | null };
export type ShopFooter = {
  service: string | null;
  company: string | null;
  ceo: string | null;
  seller: number | string | null;
  biznum: string | null;
  biznum_url: string | null;
  salenum: string | null;
  zipcode: string | null;
  addr1: string | null;
  addr2: string | null;
  tel: string | null;
  fax: string | null;
  email: string | null;
  worktime: string | null;
  pri_name: string | null;
  pri_email: string | null;
  banks: FooterBank[];
  hosting: { name: string; url: string | null };
  copyright: string | null;
};

/** 쇼핑몰 푸터 정보(회사/법적고지/계좌/호스팅) 조회 — 비회원(client_id). (GET /api/v2/shop/footer)
 *  백엔드 Redis 캐시(10분) 적용. 서버사이드 전용. 미설정/실패 시 null. */
export async function fetchFooter(): Promise<ShopFooter | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/shop/footer`, {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      // 캐시는 백엔드 Redis 가 주(主, 600초, 회사정보 저장 시 무효화). 스타터는 가벼운 60초 ISR.
      // 개발 3초 / 배포 10분. 관리자 수정 후 즉시 반영이 필요하면 revalidateTag("shop-footer") 로 퍼지(웹훅 연동 시).
      ...isrOpt(["shop-footer"]),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { data?: ShopFooter } | null;
    return j?.data ?? null;
  } catch {
    return null;
  }
}

/** 쇼핑몰 주문 정책 — 비회원(client_id). (GET /api/v2/shop/policy)
 *  order_guest: 0=비회원 주문 불가(로그인 필수) / 1=바로 가능 / 2=로그인 경유(로그인 화면에서 «비회원 구매» 선택).
 *  주문서 API 는 토큰/게스트 세션이 필요해, «인증 전» 화면(로그인)에서는 이 엔드포인트를 쓴다. */
export type ShopPolicy = { order_guest: number };

export async function fetchShopPolicy(): Promise<ShopPolicy | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/shop/policy`, {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      ...isrOpt(["shop-policy"]),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { data?: ShopPolicy } | null;
    return j?.data ?? null;
  } catch {
    return null;
  }
}

// ── 공지사항(notice) ──────────────────────────────────────────
// 통합 게시판(board_type=1)이면 cs_article_board(board_type='notice'), 아니면 cs_article_notice.
// 백엔드가 두 경우를 흡수해 같은 형태로 내려준다(board.unified 로 구분 가능).
export type Notice = {
  id: number;
  category: string | null;
  title: string | null;
  content: string | null;   // 통합=위지윅 HTML / 개별=평문 — 렌더 전 renderContent 로 정규화
  dt: string | null;
  views: number;
  name: string | null;      // 작성자
  fixed: number;            // 1=상단고정
  url?: string | null;
  video_src?: string | null;
  files?: InquiryFile[];
};
export type NoticeBoard = { unified: number; use_category: number; categories: string[] };
export type NoticeList = { total_count: number; items: Notice[]; board: NoticeBoard; fixeds: string[]; page: number };
const DEFAULT_NOTICE_BOARD: NoticeBoard = { unified: 0, use_category: 0, categories: [] };

function normalizeNotice(n: Notice): Notice {
  // 본문은 레거시/관리자가 쓴 HTML — 출력 전 새니타이즈(평문이면 줄바꿈 보존).
  return { ...n, content: n.content ? renderContent(n.content) : n.content };
}

export async function fetchNotices(opts: { page?: number; limit?: number; category?: string; q?: string } = {}): Promise<NoticeList> {
  const e = env();
  const page = Math.max(1, opts.page ?? 1);
  const limit = opts.limit ?? 20;
  const empty: NoticeList = { total_count: 0, items: [], board: DEFAULT_NOTICE_BOARD, fixeds: [], page };
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return empty;
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/notice`);
    u.searchParams.set("page", String(page));
    u.searchParams.set("limit", String(limit));
    // 카테고리 필터 / 제목 검색 — 백엔드가 board_type 에 맞는 컬럼(category|ar_ct, title|ar_title)으로 건다.
    if (opts.category) u.searchParams.set("category", opts.category);
    if (opts.q) u.searchParams.set("title", opts.q);
    // 기간 미지정 시 백엔드가 «오늘»로 기본 → 전체를 보려면 넓은 기간 명시(리뷰·문의와 동일).
    u.searchParams.set("period_start", "2000-01-01");
    u.searchParams.set("period_end", "2999-12-31");
    const res = await fetch(u.toString(), {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      // 검색어가 있으면 캐시하지 않는다(질의마다 결과가 달라 캐시 효율이 없다).
      ...(opts.q ? { cache: "no-store" as const } : isrOpt(["notices"])),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return empty;
    return {
      total_count: Number(j.total_count ?? 0),
      items: (Array.isArray(j.items) ? (j.items as Notice[]) : []).map(normalizeNotice),
      board: (j.board as NoticeBoard) ?? DEFAULT_NOTICE_BOARD,
      fixeds: Array.isArray(j.fixeds) ? j.fixeds.map(String) : [],
      page,
    };
  } catch { return empty; }
}

/** 공지 단건 — 단건 GET 엔드포인트가 없어 목록 API 의 id 필터를 쓴다(백엔드 setSQL 이 지원). */
export async function fetchNotice(id: number | string): Promise<Notice | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return null;
  const nid = Number(id);
  if (!Number.isInteger(nid) || nid <= 0) return null;
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/notice`);
    u.searchParams.set("id", String(nid));
    u.searchParams.set("limit", "1");
    const res = await fetch(u.toString(), {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      ...isrOpt([`notice-${nid}`]),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return null;
    const item = Array.isArray(j.items) ? (j.items[0] as Notice | undefined) : undefined;
    return item ? normalizeNotice(item) : null;
  } catch { return null; }
}

// ── 자주묻는 질문(FAQ) ─────────────────────────────────────────
// 통합 게시판(board_type=1)이면 cs_article_board(board_type='faq'), 아니면 cs_article_faq.
// 백엔드가 두 경우를 흡수해 같은 형태로 내려준다(board.unified 로 구분 가능).
export type Faq = {
  id: number;
  category: string | null;
  title: string | null;    // 질문
  content: string | null;  // 답변 — 통합=위지윅 HTML / 개별=평문. renderContent 로 정규화
  dt: string | null;
  views: number;
  url?: string | null;
  video_src?: string | null;
  files?: InquiryFile[];
};
export type FaqBoard = { unified: number; use_category: number; categories: string[] };
export type FaqList = { total_count: number; items: Faq[]; board: FaqBoard; page: number };
const DEFAULT_FAQ_BOARD: FaqBoard = { unified: 0, use_category: 0, categories: [] };

export async function fetchFaqs(opts: { page?: number; limit?: number; category?: string; q?: string } = {}): Promise<FaqList> {
  const e = env();
  const page = Math.max(1, opts.page ?? 1);
  const limit = opts.limit ?? 20;
  const empty: FaqList = { total_count: 0, items: [], board: DEFAULT_FAQ_BOARD, page };
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return empty;
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/faq`);
    u.searchParams.set("page", String(page));
    u.searchParams.set("limit", String(limit));
    // 기간 미지정 시 백엔드가 «오늘»로 기본 → 전체를 보려면 넓은 기간 명시.
    u.searchParams.set("period_start", "2000-01-01");
    u.searchParams.set("period_end", "2999-12-31");
    if (opts.category) u.searchParams.set("category", opts.category);
    if (opts.q) u.searchParams.set("title", opts.q);
    const res = await fetch(u.toString(), {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      // 검색어가 있으면 캐시하지 않는다(질의마다 결과가 달라 캐시 이득이 없다).
      ...(opts.q ? { cache: "no-store" as const } : isrOpt(["faqs"])),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return empty;
    return {
      total_count: Number(j.total_count ?? 0),
      items: (Array.isArray(j.items) ? (j.items as Faq[]) : []).map((f) => ({
        ...f,
        // 답변은 레거시/관리자가 쓴 HTML — 출력 전 새니타이즈(평문이면 줄바꿈 보존).
        content: f.content ? renderContent(f.content) : f.content,
      })),
      board: (j.board as FaqBoard) ?? DEFAULT_FAQ_BOARD,
      page,
    };
  } catch { return empty; }
}

// ── 상품 상세(스토어프론트 전용 API) ──────────────────────────
export type ProductViewOption = {
  id: number; label: string;
  o1: string | null; o2: string | null; o3: string | null;
  thumb?: string | null;   // 옵션별 대표 이미지(없으면 상품 대표이미지로 폴백)
  price: number; sale_price: number; stock: number; soldout: number;
  quantity_min: number; quantity_max: number; bundle: number; onoff: number;
};
export type ProductView = {
  id: number; title: string | null; category: string | null; summary: string | null;
  soldout: number; adult: number;
  // 상품 아이콘(상품명 위 표기) — 설정 없으면 null
  icon?: { id: number; title: string } | null;
  // 재입고 알림 — enabled=1 이면 품절 시 알림신청 노출 가능(옵션 없는 상품 한정).
  restock?: { enabled: number; mode: number; target: number };
  // 판매상태·접근 게이트. block="" 이면 구매가능. login/private/onoff/display/soldout/period/adult/level
  state: { block: string; logged_in: number; onoff: number; productoff: number; order_use: number; order_state: number; order_guide: string | null; level_order: number; level_view: number; price_open?: number; level_view_name?: string | null };
  // 타임세일(레거시 sale_dday) — active=1 이면 종료(remain_sec)까지 카운트다운 노출.
  timesale?: { active: number; onoff: number; start: string; end: string; remain_sec: number };
  // SEO(레거시 seo_use 시 seo_title/description/keywords, 아니면 상품명 폴백)
  seo: { title: string | null; description: string | null; keywords: string | null };
  // 상품 첨부 다운로드 파일(레거시 arrayDownload, productsupload_use=1). 토큰 포함 다운로드 URL.
  downloads: { title: string | null; name: string | null; size: string | null; download: string | null }[];
  option_type: number; option_titles: (string | null)[];
  quantity_type: number; quantity_min: number; quantity_max: number;
  price: { sale: number; original: number; sale_high: number; original_high: number; discount_percent: number; point: number; point_review?: number; point_review_photo?: number; coupon: number };
  gallery: { src: string; thumb: string }[];
  options: ProductViewOption[];
  addoption: number[];
  bulk_discount: { type: string; unit: string; tiers: { range: number; value: number }[] } | null;
  card_benefits: { card: string; months: string }[];
  request: { use: number; required: number; group: number; text: string | null; upload_use: number; upload_group: number; uploads: { title?: string; req?: number }[] };
  delivery: { use: number; fee: number; free_over: number; bundle: number; area1_price: number; area2_price: number; weight: number; parcel_type: number; parcel_title?: string; extra_charge: number; range2_from?: number; range2_price?: number; range3_from?: number; range3_price?: number; repeat_quantity?: number; guide: string | null; guide_detail: string | null; courier_type: number; direct_type: number; visit_type: string; country_type: number; night_use: number; dawn_use: number; country_price: number; night_price: number; dawn_price: number; overseas: { country: string; day: number; date: string | null; customs: number; return_price: number } | null };
  shipping: { delivery: string | null; exchange: string | null; as: string | null };
  information: { name: string; content: string }[];
  detail_html: string | null;
  // 동영상/오디오(레거시 getVideoHTML/getAudiosHTML/getVideosHTML) — video=임베드 HTML, audios/videos=업로드 파일.
  media?: {
    video: string | null;
    audios: { title: string | null; src: string; type: string }[];
    videos: { title: string | null; src: string; type: string; width?: number; height?: number }[];
    video_width: number; video_height: number;
  };
  report: { review_cnt: number; review_score: number; inquiry_cnt: number; order_cnt: number };
};

export type Addoption = { id: number; title: string; req_type: number; options: { name: string; price: number }[] };

/** 추가 주문옵션 조회 — /api/v2/addoptions?id=1,2,3. 상품의 addoption id 목록을 해석. */
export async function fetchAddoptions(ids: number[], token?: string): Promise<Addoption[]> {
  const e = env();
  if (!e.PROSELL_API_BASE || ids.length === 0) return [];
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/addoptions?id=${ids.join(",")}`, {
      headers: authHeaders(token), ...cacheOpt(token),
    });
    if (!res.ok) return [];
    const j = (await res.json().catch(() => null)) as { items?: Addoption[] } | null;
    const items = j?.items ?? [];
    // 요청한 순서 유지
    return ids.map((id) => items.find((a) => a.id === id)).filter(Boolean) as Addoption[];
  } catch {
    return [];
  }
}

/** 상품 상세 조회 — 신규 스토어프론트 API. (GET /api/v2/products/view/{id})
 *  로그인 토큰이면 등급가 반영(개인화 → no-store). 비회원은 공통가라 ISR 캐시(cacheOpt, 개발 3초/배포 10분). 없으면 null. */
export type ProductCoupon = {
  id: number; name: string; title: string; coupon_type: number;
  discount_type: number; discount_price: number; discount_percent: number;
  discount_max_price: number; discount_terms_price: number; level: number;
};

/** 상품에서 받을 수 있는 다운로드 쿠폰 목록(비회원도 조회). (GET /api/v2/products/coupon) 서버사이드 전용. */
export async function fetchProductCoupons(productsId: number | string): Promise<ProductCoupon[]> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return [];
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/products/coupon`);
    u.searchParams.set("products_id", String(productsId));
    // 다운로드 쿠폰 목록은 비회원 공통 데이터 → 공유 캐시(ISR, 개발 3초/배포 10분).
    const res = await fetch(u.toString(), { headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID }, ...isrOpt() });
    const j = await res.json().catch(() => null);
    return res.ok && Array.isArray(j?.data?.items) ? (j.data.items as ProductCoupon[]) : [];
  } catch { return []; }
}

/** 다운로드 쿠폰 발급(회원). (POST /api/v2/products/coupon) 서버사이드 전용. */
export async function downloadProductCoupon(token: string, couponId: number): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "쿠폰은 회원만 받을 수 있습니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/products/coupon`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ coupon_id: couponId }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: j?.error?.message || "쿠폰 다운로드에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "통신 오류가 발생했습니다." }; }
}

export async function fetchProductView(id: string, token?: string): Promise<ProductView | null> {
  const e = env();
  if (!e.PROSELL_API_BASE) return null;
  try {
    let res = await fetch(`${e.PROSELL_API_BASE}/api/v2/products/view/${encodeURIComponent(id)}`, {
      headers: authHeaders(token),
      ...cacheOpt(token),
    });
    // 무효 회원 토큰이면 비회원(client-id)으로 재시도 → 상세도 정상 노출(비회원 공개가).
    if (token && !res.ok) {
      res = await fetch(`${e.PROSELL_API_BASE}/api/v2/products/view/${encodeURIComponent(id)}`, {
        headers: authHeaders(undefined),
        ...cacheOpt(undefined),
      });
    }
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { data?: ProductView } | null;
    const data = j?.data ?? null;
    if (data) {
      // 이미지 호스트 정규화 — 갤러리/상세본문 이미지도 CDN(cdnpro.kr)으로.
      if (Array.isArray(data.gallery)) {
        data.gallery = data.gallery.map((g) => ({ src: imgUrl(g.src) ?? g.src, thumb: imgUrl(g.thumb) ?? g.thumb }));
      }
      if (typeof data.detail_html === "string") data.detail_html = rewriteContent(data.detail_html);
    }
    return data;
  } catch {
    return null;
  }
}

// ── 재입고 알림 (POST /api/v2/products/restock) — 서버사이드 전용 ──
function restockHeaders(token?: string, clientIp?: string): Record<string, string> {
  const e = env();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;      // 회원: mid 기반 프리필·갱신
  else h["X-App-Client-Id"] = e.PROSELL_CLIENT_ID;         // 비회원
  if (clientIp) h["X-Forwarded-For"] = clientIp;
  return h;
}

/** 재입고 알림 상태 확인 — 회원 프리필 휴대폰·기존 신청 여부. */
export async function restockCheck(productId: string, token?: string): Promise<{ ok: boolean; hp: string; is_update: boolean }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !/^[0-9]+$/.test(productId)) return { ok: false, hp: "", is_update: false };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/products/restock`, {
      method: "POST", headers: restockHeaders(token), body: JSON.stringify({ action: "check", product_id: productId }), cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as { hp?: string; is_update?: boolean };
    if (!res.ok) return { ok: false, hp: "", is_update: false };
    return { ok: true, hp: String(d.hp || ""), is_update: !!d.is_update };
  } catch { return { ok: false, hp: "", is_update: false }; }
}

/** 재입고 알림 신청/변경 — hp 는 숫자만(10~11). */
export async function restockSubmit(productId: string, hp: string, token?: string, clientIp?: string): Promise<{ ok: boolean; updated?: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !/^[0-9]+$/.test(productId)) return { ok: false, error: "상품을 확인해 주세요." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/products/restock`, {
      method: "POST", headers: restockHeaders(token, clientIp),
      body: JSON.stringify({ action: "submit", product_id: productId, hp: hp.replace(/\D/g, "") }), cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as { registered?: boolean; updated?: boolean; error?: { message?: string } };
    if (!res.ok || !d.registered) return { ok: false, error: d?.error?.message || "신청에 실패했습니다." };
    return { ok: true, updated: !!d.updated };
  } catch { return { ok: false, error: "통신 오류가 발생했습니다." }; }
}

// ── 디자인 페이지(이용약관/개인정보 처리방침 등) ────────────────
export type ShopPage = { pid: string; title: string | null; slogan: string | null; mode: number; content: string | null };

/** 디자인 페이지 조회 — 비회원(client_id). (GET /api/v2/page?pid=) 읽기 전용.
 *  pid 예: policy/privacy. 백엔드 Redis 캐시(10분) + ISR(개발 3초/배포 10분). 없으면 null. */
export async function fetchPage(pid: string): Promise<ShopPage | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !pid) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/page?pid=${encodeURIComponent(pid)}`, {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      ...isrOpt([`page-${pid}`]),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { data?: ShopPage } | null;
    return j?.data ?? null;
  } catch {
    return null;
  }
}

// ── 카테고리(네비게이션) ───────────────────────────────────────
export type CategoryNode = {
  id: number;
  title: string;
  code: string;       // 트리 경로. "1"(대분류) / "1-6"(중분류) / "1-6-30"(소분류)
  level: number;      // depth: 1=대분류, 2=중분류 …
  position: number;
  children: CategoryNode[];
};

type CategoryRow = { origin?: { id: number; onoff: number; title: string | null; code: string | null; position: number } };

/** 카테고리 트리 조회 — 비회원(client_id). (GET /api/v2/categories)
 *  onoff=1 만, code 로 부모-자식 트리 구성. 초기 렌더에서 1회 호출(ISR 300초 캐시 + 태그).
 *  ⇒ 100 TPS 여도 백엔드 호출은 5분당 ~1회. 서버사이드 전용. */
export async function fetchCategories(): Promise<CategoryNode[]> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return [];
  try {
    const u = `${e.PROSELL_API_BASE}/api/v2/categories?limit=1000&order=1&expand=origin`;
    const res = await fetch(u, {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      // 카테고리는 자주 안 바뀜 → 개발 3초 / 배포 10분. 관리자 변경 즉시 반영이 필요하면 revalidateTag("categories").
      ...isrOpt(["categories"]),
    });
    if (!res.ok) return [];
    const j = (await res.json().catch(() => null)) as { items?: CategoryRow[] } | null;
    const rows = (j?.items ?? [])
      .map((r) => r.origin)
      .filter((o): o is NonNullable<CategoryRow["origin"]> => !!o && o.onoff === 1 && !!o.code && !!o.title)
      .map((o) => ({ id: o.id, title: o.title, code: o.code as string, position: o.position }));
    return buildCategoryTree(rows);
  } catch {
    return [];
  }
}

/** 평평한 카테고리 목록을 code 기준 트리로 변환. 부모 code = 자신의 code 에서 마지막 '-구간' 제거. */
function buildCategoryTree(rows: { id: number; title: string | null; code: string; position: number }[]): CategoryNode[] {
  const byCode = new Map<string, CategoryNode>();
  for (const r of rows) {
    byCode.set(r.code, { id: r.id, title: r.title || "", code: r.code, level: r.code.split("-").length, position: r.position, children: [] });
  }
  const roots: CategoryNode[] = [];
  for (const node of byCode.values()) {
    const parentCode = node.code.includes("-") ? node.code.slice(0, node.code.lastIndexOf("-")) : "";
    const parent = parentCode ? byCode.get(parentCode) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (a: CategoryNode, b: CategoryNode) => a.position - b.position || a.id - b.id;
  const walk = (n: CategoryNode) => { n.children.sort(sort); n.children.forEach(walk); };
  roots.sort(sort);
  roots.forEach(walk);
  return roots;
}

/** code 로 카테고리 경로(조상→자신)를 찾는다. 예: "1-6" → [패션/뷰티, 여성의류]. 없으면 []. */
export function categoryPath(tree: CategoryNode[], code: string): CategoryNode[] {
  const path: CategoryNode[] = [];
  let level: CategoryNode[] = tree;
  const segs = code.split("-");
  for (let i = 0; i < segs.length; i++) {
    const prefix = segs.slice(0, i + 1).join("-");
    const node = level.find((n) => n.code === prefix);
    if (!node) break;
    path.push(node);
    level = node.children;
  }
  return path;
}

/** 회원가입 — 비회원(client_id)으로 신규 회원 생성. (POST /api/v2/member) */
export async function signup(input: SignupInput, clientIp?: string): Promise<SignupResult> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/member`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID, ...ipHeader(clientIp) },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { mid?: number; uid?: string; error?: { message?: string } };
    if (!res.ok || !data.mid) return { ok: false, error: data?.error?.message || "가입에 실패했습니다." };
    return { ok: true, mid: data.mid, uid: data.uid! };
  } catch {
    return { ok: false, error: "통신 오류가 발생했습니다." };
  }
}

export type LoginResult =
  | { ok: true; access_token: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number; mid: number; uid: string }
  | { ok: false; error: string };

/**
 * 회원 로그인 — 앱키(client_id+client_secret)로 백엔드가 직접 토큰을 발급받는다.
 * OAuth 리다이렉트 없이 uid/upw 로 바로 로그인. ⚠ 반드시 서버사이드에서만 호출(비밀번호·시크릿 노출 금지).
 */
export async function loginMember(uid: string, upw: string, clientIp?: string): Promise<LoginResult> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !e.PROSELL_CLIENT_SECRET) {
    return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  }
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/member/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ipHeader(clientIp) },
      body: JSON.stringify({ client_id: e.PROSELL_CLIENT_ID, client_secret: e.PROSELL_CLIENT_SECRET, uid, upw }),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    if (!res.ok || !d.access_token) return { ok: false, error: d?.error?.message || "로그인에 실패했습니다." };
    return {
      ok: true,
      access_token: String(d.access_token),
      refresh_token: d.refresh_token ? String(d.refresh_token) : undefined,
      expires_in: typeof d.expires_in === "number" ? d.expires_in : undefined,
      refresh_token_expires_in: typeof d.refresh_token_expires_in === "number" ? d.refresh_token_expires_in : undefined,
      mid: Number(d.mid || 0),
      uid: String(d.uid || uid),
    };
  } catch {
    return { ok: false, error: "통신 오류가 발생했습니다." };
  }
}

// ── 비회원 주문조회 (POST /api/v2/order/guest) — 서버사이드 전용 ──
export type GuestLookupInput = { tab: 0 | 1; name: string; dno?: string; hp?: string; sendId?: number; code?: string };

/** 비회원 주문조회 정책 — 휴대폰 조회에 SMS 인증이 필요한지(shop.guest_login). GET /api/v2/order/guest */
export async function guestHpVerifyRequired(): Promise<boolean> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return false;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/guest`, {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID }, cache: "no-store",
    });
    if (!res.ok) return false;
    const d = (await res.json().catch(() => ({}))) as { hp_verify_required?: boolean };
    return !!d.hp_verify_required;
  } catch { return false; }
}

/** 비회원 휴대폰 인증번호 발송 — 성명+휴대폰 일치 주문이 있을 때만. */
export async function guestHpSend(input: { name: string; hp: string; clientIp?: string }): Promise<{ ok: true; send_id: number } | { ok: false; error: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID, ...ipHeader(input.clientIp) },
      body: JSON.stringify({ action: "hp_send", name: input.name, hp: input.hp }),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    if (!res.ok || !d.send_id) return { ok: false, error: d?.error?.message || "인증번호 발송에 실패했습니다." };
    return { ok: true, send_id: Number(d.send_id) };
  } catch { return { ok: false, error: "통신 오류가 발생했습니다." }; }
}
export type GuestLookupResult =
  | { ok: true; access_token: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number; count: number }
  | { ok: false; error: string };

/** 비회원 주문조회 — 성명+주문번호(tab 0) 또는 성명+휴대폰(tab 1)으로 게스트 주문을 찾아 guest 토큰 발급. */
export async function guestOrderLookup(input: GuestLookupInput, clientIp?: string): Promise<GuestLookupResult> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !e.PROSELL_CLIENT_SECRET) {
    return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  }
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID, ...ipHeader(clientIp) },
      body: JSON.stringify({
        client_id: e.PROSELL_CLIENT_ID, client_secret: e.PROSELL_CLIENT_SECRET,
        tab: input.tab, name: input.name,
        ...(input.tab === 0 ? { dno: input.dno } : { hp: input.hp, send_id: input.sendId, code: input.code }),
      }),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    if (!res.ok || !d.access_token) return { ok: false, error: d?.error?.message || "일치하는 주문 정보가 없습니다." };
    return {
      ok: true,
      access_token: String(d.access_token),
      refresh_token: d.refresh_token ? String(d.refresh_token) : undefined,
      expires_in: typeof d.expires_in === "number" ? d.expires_in : undefined,
      refresh_token_expires_in: typeof d.refresh_token_expires_in === "number" ? d.refresh_token_expires_in : undefined,
      count: Number(d.count || 0),
    };
  } catch {
    return { ok: false, error: "통신 오류가 발생했습니다." };
  }
}

// 방금 주문한 비회원의 «재입력 없는» 조회 — 주문 시 cart_id(=list.user)로 소유 주문을 찾아 guest 토큰 발급.
// 주문완료 페이지에서 cart_id(httpOnly)만으로 gt 를 발급받아 바로 주문조회로 진입하게 한다.
export async function guestSessionFromCart(cartId: string, clientIp?: string): Promise<GuestLookupResult> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !e.PROSELL_CLIENT_SECRET) {
    return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  }
  if (!/^[\w-]{8,64}$/.test(cartId)) return { ok: false, error: "세션 식별자를 확인해 주세요." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID, ...ipHeader(clientIp) },
      body: JSON.stringify({ action: "session", client_id: e.PROSELL_CLIENT_ID, client_secret: e.PROSELL_CLIENT_SECRET, guest_id: cartId }),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    if (!res.ok || !d.access_token) return { ok: false, error: d?.error?.message || "조회할 주문이 없습니다." };
    return {
      ok: true,
      access_token: String(d.access_token),
      refresh_token: d.refresh_token ? String(d.refresh_token) : undefined,
      expires_in: typeof d.expires_in === "number" ? d.expires_in : undefined,
      refresh_token_expires_in: typeof d.refresh_token_expires_in === "number" ? d.refresh_token_expires_in : undefined,
      count: Number(d.count || 0),
    };
  } catch {
    return { ok: false, error: "통신 오류가 발생했습니다." };
  }
}

/** 비회원 주문조회 결과 목록 — 발급된 guest 토큰으로 order/search(guest 스코프) 조회. 기본 90일(≈3개월). */
export async function fetchGuestOrders(guestToken: string, opts: { page?: number; limit?: number } = {}): Promise<MemberOrderList> {
  return fetchMemberOrders(guestToken, { page: opts.page ?? 1, months: 3, limit: opts.limit ?? 20 });
}

/** refresh_token 으로 토큰 재발급(회전). 실패 시 ok:false. */
export async function refreshMember(refreshToken: string): Promise<LoginResult> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !e.PROSELL_CLIENT_SECRET) {
    return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  }
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/member/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: e.PROSELL_CLIENT_ID, client_secret: e.PROSELL_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: refreshToken }),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    if (!res.ok || !d.access_token) return { ok: false, error: d?.error?.message || "세션 갱신 실패" };
    return {
      ok: true,
      access_token: String(d.access_token),
      refresh_token: d.refresh_token ? String(d.refresh_token) : undefined,
      expires_in: typeof d.expires_in === "number" ? d.expires_in : undefined,
      refresh_token_expires_in: typeof d.refresh_token_expires_in === "number" ? d.refresh_token_expires_in : undefined,
      mid: Number(d.mid || 0),
      uid: String(d.uid || ""),
    };
  } catch {
    return { ok: false, error: "통신 오류가 발생했습니다." };
  }
}

export type SocialProvider = { provider: string; code: number; name: string; client_id: string; authorize_url: string; scope: string };

/** 활성화된 SNS 로그인 provider 목록 (버튼 렌더용). 미설정이면 빈 배열. */
export async function fetchSocialProviders(): Promise<SocialProvider[]> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return [];
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/member/social`, {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const d = (await res.json()) as { providers?: SocialProvider[] };
    return Array.isArray(d.providers) ? d.providers : [];
  } catch {
    return [];
  }
}

/**
 * SNS 인증 결과(code)를 API 로 전달 → 로그인/가입 처리 후 토큰 발급.
 * 스토어가 provider OAuth(authorize→code)를 마친 뒤 호출. ⚠ 서버사이드 전용(앱키 사용).
 */
// 소셜 프로필(가입 랜딩 프리필)
export type SocialProfile = { name: string; nick: string; email: string; hp: string; birth: string; gender: number };
// 소셜 결과: 기존 회원=로그인 토큰 / 신규=가입 랜딩용 wait.
export type SocialResult =
  | (LoginResult & { created?: boolean; wait?: false })
  | { ok: true; wait: true; wait_token: string; provider: string; profile: SocialProfile };

export async function socialLogin(provider: string, code: string, redirectUri: string, state = "", clientIp?: string): Promise<SocialResult> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !e.PROSELL_CLIENT_SECRET) {
    return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  }
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/member/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ipHeader(clientIp) },
      // state: 네이버 토큰 교환에 필수(authorize 때와 동일 값). 다른 provider 는 무시.
      body: JSON.stringify({ client_id: e.PROSELL_CLIENT_ID, client_secret: e.PROSELL_CLIENT_SECRET, provider, code, redirect_uri: redirectUri, state }),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    // 신규 소셜 → member_wait 임시저장(가입 랜딩으로). 토큰 없이 프로필/wait_token 반환.
    if (res.ok && d.status === "wait" && d.wait_token) {
      const pr = (d.profile ?? {}) as Partial<SocialProfile>;
      return {
        ok: true, wait: true, wait_token: String(d.wait_token), provider: String(d.provider || provider),
        profile: { name: String(pr.name || ""), nick: String(pr.nick || ""), email: String(pr.email || ""), hp: String(pr.hp || ""), birth: String(pr.birth || ""), gender: Number(pr.gender || 0) },
      };
    }
    if (!res.ok || !d.access_token) return { ok: false, error: d?.error?.message || "SNS 로그인에 실패했습니다." };
    return {
      ok: true,
      access_token: String(d.access_token),
      refresh_token: d.refresh_token ? String(d.refresh_token) : undefined,
      expires_in: typeof d.expires_in === "number" ? d.expires_in : undefined,
      refresh_token_expires_in: typeof d.refresh_token_expires_in === "number" ? d.refresh_token_expires_in : undefined,
      mid: Number(d.mid || 0),
      uid: String(d.uid || ""),
      created: Boolean(d.created),
    };
  } catch {
    return { ok: false, error: "통신 오류가 발생했습니다." };
  }
}

// 소셜 가입완료 입력 — 가입 랜딩에서 수집(약관/본인확인/추가정보).
export type SocialCompleteInput = {
  wait_token: string; provider: string;
  name?: string; nick?: string; email?: string; hp?: string; birth?: string; gender?: number;
  agree_service?: boolean; agree_privacy?: boolean; agree_age?: boolean;
  email_receive?: boolean; hp_receive?: boolean;
  // 본인인증(일반 회원가입과 동일): /member/verify 로 받은 send_id + 입력 코드, PASS 본인확인 certify_id
  send_hp_id?: number; hp_code?: string; send_email_id?: number; email_code?: string; certify_id?: string;
};

/** 소셜 가입완료 — member_wait + 랜딩 입력 → member 생성 + 토큰. (POST /api/v2/member/social {action:complete}) 서버사이드 전용. */
export async function completeSocialSignup(input: SocialCompleteInput, clientIp?: string): Promise<LoginResult & { created?: boolean }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !e.PROSELL_CLIENT_SECRET) return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/member/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ipHeader(clientIp) },
      body: JSON.stringify({ action: "complete", client_id: e.PROSELL_CLIENT_ID, client_secret: e.PROSELL_CLIENT_SECRET, ...input }),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    if (!res.ok || !d.access_token) return { ok: false, error: d?.error?.message || "가입 완료에 실패했습니다." };
    return {
      ok: true,
      access_token: String(d.access_token),
      refresh_token: d.refresh_token ? String(d.refresh_token) : undefined,
      expires_in: typeof d.expires_in === "number" ? d.expires_in : undefined,
      refresh_token_expires_in: typeof d.refresh_token_expires_in === "number" ? d.refresh_token_expires_in : undefined,
      mid: Number(d.mid || 0),
      uid: String(d.uid || ""),
      created: Boolean(d.created),
    };
  } catch { return { ok: false, error: "통신 오류가 발생했습니다." }; }
}

/** 페이스북 데이터 삭제 콜백 처리(정책 B: 회원탈퇴) — signed_request 를 백엔드에서 facebook_secret 으로 검증·탈퇴.
 *  백엔드는 confirmation_code 를 반환하고, 상태조회 url 은 호출부(콜백 라우트)가 origin 을 붙여 완성한다. 서버사이드 전용. */
export async function requestFacebookDeletion(signedRequest: string, clientIp?: string): Promise<{ ok: boolean; confirmation_code?: string; deleted?: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !e.PROSELL_CLIENT_SECRET) return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/member/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ipHeader(clientIp) },
      body: JSON.stringify({ action: "fb_deletion", client_id: e.PROSELL_CLIENT_ID, client_secret: e.PROSELL_CLIENT_SECRET, signed_request: signedRequest }),
      cache: "no-store",
    });
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
    if (!res.ok || !d.confirmation_code) return { ok: false, error: d?.error?.message || "삭제 처리에 실패했습니다." };
    return { ok: true, confirmation_code: String(d.confirmation_code), deleted: Boolean(d.deleted) };
  } catch { return { ok: false, error: "통신 오류가 발생했습니다." }; }
}

/** 가격 포맷 */
// won/formatPhone 은 클라이언트 컴포넌트도 쓰므로 서버 의존성 없는 lib/format 에 두고 재노출.
export { won, formatPhone } from "./format";

/** 표시용 대표가/정가 추출 */
export function priceOf(it: ProductItem): { price?: number; base?: number } {
  const b = it.benefit ?? {};
  // 현재 판매가: show_sale_price(타임세일·등급할인 반영, 레거시 권위값) 우선 →
  //             실서버 low_price(시간창 타임세일 미반영) → 데모 폴백 discount_price→price.
  const sale = (b.show_sale_price && b.show_sale_price > 0 ? b.show_sale_price : undefined)
    ?? b.low_price ?? b.discount_price ?? b.price;
  // 원가(정가): show_price 우선 → product_low_price → 데모 폴백 price. 판매가보다 클 때만 취소선.
  const original = (b.show_price && b.show_price > 0 ? b.show_price : undefined)
    ?? b.product_low_price ?? b.price;
  const base = original != null && sale != null && original > sale ? original : undefined;
  return { price: sale, base };
}

// 운영 이미지 호스트 정규화 — 이미지 정적파일은 CDN({shopid}.cdnpro.kr)에서 서빙한다.
// API 는 {shopid}.prosell.kr/upload/... 로 주기도 하므로, /upload 경로의 prosell.kr 호스트를 cdnpro.kr 로 치환.
// (프로토콜-상대·http/https 모두 대응. 커스텀 도메인은 건드리지 않음.)
function toCdnHost(u: string): string {
  return u.replace(/(:?\/\/)([a-z0-9-]+)\.prosell\.kr(?=\/upload)/gi, "$1$2.cdnpro.kr");
}

/**
 * 이미지 URL 정규화.
 *  - 로컬 도커: prosell 이 //{shop_id}.cdnpro.kr/... 로 주는데 그 CDN엔 파일이 없음.
 *    실제 파일은 로컬 nginx 에 있으므로 호스트를 PROSELL_IMAGE_BASE 로 치환.
 *  - 운영: PROSELL_IMAGE_BASE 미설정 → protocol-relative(//) 만 https 로 보정 + 이미지 호스트를 CDN(cdnpro.kr)으로.
 */
export function imgUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  const base = env().PROSELL_IMAGE_BASE;
  if (!base) return toCdnHost(u.startsWith("//") ? "https:" + u : u);
  const path = u.replace(/^(https?:)?\/\/[^/]+/, ""); // 스킴+호스트 제거 → 경로만
  return base.replace(/\/$/, "") + (path.startsWith("/") ? path : "/" + path);
}

/** 상세 본문 HTML 안의 이미지 호스트 치환.
 *  - 로컬 도커: cdnpro.kr / nginx 호스트를 PROSELL_IMAGE_BASE 로.
 *  - 운영: prosell.kr/upload 이미지 호스트를 CDN(cdnpro.kr)으로. */
export function rewriteContent(html?: string | null): string {
  if (!html) return "";
  const base = env().PROSELL_IMAGE_BASE;
  if (!base) return toCdnHost(html);
  const b = base.replace(/\/$/, "");
  return html
    .replace(/(https?:)?\/\/[a-z0-9.-]*cdnpro\.kr/gi, b)
    .replace(/https?:\/\/nginx/gi, b);
}

/** 대표 옵션 추출. 목록은 product_first, 상세는 product[0] 를 사용. */
export function optionOf(it: ProductItem): ProductOption | undefined {
  return it.product_first ?? it.product?.[0] ?? undefined;
}

export function thumbOf(it: ProductItem): string | undefined {
  // 목록은 images_thumb, 상세는 images. 둘 다 0번째가 대표(file_photo).
  // src(원본 파일명) 우선 — thumb 는 't' 접두사 축소본이라 상품 목록 이미지는 존재하지 않을 수 있음.
  const img = (it.images_thumb ?? it.images)?.[0];
  return imgUrl(img?.src || img?.thumb || img?.url);
}

/** 목록 카드 hover 시 전환할 두 번째 이미지(레거시 thumb2).
 *  두 번째가 «목록이미지(file_list)»일 때만 반환 — file_photo 폴백(1장 상품)은 제외해 hover 확대가 살아나도록. */
export function thumbHoverOf(it: ProductItem): string | undefined {
  const img = (it.images_thumb ?? it.images)?.[1];
  if (!img || img.field !== "file_list") return undefined;
  return imgUrl(img.src || img.thumb || img.url);
}

// ───────────────────────────────────────────────────────────────────────────
// 레거시 연동 주문(체크아웃) — 레거시 cart → oid 세션 → \Order\OrderCreate → o{YYMM}_*.
//   prepare(POST /api/v2/order/checkout/prepare) : 장바구니/바로구매 → oid 발행
//   session(GET  .../session?oid=)               : 주문서 표시(품목/합계)
//   submit (POST /api/v2/order/checkout)         : oid + 결제수단 → 주문 생성
// 인증: 회원 Bearer / 비회원 X-App-Client-Id + X-Guest-Id(cart_id).
// ───────────────────────────────────────────────────────────────────────────

export type PayMethodOpt = { method: number; label: string };
// 최근 주문에서 가져온 배송지(없으면 null). 주소록(SavedAddress)과 달리 id/is_default 없음.
export type RecentDelivery = {
  name: string; hp: string; tel: string;
  zipcode: string; addr1: string; addr2: string; admcode: string; place: string;
};
export type CheckoutInit = {
  buyer: { name: string; hp: string; email: string };
  point: number;
  recent?: RecentDelivery | null;
  banks: { code: string; num: string; holder: string; title: string }[];
  pg_id: number;
  taxinvoice?: number; // 1=세금계산서 발행 가능(무통장입금 한정)
  // 비회원 주문 정책 — 0=불가(로그인 필수) / 1=바로 가능 / 2=로그인 경유(로그인 화면에서 «비회원 구매» 선택)
  order_guest?: number;
  methods: { general: PayMethodOpt[]; easy: PayMethodOpt[]; bank: number; point: number };
};

export type CallbackState = {
  state: "complete" | "pending" | "failed";
  order_state: number;
  pay_state?: number;
  error_code?: string;
};

export type BuyItem = { line_key: string; products_id: number; product_id: number; kind: "opt" | "addo"; quantity: number; request?: string; orderupload?: string; delivery_type?: number };

export type CheckoutInput = {
  oid: string;          // prepare 로 발행된 주문 세션
  from_cart?: boolean;  // 장바구니 주문이면 true → 성공 시 장바구니 비움
  pay_payment: number;
  pay_method: number;
  pay_bank_code?: string;
  pay_bank_name?: string; // 입금자명
  name?: string; hp?: string; email?: string;
  receive_name: string; receive_hp: string; receive_tel?: string;
  receive_zipcode: string; receive_addr1: string; receive_addr2?: string; receive_admcode?: string;
  // 해외 배송지(해외배송)
  receive_country?: string; receive_postcode?: string; receive_state?: string; receive_city?: string; receive_detail?: string;
  delivery_message?: string;   // 배송 그룹 2개 이상이면 그룹 순서대로 "|" 결합
  delivery_msgtype?: number;   // 1=그룹별 개별 메시지
  point_price?: number;
  // 현금영수증 신청(무통장/가상계좌). type: 0/미전송=미신청, 1=소득공제, 2=지출증빙, 3=세금계산서.
  pay_receipt_type?: number;
  pay_receipt_num?: string;      // 소득공제=휴대폰/현금영수증카드, 지출증빙·세금계산서=사업자번호
  pay_receipt_name?: string;     // (세금계산서) 대표자명
  pay_receipt_email?: string;    // (세금계산서) 이메일
  pay_receipt_address?: string;  // (세금계산서) 사업장 주소
  pay_receipt_corpname?: string; // (세금계산서) 상호(법인명)
  pay_receipt_biztype?: string;  // (세금계산서) 업태
  pay_receipt_bizclass?: string; // (세금계산서) 종목
};

export type DeliveryGroup = { del_title: string };
export type CheckoutSession = {
  oid: string;
  from_mid?: number;                  // 세션 소유 회원 mid(>0 이면 회원 — 쿠폰 사용 가능)
  from_cart?: number;                 // 1=장바구니 주문(성공 시 장바구니 비움), 0=바로구매
  is_coupon_product?: number;         // 1=회원이 상품쿠폰 보유(품목별 쿠폰적용 버튼 노출)
  coupons?: { bundle: { id: number; price: number }; delivery: { id: number; price: number }; product_price: number }; // 적용된 쿠폰
  saved?: { name: string; hp: string; email: string; receive_name: string; receive_hp: string; receive_zipcode: string; receive_addr1: string; receive_addr2: string; receive_admcode: string; receive_country?: string; receive_postcode?: string; receive_state?: string; receive_city?: string; receive_detail?: string; delivery_message: string; delivery_msgtype: number; point_price: number }; // 증분 저장값(새로고침 복원)
  countries?: { code: string; name: string }[]; // 해외배송 배송가능 국가(레거시 shop.country_list) — 국가 셀렉트용
  delivery_cnt?: number;              // 배송 그룹 수(묶음배송 단위)
  delivery_groups?: DeliveryGroup[];  // 그룹별 제목(순서 = delivery_message "|" 인덱스)
  groups?: {
    key: string; supplier_title: string; shipping_fee: number;
    method?: number; method_name?: string; delivery_type?: number;
    parcel_title?: string; delivery_use?: number;
    basic_price?: number; free_price?: number; area1_price?: number; area2_price?: number;
    extra_charge?: number; weight?: number;
    range2_from?: number; range2_price?: number; range3_from?: number; range3_price?: number; repeat_quantity?: number;
    guide?: string; guide_detail?: string;
    overseas?: { country: string; day: number; date: string | null; customs: number; return_price: number } | null;
  }[]; // 배송그룹 메타(공급자 헤더/배송비/배송안내 전체)
  items: { products_id: number; line_id?: number; coupon_id?: number; coupon_price?: number; group?: string; supplier_title?: string; title: string; option_label: string; option_type?: number; thumb: string; qty: number; unit: number; line_total: number; item_total: number; original?: number; soldout: number; addoptions: { title: string; name: string; qty: number; unit: number; line_total: number }[]; uploads?: { title: string | null; name: string | null; download: string | null }[] }[];
  summary: {
    item_cnt: number;
    goods_price?: number;         // 상품 정가 합
    item_price: number;           // 할인 반영 상품금액
    level_discount?: number;      // 등급할인
    bulk_discount?: number;       // 대량구매 할인
    exclusive_discount?: number;  // 단독할인
    coupon_discount?: number;     // 쿠폰할인
    delivery_price: number;
    point_used?: number;          // 세션에 저장된 사용 적립금
    deposit_point?: number;       // 구매 적립예정
    point_allow?: number;         // 적립금 사용 가능(0=포인트 사용불가 상품 포함 → 입력란 숨김). 레거시 is_point 가드
    // 적립금 사용 조건(레거시 pay900_*). 0 = 제한 없음.
    point_order_min?: number;     // 판매가 합계(item_price) 이 값 이상이어야 사용 가능
    point_min?: number;           // 1회 최소 사용 포인트
    point_max?: number;           // 1회 최대 사용 포인트
    total_price: number;          // 적립금 반영 전 결제금액
  };
};

export type CheckoutResult =
  | { ok: true; pno: string; pg: number; payurl: string; polling: number }
  | { ok: false; code: string; message: string };

export type OrderResult = {
  pno: string; oid: string; state: number; title: string; dt: string;
  buyer: { name: string; hp: string; email: string };
  receiver: {
    name: string; hp: string; zipcode: string; addr1: string; addr2: string; message: string;
    is_overseas?: number; country?: string; country_name?: string; postcode?: string; state?: string; city?: string; detail?: string;
  };
  payment: {
    method: number; method_label: string; state: number; state_label: string;
    pay_price: number; item_price: number; delivery_price: number;
    delivery_type?: number; // 배송 3자리 코드(끝자리 0무료/1선불/2착불) — 배송비 표기 판정
    bank: { title: string; num: string; holder: string; sender: string; deadline: string } | null;
  };
  items: { prno: string; is_option: number; products_id: number; product_id: number; title: string; option_label: string; quantity: number; price: number; amount_price: number; thumb?: string }[];
};

// 체크아웃 인증 — 회원(token) 또는 비회원(guest 식별자=cart_id). 핸들러가 결정.
export type CheckoutAuth = { token?: string; guest?: string };
function checkoutHeaders(auth: CheckoutAuth, extra?: Record<string, string>): Record<string, string> {
  const e = env();
  const h: Record<string, string> = { Accept: "application/json", ...(extra ?? {}) };
  if (auth.token) h["Authorization"] = `Bearer ${auth.token}`;
  else { h["X-App-Client-Id"] = e.PROSELL_CLIENT_ID; if (auth.guest) h["X-Guest-Id"] = auth.guest; }
  return h;
}
function hasAuth(auth: CheckoutAuth): boolean { return !!auth.token || !!auth.guest; }

/** 주문서 초기화(구매자/은행/포인트/결제수단) */
export async function checkoutInit(auth: CheckoutAuth): Promise<CheckoutInit | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !hasAuth(auth)) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/checkout`, {
      method: "GET", cache: "no-store", headers: checkoutHeaders(auth),
    });
    const j = await res.json().catch(() => null);
    return res.ok && j?.data ? (j.data as CheckoutInit) : null;
  } catch { return null; }
}

/** 주문 세션 발행(prepare) — 장바구니 또는 바로구매(items). oid 반환 → /order/[oid] */
export async function prepareOrder(auth: CheckoutAuth, items?: BuyItem[], owner?: string, fromCart?: boolean): Promise<{ ok: true; oid: string; from: string } | { ok: false; code: string; message: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !hasAuth(auth)) return { ok: false, code: "CONFIG", message: "주문 권한이 없습니다." };
  try {
    // 장바구니 전체 주문은 표시(cart)와 동일한 소유자(owner=cart_id)로 세션을 만든다(소유자 불일치 CART_EMPTY 방지).
    // 선택주문(items+from_cart): 원본 cart 행을 계승해 결제완료 시 해당 항목을 비운다. 상품페이지 바로구매는 from_cart 없음.
    const payload = items && items.length ? { items, ...(fromCart ? { from_cart: 1 } : {}) } : (owner ? { owner } : {});
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/checkout/prepare`, {
      method: "POST", cache: "no-store",
      headers: checkoutHeaders(auth, { "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.data?.oid) {
      const err = j?.error ?? {};
      return { ok: false, code: err.code ?? "ERROR", message: err.message ?? "주문서 생성에 실패했습니다." };
    }
    return { ok: true, oid: String(j.data.oid), from: String(j.data.from || "cart") };
  } catch { return { ok: false, code: "NETWORK", message: "주문 요청 중 오류가 발생했습니다." }; }
}

export type CheckoutCoupon = {
  id: number; name: string; coupon_type: number;
  discount_type: number;        // 1=정액, 2=정률
  discount_price: number; discount_percent: number;
  discount_max_price: number; discount_terms_price: number;
  use_dt: string;
  category_title?: string;      // 카테고리 지정 쿠폰이면 분류명
  coupon_discount?: number;     // (상품쿠폰) 이 쿠폰 적용 시 할인액
  result_price?: number;        // (상품쿠폰) 할인 후 상품금액
};

// 상품쿠폰은 기준금액(base_price=추가옵션 제외 상품금액)·현재 적용쿠폰을 함께 반환.
export type CheckoutCouponList = { items: CheckoutCoupon[]; base_price?: number; applied_coupon_id?: number };

/** 체크아웃 쿠폰 후보 목록(회원 전용). type: bundle|delivery|product. product 는 id(cart_product.id) 필요. */
export async function fetchCheckoutCoupons(auth: CheckoutAuth, type: string, id?: number, oid?: string, ua?: string): Promise<CheckoutCouponList> {
  const e = env();
  if (!e.PROSELL_API_BASE || !auth.token) return { items: [] };
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/checkout/coupon`);
    u.searchParams.set("type", type);
    if (id && id > 0) u.searchParams.set("id", String(id));
    if (oid && /^[0-9]+$/.test(oid)) u.searchParams.set("oid", oid); // 묶음/배송쿠폰 사용가능 필터(주문 컨텍스트)
    // 실제 사용자 UA 전달 — service==2(모바일 전용) 쿠폰의 device 판정용(서버사이드 호출 보정).
    const extra = ua ? { "X-Client-UA": ua } : undefined;
    const res = await fetch(u.toString(), { method: "GET", cache: "no-store", headers: checkoutHeaders(auth, extra) });
    const j = await res.json().catch(() => null);
    const d = res.ok && j?.data ? j.data : {};
    return {
      items: Array.isArray(d.items) ? (d.items as CheckoutCoupon[]) : [],
      base_price: typeof d.base_price === "number" ? d.base_price : undefined,
      applied_coupon_id: typeof d.applied_coupon_id === "number" ? d.applied_coupon_id : undefined,
    };
  } catch { return { items: [] }; }
}

/** 체크아웃 쿠폰 적용/해제(회원). coupon_id=0 → 해제. (POST /api/v2/order/checkout/coupon) */
export async function applyCheckoutCoupon(
  auth: CheckoutAuth,
  body: { oid: string; type: string; id?: number; coupon_id: number },
): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !auth.token) return { ok: false, error: "쿠폰은 회원만 사용할 수 있습니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/checkout/coupon`, {
      method: "POST", cache: "no-store",
      headers: checkoutHeaders(auth, { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: j?.error?.message || "쿠폰 적용에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "통신 오류가 발생했습니다." }; }
}

/** 주문 세션 조회(oid) — 표시용 품목 + 합계. admcode 를 주면 도서산간/제주 배송 할증을 반영해 견적. */
export async function getCheckoutSession(auth: CheckoutAuth, oid: string, admcode = ""): Promise<CheckoutSession | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !hasAuth(auth)) return null;
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/checkout/session`);
    u.searchParams.set("oid", oid);
    if (/^[0-9]{1,10}$/.test(admcode)) u.searchParams.set("admcode", admcode);
    const res = await fetch(u.toString(), {
      method: "GET", cache: "no-store", headers: checkoutHeaders(auth),
    });
    const j = await res.json().catch(() => null);
    return res.ok && j?.data ? (j.data as CheckoutSession) : null;
  } catch { return null; }
}

/** 주문서 입력값 증분 저장(POST session). 레거시처럼 입력 즉시 cart_order 에 저장 → 새로고침 복원. */
export async function saveCheckoutSession(auth: CheckoutAuth, oid: string, fields: Record<string, string | number>): Promise<boolean> {
  const e = env();
  if (!e.PROSELL_API_BASE || !hasAuth(auth)) return false;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/checkout/session`, {
      method: "POST", cache: "no-store",
      headers: { ...checkoutHeaders(auth), "Content-Type": "application/json" },
      body: JSON.stringify({ oid, ...fields }),
    });
    return res.ok;
  } catch { return false; }
}

/** 주문 생성(체크아웃). 멱등키로 중복주문 방지. */
export async function checkoutOrder(auth: CheckoutAuth, input: CheckoutInput, idempotencyKey: string): Promise<CheckoutResult> {
  const e = env();
  if (!e.PROSELL_API_BASE || !hasAuth(auth)) return { ok: false, code: "CONFIG", message: "주문 권한이 없습니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/checkout`, {
      method: "POST", cache: "no-store",
      headers: checkoutHeaders(auth, { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }),
      body: JSON.stringify(input),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.data) {
      const err = j?.error ?? {};
      return { ok: false, code: err.code ?? "ERROR", message: err.message ?? "주문에 실패했습니다." };
    }
    const d = j.data;
    return { ok: true, pno: String(d.pno), pg: Number(d.pg) || 0, payurl: String(d.payurl || ""), polling: Number(d.polling) || 0 };
  } catch { return { ok: false, code: "NETWORK", message: "주문 요청 중 오류가 발생했습니다." }; }
}

/** 결제 상태 폴링(PG) — complete/pending/failed */
export async function pollOrderCallback(auth: CheckoutAuth, pno: string): Promise<CallbackState | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !hasAuth(auth)) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/checkout/callback?pno=${encodeURIComponent(pno)}`, {
      method: "GET", cache: "no-store", headers: checkoutHeaders(auth),
    });
    const j = await res.json().catch(() => null);
    return res.ok && j?.data ? (j.data as CallbackState) : null;
  } catch { return null; }
}

/** 주문 완료 조회(pno) */
export async function getOrderResult(auth: CheckoutAuth, pno: string): Promise<OrderResult | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !hasAuth(auth)) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/checkout/result?pno=${encodeURIComponent(pno)}`, {
      method: "GET", cache: "no-store", headers: checkoutHeaders(auth),
    });
    const j = await res.json().catch(() => null);
    return res.ok && j?.data ? (j.data as OrderResult) : null;
  } catch { return null; }
}

// ── 회원 주문내역(마이페이지) — 운영자 MCP 목록과 동일한 order/search 를 회원 스코프로 사용.
//   백엔드가 토큰 mid 로 자동 필터(l.mid=본인)하므로 별도 소유자 파라미터 불필요.
export type MemberOrderItem = {
  product: {
    prno: number; dno: number; products_id: number; product_id?: number; item_type: number; // item_type 0·10=상품 / 1=추가옵션 · product_id=주문 옵션id(교환대상 판별용)
    products_title: string | null; pro_title: string | null; product_name: string | null;
    products_option_type: number; option_title: string | null; option_name: string | null;
    pro_quantity: number; pro_state: number; product_price: number; option_price: number;
    pro_review_id?: number;   // 작성된 상품평 id(>0 이면 상품평 등록 완료)
    // 취소 상품(취소내역) — 취소 수량·금액·할인
    can_pro_quantity?: number; can_pro_amount_price?: number; can_pro_price?: number;
    can_pro_discount_price?: number; can_pro_coupon_price?: number; can_pro_bundle_price?: number;
    // 반품 상품(반품내역) — 반품 수량·금액·할인
    ref_pro_quantity?: number; ref_pro_amount_price?: number; ref_pro_price?: number;
    ref_pro_discount_price?: number; ref_pro_coupon_price?: number; ref_pro_bundle_price?: number;
    pro_price?: number;       // 할인 전 라인 금액(정가×수량) — pro_amount_price = pro_price - 할인
    pro_amount_price: number; // 최종 결제금액(라인 합계, 수량·할인·쿠폰 반영) — 표시용 권위 필드
    pro_point?: number;       // 이 품목 구매 적립예정 포인트(레거시 amount_fix_point 합산 요소)
    // 할인 내역(툴팁용) — pro_discount_price(상품할인=즉시+등급+대량 합) / 쿠폰·추가할인 / 대량·등급 분리값
    pro_discount_price?: number; pro_coupon_price?: number; pro_bundle_price?: number; pro_double_price?: number;
    pro_bulk_discount_price?: number; level_discount_price?: number;
  };
  delivery?: {
    dno: number; del_state: number; del_price: number; del_split: number; del_type: number;
    del_payment?: number; del_use?: number; // 배송지 변경 조건·해외(del_use==2) 판정
    del_product_cnt?: number; // 배송그룹 상품수 — 상품평 적립 계산용
    del_message?: string | null;
    // 수신자(배송지) — 국내/해외 공통(암호화 필드는 서버가 복호화해 내려줌)
    rec_name?: string | null; rec_hp?: string | null; rec_tel?: string | null; rec_place?: string | null; rec_admcode?: string | null;
    rec_zipcode?: string | null; rec_addr1?: string | null; rec_addr2?: string | null;
    rec_country?: string | null; rec_postcode?: string | null; rec_state?: string | null; rec_city?: string | null; rec_detail?: string | null;
    // 매장방문 수령(del_type 4xx) — 매장명/전화/주소/안내
    del_store_title?: string | null; del_store_tel?: string | null; del_store_content?: string | null;
    del_store_zipcode?: string | null; del_store_addr1?: string | null; del_store_addr2?: string | null;
    // 퀵(2xx)·직접(3xx) 배송 담당(기사) — 담당명/연락처/안내 + 직접 배송예정일(del_dt)
    del_move_title?: string | null; del_move_hp?: string | null; del_move_msg?: string | null; del_dt?: string | null;
  };
  tracking?: { tr_state: string | null; tr_place: string | null; tr_dt: string | null } | null;
  images?: { field: string; thumb: string; src: string }[];
  // 액션 버튼 노출 플래그(레거시 order/list field-option). 동작은 추후 연결 — 현재는 노출만.
  actions?: {
    pay_state: number;
    can_decide: number; can_cancel: number; unpaid?: number; can_review: number; can_refund: number; can_exchange: number;
    can_view_exchange: number; can_view_refund: number; can_receive: number;
    can_tracking: number; tracking_url: string;
  };
};
export type MemberOrder = {
  order: {
    ono: number; state: number; ct?: number; dt: string; cancel_no: string | null; refund_no: string | null; exchange_no: string | null;
    name?: string | null; hp?: string | null; email?: string | null; // 주문자
    delivery_coupon_price?: number; delivery_coupon_title?: string | null; // 배송할인 쿠폰(주문 전체)
  };
  payment: {
    pno: number; pay_method: number; pay_price: number; pay_state?: number;
    pay_discount_price?: number; pay_point?: number; pay_point_price?: number; pay_change_price?: number; // 할인·적립금 사용·적립예정·변경금액
    // 무통장 입금정보
    pay_bank_title?: string | null; pay_bank_num?: string | null; pay_bank_holder?: string | null; pay_bank_name?: string | null; pay_bank_dt?: string | null;
    // 카드
    pay_card_name?: string | null; pay_card_inst?: number;
    // 영수증/전표 URL(있을 때만 버튼 노출)
    pay_bill_url?: string | null; pay_receipt_url?: string | null;
    receipt_transaction_url?: string | null; receipt_order_url?: string | null; receipt_tax_url?: string | null;
  };
  items: MemberOrderItem[];
};
export type MemberOrderList = { total_count: number; orders: MemberOrder[]; page: number; months: number };

/** 회원 주문내역 조회. (GET /api/v2/order/search) 서버사이드 전용.
 *  months=조회 기간(개월). start/end(YYYY-MM-DD) 를 주면 직접 기간으로 override. */
export async function fetchMemberOrders(token: string, opts: { page?: number; months?: number; limit?: number; start?: string; end?: string } = {}): Promise<MemberOrderList> {
  const e = env();
  const page = Math.max(1, opts.page ?? 1);
  const months = opts.months ?? 3;
  const limit = opts.limit ?? 10;
  const empty: MemberOrderList = { total_count: 0, orders: [], page, months };
  if (!e.PROSELL_API_BASE || !token) return empty;
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  // 직접 기간(start/end) 우선, 없으면 최근 months 개월. 월별 테이블 UNION 이라 과도한 범위는 지양.
  let periodStart: string, periodEnd: string;
  if (opts.start && opts.end && dateRe.test(opts.start) && dateRe.test(opts.end)) {
    periodStart = opts.start; periodEnd = opts.end;
  } else {
    const end = new Date();
    const start = new Date(); start.setMonth(start.getMonth() - months);
    periodStart = ymd(start); periodEnd = ymd(end);
  }
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/search`);
  u.searchParams.set("expand", "order,payment,product,images,delivery,tracking");
  u.searchParams.set("period_start", periodStart);
  u.searchParams.set("period_end", periodEnd);
  u.searchParams.set("page", String(page));
  u.searchParams.set("limit", String(limit));
  // 주문내역 노출 상품 상태 — 정상 흐름 + 취소접수·반품접수(진행중은 노출, 완료는 제외).
  // 주문내역은 취소완료(990)·반품완료(980)만 제외하고 전부 노출.
  //  1입금대기·100결제완료·110해외2차·120준비중·130발송지연·190/900취소접수·210배송중·290배송완료
  //  ·300~340교환접수·390교환완료·500구매확정·800~830반품접수. (레거시 ProductStateCode.codeProduct 코드 전체)
  [1, 100, 110, 120, 130, 190, 210, 290, 300, 310, 320, 330, 340, 390, 500, 800, 810, 820, 830, 900].forEach((s) => u.searchParams.append("pro_state[]", String(s)));
  try {
    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    if (!res.ok) return empty;
    const j = await res.json().catch(() => null);
    return {
      total_count: Number(j?.total_count ?? 0),
      orders: Array.isArray(j?.orders) ? (j.orders as MemberOrder[]) : [],
      page, months,
    };
  } catch { return empty; }
}

// 마이페이지 대시보드 주문 요약 — 상태 버킷별 주문 건수(기간 내, DISTINCT 주문 기준).
//  · orders: 배송 단계 파이프라인(입금대기→준비중→배송중→배송완료) + 구매확정 + total
//  · claims: 진행중 클레임(취소접수/반품접수/교환접수)
// 상태별 집계는 order/search 에 없어 전용 엔드포인트(GET /api/v2/order/summary)를 사용한다.
export type OrderSummary = {
  period: { start: string; end: string };
  orders: { paywait: number; preparing: number; shipping: number; delivered: number; confirmed: number; total: number };
  claims: { cancel: number; refund: number; exchange: number };
};

const EMPTY_ORDER_SUMMARY: OrderSummary = {
  period: { start: "", end: "" },
  orders: { paywait: 0, preparing: 0, shipping: 0, delivered: 0, confirmed: 0, total: 0 },
  claims: { cancel: 0, refund: 0, exchange: 0 },
};

/** 대시보드 주문 요약. (GET /api/v2/order/summary) 회원/게스트 스코프. 서버사이드 전용. */
export async function fetchOrderSummary(token: string, months = 3): Promise<OrderSummary> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return EMPTY_ORDER_SUMMARY;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/summary?months=${months}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return EMPTY_ORDER_SUMMARY;
    const o = j.orders ?? {};
    const c = j.claims ?? {};
    const n = (x: unknown) => Number(x ?? 0) || 0;
    return {
      period: { start: String(j.period?.start ?? ""), end: String(j.period?.end ?? "") },
      orders: {
        paywait: n(o.paywait), preparing: n(o.preparing), shipping: n(o.shipping),
        delivered: n(o.delivered), confirmed: n(o.confirmed), total: n(o.total),
      },
      claims: { cancel: n(c.cancel), refund: n(c.refund), exchange: n(c.exchange) },
    };
  } catch { return EMPTY_ORDER_SUMMARY; }
}

// 취소 내역(회원) — GET /api/v2/order/cancel. cancel(취소정보) + items(취소 상품).
export type MemberCancel = {
  cancel: {
    cno: number; ono: number; pno: number; can_state: number; can_type: number; can_title: string | null;
    can_content?: string | null; can_method?: number;
    can_price: number; can_tax_price?: number; can_free_price?: number; can_vat_price?: number;
    can_discount_price?: number; can_delivery_price?: number; can_delivery_coupon_price?: number; can_coupon?: number;
    can_point: number; can_benefit_price?: number; can_dt: string; can_confirm_dt: string;
    can_bank_code?: number; can_bank_title?: string | null; can_bank_num?: string | null; can_bank_holder?: string | null;
    // 취소 영수증/전표(레거시 cancel 하단 버튼)
    can_bill_type?: number; can_bill_url?: string | null; can_receipt_no?: string | null; can_receipt_url?: string | null;
  };
  order: { ono: number; dt: string; name?: string | null };
  payment?: { pno?: number; pay_dt?: string | null; pay_state?: number };
  items: MemberOrderItem[];
};
export type MemberCancelList = { total_count: number; cancels: MemberCancel[]; page: number; months: number };

/** 회원 취소내역 조회. (GET /api/v2/order/cancel) 회원 스코프(mid). 주문내역과 동일 기간 파라미터. */
export async function fetchMemberCancels(token: string, opts: { page?: number; months?: number; limit?: number; start?: string; end?: string } = {}): Promise<MemberCancelList> {
  const e = env();
  const page = Math.max(1, opts.page ?? 1);
  const months = opts.months ?? 3;
  const limit = opts.limit ?? 10;
  const empty: MemberCancelList = { total_count: 0, cancels: [], page, months };
  if (!e.PROSELL_API_BASE || !token) return empty;
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  let periodStart: string, periodEnd: string;
  if (opts.start && opts.end && dateRe.test(opts.start) && dateRe.test(opts.end)) {
    periodStart = opts.start; periodEnd = opts.end;
  } else {
    const end = new Date();
    const start = new Date(); start.setMonth(start.getMonth() - months);
    periodStart = ymd(start); periodEnd = ymd(end);
  }
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/cancel`);
  u.searchParams.set("expand", "cancel,order,product,images");
  u.searchParams.set("period_start", periodStart);
  u.searchParams.set("period_end", periodEnd);
  u.searchParams.set("page", String(page));
  u.searchParams.set("limit", String(limit));
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return empty;
    const j = await res.json().catch(() => null);
    return {
      total_count: Number(j?.total_count ?? 0),
      cancels: Array.isArray(j?.orders) ? (j.orders as MemberCancel[]) : [],
      page, months,
    };
  } catch { return empty; }
}

/** 취소 상세 조회(cno) — 회원 스코프. */
export async function fetchMemberCancelByCno(token: string, cno: string): Promise<MemberCancel | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token || !/^[0-9]+$/.test(cno)) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/cancel`);
  u.searchParams.set("expand", "cancel,order,payment,product,images");
  u.searchParams.set("cno_ids", cno);
  u.searchParams.set("limit", "1");
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    const list = Array.isArray(j?.orders) ? (j.orders as MemberCancel[]) : [];
    return list[0] ?? null;
  } catch { return null; }
}

// 반품 내역(회원) — GET /api/v2/order/refund. refund(반품정보, 중첩 addressInfo/paymentInfo/benefitInfo) + items(반품 상품).
export type MemberRefund = {
  refund: {
    rno: number; ono: number; pno: number; dno: number; ppno: number;
    ref_state: number; ref_type: number; ref_supplier: number;
    ref_title: string | null; ref_ct: string | null; ref_content: string | null;
    ref_name?: string | null; ref_dt: string; ref_confirm?: string | null; ref_confirm_dt?: string | null;
    addressInfo: {
      ref_ret_name: string | null; ref_ret_hp?: string | null;
      ref_ret_zipcode: string | null; ref_ret_addr1: string | null; ref_ret_addr2: string | null;
      ref_ret_country?: string | null; ref_ret_postcode?: string | null; ref_ret_state?: string | null;
      ref_ret_city?: string | null; ref_ret_detail?: string | null;
      ref_ret_type: number; ref_ret_parcel: number; ref_ret_num?: string | null;
      ref_ret_parcel_title?: string | null; ref_ret_tracking_url?: string | null;
      // 퀵/직접 회수 담당(회수업체·기사) + 방문수령 매장/주소
      ref_ret_mtitle?: string | null; ref_ret_mhp?: string | null; ref_ret_mmsg?: string | null;
      ref_ret_dt1?: string | null; // 직접 회수 예정일
      ref_ret_stitle?: string | null; ref_ret_stel?: string | null; ref_ret_scontent?: string | null; ref_ret_store_addr?: string | null;
    };
    // 개인결제(반품 추가비용) — pay_state<10 이면 미결제(회원 결제 필요)
    private?: {
      ppno: number; private_no: string; title: string | null;
      pay_price: number; pay_currency: string; pay_method: number; pay_state: number;
    } | null;
    paymentInfo: {
      ref_method: number;
      ref_del_cost: number; ref_ret_cost: number;   // 배송/회수비 부담 플래그(0=협의)
      ref_del_price: number; ref_ret_price: number; ref_deduct_price: number;
      ref_price: number; ref_tax_price: number; ref_free_price: number; ref_vat_price: number;
      ref_bring_price: number; ref_point: number;
      ref_bank_code: number; ref_bank_title: string | null; ref_bank_num: string | null; ref_bank_holder: string | null;
    };
    benefitInfo: {
      ref_discount_price: number; ref_product_coupon_price: number; ref_bundle_coupon_price: number;
      ref_delivery_price: number; ref_delivery_coupon_price: number;
      ref_amt_pro_price: number; ref_benefit_price: number;
    };
  };
  order: { ono: number; dt: string; name?: string | null };
  payment?: {
    pno?: number; pay_dt?: string | null; pay_state?: number; pay_method?: number; pay_currency?: string;
    pay_bill_type?: number; pay_bill_url?: string | null; pay_receipt_no?: string | null; pay_receipt_url?: string | null;
  };
  items: MemberOrderItem[];
};
export type MemberRefundList = { total_count: number; refunds: MemberRefund[]; page: number; months: number };

/** 회원 반품내역 조회. (GET /api/v2/order/refund) 회원 스코프(mid). 주문내역과 동일 기간 파라미터. */
export async function fetchMemberRefunds(token: string, opts: { page?: number; months?: number; limit?: number; start?: string; end?: string; state?: number | number[] } = {}): Promise<MemberRefundList> {
  const e = env();
  const page = Math.max(1, opts.page ?? 1);
  const months = opts.months ?? 3;
  const limit = opts.limit ?? 10;
  const empty: MemberRefundList = { total_count: 0, refunds: [], page, months };
  if (!e.PROSELL_API_BASE || !token) return empty;
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  let periodStart: string, periodEnd: string;
  if (opts.start && opts.end && dateRe.test(opts.start) && dateRe.test(opts.end)) {
    periodStart = opts.start; periodEnd = opts.end;
  } else {
    const end = new Date();
    const start = new Date(); start.setMonth(start.getMonth() - months);
    periodStart = ymd(start); periodEnd = ymd(end);
  }
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/refund`);
  u.searchParams.set("expand", "refund,order,product,images");
  u.searchParams.set("period_start", periodStart);
  u.searchParams.set("period_end", periodEnd);
  u.searchParams.set("page", String(page));
  u.searchParams.set("limit", String(limit));
  // 반품상태 필터(ref_state) — 단일값(ref_state) 또는 배열(ref_state[])로 다중 상태 필터. 미지정=전체.
  if (Array.isArray(opts.state)) {
    for (const s of opts.state) if (Number.isInteger(s) && s > 0) u.searchParams.append("ref_state[]", String(s));
  } else if (typeof opts.state === "number" && opts.state > 0) {
    u.searchParams.set("ref_state", String(opts.state));
  }
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return empty;
    const j = await res.json().catch(() => null);
    return {
      total_count: Number(j?.total_count ?? 0),
      refunds: Array.isArray(j?.orders) ? (j.orders as MemberRefund[]) : [],
      page, months,
    };
  } catch { return empty; }
}

/** 반품 상세 조회(rno) — 회원 스코프. */
export async function fetchMemberRefundByRno(token: string, rno: string): Promise<MemberRefund | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token || !/^[0-9]+$/.test(rno)) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/refund`);
  u.searchParams.set("expand", "refund,order,payment,product,images");
  u.searchParams.set("rno_ids", rno);
  u.searchParams.set("limit", "1");
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    const list = Array.isArray(j?.orders) ? (j.orders as MemberRefund[]) : [];
    return list[0] ?? null;
  } catch { return null; }
}

/** 반품 회수 운송장 등록(PUT /api/v2/order/refund/parcel) — 회원 스코프. 회수중·택배건만. 성공 시 {ok:true}. */
export async function updateRefundParcel(token: string, input: { rno: string; ref_ret_num: string }): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/refund/parcel`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "운송장 등록에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "운송장 등록 요청 중 오류가 발생했습니다." }; }
}

// 개인결제 내역(회원) — GET /api/v2/order/privatepay. 본인(mid) 개인결제창 목록.
export type MemberPrivatePay = {
  ppno: number; no: string; ct: number; ct_text: string;
  title: string; content: string;
  price: number; pay_price: number; pay_currency: string;
  pay_state: number; pay_state_text: string;
  pay_method: number; pay_method_text: string;
  pay_dt: string | null; dt: string;
  dno: number | null; rno: number | null; eno: number | null;
  product_title?: string | null; // 주문(dno) 연동 시 관련 상품명(외 N종) — 결제내용 대신 표기
  // 완료 결제 영수증/전표(회원 목록 전용)
  pay_bill_type?: number; pay_bill_url?: string | null;
  pay_receipt_no?: string | null; pay_receipt_url?: string | null;
  url: string; // 외부 개인결제창 URL(결제 전 결제하기)
};
export type MemberPrivatePayList = { total_count: number; total_page: number; page: number; items: MemberPrivatePay[] };

/** 회원 개인결제 내역 조회. (GET /api/v2/order/privatepay) 회원 스코프(본인 mid). 페이지네이션. */
export async function fetchMemberPrivatePays(token: string, opts: { page?: number; limit?: number } = {}): Promise<MemberPrivatePayList> {
  const e = env();
  const page = Math.max(1, opts.page ?? 1);
  const limit = opts.limit ?? 10;
  const empty: MemberPrivatePayList = { total_count: 0, total_page: 1, page, items: [] };
  if (!e.PROSELL_API_BASE || !token) return empty;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/privatepay`);
  u.searchParams.set("page", String(page));
  u.searchParams.set("limit", String(limit));
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return empty;
    const j = await res.json().catch(() => null);
    return {
      total_count: Number(j?.total_count ?? 0),
      total_page: Number(j?.total_page ?? 1),
      page,
      items: Array.isArray(j?.items) ? (j.items as MemberPrivatePay[]) : [],
    };
  } catch { return empty; }
}

// 개인결제 결제창(회원) — GET/POST /api/v2/order/privatepay/pay. 마이페이지 "결제하기" 팝업.
export type PrivatePayCompany = { name: string; ceo: string; biznum: string; salenum: string; addr: string; tel: string; email: string; service: string };
// 무통장(300)·가상계좌(130) 입금계좌 — 주문완료 페이지와 동일.
export type PrivatePayBank = { method: number; title: string; num: string; holder: string; sender: string; deadline: string; amount: number };
export type PrivatePayCheckoutInit = {
  ppno: number; no: string; paid: number; pay_state: number;
  ct: number; ct_text: string; title: string; content: string;
  product_title: string | null; thumb: string | null;
  price: number; pay_price: number; pay_currency: string;
  pay_method?: number;
  banks: { code: string; num: string; holder: string; title: string }[];
  methods: { general: PayMethodOpt[]; easy: PayMethodOpt[]; bank: number };
  company?: PrivatePayCompany; // 팝업 푸터 사업자 정보
  bank?: PrivatePayBank | null; // 이미 입금대기(무통장/가상계좌)면 입금계좌
};
export type PrivatePaySubmit =
  | { ok: true; ppno: number; no: string; pg: number; payurl: string; polling: number }
  | { ok: false; code?: string; error: string };
export type PrivatePayState = { paid: number; failed: number; pay_state: number; state: number; bank?: PrivatePayBank | null };

// 개인결제 결제영수증(회원) — 마이페이지 구매영수증 팝업.
export type PrivatePayReceipt = {
  ppno: number; no: string; dno: number | null; dt: string; ct_text: string;
  pay_state: number; pay_dt: string | null; pay_method: number; pay_method_text: string;
  pay_price: number; pay_vat_price: number; pay_currency: string;
  pay_card_name: string; pay_card_inst: number; pay_card_num: string; pay_mobile_num: string;
  bank: { title: string; num: string; holder: string } | null;
  pay_bill_type: number; pay_bill_url: string | null; pay_receipt_no: string | null; pay_receipt_url: string | null;
};
/** 개인결제 결제영수증 조회(ppno) — 회원 스코프. GET /api/v2/order/privatepay/purchase */
export async function fetchPrivatePayReceipt(token: string, ppno: string): Promise<PrivatePayReceipt | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token || !/^[0-9]+$/.test(ppno)) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/privatepay/purchase`);
  u.searchParams.set("ppno", ppno);
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    return j?.data ? (j.data as PrivatePayReceipt) : null;
  } catch { return null; }
}

// 개인결제창은 공개 URL(비회원 포함) — 로그인 없이 클라이언트 인증(X-App-Client-Id)으로 결제. ppno 가 접근키.
/** 개인결제 결제 준비 — 금액/통화/상품/사업자정보 + 과세계산·통화저장(서버). GET /api/v2/order/privatepay/pay?ppno= */
export async function fetchPrivatePayInit(ppno: string): Promise<PrivatePayCheckoutInit | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !/^[0-9]+$/.test(ppno)) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/privatepay/pay`);
  u.searchParams.set("ppno", ppno);
  try {
    const res = await fetch(u.toString(), { headers: { "X-App-Client-Id": e.PROSELL_CLIENT_ID, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    return j?.data ? (j.data as PrivatePayCheckoutInit) : null;
  } catch { return null; }
}

/** 개인결제 실행 — PrivateCreate 래핑. POST /api/v2/order/privatepay/pay */
export async function submitPrivatePay(input: Record<string, string | number>): Promise<PrivatePaySubmit> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return { ok: false, error: "요청을 처리할 수 없습니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/privatepay/pay`, {
      method: "POST",
      headers: { "X-App-Client-Id": e.PROSELL_CLIENT_ID, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, code: j?.error?.code, error: j?.error?.message || "결제 처리에 실패했습니다." };
    const d = j?.data ?? {};
    return { ok: true, ppno: Number(d.ppno), no: String(d.no || ""), pg: Number(d.pg) || 0, payurl: String(d.payurl || ""), polling: Number(d.polling) || 0 };
  } catch { return { ok: false, error: "결제 요청 중 오류가 발생했습니다." }; }
}

/** 개인결제 상태 폴링 — PG 콜백 후 결제완료 확인. GET /api/v2/order/privatepay/pay?ppno=&callback=1 */
export async function pollPrivatePay(ppno: string): Promise<PrivatePayState | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !/^[0-9]+$/.test(ppno)) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/privatepay/pay`);
  u.searchParams.set("ppno", ppno);
  u.searchParams.set("callback", "1");
  try {
    const res = await fetch(u.toString(), { headers: { "X-App-Client-Id": e.PROSELL_CLIENT_ID, Accept: "application/json" }, cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.data) return null;
    return j.data as PrivatePayState;
  } catch { return null; }
}

// 교환 내역(회원) — GET /api/v2/order/exchange. exchange(교환정보, 중첩 addressInfo/paymentInfo) + items(회수/교환 상품).
export type MemberExchangeItem = {
  product: MemberOrderItem["product"];
  exchange: {
    epno: number; prno: number; item_type: number; delivery: number; option_group: number;
    products_id: number; products_option_type: number; products_title: string | null;
    exc_pro_quantity: number; exc_pro_price: number; exc_amount_price: number;
    exc_s_title: string | null; exc_t_title: string | null;
    exc_s_thumb: string | null; exc_t_thumb: string | null;
  };
};
export type MemberExchange = {
  exchange: {
    eno: number; ono: number; pno: number; dno: number; ppno: number;
    exc_state: number; exc_supplier: number;
    exc_title: string | null; exc_ct: string | null; exc_content: string | null;
    exc_name?: string | null; exc_dt: string; exc_confirm?: string | null; exc_confirm_dt?: string | null;
    exc_ret_type: number; exc_del_type: number; exc_supplier_tel: string | null;
    // 개인결제(교환 추가비용) — pay_state<10 이면 미결제(회원 결제 필요)
    private?: {
      ppno: number; private_no: string; title: string | null;
      pay_price: number; pay_currency: string; pay_method: number; pay_state: number;
    } | null;
    addressInfo: {
      // 회수(exc_ret)
      exc_ret_name: string | null; exc_ret_hp?: string | null;
      exc_ret_zipcode: string | null; exc_ret_addr1: string | null; exc_ret_addr2: string | null;
      exc_ret_type: number; exc_ret_parcel: number; exc_ret_num?: string | null;
      exc_ret_parcel_title?: string | null; exc_ret_tracking_url?: string | null;
      exc_ret_mtitle?: string | null; exc_ret_mhp?: string | null; exc_ret_mmsg?: string | null;
      exc_ret_stitle?: string | null; exc_ret_stel?: string | null; exc_ret_scontent?: string | null; exc_ret_store_addr?: string | null;
      exc_ret_dt1?: string | null; exc_ret_dt2?: string | null;
      // 재배송(exc_del)
      exc_del_type: number; exc_del_parcel: number; exc_del_num?: string | null;
      exc_del_parcel_title?: string | null; exc_del_tracking_url?: string | null;
      exc_del_mtitle?: string | null; exc_del_mhp?: string | null; exc_del_mmsg?: string | null;
      exc_del_stitle?: string | null; exc_del_stel?: string | null;
      exc_del_store_zipcode?: string | null; exc_del_store_addr1?: string | null; exc_del_store_addr2?: string | null;
      exc_del_name?: string | null; exc_del_hp?: string | null;
      exc_del_zipcode?: string | null; exc_del_addr1?: string | null; exc_del_addr2?: string | null;
      exc_del_dt1?: string | null; exc_del_dt2?: string | null;
    };
    paymentInfo: { exc_ret_price: number; exc_del_price: number; exc_deduct_price: number; exc_price: number };
  };
  order: { ono: number; dt: string; name?: string | null };
  payment?: {
    pno?: number; pay_dt?: string | null; pay_state?: number; pay_method?: number; pay_currency?: string;
    pay_bill_type?: number; pay_bill_url?: string | null; pay_receipt_no?: string | null; pay_receipt_url?: string | null;
  };
  items: MemberExchangeItem[];
};
export type MemberExchangeList = { total_count: number; exchanges: MemberExchange[]; page: number; months: number };

/** 회원 교환내역 조회. (GET /api/v2/order/exchange) 회원 스코프(mid). 주문내역과 동일 기간 파라미터. */
export async function fetchMemberExchanges(token: string, opts: { page?: number; months?: number; limit?: number; start?: string; end?: string; state?: number | number[] } = {}): Promise<MemberExchangeList> {
  const e = env();
  const page = Math.max(1, opts.page ?? 1);
  const months = opts.months ?? 3;
  const limit = opts.limit ?? 10;
  const empty: MemberExchangeList = { total_count: 0, exchanges: [], page, months };
  if (!e.PROSELL_API_BASE || !token) return empty;
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  let periodStart: string, periodEnd: string;
  if (opts.start && opts.end && dateRe.test(opts.start) && dateRe.test(opts.end)) {
    periodStart = opts.start; periodEnd = opts.end;
  } else {
    const end = new Date();
    const start = new Date(); start.setMonth(start.getMonth() - months);
    periodStart = ymd(start); periodEnd = ymd(end);
  }
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/exchange`);
  u.searchParams.set("expand", "exchange,order,product");
  u.searchParams.set("period_start", periodStart);
  u.searchParams.set("period_end", periodEnd);
  u.searchParams.set("page", String(page));
  u.searchParams.set("limit", String(limit));
  // 교환상태 필터 — 배열이면 exc_state[] 반복(IN), 단일이면 exc_state.
  if (Array.isArray(opts.state)) {
    for (const s of opts.state) u.searchParams.append("exc_state[]", String(s));
  } else if (typeof opts.state === "number") {
    u.searchParams.set("exc_state", String(opts.state));
  }
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return empty;
    const j = await res.json().catch(() => null);
    return {
      total_count: Number(j?.total_count ?? 0),
      exchanges: Array.isArray(j?.orders) ? (j.orders as MemberExchange[]) : [],
      page, months,
    };
  } catch { return empty; }
}

/** 교환 상세 조회(eno) — 회원 스코프. */
export async function fetchMemberExchangeByEno(token: string, eno: string): Promise<MemberExchange | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token || !/^[0-9]+$/.test(eno)) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/exchange`);
  u.searchParams.set("expand", "exchange,order,payment,product");
  u.searchParams.set("eno_ids", eno);
  u.searchParams.set("limit", "1");
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    const list = Array.isArray(j?.orders) ? (j.orders as MemberExchange[]) : [];
    return list[0] ?? null;
  } catch { return null; }
}

/** 교환 회수 운송장 등록(PUT /api/v2/order/exchange/parcel) — 회원 스코프. 회수중·택배건만. 성공 시 {ok:true}. */
export async function updateExchangeParcel(token: string, input: { eno: string; exc_ret_num: string }): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/exchange/parcel`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "운송장 등록에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "운송장 등록 요청 중 오류가 발생했습니다." }; }
}

export type PointReward = { review: number; review_photo: number };
/** 배송그룹 상세 조회(dno) — order/search 가 dno→ono 로 변환해 조회(본인 여부는 서버가 재확인). 상품평 적립 설정 동봉. */
export async function fetchMemberOrderByDno(token: string, dno: string): Promise<{ order: MemberOrder; pointReward: PointReward } | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token || !/^[0-9]+$/.test(dno)) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/search`);
  u.searchParams.set("expand", "order,payment,product,images,delivery,tracking");
  u.searchParams.set("dno", dno);
  u.searchParams.set("limit", "1");
  // 주문상세도 목록과 동일하게 취소완료(990)·반품완료(980) 상품만 제외하고 전부 노출.
  [1, 100, 110, 120, 130, 190, 210, 290, 300, 310, 320, 330, 340, 390, 500, 800, 810, 820, 830, 900].forEach((s) => u.searchParams.append("pro_state[]", String(s)));
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    const list = Array.isArray(j?.orders) ? (j.orders as MemberOrder[]) : [];
    if (!list[0]) return null;
    const pr = j?.point_reward ?? {};
    return { order: list[0], pointReward: { review: Number(pr.review ?? 0), review_photo: Number(pr.review_photo ?? 0) } };
  } catch { return null; }
}

// 구매영수증(참고용) — 레거시 Receipt\Order 포팅 데이터.
export type ReceiptData = {
  order: { pno: string; dno: string; delivery_cnt: number; dt: string; pay_state: number; pay_currency: string };
  items: { title: string; quantity: number; amount_price: number; product_taxfree: number; sup_title: string; rowspan_cnt?: number; rowspan_num?: number }[];
  totals: { pay_free_price: number; pay_tax_price: number; pay_vat_price: number; delivery_amount_price: number; delivery_vat_price: number };
  payment: {
    pay_dt: string; pay_method: number; pay_card_name: string; pay_card_inst: number; pay_card_num: string; pay_mobile_num: string;
    pay_bank_title: string; pay_bank_num: string; pay_bank_holder: string; order_amount_price: number; pay_point: number; pay_price: number;
  };
};
/** 구매영수증 데이터 조회(pno) — 회원 스코프. 스타터 팝업 페이지에서 렌더. */
export async function fetchReceipt(token: string, pno: string): Promise<ReceiptData | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token || !/^[0-9]+$/.test(pno)) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/receipt`);
  u.searchParams.set("pno", pno);
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    if (!j?.order?.pno) return null;
    return j as ReceiptData;
  } catch { return null; }
}

// 배송지 변경 입력(국내/해외 공통 — 서버가 del_use 로 분기).
export type ReceiveEditInput = {
  dno: string;
  rec_name: string; rec_hp: string; del_message?: string;
  // 국내
  rec_tel?: string; rec_zipcode?: string; rec_addr1?: string; rec_addr2?: string; rec_admcode?: string; rec_place?: string;
  // 해외
  rec_country?: string; rec_postcode?: string; rec_state?: string; rec_city?: string; rec_detail?: string;
};
/** 배송지 변경(PUT /api/v2/order/receive) — 회원 스코프. 성공 시 {ok:true}. */
export async function updateReceiveAddress(token: string, input: ReceiveEditInput): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/receive`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "배송지 변경에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "배송지 변경 요청 중 오류가 발생했습니다." }; }
}

// 세금계산서 발행상태(전자세금계산서 서비스가 이메일 발송 — 팝업은 상태 안내만).
export type TaxinvoiceData = { pno: string; exists: number; state: number; invoicee_email: string };
/** 세금계산서 발행상태 조회(pno) — 회원 스코프. */
export async function fetchTaxinvoice(token: string, pno: string): Promise<TaxinvoiceData | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token || !/^[0-9]+$/.test(pno)) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/taxinvoice`);
  u.searchParams.set("pno", pno);
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    if (!j?.pno) return null;
    return j as TaxinvoiceData;
  } catch { return null; }
}

// 자체 배송추적(택배 단계).
export type TrackingStep = { dt: string; level: number; state: string; place: string };
export type TrackingData = {
  dno: string; rno?: string; eno?: string; prno?: string; kind?: "return" | "redelivery"; parcel_title: string; parcel_num: string; tracking_dt: string;
  complete: number; current_state: string; receiver_name: string;
  steps: TrackingStep[]; external_url: string;
};
/** 배송추적 조회(dno) — 회원 스코프. 캐시/택배사 API 기반 배송 단계. */
export async function fetchTracking(token: string, dno: string): Promise<TrackingData | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token || !/^[0-9]+$/.test(dno)) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/tracking`);
  u.searchParams.set("dno", dno);
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.dno) return null;
    return j as TrackingData;
  } catch { return null; }
}

/** 상품 배송추적 조회(prno) — 회원 스코프. order/tracking?prno= (상품별 운송장 pro_parcel_num; 분할배송 대응). */
export async function fetchProductTracking(token: string, prno: string): Promise<TrackingData | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token || !/^[0-9]+$/.test(prno)) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/tracking`);
  u.searchParams.set("prno", prno);
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.prno) return null;
    return j as TrackingData;
  } catch { return null; }
}

/** 반품 회수 배송추적 조회(rno) — 회원 스코프. order/tracking?rno= (회수 택배사·ref_ret_num). */
export async function fetchRefundTracking(token: string, rno: string): Promise<TrackingData | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token || !/^[0-9]+$/.test(rno)) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/tracking`);
  u.searchParams.set("rno", rno);
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.rno) return null;
    return j as TrackingData;
  } catch { return null; }
}

/** 교환 배송추적 조회(eno) — 회원 스코프. order/tracking?eno= (재배송중이면 재배송, 아니면 회수 송장). */
export async function fetchExchangeTracking(token: string, eno: string): Promise<TrackingData | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token || !/^[0-9]+$/.test(eno)) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/tracking`);
  u.searchParams.set("eno", eno);
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.eno) return null;
    return j as TrackingData;
  } catch { return null; }
}

/** 구매확정(POST /api/v2/order/confirm) — prno 배열. 추가옵션은 서버가 함께 확정. */
export async function confirmPurchase(token: string, prnos: number[]): Promise<{ ok: boolean; count?: number; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  if (!Array.isArray(prnos) || prnos.length === 0) return { ok: false, error: "구매확정할 상품이 없습니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/confirm`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ prno: prnos }),
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "구매확정에 실패했습니다." };
    return { ok: true, count: Number(j?.count ?? 0) };
  } catch { return { ok: false, error: "구매확정 요청 중 오류가 발생했습니다." }; }
}

/* ── 취소접수(cancel request) ─────────────────────────────────────────────
 * 초기데이터(사유·약관·환불계좌) → 예상금액 미리보기(CancelCalc) → 접수 POST.
 * 접수는 기존 POST /api/v2/order/cancel(전체/부분 자동 판별) 재사용.
 */
export type CancelBank = { code: string; name: string };
export type CancelInit = {
  ono: number; pno: number; pay_method: number; pay_currency: string;
  pay_state: number;                   // 결제상태(10=결제완료). <10 이면 결제 전(입금대기 등)
  unpaid: boolean;                     // 결제 전 → 환불 없는 전체 주문취소
  needs_bank: boolean;                 // 휴대폰/가상계좌/무통장 → 환불계좌 입력 필요
  categories: string[];                // 취소사유 목록
  terms: string;                       // 취소 안내(자동문구)
  banks: CancelBank[];                 // 환불계좌 은행 목록
  member_bank: { code: string; num: string; holder: string }; // 회원 저장 계좌 프리필
};
export type CancelPreview = {
  mode: "all" | "item";
  unpaid?: boolean;                    // 결제 전 취소(환불 없음)
  is_submit: boolean;                  // false = 추가결제 발생 등으로 접수 불가
  is_minus_price: boolean;             // 환불금액 마이너스(추가결제 필요)
  is_warning: boolean;                 // 쿠폰/배송비 변동 경고
  warnings: {
    product_coupon?: boolean; product_change?: boolean;
    bundle_coupon?: boolean; bundle_change?: boolean;
    delivery_coupon?: boolean; delivery_change?: boolean; delivery_has_price?: boolean;
  };
  details: {
    product_price?: number; product_coupon_price?: number;
    bundle_coupon_price?: number; delivery_coupon_price?: number; delivery_price?: number;
  };
  amount: { can_price: number; can_point: number; delivery_price: number; can_bring_price: number };
  needs_bank: boolean; pay_currency: string;
};
export type CancelItemInput = { prno: number; quantity: number };
export type CancelBankInput = { code: string; num: string; holder: string };

export async function fetchCancelInit(token: string, ono: number | string): Promise<CancelInit | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/cancel/preview?ono=${encodeURIComponent(String(ono))}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return null;
    return j as CancelInit;
  } catch { return null; }
}

export async function fetchCancelPreview(token: string, ono: number | string, items: CancelItemInput[]): Promise<{ ok: boolean; preview?: CancelPreview; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "취소할 상품을 선택해 주세요." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/cancel/preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ono, items }),
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return { ok: false, error: j?.error?.message || "취소금액을 계산할 수 없습니다." };
    return { ok: true, preview: j as CancelPreview };
  } catch { return { ok: false, error: "취소금액 계산 중 오류가 발생했습니다." }; }
}

export async function submitCancel(
  token: string,
  // 회원/게스트는 can_state 를 보낼 수 없다(백엔드 화이트리스트). 취소완료 여부는 서버가 결제상태로 자동 판정(레거시 'auto').
  input: { ono: number | string; items: CancelItemInput[]; can_ct: string; can_content?: string; bank?: CancelBankInput | null },
): Promise<{ ok: boolean; cno?: number; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  if (!Array.isArray(input.items) || input.items.length === 0) return { ok: false, error: "취소할 상품을 선택해 주세요." };
  if (!input.can_ct) return { ok: false, error: "취소사유를 선택해 주세요." };
  const body: Record<string, unknown> = { ono: input.ono, items: input.items, can_ct: input.can_ct };
  if (input.can_content) body.can_content = input.can_content;
  if (input.bank && input.bank.code && input.bank.code !== "0") {
    body.can_bank_code = input.bank.code;
    body.can_bank_num = input.bank.num;
    body.can_bank_holder = input.bank.holder;
  }
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "취소접수에 실패했습니다." };
    return { ok: true, cno: Number(j?.cno ?? 0) };
  } catch { return { ok: false, error: "취소접수 요청 중 오류가 발생했습니다." }; }
}

/* ── 반품접수(refund request) ─────────────────────────────────────────────
 * 초기데이터(사유·약관·회수지) → 예상금액 미리보기(RefundCalc) → 접수 POST.
 * 회수지 주소·회수방법은 서버가 주문 배송지(rec_*)로 기본 세팅(회원 입력 불가).
 * 반품은 동일 배송그룹·결제완료 건만 가능.
 */
export type RefundBank = { code: string; name: string };
export type RefundInit = {
  ono: number; pay_method: number; pay_currency: string;
  is_product_all: boolean;             // 대량구매 할인 주문 → 전체반품만 가능(부분 불가)
  needs_bank: boolean;                 // 휴대폰/가상계좌/무통장 → 환불계좌 입력 필요
  banks: RefundBank[];                 // 환불계좌 은행 목록
  member_bank: { code: string; num: string; holder: string }; // 회원 저장 계좌 프리필
  categories: string[];                // 반품사유 목록
  terms: string;                       // 반품 안내(자동문구)
  return_address: { name: string; hp: string; zipcode: string; addr1: string; addr2: string; admcode: string }; // 회수지(주문 배송지)
};
export type RefundBankInput = { code: string; num: string; holder: string };
export type RefundAddressInput = { name: string; hp: string; zipcode: string; addr1: string; addr2: string; admcode: string };
export type RefundPreview = {
  is_submit: boolean;                  // false = 추가결제(재청구) 발생 등으로 접수 불가
  is_minus_price: boolean;             // 환불금액 마이너스(추가결제 필요)
  is_warning: boolean;                 // 쿠폰/배송비 변동 경고
  warnings: {
    product_coupon?: boolean; product_change?: boolean;
    bundle_coupon?: boolean; bundle_change?: boolean; delivery_coupon?: boolean; delivery_change?: boolean;
  };
  details: {
    product_price?: number; product_coupon_price?: number; bundle_coupon_price?: number;
    delivery_coupon_price?: number; delivery_price?: number; del_price?: number;
    ret_price?: number;                // 회수 배송비(고객부담 금액)
    ret_cost?: number;                 // 0=협의 / 1=고객부담
  };
  amount: { ref_price: number; ref_point: number; ref_bring_price: number };
  needs_bank: boolean;
  pay_currency: string;
};
export type RefundItemInput = { prno: number; quantity: number };

export async function fetchRefundInit(token: string, ono: number | string): Promise<RefundInit | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/refund/preview?ono=${encodeURIComponent(String(ono))}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return null;
    return j as RefundInit;
  } catch { return null; }
}

export async function fetchRefundPreview(token: string, ono: number | string, items: RefundItemInput[], ref_ct: string): Promise<{ ok: boolean; preview?: RefundPreview; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "반품할 상품을 선택해 주세요." };
  if (!ref_ct) return { ok: false, error: "반품사유를 선택해 주세요." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/refund/preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ono, items, ref_ct }),
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return { ok: false, error: j?.error?.message || "반품금액을 계산할 수 없습니다." };
    return { ok: true, preview: j as RefundPreview };
  } catch { return { ok: false, error: "반품금액 계산 중 오류가 발생했습니다." }; }
}

export async function submitRefund(
  token: string,
  input: { ono: number | string; items: RefundItemInput[]; ref_ct: string; ref_content?: string; bank?: RefundBankInput | null; address?: RefundAddressInput | null },
): Promise<{ ok: boolean; rno?: number; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  if (!Array.isArray(input.items) || input.items.length === 0) return { ok: false, error: "반품할 상품을 선택해 주세요." };
  if (!input.ref_ct) return { ok: false, error: "반품사유를 선택해 주세요." };
  const refund: Record<string, unknown> = { ref_ct: input.ref_ct };
  if (input.ref_content) refund.ref_content = input.ref_content;
  const body: Record<string, unknown> = { ono: input.ono, items: input.items, refund };
  if (input.bank && input.bank.code && input.bank.code !== "0") {
    body.paymentInfo = { ref_bank_code: input.bank.code, ref_bank_num: input.bank.num, ref_bank_holder: input.bank.holder };
  }
  if (input.address) {
    body.addressInfo = {
      ref_ret_name: input.address.name, ref_ret_hp: input.address.hp,
      ref_ret_zipcode: input.address.zipcode, ref_ret_addr1: input.address.addr1,
      ref_ret_addr2: input.address.addr2, ref_ret_admcode: input.address.admcode,
    };
  }
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/refund`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "반품접수에 실패했습니다." };
    return { ok: true, rno: Number(j?.rno ?? 0) };
  } catch { return { ok: false, error: "반품접수 요청 중 오류가 발생했습니다." }; }
}

// 반품 철회 — 회원 전용. 반품접수(ref_state 10) 상태에서만 가능. DELETE /api/v2/order/refund/{rno} → ref_state=1.
export async function withdrawRefund(token: string, rno: number | string): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  if (!/^\d+$/.test(String(rno))) return { ok: false, error: "반품번호가 올바르지 않습니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/refund/${rno}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "반품철회에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "반품철회 요청 중 오류가 발생했습니다." }; }
}

// ── 교환접수(회원) ─────────────────────────────────────────────
// 교환은 반품과 달리 "교환상품(재배송 받을 상품)"을 고른다. 레거시 제약상 같은 상품 내 다른 옵션만 가능.
// 왕복배송비(exc_price)는 단순변심 사유일 때만 발생하며 접수 시 금액만 기록(PG 미연동, 고객센터/계좌 안내).
export type ExchangeInit = {
  ono: number; pay_currency: string;
  categories: string[];                // 교환사유 목록(setup_item order_exchange)
  terms: string;                       // 교환 안내(자동문구)
  return_address: { name: string; hp: string; zipcode: string; addr1: string; addr2: string; admcode: string }; // 수거지(주문 배송지)
};
export type ExchangeAddressInput = { name: string; hp: string; zipcode: string; addr1: string; addr2: string; admcode: string };
// prno=주문상품, quantity=교환수량, product_id=원래 옵션id, exc_product_id=교환할 새 옵션id(옵션변경 시에만; 없으면 동일재교환)
export type ExchangeItemInput = { prno: number; quantity: number; product_id?: number; exc_product_id?: number };
export type ExchangePreview = {
  is_submit: boolean;
  is_exchange_diff: number;            // 1=다른 옵션으로 교환 포함
  details: { ret_cost?: number; ret_price?: number; del_price?: number }; // ret_cost 0=협의 / 1=고객부담
  amount: { exc_price: number };       // 교환 왕복배송비(회수+재배송)
  pay_currency: string;
};

export async function fetchExchangeInit(token: string, ono: number | string): Promise<ExchangeInit | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/exchange/preview?ono=${encodeURIComponent(String(ono))}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return null;
    return j as ExchangeInit;
  } catch { return null; }
}

export async function fetchExchangePreview(token: string, ono: number | string, items: ExchangeItemInput[], exc_ct: string): Promise<{ ok: boolean; preview?: ExchangePreview; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "교환할 상품을 선택해 주세요." };
  if (!exc_ct) return { ok: false, error: "교환사유를 선택해 주세요." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/exchange/preview`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ono, items, exc_ct }),
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return { ok: false, error: j?.error?.message || "교환배송비를 계산할 수 없습니다." };
    return { ok: true, preview: j as ExchangePreview };
  } catch { return { ok: false, error: "교환배송비 계산 중 오류가 발생했습니다." }; }
}

export async function submitExchange(
  token: string,
  input: { ono: number | string; items: ExchangeItemInput[]; exc_ct: string; exc_content?: string; address?: ExchangeAddressInput | null },
): Promise<{ ok: boolean; eno?: number; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  if (!Array.isArray(input.items) || input.items.length === 0) return { ok: false, error: "교환할 상품을 선택해 주세요." };
  if (!input.exc_ct) return { ok: false, error: "교환사유를 선택해 주세요." };
  const exchange: Record<string, unknown> = { exc_ct: input.exc_ct };
  if (input.exc_content) exchange.exc_content = input.exc_content;
  const body: Record<string, unknown> = { ono: input.ono, items: input.items, exchange };
  if (input.address) {
    body.addressInfo = {
      exc_ret_name: input.address.name, exc_ret_hp: input.address.hp,
      exc_ret_zipcode: input.address.zipcode, exc_ret_addr1: input.address.addr1,
      exc_ret_addr2: input.address.addr2, exc_ret_admcode: input.address.admcode,
    };
  }
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/exchange`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "교환접수에 실패했습니다." };
    return { ok: true, eno: Number(j?.eno ?? 0) };
  } catch { return { ok: false, error: "교환접수 요청 중 오류가 발생했습니다." }; }
}

// 교환 철회 — 회원 전용. 교환접수(exc_state 10) 상태에서만 가능. DELETE /api/v2/order/exchange/{eno} → exc_state=1.
export async function withdrawExchange(token: string, eno: number | string): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  if (!/^\d+$/.test(String(eno))) return { ok: false, error: "교환번호가 올바르지 않습니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/exchange/${eno}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "교환철회에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "교환철회 요청 중 오류가 발생했습니다." }; }
}

// ── 쿠폰 보관함(회원) ──────────────────────────────────────────
// 보유 쿠폰(coupon_list, 미사용·미만료) + 등급쿠폰 다운로드 + PIN 쿠폰 등록. 신규 GET/POST /api/v2/coupon/box.
export type MemberCoupon = {
  id: number; coupon_id: number; title: string | null; coupon_name: string | null;
  coupon_type: number;                 // 1=상품 / 2=묶음 / 3=배송
  discount_type: number;               // 1=정액(원) / 2=정률(%)
  discount_price: number; discount_percent: number;
  discount_terms_price: number;        // 최소 구매금액
  discount_max_price: number;          // 정률 최대 할인
  category: string | null; service: number;
  use_dt: string | null; dday: number; // dday=만료까지 남은 일수
};
export type LevelCoupon = {
  id: number; num: number; title: string | null;
  coupon_type: number; discount_type: number;
  discount_price: number; discount_percent: number;
  discount_terms_price: number; discount_max_price: number;
  downloadable: boolean;               // false=이미 받음/한도도달
};
export type CouponBox = {
  total_count: number; page: number;
  coupons: MemberCoupon[];
  level: { use: boolean; coupons: LevelCoupon[] };
};

export async function fetchCouponBox(token: string, page = 1): Promise<CouponBox | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/coupon/box?page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return null;
    return {
      total_count: Number(j.total_count ?? 0),
      page: Number(j.page ?? 1),
      coupons: Array.isArray(j.coupons) ? (j.coupons as MemberCoupon[]) : [],
      level: { use: !!j.level?.use, coupons: Array.isArray(j.level?.coupons) ? (j.level.coupons as LevelCoupon[]) : [] },
    };
  } catch { return null; }
}

async function couponBoxAction(token: string, body: Record<string, unknown>): Promise<{ ok: boolean; id?: number; count?: number; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/coupon/box`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "요청을 처리할 수 없습니다." };
    return { ok: true, id: j?.id != null ? Number(j.id) : undefined, count: j?.count != null ? Number(j.count) : undefined };
  } catch { return { ok: false, error: "요청 중 오류가 발생했습니다." }; }
}

// PIN 쿠폰 등록. pincode=영숫자. 성공 시 새 보유쿠폰 id 반환.
export function registerCouponCode(token: string, pincode: string): Promise<{ ok: boolean; id?: number; count?: number; error?: string }> {
  if (!/^[a-zA-Z0-9]+$/.test(pincode)) return Promise.resolve({ ok: false, error: "쿠폰 번호를 확인해 주세요." });
  return couponBoxAction(token, { action: "code", pincode });
}
// 등급쿠폰 1건 다운로드(num=1~4).
export function downloadLevelCoupon(token: string, num: number) {
  return couponBoxAction(token, { action: "download", num });
}
// 등급쿠폰 전체 다운로드.
export function downloadAllLevelCoupons(token: string) {
  return couponBoxAction(token, { action: "download_all" });
}

// ── 적립금(회원) ──────────────────────────────────────────────
// 적립금 변동내역 + 현재 잔액. dual-scope GET /api/v2/point(회원은 본인 mid 강제 + balance 포함).
export type PointEntry = {
  id: number | null; ct: number;      // ct 0기타/1로그인/2가입/3주문/4취소/5커뮤니티
  point: number;                      // +적립 / -차감
  total_point: number;                // 변동 후 누적 잔액
  content: string | null; dt: string | null;
};
export type PointHistory = { total_count: number; balance: number; items: PointEntry[]; page: number };

export async function fetchPointHistory(token: string, opts: { page?: number; limit?: number; start?: string; end?: string } = {}): Promise<PointHistory> {
  const e = env();
  const page = Math.max(1, opts.page ?? 1);
  const limit = opts.limit ?? 10;
  const empty: PointHistory = { total_count: 0, balance: 0, items: [], page };
  if (!e.PROSELL_API_BASE || !token) return empty;
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  let periodStart: string, periodEnd: string;
  if (opts.start && opts.end && dateRe.test(opts.start) && dateRe.test(opts.end)) {
    periodStart = opts.start; periodEnd = opts.end;
  } else {
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - 30);
    periodStart = ymd(start); periodEnd = ymd(end);
  }
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/point`);
  u.searchParams.set("period_start", periodStart);
  u.searchParams.set("period_end", periodEnd);
  u.searchParams.set("page", String(page));
  u.searchParams.set("limit", String(limit));
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return empty;
    const j = await res.json().catch(() => null);
    return {
      total_count: Number(j?.total_count ?? 0),
      balance: Number(j?.balance ?? 0),
      items: Array.isArray(j?.items) ? (j.items as PointEntry[]) : [],
      page,
    };
  } catch { return empty; }
}

// ── 관심상품(위시리스트, 회원) ─────────────────────────────────
// 신규 GET/POST/DELETE /api/v2/wishlist. 저장은 상품번호(products_id)만 → 카드는 products API 로 조회.
export type WishlistItem = { id: number; products_id: number; dt: string | null };
export type WishlistList = { total_count: number; page: number; wishlist_day: number; items: WishlistItem[] };

export async function fetchWishlist(token: string, page = 1, limit = 10): Promise<WishlistList> {
  const e = env();
  const empty: WishlistList = { total_count: 0, page, wishlist_day: 0, items: [] };
  if (!e.PROSELL_API_BASE || !token) return empty;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/wishlist?page=${page}&limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return empty;
    return { total_count: Number(j.total_count ?? 0), page: Number(j.page ?? 1), wishlist_day: Number(j.wishlist_day ?? 0), items: Array.isArray(j.items) ? (j.items as WishlistItem[]) : [] };
  } catch { return empty; }
}

// 단건 담김 여부 확인(PDP 하트 초기상태). 서버사이드에서 호출.
export async function checkWishlist(token: string, productsId: number | string): Promise<boolean> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return false;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/wishlist?products_id=${encodeURIComponent(String(productsId))}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    return !!(res.ok && j?.wished);
  } catch { return false; }
}

// 관심상품 토글(있으면 삭제/없으면 추가). PDP 하트 등에서 사용.
export async function toggleWishlist(token: string, productsId: number | string): Promise<{ ok: boolean; wished?: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/wishlist`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ products_id: Number(productsId) }), cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "요청을 처리할 수 없습니다." };
    return { ok: true, wished: !!j?.wished };
  } catch { return { ok: false, error: "요청 중 오류가 발생했습니다." }; }
}

// 관심상품 전체삭제.
export async function clearWishlist(token: string): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/wishlist?all=1`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "삭제할 수 없습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "삭제 중 오류가 발생했습니다." }; }
}

// 관심상품 삭제(보관함에서 제거).
export async function removeWishlist(token: string, productsId: number | string): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/wishlist?products_id=${encodeURIComponent(String(productsId))}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "삭제할 수 없습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "삭제 중 오류가 발생했습니다." }; }
}

// ── 최근 본 상품(회원) ─────────────────────────────────────────
// 신규 GET/POST/DELETE /api/v2/history. 관심상품과 동일 구조. 열람 기록은 PDP 진입 시 POST.
export type HistoryItem = { id: number; products_id: number; dt: string | null };
export type HistoryList = { total_count: number; page: number; history_day: number; items: HistoryItem[] };

export async function fetchHistory(token: string, page = 1, limit = 10): Promise<HistoryList> {
  const e = env();
  const empty: HistoryList = { total_count: 0, page, history_day: 0, items: [] };
  if (!e.PROSELL_API_BASE || !token) return empty;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/history?page=${page}&limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return empty;
    return { total_count: Number(j.total_count ?? 0), page: Number(j.page ?? 1), history_day: Number(j.history_day ?? 0), items: Array.isArray(j.items) ? (j.items as HistoryItem[]) : [] };
  } catch { return empty; }
}

// 열람 기록(PDP 진입 시). 실패해도 무시(부가기능).
export async function recordHistory(token: string, productsId: number | string): Promise<void> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return;
  try {
    await fetch(`${e.PROSELL_API_BASE}/api/v2/history`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ products_id: Number(productsId) }), cache: "no-store",
    });
  } catch { /* noop */ }
}

export async function removeHistory(token: string, productsId: number | string): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/history?products_id=${encodeURIComponent(String(productsId))}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "삭제할 수 없습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "삭제 중 오류가 발생했습니다." }; }
}

export async function clearHistory(token: string): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/history?all=1`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "삭제할 수 없습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "삭제 중 오류가 발생했습니다." }; }
}

// ── 상품 상세 페이지 «공개» 상품평(읽기 전용) ──────────────────
// GET /api/v2/products/review — 로그인 없이 열람. 관리자/작성 기능 없음(작성은 회원 스코프 /review).
// 상품당 동일 응답이라 ISR 공유 캐시(isrOpt, Redis 캐시핸들러로 대체 가능)로 감싸 캐시 주기당 1회로 수렴.
export type ProductReviewFile = { field: string; id: number; thumb: string | null; src: string | null; width: number; height: number };
export type ProductReview = {
  id: number; product_id: number; option: string | null; title: string | null;
  url: string | null; video_src: string | null; name: string | null; score: number; best: number;
  content: string | null; dt: string | null; files: ProductReviewFile[];
  reply_name: string | null; reply_content: string | null; reply_dt: string | null;
  products_id?: number; product_title?: string | null;   // 전체(홈) 리뷰 — 상품 링크/이름
};
export type ProductReviewSummary = {
  count: number; average: number; photo_count: number;
  score_counts: Record<"1" | "2" | "3" | "4" | "5", number>;
};
export type ProductReviewList = { total_count: number; summary: ProductReviewSummary; items: ProductReview[] };

const EMPTY_REVIEW_SUMMARY: ProductReviewSummary = { count: 0, average: 0, photo_count: 0, score_counts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 } };

/** 리뷰 항목의 이미지(files) 호스트를 CDN(cdnpro.kr)으로 정규화. video_src(iframe)는 그대로. */
function normReviewItems(items: unknown): ProductReview[] {
  if (!Array.isArray(items)) return [];
  return (items as ProductReview[]).map((r) => ({
    ...r,
    files: Array.isArray(r.files)
      ? r.files.map((f) => ({ ...f, src: imgUrl(f.src) ?? f.src, thumb: imgUrl(f.thumb) ?? f.thumb }))
      : [],
  }));
}

/** 전체 상품 베스트 리뷰(홈용). products_id=0 전역 조회 — best DESC 순, 기본 포토리뷰. */
export async function fetchBestReviews(opts: { limit?: number; photo?: 0 | 1 } = {}): Promise<ProductReviewList> {
  const e = env();
  const empty: ProductReviewList = { total_count: 0, summary: EMPTY_REVIEW_SUMMARY, items: [] };
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return empty;
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/products/review`);
    u.searchParams.set("products_id", "0");   // 전체
    u.searchParams.set("limit", String(opts.limit ?? 15));
    if (opts.photo !== undefined) u.searchParams.set("photo", String(opts.photo));
    const res = await fetch(u.toString(), {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      ...isrOpt(["best-reviews"]),
    });
    if (!res.ok) return empty;
    const j = await res.json().catch(() => null);
    if (!j || j.error) return empty;
    return {
      total_count: Number(j.total_count ?? 0),
      summary: (j.summary as ProductReviewSummary) ?? EMPTY_REVIEW_SUMMARY,
      items: normReviewItems(j.items),
    };
  } catch { return empty; }
}

export async function fetchProductReviews(
  productsId: number | string,
  opts: { page?: number; limit?: number; score?: number; photo?: 0 | 1; best?: 0 | 1 } = {},
): Promise<ProductReviewList> {
  const e = env();
  const empty: ProductReviewList = { total_count: 0, summary: EMPTY_REVIEW_SUMMARY, items: [] };
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !productsId) return empty;
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/products/review`);
    u.searchParams.set("products_id", String(productsId));
    u.searchParams.set("page", String(Math.max(1, opts.page ?? 1)));
    u.searchParams.set("limit", String(opts.limit ?? 10));
    if (opts.score) u.searchParams.set("score", String(opts.score));
    if (opts.photo !== undefined) u.searchParams.set("photo", String(opts.photo));
    if (opts.best !== undefined) u.searchParams.set("best", String(opts.best));
    // 공개·공통 데이터 → 상품별 태그로 ISR 공유 캐시(배포) / 개발 no-store.
    const res = await fetch(u.toString(), {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      ...isrOpt([`product-reviews-${productsId}`]),
    });
    if (!res.ok) return empty;
    const j = await res.json().catch(() => null);
    if (!j || j.error) return empty;
    return {
      total_count: Number(j.total_count ?? 0),
      summary: (j.summary as ProductReviewSummary) ?? EMPTY_REVIEW_SUMMARY,
      items: normReviewItems(j.items),
    };
  } catch { return empty; }
}

// ── 상품 상세 페이지 «공개» 상품문의(읽기 전용) ──────────────────
// GET /api/v2/products/inquiry — 로그인 없이 열람. 비밀글은 내용/답변 숨김(secret=1).
export type ProductInquiry = {
  id: number; product_id?: number; secret: number; title: string | null; content: string | null;
  name: string | null; dt: string | null; answered: number;
  reply_name: string | null; reply_content: string | null; reply_dt: string | null;
  is_mine?: number; // 로그인 회원 본인 문의면 1(수정 노출용). 비밀글이라도 본인 것이면 title/content 제공.
  is_guest?: number; // 비회원 작성글(비밀번호 확인으로 수정/삭제)
  url?: string | null; video_src?: string | null; // 통합 게시판 전용(참고 URL·동영상 임베드 src)
  category?: string | null; // 통합 게시판 카테고리
  files?: InquiryFile[]; // 첨부 이미지
  send_phone?: number; send_email?: number; // 답변 알림 수신(회원 전용)
};
// 첨부파일 — 이미지면 thumb/src 가 채워지고, 일반 파일이면 null(name/size/download 로 카드 표시).
export type InquiryFile = {
  id: number; thumb: string | null; src: string | null; width: number; height: number;
  name?: string; size?: number; filesize?: string; type?: string; download?: string;
};
// 작성 권한 — level_write(최소등급)/can_write(현재 뷰어 작성 가능)/guest_writable(비회원 가능).
// notify_hp/notify_email — 답변 알림 체크박스 노출 여부(환경설정 setup_hp/setup_email 의 inquiry_answer onoff + 회원 hp/email 보유).
export type InquiryPermission = { level_write: number; can_write: number; guest_writable: number; notify_hp?: number; notify_email?: number };
// 게시판 메타 — unified(통합여부: URL/동영상/첨부 지원) + 카테고리 설정.
// secret: 0=비밀글 미사용(체크박스 숨김) / 1=작성자 선택 / 2=전체 적용(숨김·항상 비밀글) — 운영자 게시판 설정.
export type InquiryBoard = { unified: number; use_category: number; categories: string[]; secret?: number };
export type ProductInquiryList = { total_count: number; items: ProductInquiry[]; permission: InquiryPermission; board: InquiryBoard; recaptcha_sitekey: string };

const DEFAULT_INQUIRY_PERM: InquiryPermission = { level_write: 0, can_write: 0, guest_writable: 0 };
const DEFAULT_INQUIRY_BOARD: InquiryBoard = { unified: 0, use_category: 0, categories: [], secret: 1 };

export async function fetchProductInquiries(
  productsId: number | string,
  opts: { page?: number; limit?: number } = {},
  token?: string,
): Promise<ProductInquiryList> {
  const e = env();
  const empty: ProductInquiryList = { total_count: 0, items: [], permission: DEFAULT_INQUIRY_PERM, board: DEFAULT_INQUIRY_BOARD, recaptcha_sitekey: "" };
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !productsId) return empty;
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/products/inquiry`);
    u.searchParams.set("products_id", String(productsId));
    u.searchParams.set("page", String(Math.max(1, opts.page ?? 1)));
    u.searchParams.set("limit", String(opts.limit ?? 10));
    // client_id 는 공개열람용, 회원 토큰이 있으면 함께 보내 본인 문의(is_mine)·본인 비밀글 노출. 토큰 있으면 공유 캐시 미사용.
    const headers: Record<string, string> = { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(u.toString(), {
      headers,
      ...(token ? { cache: "no-store" as const } : isrOpt([`product-inquiries-${productsId}`])),
    });
    if (!res.ok) return empty;
    const j = await res.json().catch(() => null);
    if (!j || j.error) return empty;
    return {
      total_count: Number(j.total_count ?? 0),
      items: Array.isArray(j.items) ? (j.items as ProductInquiry[]) : [],
      permission: (j.permission as InquiryPermission) ?? DEFAULT_INQUIRY_PERM,
      board: (j.board as InquiryBoard) ?? DEFAULT_INQUIRY_BOARD,
      recaptcha_sitekey: String(j.recaptcha_sitekey ?? ""),
    };
  } catch { return empty; }
}

// 상품문의 작성 — POST /api/v2/inquiry/product. product_id = «옵션» id.
//  · 회원: token(Bearer). · 비회원: token 없이 client-id + name/upw(비회원 작성 허용 상점일 때).
export async function submitInquiry(
  token: string | null | undefined,
  body: { product_id: number | string; title: string; content: string; secret?: 0 | 1; send_phone?: 0 | 1; send_email?: 0 | 1; url?: string; video_url?: string; name?: string; upw?: string; category?: string; files?: number[]; recaptcha?: string },
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE) return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  const isGuest = !token;
  if (isGuest && !e.PROSELL_CLIENT_ID) return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    else headers["X-App-Client-Id"] = e.PROSELL_CLIENT_ID; // 비회원
    const payload: Record<string, unknown> = {
      product_id: body.product_id,
      title: body.title,
      content: body.content,
      secret: body.secret ? 1 : 0,
      url: body.url ?? "",
      video_url: body.video_url ?? "",
      category: body.category ?? "",
      files: Array.isArray(body.files) ? body.files : [],
    };
    if (isGuest) {
      // 비회원: 이름/비밀번호(조회·삭제용). 알림 수신은 저장된 연락처가 없어 제외.
      payload.name = body.name ?? "";
      payload.upw = body.upw ?? "";
      payload.recaptcha = body.recaptcha ?? "";
    } else {
      payload.send_phone = body.send_phone ? 1 : 0;
      payload.send_email = body.send_email ? 1 : 0;
    }
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/inquiry/product`, {
      method: "POST", headers, cache: "no-store", body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "문의 등록에 실패했습니다." };
    return { ok: true, id: Number(j?.id ?? j?.data?.id ?? 0) };
  } catch { return { ok: false, error: "요청 중 오류가 발생했습니다." }; }
}

// ── 1:1 문의(qna, 회원) — 계정 «1:1 문의» 페이지용 ────────────────
// 문의대상 상품(개별 게시판 qna) — 상세에서 «어떤 상품 문의인지» 표시.
export type QnaTargetProduct = { products_id: number; title: string | null; thumb: string | null; url: string | null };
export type MyQna = {
  id: number; category: string | null; title: string | null; content: string | null;
  secret: number; dt: string | null; answered: number;
  reply_name: string | null; reply_content: string | null; reply_dt: string | null;
  url?: string | null; video_src?: string | null; // 통합 게시판 전용(참고 URL·동영상 임베드 src)
  files?: InquiryFile[]; // 첨부 이미지
  send_phone?: number; send_email?: number; // 답변 알림 수신
  item_type?: number; // 문의대상 유형(0=없음/1=주문/2=장바구니/3=보관/4=최근본)
  target_products?: QnaTargetProduct[]; // 선택한 상품 정보
};
// notify_hp/notify_email — 답변 알림 체크박스 노출 여부(setup_hp/setup_email 의 qna_answer onoff + 회원 hp/email 보유).
// secret: 0=비밀글 미사용(체크박스 숨김) / 1=작성자 선택 / 2=전체 적용 — 1:1 문의는 기본 0(미사용).
// file_count/file_size_mb — 업로드 제한(운영자 CS 설정과 동일 출처).
export type QnaBoard = {
  unified: number; use_category: number; categories: string[]; secret?: number;
  notify_hp?: number; notify_email?: number; file_count?: number; file_size_mb?: number;
};
export type MyQnaList = { total_count: number; items: MyQna[]; board: QnaBoard; page: number };
const DEFAULT_QNA_BOARD: QnaBoard = { unified: 0, use_category: 0, categories: [], secret: 0, notify_hp: 0, notify_email: 0, file_count: 0, file_size_mb: 0 };

export type QnaInput = {
  category: string; title: string; content: string; secret?: 0 | 1;
  url?: string; video_url?: string; files?: number[];
  send_phone?: 0 | 1; send_email?: 0 | 1;
  editor?: 0 | 1; // 1=본문이 HTML(위지윅) — 개별 게시판 ar_editor
  // 문의대상 — item_type: 0=없음/1=주문상품/2=장바구니/3=보관상품/4=최근본상품, item_ids: 콤마구분
  item_type?: 0 | 1 | 2 | 3 | 4;
  item_ids?: string;
};

// 문의대상 상품 소스 — GET /api/v2/inquiry/customer/items?type=1~4 (회원 전용).
export type QnaItemSourceType = 1 | 2 | 3 | 4;
export type QnaItem = {
  item_id: string;       // 등록 시 item_ids 로 넘길 값(소스별 형식 상이)
  products_id: number;
  product_id: number;
  title: string;
  quantity: number;
  thumb: string | null;
  dt: string | null;
};

export async function fetchQnaItemSource(token: string, type: QnaItemSourceType): Promise<QnaItem[]> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return [];
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/inquiry/customer/items?type=${type}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return [];
    return Array.isArray(j.items) ? (j.items as QnaItem[]) : [];
  } catch { return []; }
}

// 통합 게시판 전용 필드는 unified 일 때만 전송(개별 게시판은 파라미터 자체를 거부).
function qnaPayload(b: QnaInput): Record<string, unknown> {
  const p: Record<string, unknown> = { category: b.category, title: b.title, content: b.content, secret: b.secret ? 1 : 0 };
  if (b.editor !== undefined) p.editor = b.editor;
  if (b.url !== undefined) p.url = b.url;
  if (b.video_url !== undefined) p.video_url = b.video_url;
  if (b.files !== undefined) p.files = b.files;
  if (b.send_phone !== undefined) p.send_phone = b.send_phone ? 1 : 0;
  if (b.send_email !== undefined) p.send_email = b.send_email ? 1 : 0;
  // 문의대상 — 등록에서만 유효(수정 PUT 은 백엔드가 거부). item_ids 는 대상이 있을 때만.
  if (b.item_type !== undefined) p.item_type = b.item_type;
  if (b.item_ids) p.item_ids = b.item_ids;
  return p;
}

export async function fetchMyQna(token: string, opts: { page?: number; limit?: number } = {}): Promise<MyQnaList> {
  const e = env();
  const page = Math.max(1, opts.page ?? 1);
  const limit = opts.limit ?? 10;
  const empty: MyQnaList = { total_count: 0, items: [], board: DEFAULT_QNA_BOARD, page };
  if (!e.PROSELL_API_BASE || !token) return empty;
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/inquiry/customer`);
    u.searchParams.set("page", String(page));
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("period_start", "2000-01-01");
    u.searchParams.set("period_end", "2999-12-31");
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return empty;
    // 본문/답변은 HTML(위지윅) — 레거시·관리자가 작성한 것도 섞이므로 «출력 전»에도 새니타이즈한다.
    const items = (Array.isArray(j.items) ? (j.items as MyQna[]) : []).map((it) => ({
      ...it,
      content: it.content ? renderContent(it.content) : it.content,
      reply_content: it.reply_content ? renderContent(it.reply_content) : it.reply_content,
    }));
    return { total_count: Number(j.total_count ?? 0), items, board: (j.board as QnaBoard) ?? DEFAULT_QNA_BOARD, page };
  } catch { return empty; }
}

export async function submitQna(token: string, body: QnaInput): Promise<{ ok: boolean; id?: number; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/inquiry/customer`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store",
      // item_type 은 등록에서만 필수(수정에선 거부됨). 문의 대상 미지정 → 0.
      body: JSON.stringify({ item_type: 0, ...qnaPayload(body) }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "문의 등록에 실패했습니다." };
    return { ok: true, id: Number(j?.id ?? j?.data?.id ?? 0) };
  } catch { return { ok: false, error: "요청 중 오류가 발생했습니다." }; }
}

export async function updateQna(token: string, body: QnaInput & { id: number | string }): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/inquiry/customer/${encodeURIComponent(String(body.id))}`, {
      method: "PUT", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store",
      body: JSON.stringify(qnaPayload(body)),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "문의 수정에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "요청 중 오류가 발생했습니다." }; }
}

export async function deleteQna(token: string, id: number | string): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/inquiry/customer/${encodeURIComponent(String(id))}`, {
      method: "DELETE", headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "문의 삭제에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "요청 중 오류가 발생했습니다." }; }
}

// ── 내 상품문의(회원) — 계정 «상품 문의» 페이지용 ──────────────
export type MyInquiry = {
  id: number; products_id: number; product_id: number; title: string | null; content: string | null;
  category: string | null; url?: string | null; video_src?: string | null; files?: InquiryFile[];
  secret: number; dt: string | null; answered: number;
  reply_name: string | null; reply_content: string | null; reply_dt: string | null;
  send_phone?: number; send_email?: number; // 답변 알림 수신(수정 프리필)
};
// notify_hp/notify_email — 답변 알림 체크박스 노출 여부(환경설정 inquiry_answer onoff + 회원 hp/email 보유).
export type MyInquiryList = { total_count: number; items: MyInquiry[]; page: number; notify_hp: number; notify_email: number };

export async function fetchMyInquiries(token: string, opts: { page?: number; limit?: number } = {}): Promise<MyInquiryList> {
  const e = env();
  const page = Math.max(1, opts.page ?? 1);
  const limit = opts.limit ?? 10;
  const empty: MyInquiryList = { total_count: 0, items: [], page, notify_hp: 0, notify_email: 0 };
  if (!e.PROSELL_API_BASE || !token) return empty;
  try {
    // 기간 미지정 시 백엔드가 period 를 «오늘»로 기본 → 전체를 보려면 넓은 기간 명시(리뷰와 동일).
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/inquiry/product`);
    u.searchParams.set("page", String(page));
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("period_start", "2000-01-01");
    u.searchParams.set("period_end", "2999-12-31");
    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return empty;
    return { total_count: Number(j.total_count ?? 0), items: Array.isArray(j.items) ? (j.items as MyInquiry[]) : [], page, notify_hp: Number(j.notify_hp ?? 0), notify_email: Number(j.notify_email ?? 0) };
  } catch { return empty; }
}

// 상품문의 이미지 업로드 — 회원(token) 또는 비회원(client-id). multipart → /api/v2/inquiry/product/upload.
export async function uploadInquiryPhotos(token: string | null | undefined, files: File[]): Promise<{ ok: boolean; items?: InquiryFile[]; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE) return { ok: false, error: "요청을 처리할 수 없습니다." };
  if (!token && !e.PROSELL_CLIENT_ID) return { ok: false, error: "요청을 처리할 수 없습니다." };
  if (!files.length) return { ok: false, error: "파일이 없습니다." };
  const fd = new FormData();
  files.forEach((f, i) => fd.append(`file${i}`, f, f.name));
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    else headers["X-App-Client-Id"] = e.PROSELL_CLIENT_ID;
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/inquiry/product/upload`, { method: "POST", headers, body: fd, cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "이미지 업로드에 실패했습니다." };
    const items = Array.isArray(j?.items) ? (j.items as InquiryFile[]) : (Array.isArray(j?.data?.items) ? (j.data.items as InquiryFile[]) : []);
    return { ok: true, items };
  } catch { return { ok: false, error: "이미지 업로드 중 오류가 발생했습니다." }; }
}

// 1:1 문의 이미지 업로드 — 회원 전용. multipart → /api/v2/inquiry/customer/upload.
export async function uploadQnaPhotos(token: string, files: File[]): Promise<{ ok: boolean; items?: InquiryFile[]; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "로그인이 필요합니다." };
  if (!files.length) return { ok: false, error: "파일이 없습니다." };
  const fd = new FormData();
  files.forEach((f, i) => fd.append(`file${i}`, f, f.name));
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/inquiry/customer/upload`, {
      method: "POST", headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, body: fd, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "이미지 업로드에 실패했습니다." };
    const items = Array.isArray(j?.items) ? (j.items as InquiryFile[]) : (Array.isArray(j?.data?.items) ? (j.data.items as InquiryFile[]) : []);
    return { ok: true, items };
  } catch { return { ok: false, error: "이미지 업로드 중 오류가 발생했습니다." }; }
}

// 비회원 상품문의 비밀번호 검증 + 본문 로드(수정 전 단계) — POST /api/v2/inquiry/product/verify.
export async function verifyInquiryPassword(id: number | string, upw: string): Promise<{ ok: boolean; item?: ProductInquiry; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/inquiry/product/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      cache: "no-store",
      body: JSON.stringify({ id, upw }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "비밀번호 확인에 실패했습니다." };
    const item = (j?.item ?? j?.data?.item) as ProductInquiry | undefined;
    return item ? { ok: true, item } : { ok: false, error: "문의를 불러오지 못했습니다." };
  } catch { return { ok: false, error: "요청 중 오류가 발생했습니다." }; }
}

// 상품문의 삭제 — 회원(token) 또는 비회원(client-id + 비밀번호 upw). DELETE /api/v2/inquiry/product.
export async function deleteInquiry(token: string | null | undefined, id: number | string, upw?: string): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE) return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  if (!token && !e.PROSELL_CLIENT_ID) return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    else headers["X-App-Client-Id"] = e.PROSELL_CLIENT_ID;
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/inquiry/product`, {
      method: "DELETE",
      headers,
      cache: "no-store",
      body: JSON.stringify(upw ? { id, upw } : { id }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "문의 삭제에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "요청 중 오류가 발생했습니다." }; }
}

// 상품문의 수정 — 회원(token) 또는 비회원(client-id + 비밀번호 upw). PUT /api/v2/inquiry/product.
export async function updateInquiry(
  token: string | null | undefined,
  body: { id: number | string; product_id?: number | string; title: string; content: string; secret?: 0 | 1; url?: string; video_url?: string; category?: string; files?: number[]; upw?: string; send_phone?: 0 | 1; send_email?: 0 | 1 },
): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE) return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  if (!token && !e.PROSELL_CLIENT_ID) return { ok: false, error: "쇼핑몰 연결 설정이 필요합니다." };
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    else headers["X-App-Client-Id"] = e.PROSELL_CLIENT_ID;
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/inquiry/product`, {
      method: "PUT",
      headers,
      cache: "no-store",
      body: JSON.stringify({ id: body.id, ...(body.product_id ? { product_id: body.product_id } : {}), title: body.title, content: body.content, secret: body.secret ? 1 : 0, url: body.url ?? "", video_url: body.video_url ?? "", category: body.category ?? "", files: Array.isArray(body.files) ? body.files : [], ...(body.upw ? { upw: body.upw } : {}), ...(body.send_phone !== undefined ? { send_phone: body.send_phone } : {}), ...(body.send_email !== undefined ? { send_email: body.send_email } : {}) }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "문의 수정에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "요청 중 오류가 발생했습니다." }; }
}

// ── 내 상품리뷰(회원) ──────────────────────────────────────────
// 기존 GET /api/v2/review 가 user 토큰이면 본인 리뷰만 반환(mid 자동필터). 상품정보는 프론트가 조회.
export type MyReview = {
  id: number; prno: number; products_id: number; product_id: number;
  product_title: string | null; // 작성 당시 저장된 상품명(옵션 포함) — 판매중지·삭제 상품도 표시
  thumb: string | null;         // 주문 시점 대표이미지 — 판매중지·삭제 상품도 표시
  title: string | null; url: string | null; video_src: string | null; // 통합 게시판 전용(수정 프리필)
  content: string | null; score: number; best: number; dt: string | null;
  reply_content: string | null; reply_dt: string | null;
  files: { id: number; thumb: string | null; src: string | null }[];
};
export type MyReviewList = { total_count: number; items: MyReview[]; page: number };

// 작성 가능한 상품(구매확정·미작성) — order/products?reviewable=1 (회원 스코프, 페이징). 레거시 review/product-list.
export type ReviewableProduct = {
  prno: number; products_id: number; product_id: number;
  title: string; option: string; pro_fix_dt: string | null;
};
export type ReviewableList = { total_count: number; items: ReviewableProduct[]; page: number };

export async function fetchReviewableProducts(token: string, opts: { page?: number; limit?: number } = {}): Promise<ReviewableList> {
  const e = env();
  const page = Math.max(1, opts.page ?? 1);
  const limit = opts.limit ?? 5;
  const empty: ReviewableList = { total_count: 0, items: [], page };
  if (!e.PROSELL_API_BASE || !token) return empty;
  // 최근 1년 주문에서 구매확정·미작성 상품(서버가 review_day 창으로 추가 필터).
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const end = new Date();
  const start = new Date(); start.setFullYear(start.getFullYear() - 1);
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/order/products`);
  u.searchParams.set("reviewable", "1");
  u.searchParams.set("expand", "product,delivery");
  u.searchParams.set("period_start", ymd(start));
  u.searchParams.set("period_end", ymd(end));
  u.searchParams.set("page", String(page));
  u.searchParams.set("limit", String(limit));
  try {
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return empty;
    const j = await res.json().catch(() => null);
    const rows = Array.isArray(j?.items) ? j.items : [];
    const items: ReviewableProduct[] = rows.map((r: { product?: Record<string, unknown> }) => {
      const p = r.product ?? {};
      const optType = Number(p.products_option_type ?? 0);
      return {
        prno: Number(p.prno ?? 0),
        products_id: Number(p.products_id ?? 0),
        product_id: Number(p.product_id ?? 0),
        title: String(p.products_title ?? p.pro_title ?? "상품"),
        option: optType > 0 ? [p.pro_title, p.option_name].filter(Boolean).join(" / ") : "",
        pro_fix_dt: (p.pro_fix_dt as string) ?? null,
      };
    }).filter((x: ReviewableProduct) => x.prno > 0);
    return { total_count: Number(j?.total_count ?? 0), items, page };
  } catch { return empty; }
}

export async function fetchMyReviews(token: string, opts: { page?: number; limit?: number } = {}): Promise<MyReviewList> {
  const e = env();
  const page = Math.max(1, opts.page ?? 1);
  const limit = opts.limit ?? 10;
  const empty: MyReviewList = { total_count: 0, items: [], page };
  if (!e.PROSELL_API_BASE || !token) return empty;
  try {
    // 기간 미지정 시 백엔드가 period 를 «오늘»로 기본 설정 → 오늘 작성분만 나온다.
    // 내 작성 리뷰는 전체를 보여야 하므로 넓은 기간을 명시한다.
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/review`);
    u.searchParams.set("page", String(page));
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("period_start", "2000-01-01");
    u.searchParams.set("period_end", "2999-12-31");
    const res = await fetch(u.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return empty;
    return { total_count: Number(j.total_count ?? 0), items: Array.isArray(j.items) ? (j.items as MyReview[]) : [], page };
  } catch { return empty; }
}

// 상품평 설정 — 제목 사용 여부(board_type=1=통합게시판)만 필요. 회원/게스트 토큰 공용(isToken).
// 상품평 설정 — board_type(통합게시판)·review_edit(수정/삭제 허용). 회원/게스트 토큰 공용.
export type ReviewSetup = { unified: boolean; titleEnabled: boolean; editEnabled: boolean };
export async function fetchReviewSetup(token: string): Promise<ReviewSetup> {
  const e = env();
  const empty: ReviewSetup = { unified: false, titleEnabled: false, editEnabled: false };
  if (!e.PROSELL_API_BASE || !token) return empty;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/review/setup`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    if (!res.ok) return empty;
    const j = await res.json().catch(() => null);
    const unified = Number(j?.data?.board_type ?? 0) === 1;
    return { unified, titleEnabled: unified, editEnabled: Number(j?.data?.review_edit ?? 0) === 1 };
  } catch { return empty; }
}
export async function fetchReviewTitleEnabled(token: string): Promise<boolean> {
  return (await fetchReviewSetup(token)).titleEnabled;
}

// 상품평 수정 — 회원 본인·shop.review_edit 허용 시. PUT /api/v2/review/{id} { score, content, files? }
export async function updateReview(token: string, id: number, input: { score: number; content: string; files?: number[]; title?: string; url?: string; video_url?: string }): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  const body: Record<string, unknown> = { score: input.score, content: input.content };
  if (input.files) body.files = input.files;
  // 통합 게시판 전용 필드는 값이 정의됐을 때만 전송(개별 게시판은 백엔드 화이트리스트에서 무시).
  if (input.title !== undefined) body.title = input.title;
  if (input.url !== undefined) body.url = input.url;
  if (input.video_url !== undefined) body.video_url = input.video_url;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/review/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body), cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "상품평 수정에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "상품평 수정 중 오류가 발생했습니다." }; }
}

// 상품평 삭제 — 회원 본인·shop.review_edit 허용 시. DELETE /api/v2/review/{id}
export async function deleteReview(token: string, id: number): Promise<{ ok: boolean; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/review/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "상품평 삭제에 실패했습니다." };
    return { ok: true };
  } catch { return { ok: false, error: "상품평 삭제 중 오류가 발생했습니다." }; }
}

// 상품평 작성 — 회원 전용. prno(구매확정/교환완료 상품) 기준. files=업로드된 사진 id 배열.
export async function submitReview(token: string, input: { prno: number; score: number; content: string; files?: number[]; title?: string; url?: string; video_url?: string }): Promise<{ ok: boolean; id?: number; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  const body: Record<string, unknown> = { prno: input.prno, score: input.score, content: input.content };
  if (input.files && input.files.length) body.files = input.files;
  // 제목·URL·동영상 링크는 통합 게시판(board_type=1) 전용 → 값이 있을 때만 전송(개별 게시판은 백엔드가 무시).
  if (input.title && input.title.trim()) body.title = input.title.trim();
  if (input.url && input.url.trim()) body.url = input.url.trim();
  if (input.video_url && input.video_url.trim()) body.video_url = input.video_url.trim();
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/review`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "상품평 등록에 실패했습니다." };
    return { ok: true, id: Number(j?.id ?? 0) };
  } catch { return { ok: false, error: "상품평 등록 중 오류가 발생했습니다." }; }
}

// 상품평 사진 업로드(multipart) → 업로드된 파일 정보(id 포함) 반환.
export type ReviewFile = { id: number; thumb?: string; src?: string };
export async function uploadReviewPhotos(token: string, files: File[]): Promise<{ ok: boolean; items?: ReviewFile[]; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !token) return { ok: false, error: "요청을 처리할 수 없습니다." };
  if (!files.length) return { ok: false, error: "파일이 없습니다." };
  const fd = new FormData();
  files.forEach((f, i) => fd.append(`file${i}`, f, f.name));
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/review/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: fd,
      cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "사진 업로드에 실패했습니다." };
    const items = Array.isArray(j?.items) ? (j.items as ReviewFile[]) : [];
    return { ok: true, items };
  } catch { return { ok: false, error: "사진 업로드 중 오류가 발생했습니다." }; }
}

/** 결제수단 코드 → 라벨(주문내역 표시용, 백엔드 payMethodName 과 동일). */
export function payMethodLabel(m: number): string {
  const map: Record<number, string> = {
    100: "신용카드", 101: "신용카드", 110: "휴대폰결제", 120: "계좌이체", 130: "가상계좌",
    201: "페이코", 202: "토스페이", 203: "카카오페이", 204: "네이버페이", 205: "네이버 주문형",
    206: "제로페이", 207: "스마일페이", 208: "애플페이", 209: "위챗페이", 210: "내통장결제",
    300: "무통장입금", 500: "해외결제", 900: "전액포인트",
  };
  return map[m] ?? "결제";
}

// ───────────────────────────────────────────────────────────────────────────
// 서버 장바구니 — 라우트 핸들러(app/api/cart)에서 호출. owner 는 핸들러가 주입.
// 저장소는 레거시 cart(mid/user). 재고 차감 없음(차감은 주문 시). 단가는 주문옵션(ct=0) 서버 산정.
// ───────────────────────────────────────────────────────────────────────────

export type ServerCartItem = {
  line_key: string;
  products_id: number;
  product_id: number;
  ct: number; // 0 주문옵션 / 1 추가옵션
  title: string;
  option_label: string;
  price: number;
  quantity: number;
};
export type ServerCart = {
  owner: string;
  item_cnt: number;
  total_qty: number;
  total_price: number;
  items: ServerCartItem[];
};
export type ServerCartAddItem = {
  line_key: string;
  products_id: number;
  product_id: number;
  kind: "opt" | "addo";
  title?: string;
  label?: string;
  price?: number;
  quantity: number;
  request?: string; // 상품 요청사항(주문옵션 라인에만). 레거시 cart.request 컬럼.
  orderupload?: string; // 주문 파일접수 업로드 파일 id(콤마). 레거시 cart.orderupload.
  delivery_type?: number; // 선택 배송수단 3자리 코드(레거시 real_delivery_type).
};

async function cartApi(
  method: "GET" | "POST" | "PUT" | "DELETE",
  owner: string,
  body?: Record<string, unknown>
): Promise<ServerCart | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/cart`);
  const init: RequestInit = {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-App-Client-Id": e.PROSELL_CLIENT_ID,
    },
  };
  if (method === "GET") u.searchParams.set("owner", owner);
  else init.body = JSON.stringify({ owner, ...(body ?? {}) });
  try {
    const res = await fetch(u.toString(), init);
    const j = await res.json().catch(() => null);
    return (j?.data as ServerCart) ?? null;
  } catch {
    return null;
  }
}

export const getServerCart = (owner: string) => cartApi("GET", owner);
export const addServerCart = (owner: string, items: ServerCartAddItem[]) => cartApi("POST", owner, { items });
export const putServerCart = (owner: string, line_key: string, quantity: number) => cartApi("PUT", owner, { line_key, quantity });
export const delServerCart = (owner: string, line_key?: string) => cartApi("DELETE", owner, line_key ? { line_key } : {});
// 선택 다건 삭제 — line_keys 배열을 한 번에 전달(백엔드가 각 라인 + 같은 cid 추가옵션까지 삭제).
export const delServerCartMany = (owner: string, line_keys: string[]) => cartApi("DELETE", owner, { line_keys });

// 장바구니 이전(비회원 → 회원). 로그인 직후 라우트핸들러가 호출.
export async function mergeServerCart(fromOwner: string, toOwner: string): Promise<ServerCart | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/cart/merge`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      body: JSON.stringify({ from_owner: fromOwner, to_owner: toOwner }),
    });
    const j = await res.json().catch(() => null);
    return (j?.data as ServerCart) ?? null;
  } catch {
    return null;
  }
}

// 회원 장바구니 owner 키(로그인 시 cart_id 쿠키 값으로 사용). owner 정규식(8~64 \w) 충족.
export function memberCartOwner(mid: number | string): string {
  return `member_${mid}`;
}

// 배송 그룹 구조(레거시 Order\Cart 재현). GET /api/v2/cart?group=1
// 그룹 → 품목(item) → 추가옵션(addoptions) 중첩. 품목별로 배송그룹이 다를 수 있어 분리.
export type CartAddo = {
  line_key: string; title: string; option_label: string;
  unit: number; qty: number; line_total: number;
};
export type CartGroupItem = {
  line_key: string; products_id: number; product_id: number;
  title: string; thumb: string; option_label: string;
  unit: number; qty: number; line_total: number;
  bulk_discount?: number; soldout?: number; state?: number; addoption?: number;
  addoptions: CartAddo[]; item_total: number;
};
export type CartGroup = {
  key: string;
  orderable: number;
  supplier: { id: number; title: string };
  delivery: { method: number; method_label: string; fee: number; free_price: number; is_free: number };
  items: CartGroupItem[];
  subtotal: number;
  discount: number;
  shipping_fee: number;
};
export type CartGrouped = {
  owner: string;
  groups: CartGroup[];
  summary: {
    group_cnt: number; item_cnt: number; item_price: number;
    bulk_discount: number; discount?: number; goods_price: number; delivery_price: number; total_price: number;
  };
};

export async function getServerCartGrouped(owner: string, admcode = "", lineKeys = "", tab = ""): Promise<CartGrouped | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/cart`);
  u.searchParams.set("owner", owner);
  u.searchParams.set("group", "1");
  if (admcode) u.searchParams.set("admcode", admcode);
  if (/^[0-9,]+$/.test(lineKeys)) u.searchParams.set("line_keys", lineKeys); // 선택 품목만 계산
  if (tab === "country") u.searchParams.set("tab", "country"); // 해외배송 탭(국내는 기본값)
  try {
    const res = await fetch(u.toString(), {
      cache: "no-store",
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
    });
    const j = await res.json().catch(() => null);
    return (j?.data as CartGrouped) ?? null;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
//  자유게시판(bbs) — 레거시 커뮤니티 게시판(bbs_article_{id}/bbs_reply_{id}).
//  통합 cs 게시판(/api/v2/board)과 별개 시스템. 신규 API2 /api/v2/bbs 를 래핑.
//  회원/비회원(name+upw) 모두 지원. 비밀글은 본인/관리자 자동, 비회원은 upw 검증.
// ══════════════════════════════════════════════════════════════
export type BbsBoard = {
  bbs_id: string; title: string; slogan: string;
  use_category: boolean; categories: string[];
  rows: number;
  secret: number; adult: number; file: number; file_size_mb: number;
  video: number; url: number; hashtag: number; reply: number; good: number; reply_good: number;
  police: number; report_reasons: string[];   // 신고 사용 + 사유 목록
  view_list: number;   // 1이면 상세 하단에 게시물 리스트 노출
  list_level: number; view_level: number;   // 목록/내용 열람 필요 등급
  write_level: number; can_write: number; is_admin: number; adult_ok: number;
  recaptcha: string;   // 비회원 글쓰기용 reCAPTCHA 사이트키(빈값=불필요)
  fields_list: { num: boolean; ct: boolean; name: boolean; dt: boolean; view: boolean; good: boolean; nogood: boolean };
};
export type BbsArticleSummary = {
  id: number; number: number | string | null; category: string | null; title: string;
  name: string; is_guest: boolean; dt: string; dt_full: string;
  view: number; good: number; nogood: number; reply_count: number;
  secret: number; adult: number; locked: number; is_mine: number;
  has_url: number; has_photo: number; has_file: number; is_new: number;
};
export type BbsList = {
  board: BbsBoard | null; notices: BbsArticleSummary[]; articles: BbsArticleSummary[];
  total_count: number; total_page: number; page: number; list_msg: number; blocked: number;
};
export type BbsFile = { id: number; name: string; size: number; href: string };
export type BbsImage = { url: string; width: number; height: number };
export type BbsAttachmentRef = { id: number; mode: string; name: string; is_image: number };
export type BbsArticleDetail = {
  id: number; category: string | null; title: string; name: string; is_guest: boolean;
  dt: string; view: number; secret: number; adult: number; notice: number;
  url: string | null; good: number; nogood: number; hashtags: string[]; videos: string[];
  read: number; locked: number; adult_blocked: number; view_blocked: number; is_mine: number; can_edit: number; can_delete: number;
  content: string | null; images: BbsImage[]; files: BbsFile[]; attachments: BbsAttachmentRef[];
};
export type BbsArticleLink = { id: number; title: string; secret: number } | null;
export type BbsReply = {
  id: number; reply_id: number; is_reply: number; name: string; is_guest: boolean; is_mine: number;
  good: number; nogood: number;
  content: string; blind: number; dt: string; can_edit: number; can_delete: number; can_reply: number;
};
export type BbsArticleView = {
  board: BbsBoard | null; article: BbsArticleDetail | null;
  prev: BbsArticleLink; next: BbsArticleLink; replies: BbsReply[];
};
export type BbsUploadItem = { id: number; mode: string; name: string; size: number; is_image: number; width: number; height: number; src: string };

// 읽기 헤더: 토큰(회원) 우선, 없으면 client-id(비회원).
function bbsReadHeaders(token?: string): Record<string, string> {
  const e = env();
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  else h["X-App-Client-Id"] = e.PROSELL_CLIENT_ID;
  return h;
}

export type BbsListInput = { page?: number; ct?: string; c?: number; q?: string };

/** 게시판 목록 + 메타. (GET /api/v2/bbs) 서버사이드 전용. */
export async function fetchBbsList(bbsId: string, opts: BbsListInput = {}, token?: string): Promise<BbsList> {
  const e = env();
  const page = Math.max(1, opts.page ?? 1);
  const empty: BbsList = { board: null, notices: [], articles: [], total_count: 0, total_page: 0, page, list_msg: 0, blocked: 0 };
  if (!e.PROSELL_API_BASE || !/^[a-zA-Z0-9_-]+$/.test(bbsId)) return empty;
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/bbs`);
    u.searchParams.set("bbs_id", bbsId);
    u.searchParams.set("page", String(page));
    if (opts.ct) u.searchParams.set("ct", opts.ct);
    if (opts.c && opts.q) { u.searchParams.set("c", String(opts.c)); u.searchParams.set("q", opts.q); }
    const res = await fetch(u.toString(), { headers: bbsReadHeaders(token), cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return empty;
    return {
      board: (j.board as BbsBoard) ?? null,
      notices: Array.isArray(j.notices) ? (j.notices as BbsArticleSummary[]) : [],
      articles: Array.isArray(j.articles) ? (j.articles as BbsArticleSummary[]) : [],
      total_count: Number(j.total_count ?? 0),
      total_page: Number(j.total_page ?? 0),
      page: Number(j.page ?? page),
      list_msg: Number(j.list_msg ?? 0),
      blocked: Number(j.blocked ?? 0),
    };
  } catch { return empty; }
}

/** 게시물 상세(+이전/다음/댓글). (GET /api/v2/bbs/article) 비밀글은 upw 로 열람. 서버사이드 전용. */
export async function fetchBbsArticle(bbsId: string, id: number | string, opts: { upw?: string } = {}, token?: string): Promise<BbsArticleView | null> {
  const e = env();
  const aid = Number(id);
  if (!e.PROSELL_API_BASE || !/^[a-zA-Z0-9_-]+$/.test(bbsId) || !Number.isInteger(aid) || aid <= 0) return null;
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/bbs/article`);
    u.searchParams.set("bbs_id", bbsId);
    u.searchParams.set("id", String(aid));
    if (opts.upw) u.searchParams.set("upw", opts.upw);
    const res = await fetch(u.toString(), { headers: bbsReadHeaders(token), cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return null;
    return {
      board: (j.board as BbsBoard) ?? null,
      article: (j.article as BbsArticleDetail) ?? null,
      prev: (j.prev as BbsArticleLink) ?? null,
      next: (j.next as BbsArticleLink) ?? null,
      replies: Array.isArray(j.replies) ? (j.replies as BbsReply[]) : [],
    };
  } catch { return null; }
}

/** 댓글 목록만 조회(작성 후 갱신용). (GET /api/v2/bbs/reply) */
export async function fetchBbsReplies(bbsId: string, articleId: number | string, token?: string): Promise<BbsReply[]> {
  const e = env();
  if (!e.PROSELL_API_BASE) return [];
  try {
    const u = new URL(`${e.PROSELL_API_BASE}/api/v2/bbs/reply`);
    u.searchParams.set("bbs_id", bbsId);
    u.searchParams.set("article_id", String(articleId));
    const res = await fetch(u.toString(), { headers: bbsReadHeaders(token), cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.error) return [];
    return Array.isArray(j.replies) ? (j.replies as BbsReply[]) : [];
  } catch { return []; }
}

export type BbsArticleInput = {
  bbs_id: string; article_id?: number;
  ar_ct?: string; ar_title: string; ar_content: string;
  ar_secret?: number; ar_adult?: number; ar_notice?: number; ar_thumb?: number;
  ar_url?: string; ar_hashtag?: string; ar_video1?: string; ar_video2?: string; ar_video3?: string;
  upload_file1?: number; upload_file2?: number; upload_file3?: number;
  name?: string; upw?: string; recaptcha?: string;    // 비회원
};

// bbs 쓰기 공통 호출. token 있으면 회원, 없으면 비회원(client-id) 으로 요청.
async function bbsMutate(method: "POST" | "PUT" | "DELETE", path: string, token: string | undefined, body: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE) return { ok: false, error: "요청을 처리할 수 없습니다." };
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  else headers["X-App-Client-Id"] = e.PROSELL_CLIENT_ID;   // 비회원
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/bbs${path}`, {
      method, headers, body: JSON.stringify(body), cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "요청을 처리할 수 없습니다." };
    return { ok: true, data: j };
  } catch { return { ok: false, error: "통신 오류가 발생했습니다." }; }
}

/** 게시물 등록. token 없으면 비회원(name+upw 필요). */
export function createBbsArticle(token: string | undefined, input: BbsArticleInput) {
  return bbsMutate("POST", "/article", token, input as Record<string, unknown>);
}
/** 게시물 수정(article_id 필수). */
export function updateBbsArticle(token: string | undefined, input: BbsArticleInput) {
  return bbsMutate("PUT", "/article", token, input as Record<string, unknown>);
}
/** 게시물 삭제(비회원은 upw). */
export function deleteBbsArticle(token: string | undefined, bbs_id: string, article_id: number, upw?: string) {
  return bbsMutate("DELETE", "/article", token, { bbs_id, article_id, upw });
}
/** 댓글/대댓글 작성(reply_id 있으면 대댓글). */
export function createBbsReply(token: string | undefined, bbs_id: string, article_id: number, content: string, reply_id?: number) {
  return bbsMutate("POST", "/reply", token, { bbs_id, article_id, content, reply_id: reply_id ?? 0 });
}
/** 댓글 수정. */
export function updateBbsReply(token: string | undefined, bbs_id: string, article_id: number, reply_id: number, content: string) {
  return bbsMutate("PUT", "/reply", token, { bbs_id, article_id, reply_id, content });
}
/** 댓글 삭제. */
export function deleteBbsReply(token: string | undefined, bbs_id: string, article_id: number, reply_id: number) {
  return bbsMutate("DELETE", "/reply", token, { bbs_id, article_id, reply_id });
}
/** 게시물/댓글 추천(mode=1)·반대(mode=2). reply_id 있으면 댓글. 반환 data.good/nogood. */
export function voteBbs(token: string | undefined, bbs_id: string, article_id: number, mode: 1 | 2, reply_id?: number) {
  return bbsMutate("POST", "/good", token, reply_id ? { bbs_id, article_id, reply_id, mode } : { bbs_id, article_id, mode });
}
/** 게시물/댓글 신고. reply_id 있으면 댓글. ct=신고 사유. 로그인 필요. */
export function reportBbs(token: string | undefined, bbs_id: string, article_id: number, ct: string, reply_id?: number) {
  return bbsMutate("POST", "/police", token, reply_id ? { bbs_id, article_id, reply_id, ct } : { bbs_id, article_id, ct });
}

/** 첨부 업로드(multipart). (POST /api/v2/bbs/upload) token 없으면 비회원(client-id). */
export async function uploadBbsFiles(token: string | undefined, bbsId: string, files: File[], mode = "file1"): Promise<{ ok: boolean; items?: BbsUploadItem[]; error?: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE) return { ok: false, error: "요청을 처리할 수 없습니다." };
  if (!files.length) return { ok: false, error: "파일이 없습니다." };
  const fd = new FormData();
  fd.append("bbs_id", bbsId);
  fd.append("mode", mode);
  files.forEach((f, i) => fd.append(`file${i}`, f, f.name));
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  else headers["X-App-Client-Id"] = e.PROSELL_CLIENT_ID;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/bbs/upload`, {
      method: "POST", headers, body: fd, cache: "no-store",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || j?.error) return { ok: false, error: j?.error?.message || "업로드에 실패했습니다." };
    return { ok: true, items: Array.isArray(j?.items) ? (j.items as BbsUploadItem[]) : [] };
  } catch { return { ok: false, error: "업로드 중 오류가 발생했습니다." }; }
}
