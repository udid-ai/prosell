import { NextResponse } from "next/server";
import { AT, RT } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 폼 전송으로 로그아웃 → 쿠키 제거 후 홈으로 (303: POST→GET)
export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.delete(AT);
  res.cookies.delete(RT);
  res.cookies.delete("cart_id"); // 회원 장바구니 owner 쿠키 제거 → 다음 방문은 새 게스트 장바구니
  return res;
}
