import { NextRequest, NextResponse } from "next/server";
import { getToken, fetchRefundInit, fetchRefundPreview, type RefundItemInput } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 반품접수 초기데이터 — GET /api/order/refund/preview?ono=
export async function GET(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const ono = req.nextUrl.searchParams.get("ono") || "";
  if (!/^\d+$/.test(ono)) return NextResponse.json({ ok: false, error: "주문번호가 올바르지 않습니다." }, { status: 400 });
  const init = await fetchRefundInit(token, ono);
  if (!init) return NextResponse.json({ ok: false, error: "반품 정보를 불러올 수 없습니다." }, { status: 400 });
  return NextResponse.json({ ok: true, init });
}

// 반품 예상금액 미리보기 — POST /api/order/refund/preview { ono, items:[{prno,quantity}], ref_ct }
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { ono?: unknown; items?: unknown; ref_ct?: unknown };
  const ono = Number(b.ono);
  const items = normalizeItems(b.items);
  const ref_ct = typeof b.ref_ct === "string" ? b.ref_ct.trim() : "";
  if (!Number.isInteger(ono) || ono <= 0 || items.length === 0) {
    return NextResponse.json({ ok: false, error: "요청 정보가 올바르지 않습니다." }, { status: 400 });
  }
  if (!ref_ct) return NextResponse.json({ ok: false, error: "반품사유를 선택해 주세요." }, { status: 400 });
  const r = await fetchRefundPreview(token, ono, items, ref_ct);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, preview: r.preview });
}

function normalizeItems(v: unknown): RefundItemInput[] {
  if (!Array.isArray(v)) return [];
  const out: RefundItemInput[] = [];
  for (const it of v) {
    const prno = Number((it as { prno?: unknown })?.prno);
    const quantity = Number((it as { quantity?: unknown })?.quantity);
    if (Number.isInteger(prno) && prno > 0 && Number.isInteger(quantity) && quantity > 0) out.push({ prno, quantity });
  }
  return out;
}
