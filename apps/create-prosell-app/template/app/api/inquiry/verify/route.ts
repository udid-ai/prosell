import { NextRequest, NextResponse } from "next/server";
import { verifyInquiryPassword } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 비회원 문의 비밀번호 검증 + 본문 로드 — POST /api/inquiry/verify { id, upw }
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { id?: number; upw?: string };
  const id = Number(b.id);
  const upw = String(b.upw ?? "");
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "문의 정보가 올바르지 않습니다." }, { status: 400 });
  if (!upw) return NextResponse.json({ ok: false, error: "비밀번호를 입력해 주세요." }, { status: 400 });
  const r = await verifyInquiryPassword(id, upw);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, item: r.item });
}
