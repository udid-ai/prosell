import { NextRequest, NextResponse } from "next/server";
import { getToken, restockCheck, restockSubmit, clientIpFromHeaders } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 재입고 알림 프록시 — 회원(토큰)이면 프리필·갱신, 비회원이면 client_id 로 신청.
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { action?: string; product_id?: string; hp?: string };
  const productId = String(b.product_id || "").replace(/\D/g, "");
  if (!productId) return NextResponse.json({ ok: false, error: "상품을 확인해 주세요." }, { status: 400 });

  const token = await getToken();

  if (b.action === "check") {
    const r = await restockCheck(productId, token);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }

  const hp = String(b.hp || "").replace(/\D/g, "");
  if (!/^[0-9]{10,11}$/.test(hp)) return NextResponse.json({ ok: false, error: "휴대폰 번호를 확인해 주세요." }, { status: 400 });
  const r = await restockSubmit(productId, hp, token, clientIpFromHeaders(req.headers));
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
