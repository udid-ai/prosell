import { NextRequest, NextResponse } from "next/server";
import { getToken, getServerCart, getServerCartGrouped, addServerCart, putServerCart, delServerCart, delServerCartMany, type ServerCartAddItem } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 장바구니 소유자 식별 쿠키. 로그인 시 member_<mid>, 비회원은 랜덤 hex(cart_id).
const COOKIE = "cart_id";
const RT = "pa_rt"; // 리프레시 토큰 쿠키(존재=아직 로그인 상태)

// member_<mid> 소유자 키는 «유효한 회원 토큰이 있을 때만» 인정한다.
// 토큰이 사라졌는데(로그아웃/만료) cart_id 쿠키에 member_* 가 남아 있으면 비회원이 남의 회원
// 장바구니를 보거나 주문하려다 실패(CART_EMPTY)하는 문제가 생긴다 → 토큰 없으면 무효 처리.
function isMemberOwner(v: string): boolean {
  return /^member_/.test(v);
}
function rawOwner(req: NextRequest): string | null {
  const v = req.cookies.get(COOKIE)?.value;
  return v && /^[\w-]{8,64}$/.test(v) ? v : null;
}
// 요청의 실제 소유자. 회원(token)이면 member_* 인정, 비회원이면 게스트 cart_id 만(member_* 는 거부).
async function ownerFor(req: NextRequest): Promise<string | null> {
  const raw = rawOwner(req);
  if (!raw) return null;
  if (isMemberOwner(raw)) {
    // member_<mid> 는 로그인 시 서버가 httpOnly 로 세팅한 신뢰값. AT 쿠키는 실제 만료 5분 전 조기만료되고
    // 미들웨어는 문서 네비게이션에서만 갱신하므로, 담기 fetch 순간엔 AT 가 잠깐 없을 수 있다.
    // 이때 게스트로 폴백하면 cart 에 mid=0 으로 저장되고 cart_id 쿠키까지 게스트로 덮여 복구가 안 된다.
    // → AT 가 없어도 RT(리프레시 토큰)가 있으면 아직 로그인 상태이므로 member_* 를 유효 처리한다(완전 로그아웃만 무효).
    if (await getToken()) return raw;
    if (req.cookies.get(RT)?.value) return raw;
    return null;
  }
  return raw; // 게스트 id
}
function newOwner(): string {
  return crypto.randomUUID().replace(/-/g, ""); // 32자 hex
}
function withCookie(res: NextResponse, req: NextRequest, owner: string): NextResponse {
  if (rawOwner(req) !== owner) {
    const secure = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "")) === "https";
    res.cookies.set(COOKIE, owner, { httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: 60 * 60 * 24 * 90 });
  }
  return res;
}
// 비회원이 남긴 stale member_* 쿠키를 지운다(다음 요청부터 게스트로 정상 동작).
function clearStale(res: NextResponse, req: NextRequest): NextResponse {
  const raw = req.cookies.get(COOKIE)?.value;
  if (raw && isMemberOwner(raw)) res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

// 조회 — ?group=1 이면 배송 그룹 구조, 아니면 평면 목록
export async function GET(req: NextRequest) {
  const owner = await ownerFor(req);
  const grouped = req.nextUrl.searchParams.get("group") === "1";

  if (grouped) {
    const empty = { owner: "", groups: [], summary: { group_cnt: 0, item_cnt: 0, item_price: 0, bulk_discount: 0, goods_price: 0, delivery_price: 0, total_price: 0 } };
    if (!owner) return clearStale(NextResponse.json(empty), req);
    const admcode = req.nextUrl.searchParams.get("admcode") || "";
    const lineKeys = req.nextUrl.searchParams.get("line_keys") || ""; // 선택 품목만 계산(체크박스)
    const tab = req.nextUrl.searchParams.get("tab") || ""; // domestic(기본)/country(해외배송)
    const cart = await getServerCartGrouped(owner, admcode, lineKeys, tab);
    return NextResponse.json(cart ?? empty);
  }

  if (!owner) return clearStale(NextResponse.json({ owner: "", item_cnt: 0, total_qty: 0, total_price: 0, items: [] }), req);
  const cart = await getServerCart(owner);
  return NextResponse.json(cart ?? { owner, item_cnt: 0, total_qty: 0, total_price: 0, items: [] });
}

// 담기 — 로그인 회원은 member_*, 비회원은 게스트 cart_id(없으면 새로 발급).
export async function POST(req: NextRequest) {
  const owner = (await ownerFor(req)) ?? newOwner();
  const body = (await req.json().catch(() => ({}))) as { items?: ServerCartAddItem[] };
  if (!Array.isArray(body.items) || !body.items.length) {
    return NextResponse.json({ ok: false, error: "담을 품목이 없습니다." }, { status: 400 });
  }
  const cart = await addServerCart(owner, body.items);
  if (!cart) return NextResponse.json({ ok: false, error: "장바구니 담기에 실패했습니다." }, { status: 502 });
  return withCookie(NextResponse.json({ ok: true, cart }), req, owner);
}

// 수량 변경
export async function PUT(req: NextRequest) {
  const owner = await ownerFor(req);
  if (!owner) return NextResponse.json({ ok: false, error: "장바구니가 없습니다." }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { line_key?: string; quantity?: number };
  if (!b.line_key) return NextResponse.json({ ok: false, error: "line_key 필요" }, { status: 400 });
  const cart = await putServerCart(owner, b.line_key, Number(b.quantity) || 0);
  return NextResponse.json({ ok: true, cart });
}

// 삭제(line_key) / 전체 비우기
export async function DELETE(req: NextRequest) {
  const owner = await ownerFor(req);
  if (!owner) return NextResponse.json({ ok: true, cart: { owner: "", item_cnt: 0, total_qty: 0, total_price: 0, items: [] } });
  const b = (await req.json().catch(() => ({}))) as { line_key?: string; line_keys?: string[] };
  // 선택 다건 삭제(line_keys) 우선 → 단건(line_key) → 전체 비우기
  const cart = Array.isArray(b.line_keys)
    ? await delServerCartMany(owner, b.line_keys.map(String))
    : await delServerCart(owner, b.line_key);
  return NextResponse.json({ ok: true, cart });
}
