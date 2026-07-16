import { NextRequest, NextResponse } from "next/server";
import { getToken, submitRefund, type RefundItemInput, type RefundBankInput, type RefundAddressInput } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 반품접수 — 회원 전용. POST /api/order/refund { ono, items:[{prno,quantity}], ref_ct, ref_content?, bank? }
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    ono?: unknown; items?: unknown; ref_ct?: unknown; ref_content?: unknown; bank?: unknown; address?: unknown;
  };
  const ono = Number(b.ono);
  const items = normalizeItems(b.items);
  const ref_ct = typeof b.ref_ct === "string" ? b.ref_ct.trim() : "";
  const ref_content = typeof b.ref_content === "string" ? b.ref_content.trim() : "";
  if (!Number.isInteger(ono) || ono <= 0 || items.length === 0) {
    return NextResponse.json({ ok: false, error: "요청 정보가 올바르지 않습니다." }, { status: 400 });
  }
  if (!ref_ct) return NextResponse.json({ ok: false, error: "반품사유를 선택해 주세요." }, { status: 400 });
  const r = await submitRefund(token, { ono, items, ref_ct, ref_content, bank: normalizeBank(b.bank), address: normalizeAddress(b.address) });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, rno: r.rno });
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
function normalizeBank(v: unknown): RefundBankInput | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { code?: unknown; num?: unknown; holder?: unknown };
  const code = String(o.code ?? "").trim();
  if (!code || code === "0") return null;
  return { code, num: String(o.num ?? "").trim(), holder: String(o.holder ?? "").trim() };
}
function normalizeAddress(v: unknown): RefundAddressInput | null {
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
