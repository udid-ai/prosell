import { NextRequest, NextResponse } from "next/server";
import { guestSessionFromCart, clientIpFromHeaders, atCookieMaxAge, GUEST_TOKEN_COOKIE } from "@/lib/prosell";

export const dynamic = "force-dynamic";

const CART_COOKIE = "cart_id";

// 방금 주문한 비회원의 «재입력 없는» 주문조회 진입.
//  · cart_id(httpOnly, 주문 시 X-Guest-Id=list.user)만으로 guest 토큰을 발급받아 gt 쿠키로 저장.
//  · 이후 /order/guest 페이지가 이 gt 로 주문목록을 바로 렌더한다(성명/주문번호 재입력 불필요).
export async function POST(req: NextRequest) {
  const cartId = req.cookies.get(CART_COOKIE)?.value || "";
  if (!/^[\w-]{8,64}$/.test(cartId) || /^member_/.test(cartId)) {
    return NextResponse.json({ ok: false, error: "조회할 주문 세션이 없습니다." }, { status: 400 });
  }

  const r = await guestSessionFromCart(cartId, clientIpFromHeaders(req.headers));
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });

  const secure = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "")) === "https";
  const res = NextResponse.json({ ok: true, count: r.count });
  res.cookies.set(GUEST_TOKEN_COOKIE, r.access_token, {
    httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: atCookieMaxAge(r.expires_in),
  });
  return res;
}
