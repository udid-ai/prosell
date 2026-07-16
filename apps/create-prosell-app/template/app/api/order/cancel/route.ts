import { NextRequest, NextResponse } from "next/server";
import { getToken, submitCancel, type CancelItemInput, type CancelBankInput } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 취소접수 — 회원 전용. POST /api/order/cancel { ono, items:[{prno,quantity}], can_ct, can_content?, bank? }
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "회원 로그인이 필요합니다." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    ono?: unknown; items?: unknown; can_ct?: unknown; can_content?: unknown; bank?: unknown;
  };
  const ono = Number(b.ono);
  const items = normalizeItems(b.items);
  const can_ct = typeof b.can_ct === "string" ? b.can_ct.trim() : "";
  const can_content = typeof b.can_content === "string" ? b.can_content.trim() : "";
  if (!Number.isInteger(ono) || ono <= 0 || items.length === 0) {
    return NextResponse.json({ ok: false, error: "요청 정보가 올바르지 않습니다." }, { status: 400 });
  }
  if (!can_ct) return NextResponse.json({ ok: false, error: "취소사유를 선택해 주세요." }, { status: 400 });
  const r = await submitCancel(token, { ono, items, can_ct, can_content, bank: normalizeBank(b.bank) });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, cno: r.cno });
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
function normalizeBank(v: unknown): CancelBankInput | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { code?: unknown; num?: unknown; holder?: unknown };
  const code = String(o.code ?? "").trim();
  if (!code || code === "0") return null;
  return { code, num: String(o.num ?? "").trim(), holder: String(o.holder ?? "").trim() };
}
