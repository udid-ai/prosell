import { NextRequest, NextResponse } from "next/server";
import { getToken, withdrawRefund } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 반품 철회 — 회원 전용. POST /api/order/refund/withdraw { rno }
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { rno?: unknown };
  const rno = String(b.rno ?? "");
  if (!/^\d+$/.test(rno)) return NextResponse.json({ ok: false, error: "반품번호가 올바르지 않습니다." }, { status: 400 });
  const r = await withdrawRefund(token, rno);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
