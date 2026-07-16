import { NextRequest, NextResponse } from "next/server";
import { GUEST_TOKEN_COOKIE } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 비회원 주문조회 종료 — guest 쿠키 삭제 후 조회 폼으로.
export async function POST(req: NextRequest) {
  const host = req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "") || "https";
  const res = NextResponse.redirect(`${proto}://${host}/order/guest`, { status: 303 });
  res.cookies.set(GUEST_TOKEN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
