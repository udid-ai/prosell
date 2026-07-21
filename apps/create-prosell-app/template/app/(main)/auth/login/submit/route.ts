import { NextRequest, NextResponse } from "next/server";
import { loginMember, clientIpFromHeaders, mergeServerCart, memberCartOwner, setAuthCookies, stampMemberName } from "@/lib/prosell";
import { resolvePassword } from "@/lib/pwcrypto";

export const dynamic = "force-dynamic";

const CART_COOKIE = "cart_id";

// 비밀번호 로그인 프록시 — 앱키로 토큰 발급(서버사이드) → HttpOnly 쿠키 저장.
// 비밀번호는 클라이언트가 RSA 암호화(enc_upw)해 전송 → 복호화 후 백엔드로 전달(ISMS).
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { uid?: string; upw?: string; enc_upw?: string };
  const uid = String(b.uid || "").trim();
  const upw = resolvePassword(b);
  // enc_upw 가 왔는데 복호화 실패로 빈 값이면(키 불일치 등) 입력 누락이 아니라 보안처리 오류로 안내.
  if (b.enc_upw && !upw) {
    return NextResponse.json({ ok: false, error: "보안 처리 중 오류가 발생했습니다. 다시 시도해 주세요." }, { status: 400 });
  }
  if (!uid || !upw) {
    return NextResponse.json({ ok: false, error: "아이디와 비밀번호를 입력해 주세요." }, { status: 400 });
  }

  const r = await loginMember(uid, upw, clientIpFromHeaders(req.headers));
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 401 });

  const secure = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "")) === "https";
  const res = NextResponse.json({ ok: true, uid: r.uid, mid: r.mid });
  setAuthCookies(res, r, secure);
  await stampMemberName(res, r, secure); // 표시이름 pa_name 쿠키(헤더가 매 페이지 fetchAccount 없이 읽음)

  // 비회원 장바구니 → 회원 장바구니 이전(레거시 updateLogin 의 cart 이전에 대응).
  // 게스트 cart_id 행을 회원 owner(member_<mid>)로 합치고, 이후 cart_id 쿠키를 회원 owner 로 전환.
  if (r.mid) {
    const memberOwner = memberCartOwner(r.mid);
    const guest = req.cookies.get(CART_COOKIE)?.value;
    if (guest && /^[\w-]{8,64}$/.test(guest) && guest !== memberOwner) {
      await mergeServerCart(guest, memberOwner);
    }
    res.cookies.set(CART_COOKIE, memberOwner, { httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: 60 * 60 * 24 * 90 });
  }

  return res;
}
