import { NextRequest, NextResponse } from "next/server";
import { fetchTerms, type TermsId } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// GET /api/terms?id=order_privacy → 약관 본문(HTML) 조회. 클라이언트 모달에서 호출.
const ALLOW: TermsId[] = ["service", "privacy", "order_service", "order_privacy", "order_entrust", "order_guest"];

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") as TermsId | null;
  if (!id || !ALLOW.includes(id)) {
    return NextResponse.json({ ok: false, error: "잘못된 약관 id 입니다." }, { status: 400 });
  }
  const content = await fetchTerms(id);
  return NextResponse.json({ ok: true, content });
}
