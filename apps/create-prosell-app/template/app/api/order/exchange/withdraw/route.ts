import { NextRequest, NextResponse } from "next/server";
import { getToken, withdrawExchange } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 교환 철회 — 회원 전용. POST /api/order/exchange/withdraw { eno }
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { eno?: unknown };
  const eno = String(b.eno ?? "");
  if (!/^\d+$/.test(eno)) return NextResponse.json({ ok: false, error: "교환번호가 올바르지 않습니다." }, { status: 400 });
  const r = await withdrawExchange(token, eno);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
