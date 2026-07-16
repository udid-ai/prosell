import { NextRequest, NextResponse } from "next/server";
import { getToken, downloadProductCoupon } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 상품 다운로드 쿠폰 발급 — 회원 전용(pa_at 토큰). POST { coupon_id }
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "쿠폰은 회원 로그인 후 받을 수 있습니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { coupon_id?: number };
  const couponId = Number(b.coupon_id) || 0;
  if (!couponId) return NextResponse.json({ ok: false, error: "쿠폰 정보가 올바르지 않습니다." }, { status: 400 });
  const r = await downloadProductCoupon(token, couponId);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
