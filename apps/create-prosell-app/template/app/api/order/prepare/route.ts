import { NextRequest, NextResponse } from "next/server";
import { getToken, prepareOrder, type CheckoutAuth, type BuyItem } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// POST /api/order/prepare → 주문 세션 발행. body: { items?: BuyItem[] }
// items 있으면 바로구매, 없으면 장바구니 전체. oid 반환 → 클라이언트가 /order/[oid] 로 이동.
const CART_COOKIE = "cart_id";

async function resolveAuth(req: NextRequest): Promise<CheckoutAuth | null> {
  const token = await getToken();
  if (token) return { token };
  const guest = req.cookies.get(CART_COOKIE)?.value;
  if (guest && /^[\w-]{8,64}$/.test(guest)) return { guest };
  return null;
}

export async function POST(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) return NextResponse.json({ ok: false, error: "주문 권한이 없습니다." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { items?: BuyItem[] };
  const r = await prepareOrder(auth, body.items);
  if (!r.ok) return NextResponse.json({ ok: false, code: r.code, error: r.message }, { status: 400 });
  return NextResponse.json({ ok: true, oid: r.oid, from: r.from });
}
