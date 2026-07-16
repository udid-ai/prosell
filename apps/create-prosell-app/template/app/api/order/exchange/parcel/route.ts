import { NextRequest, NextResponse } from "next/server";
import { getToken, updateExchangeParcel } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 교환 회수 운송장 등록 — 회원 전용. PUT /api/order/exchange/parcel { eno, exc_ret_num }
export async function PUT(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { eno?: string; exc_ret_num?: string };
  if (!b.eno || !/^[0-9]+$/.test(String(b.eno))) {
    return NextResponse.json({ ok: false, error: "교환번호가 올바르지 않습니다." }, { status: 400 });
  }
  const num = String(b.exc_ret_num ?? "").replace(/-/g, "").trim();
  if (!num || !/^[0-9A-Za-z]{1,50}$/.test(num)) {
    return NextResponse.json({ ok: false, error: "운송장 번호를 정확히 입력해 주세요." }, { status: 400 });
  }
  const r = await updateExchangeParcel(token, { eno: String(b.eno), exc_ret_num: num });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
