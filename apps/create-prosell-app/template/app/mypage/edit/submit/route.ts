import { NextRequest, NextResponse } from "next/server";
import { getToken, updateAccount, type AccountUpdate } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 회원정보 수정 프록시 — 쿠키의 회원 토큰으로 PUT /user/account 중계.
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as AccountUpdate & Record<string, unknown>;

  // 비밀번호 변경 시 최소 검증(서버에서도 백엔드가 재검증)
  if (b.new_upw && !b.current_upw) {
    return NextResponse.json({ ok: false, error: "현재 비밀번호를 입력해 주세요." }, { status: 400 });
  }

  const r = await updateAccount(token, b);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
