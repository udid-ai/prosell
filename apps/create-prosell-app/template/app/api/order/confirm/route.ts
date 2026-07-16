import { NextRequest, NextResponse } from "next/server";
import { getOrderToken, confirmPurchase } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 구매확정 — 회원(pa_at) 또는 비회원 주문조회(guest gt) 토큰. POST /api/order/confirm { prno: number[] }
export async function POST(req: NextRequest) {
  const token = await getOrderToken();
  if (!token) return NextResponse.json({ ok: false, error: "주문 조회 권한이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { prno?: unknown };
  const prnos = Array.isArray(b.prno) ? b.prno.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (prnos.length === 0) return NextResponse.json({ ok: false, error: "구매확정할 상품이 없습니다." }, { status: 400 });
  const r = await confirmPurchase(token, prnos);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, count: r.count });
}
