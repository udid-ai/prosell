import { NextRequest, NextResponse } from "next/server";
import { socialLogin, clientIpFromHeaders, mergeServerCart, memberCartOwner, setAuthCookies } from "@/lib/prosell";

export const dynamic = "force-dynamic";

const SST = "pa_sstate";
const SWAIT = "pa_social_wait"; // 신규 소셜 가입 대기(wait_token+프로필) 쿠키
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

  // 신규 소셜(member_wait) → 가입 랜딩으로. wait_token·프로필을 짧은 HttpOnly 쿠키로 전달(레거시 member_wait 세션 대체).
  if ("wait" in r && r.wait) {
    const payload = Buffer.from(JSON.stringify({ wait_token: r.wait_token, provider: r.provider, profile: r.profile })).toString("base64");
    const wr = NextResponse.redirect(origin + "/auth/join/social");
    wr.cookies.set(SWAIT, payload, { httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: 600 });
    wr.cookies.delete(SST);
    return wr;
  }

  const res = NextResponse.redirect(origin + "/");
  setAuthCookies(res, r, secure);
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
