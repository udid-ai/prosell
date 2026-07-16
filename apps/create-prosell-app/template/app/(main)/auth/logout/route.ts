import { NextResponse } from "next/server";
import { AT, RT, EXP } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 폼 전송으로 로그아웃 → 쿠키 제거 후 홈으로 (303: POST→GET).
// 리다이렉트 origin 은 req.url(0.0.0.0 바인딩 시 0.0.0.0 로 나옴)이 아니라 실제 Host 헤더로 구성한다.
export async function POST(req: Request) {
  const u = new URL(req.url);
  const host = req.headers.get("host") || u.host;
  const proto = req.headers.get("x-forwarded-proto") || u.protocol.replace(/:$/, "") || "http";
  const res = NextResponse.redirect(`${proto}://${host}/`, 303);
  res.cookies.delete(AT);
  res.cookies.delete(RT);
  res.cookies.delete(EXP); // 만료 힌트 제거 → SessionKeeper 갱신 중단
  res.cookies.delete("cart_id"); // 회원 장바구니 owner 쿠키 제거 → 다음 방문은 새 게스트 장바구니
  return res;
}
