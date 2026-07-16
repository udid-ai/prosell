import { NextRequest, NextResponse } from "next/server";
import { getToken, fetchCheckoutCoupons, applyCheckoutCoupon } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 체크아웃 쿠폰 — 회원 전용(pa_at 토큰). 비회원은 쿠폰을 쓸 수 없다.
// GET  /api/order/coupon?type=bundle|delivery|product  → 보유 쿠폰 후보 목록
// POST /api/order/coupon  { oid, type, id?, coupon_id } → 적용(coupon_id=0=해제)

export async function GET(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const type = req.nextUrl.searchParams.get("type") || "";
  const id = Number(req.nextUrl.searchParams.get("id")) || 0;
  const oid = req.nextUrl.searchParams.get("oid") || ""; // 묶음/배송쿠폰 사용가능 필터용 주문 컨텍스트
  const ua = req.headers.get("user-agent") || ""; // 실제 사용자 UA(모바일 전용 쿠폰 device 판정용)
  const r = await fetchCheckoutCoupons({ token }, type, id, oid, ua);
  return NextResponse.json({ ok: true, items: r.items, base_price: r.base_price, applied_coupon_id: r.applied_coupon_id });
}

export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { oid?: string; type?: string; id?: number; coupon_id?: number };
  if (!b.oid || !b.type) return NextResponse.json({ ok: false, error: "요청 정보가 올바르지 않습니다." }, { status: 400 });
  const r = await applyCheckoutCoupon(
    { token },
    { oid: String(b.oid), type: String(b.type), id: b.id, coupon_id: Number(b.coupon_id) || 0 },
  );
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
