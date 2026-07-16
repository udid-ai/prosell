import { NextRequest, NextResponse } from "next/server";
import { getToken, fetchExchangeInit, fetchExchangePreview, type ExchangeItemInput } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 교환접수 초기데이터 — GET /api/order/exchange/preview?ono=
export async function GET(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const ono = req.nextUrl.searchParams.get("ono") || "";
  if (!/^\d+$/.test(ono)) return NextResponse.json({ ok: false, error: "주문번호가 올바르지 않습니다." }, { status: 400 });
  const init = await fetchExchangeInit(token, ono);
  if (!init) return NextResponse.json({ ok: false, error: "교환 정보를 불러올 수 없습니다." }, { status: 400 });
  return NextResponse.json({ ok: true, init });
}

// 교환 배송비 미리보기 — POST /api/order/exchange/preview { ono, items:[{prno,quantity,product_id?,exc_product_id?}], exc_ct }
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { ono?: unknown; items?: unknown; exc_ct?: unknown };
  const ono = Number(b.ono);
  const items = normalizeItems(b.items);
  const exc_ct = typeof b.exc_ct === "string" ? b.exc_ct.trim() : "";
  if (!Number.isInteger(ono) || ono <= 0 || items.length === 0) {
    return NextResponse.json({ ok: false, error: "요청 정보가 올바르지 않습니다." }, { status: 400 });
  }
  if (!exc_ct) return NextResponse.json({ ok: false, error: "교환사유를 선택해 주세요." }, { status: 400 });
  const r = await fetchExchangePreview(token, ono, items, exc_ct);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, preview: r.preview });
}

function normalizeItems(v: unknown): ExchangeItemInput[] {
  if (!Array.isArray(v)) return [];
  const out: ExchangeItemInput[] = [];
  for (const it of v) {
    const o = it as { prno?: unknown; quantity?: unknown; product_id?: unknown; exc_product_id?: unknown };
    const prno = Number(o?.prno);
    const quantity = Number(o?.quantity);
    if (!Number.isInteger(prno) || prno <= 0 || !Number.isInteger(quantity) || quantity <= 0) continue;
    const item: ExchangeItemInput = { prno, quantity };
    const product_id = Number(o?.product_id);
    if (Number.isInteger(product_id) && product_id > 0) item.product_id = product_id;
    const exc_product_id = Number(o?.exc_product_id);
    if (Number.isInteger(exc_product_id) && exc_product_id > 0) item.exc_product_id = exc_product_id;
    out.push(item);
  }
  return out;
}
