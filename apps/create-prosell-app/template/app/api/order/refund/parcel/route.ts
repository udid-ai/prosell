import { NextRequest, NextResponse } from "next/server";
import { getToken, updateRefundParcel } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 반품 회수 운송장 등록 — 회원 전용. PUT /api/order/refund/parcel { rno, ref_ret_num }
export async function PUT(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { rno?: string; ref_ret_num?: string };
  if (!b.rno || !/^[0-9]+$/.test(String(b.rno))) {
    return NextResponse.json({ ok: false, error: "반품번호가 올바르지 않습니다." }, { status: 400 });
  }
  const num = String(b.ref_ret_num ?? "").replace(/-/g, "").trim();
  if (!num || !/^[0-9A-Za-z]{1,50}$/.test(num)) {
    return NextResponse.json({ ok: false, error: "운송장 번호를 정확히 입력해 주세요." }, { status: 400 });
  }
  const r = await updateRefundParcel(token, { rno: String(b.rno), ref_ret_num: num });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
