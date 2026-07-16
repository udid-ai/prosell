import { NextRequest, NextResponse } from "next/server";
import { getToken, recordHistory, removeHistory, clearHistory } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 열람 기록 — POST /api/account/history { products_id } (PDP 진입 시). 실패해도 200(부가기능).
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false }, { status: 200 }); // 비회원은 조용히 무시
  const b = (await req.json().catch(() => ({}))) as { products_id?: unknown };
  const productsId = Number(b.products_id);
  if (!Number.isInteger(productsId) || productsId <= 0) return NextResponse.json({ ok: false }, { status: 200 });
  await recordHistory(token, productsId);
  return NextResponse.json({ ok: true });
}

// 삭제 — DELETE /api/account/history?products_id=  또는  ?all=1(전체삭제)
export async function DELETE(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  if (req.nextUrl.searchParams.get("all")) {
    const r = await clearHistory(token);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  const productsId = Number(req.nextUrl.searchParams.get("products_id"));
  if (!Number.isInteger(productsId) || productsId <= 0) return NextResponse.json({ ok: false, error: "상품번호가 올바르지 않습니다." }, { status: 400 });
  const r = await removeHistory(token, productsId);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
