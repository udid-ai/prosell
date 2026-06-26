import { NextRequest, NextResponse } from "next/server";
import { socialLogin, clientIpFromHeaders, mergeServerCart, memberCartOwner, AT, RT, atCookieMaxAge } from "@/lib/prosell";

export const dynamic = "force-dynamic";

const SST = "pa_sstate";
const CART_COOKIE = "cart_id";

// provider 콜백: code → API(앱키)로 로그인/가입 → HttpOnly 토큰 쿠키.
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const code = sp.get("code");
  const state = sp.get("state");
  const error = sp.get("error");

  const host = req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "") || "http";
  const origin = `${proto}://${host}`;
  const secure = proto === "https";
  const fail = (m: string) => NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(m)}`);

  if (error) return fail(error);
  if (!code) return fail("인증 코드가 없습니다.");

  // state 검증 (provider + 일회용 값)
  const saved = req.cookies.get(SST)?.value || "";
  if (saved !== `${provider}:${state}`) return fail("state 불일치");

  // redirect_uri 는 start 와 동일해야 한다. state 는 네이버 토큰 교환에 필수(authorize 때와 동일 값).
  const redirectUri = `${origin}/auth/social/${provider}`;
  const r = await socialLogin(provider, code, redirectUri, state || "", clientIpFromHeaders(req.headers));
  if (!r.ok) return fail(r.error);

  const res = NextResponse.redirect(origin + "/");
  res.cookies.set(AT, r.access_token, { httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: atCookieMaxAge(r.expires_in) });
  if (r.refresh_token) {
    res.cookies.set(RT, r.refresh_token, { httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: r.refresh_token_expires_in || 2592000 });
  }
  res.cookies.delete(SST);

  // 비회원 장바구니 → 회원 장바구니 이전 (비밀번호 로그인과 동일)
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
