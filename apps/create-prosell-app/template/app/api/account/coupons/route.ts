import { NextRequest, NextResponse } from "next/server";
import { getToken, fetchCouponBox, registerCouponCode, downloadLevelCoupon, downloadAllLevelCoupons } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 쿠폰 보관함 — GET /api/account/coupons?page=
export async function GET(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1);
  const box = await fetchCouponBox(token, page);
  if (!box) return NextResponse.json({ ok: false, error: "쿠폰 정보를 불러올 수 없습니다." }, { status: 400 });
  return NextResponse.json({ ok: true, box });
}

// 쿠폰 액션 — POST /api/account/coupons { action:"code",pincode } | { action:"download",num } | { action:"download_all" }
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { action?: unknown; pincode?: unknown; num?: unknown };
  const action = typeof b.action === "string" ? b.action : "";

  if (action === "code") {
    const pincode = typeof b.pincode === "string" ? b.pincode.trim() : "";
    if (!pincode) return NextResponse.json({ ok: false, error: "쿠폰 번호를 입력해 주세요." }, { status: 400 });
    const r = await registerCouponCode(token, pincode);
    return NextResponse.json(r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error }, { status: r.ok ? 200 : 400 });
  }
  if (action === "download") {
    const num = Number(b.num);
    if (!Number.isInteger(num) || num < 1 || num > 4) return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
    const r = await downloadLevelCoupon(token, num);
    return NextResponse.json(r.ok ? { ok: true } : { ok: false, error: r.error }, { status: r.ok ? 200 : 400 });
  }
  if (action === "download_all") {
    const r = await downloadAllLevelCoupons(token);
    return NextResponse.json(r.ok ? { ok: true, count: r.count } : { ok: false, error: r.error }, { status: r.ok ? 200 : 400 });
  }
  return NextResponse.json({ ok: false, error: "사용할 수 없는 요청입니다." }, { status: 400 });
}
