import { cookies } from "next/headers";

// 쿠키 키 (HttpOnly — 브라우저 JS 접근 불가)
export const AT = "pa_at"; // access token
export const RT = "pa_rt"; // refresh token
export const ST = "pa_state"; // oauth state (일회용)

// 선제 갱신 skew: AT 쿠키 수명을 실제 토큰 수명보다 이만큼 짧게 둔다.
// → 실제 만료 SKEW 초 전에 브라우저가 AT 쿠키를 삭제 → 다음 요청에서 미들웨어가 선제 갱신.
export const AT_SKEW = 300; // 5분
// expires_in(초)으로 AT 쿠키 maxAge 산출. 폴백 10800(3h). 최소 60초 보장.
export function atCookieMaxAge(expiresIn?: number): number {
  const ttl = typeof expiresIn === "number" && expiresIn > 0 ? expiresIn : 10800;
  return Math.max(60, ttl - AT_SKEW);
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

function authHeaders(token?: string): Record<string, string> {
  const e = env();
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`; // 회원: 등급 할인 반영
  else h["X-App-Client-Id"] = e.PROSELL_CLIENT_ID; // 비회원: 클라이언트 인증
  return h;
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
  origin?: { id: number; title?: string | null; category?: string | null; soldout?: number };
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
  };
  images?: { thumb?: string | null; url?: string | null }[]; // 전체 이미지 (상세용)
  images_thumb?: { thumb?: string | null; url?: string | null }[]; // 대표/목록 이미지만 (목록 경량용)
  content?: { detail?: string | null };
  product?: ProductOption[]; // 전체 옵션 (상세용)
  product_first?: ProductOption | null; // 대표(0번째) 옵션 (목록 경량용)
};

/** 목록용 경량 expand: 이미지는 대표/목록만, 옵션은 대표 1건만 — 전체 fetch 회피 */
export const LIST_EXPAND = "origin,benefit,images_thumb,product_first";
export const DETAIL_EXPAND = "origin,benefit,images,content,product";

export type ProductList = { total_count: number; items: ProductItem[] };

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

    const res = await fetch(u.toString(), { headers: authHeaders(token), cache: "no-store" });
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
  const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/user/account`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const j = (await res.json().catch(() => null)) as { data?: Partial<Account> } | null;
  const d = j?.data ?? {};
  return { origin: d.origin ?? {}, info: d.info ?? {}, files: Array.isArray(d.files) ? d.files : [] };
}

export type AccountUpdate = {
  nick?: string; name?: string; email?: string; hp?: string; tel?: string;
  birth?: string; gender?: number;
  email_receive?: boolean; hp_receive?: boolean;
  zipcode?: string; addr1?: string; addr2?: string; admcode?: string; place?: string;
  bank?: number; banknum?: string; bankholder?: string; interest?: string; profile?: string;
  current_upw?: string; new_upw?: string;
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

/** 가입 약관 본문 조회. id=service(이용약관)|privacy(개인정보) */
export async function fetchTerms(id: "service" | "privacy"): Promise<string> {
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
      // 관리자 수정 후 즉시 반영이 필요하면 revalidateTag("shop-footer") 로 퍼지(웹훅 연동 시).
      next: { revalidate: 60, tags: ["shop-footer"] },
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { data?: ShopFooter } | null;
    return j?.data ?? null;
  } catch {
    return null;
  }
}

// ── 상품 상세(스토어프론트 전용 API) ──────────────────────────
export type ProductViewOption = {
  id: number; label: string;
  o1: string | null; o2: string | null; o3: string | null;
  price: number; sale_price: number; stock: number; soldout: number;
};
export type ProductView = {
  id: number; title: string | null; category: string | null; summary: string | null;
  soldout: number; adult: number;
  option_type: number; option_titles: (string | null)[];
  quantity_min: number; quantity_max: number;
  price: { sale: number; original: number; sale_high: number; original_high: number; discount_percent: number; point: number; coupon: number };
  gallery: { src: string; thumb: string }[];
  options: ProductViewOption[];
  addoption: number[];
  bulk_discount: { type: string; unit: string; tiers: { range: number; value: number }[] } | null;
  card_benefits: { card: string; months: string }[];
  request: { use: number; required: number; text: string | null; upload_use: number; uploads: { title?: string; req?: number }[] };
  delivery: { use: number; fee: number; free_over: number; bundle: number; area1_price: number; area2_price: number; weight: number; parcel_type: number; extra_charge: number; guide: string | null };
  shipping: { delivery: string | null; exchange: string | null; as: string | null };
  information: { name: string; content: string }[];
  detail_html: string | null;
  report: { review_cnt: number; review_score: number; inquiry_cnt: number; order_cnt: number };
};

export type Addoption = { id: number; title: string; req_type: number; options: { name: string; price: number }[] };

/** 추가 주문옵션 조회 — /api/v2/addoptions?id=1,2,3. 상품의 addoption id 목록을 해석. */
export async function fetchAddoptions(ids: number[], token?: string): Promise<Addoption[]> {
  const e = env();
  if (!e.PROSELL_API_BASE || ids.length === 0) return [];
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/addoptions?id=${ids.join(",")}`, {
      headers: authHeaders(token), cache: "no-store",
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
 *  로그인 토큰이면 등급가 반영. 가격 개인화 때문에 캐시하지 않음. 없으면 null. */
export async function fetchProductView(id: string, token?: string): Promise<ProductView | null> {
  const e = env();
  if (!e.PROSELL_API_BASE) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/products/view/${encodeURIComponent(id)}`, {
      headers: authHeaders(token),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { data?: ProductView } | null;
    return j?.data ?? null;
  } catch {
    return null;
  }
}

// ── 디자인 페이지(이용약관/개인정보 처리방침 등) ────────────────
export type ShopPage = { pid: string; title: string | null; slogan: string | null; mode: number; content: string | null };

/** 디자인 페이지 조회 — 비회원(client_id). (GET /api/v2/page?pid=) 읽기 전용.
 *  pid 예: policy/privacy. 백엔드 Redis 캐시(10분) + ISR 5분. 없으면 null. */
export async function fetchPage(pid: string): Promise<ShopPage | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID || !pid) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/page?pid=${encodeURIComponent(pid)}`, {
      headers: { Accept: "application/json", "X-App-Client-Id": e.PROSELL_CLIENT_ID },
      next: { revalidate: 300, tags: [`page-${pid}`] },
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
      // 카테고리는 자주 안 바뀜 → ISR 5분. 관리자 변경 즉시 반영이 필요하면 revalidateTag("categories").
      next: { revalidate: 300, tags: ["categories"] },
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
export async function socialLogin(provider: string, code: string, redirectUri: string, state = "", clientIp?: string): Promise<LoginResult & { created?: boolean }> {
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

/** 가격 포맷 */
// won 은 클라이언트 컴포넌트도 쓰므로 서버 의존성 없는 lib/format 에 두고 재노출.
export { won } from "./format";

/** 표시용 대표가/정가 추출 */
export function priceOf(it: ProductItem): { price?: number; base?: number } {
  const b = it.benefit ?? {};
  // 현재 판매가: 실서버=low_price(할인 반영). 단일가/데모 폴백=discount_price→price.
  const sale = b.low_price ?? b.discount_price ?? b.price;
  // 원가(정가): 실서버=product_low_price, 데모 폴백=price. 판매가보다 클 때만 취소선 표시.
  const original = b.product_low_price ?? b.price;
  const base = original != null && sale != null && original > sale ? original : undefined;
  return { price: sale, base };
}

/**
 * 이미지 URL 정규화.
 *  - 로컬 도커: prosell 이 //{shop_id}.cdnpro.kr/... 로 주는데 그 CDN엔 파일이 없음.
 *    실제 파일은 로컬 nginx 에 있으므로 호스트를 PROSELL_IMAGE_BASE 로 치환.
 *  - 운영: PROSELL_IMAGE_BASE 미설정 → protocol-relative(//) 만 https 로 보정하고 원본 유지.
 */
export function imgUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  const base = env().PROSELL_IMAGE_BASE;
  if (!base) return u.startsWith("//") ? "https:" + u : u;
  const path = u.replace(/^(https?:)?\/\/[^/]+/, ""); // 스킴+호스트 제거 → 경로만
  return base.replace(/\/$/, "") + (path.startsWith("/") ? path : "/" + path);
}

/** 상세 본문 HTML 안의 이미지 호스트(cdnpro.kr / nginx)도 이미지 베이스로 치환 */
export function rewriteContent(html?: string | null): string {
  if (!html) return "";
  const base = env().PROSELL_IMAGE_BASE;
  if (!base) return html;
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
  const img = (it.images ?? it.images_thumb)?.[0];
  return imgUrl(img?.thumb || img?.url);
}

// ───────────────────────────────────────────────────────────────────────────
// 레거시 연동 주문(체크아웃) — 레거시 cart → oid 세션 → \Order\OrderCreate → o{YYMM}_*.
//   prepare(POST /api/v2/order/checkout/prepare) : 장바구니/바로구매 → oid 발행
//   session(GET  .../session?oid=)               : 주문서 표시(품목/합계)
//   submit (POST /api/v2/order/checkout)         : oid + 결제수단 → 주문 생성
// 인증: 회원 Bearer / 비회원 X-App-Client-Id + X-Guest-Id(cart_id).
// ───────────────────────────────────────────────────────────────────────────

export type PayMethodOpt = { method: number; label: string };
export type CheckoutInit = {
  buyer: { name: string; hp: string; email: string };
  point: number;
  banks: { code: string; num: string; holder: string; title: string }[];
  pg_id: number;
  methods: { general: PayMethodOpt[]; easy: PayMethodOpt[]; bank: number; point: number };
};

export type CallbackState = {
  state: "complete" | "pending" | "failed";
  order_state: number;
  pay_state?: number;
  error_code?: string;
};

export type BuyItem = { line_key: string; products_id: number; product_id: number; kind: "opt" | "addo"; quantity: number };

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
  delivery_message?: string;
  point_price?: number;
};

export type CheckoutSession = {
  oid: string;
  items: { products_id: number; title: string; option_label: string; thumb: string; qty: number; unit: number; line_total: number; item_total: number; soldout: number; addoptions: { title: string; name: string; qty: number; unit: number; line_total: number }[] }[];
  summary: { item_cnt: number; item_price: number; delivery_price: number; total_price: number };
};

export type CheckoutResult =
  | { ok: true; pno: string; pg: number; payurl: string; polling: number }
  | { ok: false; code: string; message: string };

export type OrderResult = {
  pno: string; oid: string; state: number; title: string; dt: string;
  buyer: { name: string; hp: string; email: string };
  receiver: { name: string; hp: string; zipcode: string; addr1: string; addr2: string; message: string };
  payment: {
    method: number; method_label: string; state: number; state_label: string;
    pay_price: number; item_price: number; delivery_price: number;
    bank: { title: string; num: string; holder: string; sender: string; deadline: string } | null;
  };
  items: { prno: string; is_option: number; products_id: number; product_id: number; title: string; option_label: string; quantity: number; price: number; amount_price: number }[];
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
export async function prepareOrder(auth: CheckoutAuth, items?: BuyItem[]): Promise<{ ok: true; oid: string; from: string } | { ok: false; code: string; message: string }> {
  const e = env();
  if (!e.PROSELL_API_BASE || !hasAuth(auth)) return { ok: false, code: "CONFIG", message: "주문 권한이 없습니다." };
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/checkout/prepare`, {
      method: "POST", cache: "no-store",
      headers: checkoutHeaders(auth, { "Content-Type": "application/json" }),
      body: JSON.stringify(items && items.length ? { items } : {}),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.data?.oid) {
      const err = j?.error ?? {};
      return { ok: false, code: err.code ?? "ERROR", message: err.message ?? "주문서 생성에 실패했습니다." };
    }
    return { ok: true, oid: String(j.data.oid), from: String(j.data.from || "cart") };
  } catch { return { ok: false, code: "NETWORK", message: "주문 요청 중 오류가 발생했습니다." }; }
}

/** 주문 세션 조회(oid) — 표시용 품목 + 합계 */
export async function getCheckoutSession(auth: CheckoutAuth, oid: string): Promise<CheckoutSession | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !hasAuth(auth)) return null;
  try {
    const res = await fetch(`${e.PROSELL_API_BASE}/api/v2/order/checkout/session?oid=${encodeURIComponent(oid)}`, {
      method: "GET", cache: "no-store", headers: checkoutHeaders(auth),
    });
    const j = await res.json().catch(() => null);
    return res.ok && j?.data ? (j.data as CheckoutSession) : null;
  } catch { return null; }
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
    bulk_discount: number; goods_price: number; delivery_price: number; total_price: number;
  };
};

export async function getServerCartGrouped(owner: string, admcode = ""): Promise<CartGrouped | null> {
  const e = env();
  if (!e.PROSELL_API_BASE || !e.PROSELL_CLIENT_ID) return null;
  const u = new URL(`${e.PROSELL_API_BASE}/api/v2/cart`);
  u.searchParams.set("owner", owner);
  u.searchParams.set("group", "1");
  if (admcode) u.searchParams.set("admcode", admcode);
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
