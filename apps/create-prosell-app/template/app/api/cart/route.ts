import { NextRequest, NextResponse } from "next/server";
import { getServerCart, getServerCartGrouped, addServerCart, putServerCart, delServerCart, type ServerCartAddItem } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 게스트 장바구니 소유자 식별 쿠키. 회원 연동은 후속 단계(mid 매핑).
const COOKIE = "cart_id";

function readOwner(req: NextRequest): string | null {
  const v = req.cookies.get(COOKIE)?.value;
  return v && /^[\w-]{8,64}$/.test(v) ? v : null;
}
function newOwner(): string {
  return crypto.randomUUID().replace(/-/g, ""); // 32자 hex
}
function withCookie(res: NextResponse, req: NextRequest, owner: string): NextResponse {
  if (readOwner(req) !== owner) {
    const secure = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "")) === "https";
    res.cookies.set(COOKIE, owner, { httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: 60 * 60 * 24 * 90 });
  }
  return res;
}

// 조회 — ?group=1 이면 배송 그룹 구조, 아니면 평면 목록
export async function GET(req: NextRequest) {
  const owner = readOwner(req);
  const grouped = req.nextUrl.searchParams.get("group") === "1";

  if (grouped) {
    const empty = { owner: owner ?? "", groups: [], summary: { group_cnt: 0, item_cnt: 0, item_price: 0, bulk_discount: 0, goods_price: 0, delivery_price: 0, total_price: 0 } };
    if (!owner) return NextResponse.json(empty);
    const admcode = req.nextUrl.searchParams.get("admcode") || "";
    const cart = await getServerCartGrouped(owner, admcode);
    return NextResponse.json(cart ?? empty);
  }

  if (!owner) return NextResponse.json({ owner: "", item_cnt: 0, total_qty: 0, total_price: 0, items: [] });
  const cart = await getServerCart(owner);
  return NextResponse.json(cart ?? { owner, item_cnt: 0, total_qty: 0, total_price: 0, items: [] });
}

// 담기
export async function POST(req: NextRequest) {
  const owner = readOwner(req) ?? newOwner();
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
  const owner = readOwner(req);
  if (!owner) return NextResponse.json({ ok: false, error: "장바구니가 없습니다." }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { line_key?: string; quantity?: number };
  if (!b.line_key) return NextResponse.json({ ok: false, error: "line_key 필요" }, { status: 400 });
  const cart = await putServerCart(owner, b.line_key, Number(b.quantity) || 0);
  return NextResponse.json({ ok: true, cart });
}

// 삭제(line_key) / 전체 비우기
export async function DELETE(req: NextRequest) {
  const owner = readOwner(req);
  if (!owner) return NextResponse.json({ ok: true, cart: { owner: "", item_cnt: 0, total_qty: 0, total_price: 0, items: [] } });
  const b = (await req.json().catch(() => ({}))) as { line_key?: string };
  const cart = await delServerCart(owner, b.line_key);
  return NextResponse.json({ ok: true, cart });
}
