import { NextRequest, NextResponse } from "next/server";
import { getToken, fetchCancelInit, fetchCancelPreview, type CancelItemInput } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 취소접수 초기데이터 — GET /api/order/cancel/preview?ono=
export async function GET(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const ono = req.nextUrl.searchParams.get("ono") || "";
  if (!/^\d+$/.test(ono)) return NextResponse.json({ ok: false, error: "주문번호가 올바르지 않습니다." }, { status: 400 });
  const init = await fetchCancelInit(token, ono);
  if (!init) return NextResponse.json({ ok: false, error: "취소 정보를 불러올 수 없습니다." }, { status: 400 });
  return NextResponse.json({ ok: true, init });
}

// 취소 예상금액 미리보기 — POST /api/order/cancel/preview { ono, items:[{prno,quantity}] }
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { ono?: unknown; items?: unknown };
  const ono = Number(b.ono);
  const items = normalizeItems(b.items);
  if (!Number.isInteger(ono) || ono <= 0 || items.length === 0) {
    return NextResponse.json({ ok: false, error: "요청 정보가 올바르지 않습니다." }, { status: 400 });
  }
  const r = await fetchCancelPreview(token, ono, items);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, preview: r.preview });
}

function normalizeItems(v: unknown): CancelItemInput[] {
  if (!Array.isArray(v)) return [];
  const out: CancelItemInput[] = [];
  for (const it of v) {
    const prno = Number((it as { prno?: unknown })?.prno);
    const quantity = Number((it as { quantity?: unknown })?.quantity);
    if (Number.isInteger(prno) && prno > 0 && Number.isInteger(quantity) && quantity > 0) out.push({ prno, quantity });
  }
  return out;
}
