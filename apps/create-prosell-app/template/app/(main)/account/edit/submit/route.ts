import { NextRequest, NextResponse } from "next/server";
import { getToken, updateAccount, type AccountUpdate } from "@/lib/prosell";
import { decryptPassword } from "@/lib/pwcrypto";

export const dynamic = "force-dynamic";

// 회원정보 수정 프록시 — 쿠키의 회원 토큰으로 PUT /user/account 중계.
// 비밀번호는 클라이언트가 RSA 암호화(enc_upw/enc_new_upw)해 전송 → 여기서 복호화 후 백엔드로 전달(ISMS).
export async function POST(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as AccountUpdate & Record<string, unknown> & { enc_upw?: string; enc_new_upw?: string };

  // 암호화된 비밀번호 복호화 → current_upw/new_upw 로 정규화. 암호문 제거(백엔드로 넘기지 않음).
  if (typeof b.enc_upw === "string" && b.enc_upw) { try { b.current_upw = decryptPassword(b.enc_upw); } catch { /* 폴백: current_upw 그대로 */ } }
  if (typeof b.enc_new_upw === "string" && b.enc_new_upw) { try { b.new_upw = decryptPassword(b.enc_new_upw); } catch { /* 폴백 */ } }
  delete b.enc_upw; delete b.enc_new_upw;

  // 비밀번호 변경 시 최소 검증(서버에서도 백엔드가 재검증)
  if (b.new_upw && !b.current_upw) {
    return NextResponse.json({ ok: false, error: "현재 비밀번호를 입력해 주세요." }, { status: 400 });
  }

  const r = await updateAccount(token, b);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
