import { NextRequest, NextResponse } from "next/server";
import { getToken, verifyCurrentPassword } from "@/lib/prosell";
import { resolvePassword } from "@/lib/pwcrypto";

export const dynamic = "force-dynamic";

// 정보수정 재인증 — 현재 비밀번호 확인(소셜계정은 서버가 자동 통과).
// 비밀번호는 클라이언트가 RSA 암호화(enc_upw)해 보내며, 여기서 복호화 후 백엔드로 전달(ISMS).
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { enc_upw?: string; current_upw?: string };
  const upw = resolvePassword(b);
  const r = await verifyCurrentPassword(token, upw);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
