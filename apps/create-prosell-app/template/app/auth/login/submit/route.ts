import { NextRequest, NextResponse } from "next/server";
import { loginMember, clientIpFromHeaders, mergeServerCart, memberCartOwner, AT, RT, atCookieMaxAge } from "@/lib/prosell";

export const dynamic = "force-dynamic";

const CART_COOKIE = "cart_id";

// 비밀번호 로그인 프록시 — 앱키로 토큰 발급(서버사이드) → HttpOnly 쿠키 저장.
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { uid?: string; upw?: string };
  const uid = String(b.uid || "").trim();
  const upw = String(b.upw || "");
  if (!uid || !upw) {
    return NextResponse.json({ ok: false, error: "아이디와 비밀번호를 입력해 주세요." }, { status: 400 });
  }

  const r = await loginMember(uid, upw, clientIpFromHeaders(req.headers));
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 401 });

  const secure = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "")) === "https";
  const res = NextResponse.json({ ok: true, uid: r.uid, mid: r.mid });
  res.cookies.set(AT, r.access_token, { httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: atCookieMaxAge(r.expires_in) });
  if (r.refresh_token) {
    res.cookies.set(RT, r.refresh_token, { httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: r.refresh_token_expires_in || 2592000 });
  }

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
