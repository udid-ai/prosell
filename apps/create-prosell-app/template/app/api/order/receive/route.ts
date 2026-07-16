import { NextRequest, NextResponse } from "next/server";
import { getToken, updateReceiveAddress, type ReceiveEditInput } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 배송지 변경 — 회원 전용. PUT /api/order/receive { dno, rec_* , del_message }
export async function PUT(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as Partial<ReceiveEditInput>;
  if (!b.dno || !/^[0-9]+$/.test(String(b.dno))) {
    return NextResponse.json({ ok: false, error: "배송번호가 올바르지 않습니다." }, { status: 400 });
  }
  const r = await updateReceiveAddress(token, b as ReceiveEditInput);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
