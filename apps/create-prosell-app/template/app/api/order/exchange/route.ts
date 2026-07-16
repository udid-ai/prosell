import { NextRequest, NextResponse } from "next/server";
import { getToken, submitExchange, type ExchangeItemInput, type ExchangeAddressInput } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 교환접수 — 회원 전용. POST /api/order/exchange { ono, items:[{prno,quantity,product_id?,exc_product_id?}], exc_ct, exc_content?, address? }
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    ono?: unknown; items?: unknown; exc_ct?: unknown; exc_content?: unknown; address?: unknown;
  };
  const ono = Number(b.ono);
  const items = normalizeItems(b.items);
  const exc_ct = typeof b.exc_ct === "string" ? b.exc_ct.trim() : "";
  const exc_content = typeof b.exc_content === "string" ? b.exc_content.trim() : "";
  if (!Number.isInteger(ono) || ono <= 0 || items.length === 0) {
    return NextResponse.json({ ok: false, error: "요청 정보가 올바르지 않습니다." }, { status: 400 });
  }
  if (!exc_ct) return NextResponse.json({ ok: false, error: "교환사유를 선택해 주세요." }, { status: 400 });
  const r = await submitExchange(token, { ono, items, exc_ct, exc_content, address: normalizeAddress(b.address) });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, eno: r.eno });
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
function normalizeAddress(v: unknown): ExchangeAddressInput | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const name = String(o.name ?? "").trim();
  const addr1 = String(o.addr1 ?? "").trim();
  const addr2 = String(o.addr2 ?? "").trim();
  if (!name || !addr1) return null; // 최소 이름+주소
  return {
    name, hp: String(o.hp ?? "").trim(), zipcode: String(o.zipcode ?? "").trim(),
    addr1, addr2, admcode: String(o.admcode ?? "").trim(),
  };
}
