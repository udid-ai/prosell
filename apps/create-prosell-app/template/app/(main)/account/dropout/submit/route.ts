import { NextRequest, NextResponse } from "next/server";
import { getToken, dropoutAccount, AT, RT, EXP } from "@/lib/prosell";
import { resolvePassword } from "@/lib/pwcrypto";

export const dynamic = "force-dynamic";

// 회원 탈퇴 프록시 — 쿠키의 회원 토큰으로 POST /user/dropout 중계.
// 비밀번호는 RSA 암호화(enc_upw) 전송 → 복호화 후 백엔드 전달(ISMS). 성공 시 쿠키 제거로 로그아웃.
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { dropout_ct?: string; assent?: boolean; enc_upw?: string; current_upw?: string };
  const upw = await resolvePassword(b);
  const r = await dropoutAccount(token, {
    dropout_ct: String(b.dropout_ct || ""),
    assent: !!b.assent,
    current_upw: upw || undefined,
  });

  const res = NextResponse.json(r, { status: r.ok ? 200 : 400 });
  if (r.ok) {
    res.cookies.delete(AT);
    res.cookies.delete(RT);
    res.cookies.delete(EXP);
    res.cookies.delete("cart_id");
  }
  return res;
}
