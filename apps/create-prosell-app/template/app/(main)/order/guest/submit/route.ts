import { NextRequest, NextResponse } from "next/server";
import { guestOrderLookup, guestHpSend, clientIpFromHeaders, atCookieMaxAge, GUEST_TOKEN_COOKIE } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 비회원 주문조회 프록시 — 성명+주문번호/휴대폰으로 게스트 주문을 찾아 guest 토큰을 HttpOnly 쿠키로 저장.
// 이후 /order/guest 페이지가 이 토큰으로 주문목록을 렌더한다.
// action=hp_send: 휴대폰 인증번호 발송(shop.guest_login 켜진 경우).
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { action?: string; tab?: number; name?: string; dno?: string; hp?: string; send_id?: number; code?: string };
  const clientIp = clientIpFromHeaders(req.headers);
  const name = String(b.name || "").trim();
  const hp = String(b.hp || "").replace(/\D/g, "");

  if (b.action === "hp_send") {
    if (!name || !hp) return NextResponse.json({ ok: false, error: "성명과 휴대폰번호를 입력해 주세요." }, { status: 400 });
    const s = await guestHpSend({ name, hp, clientIp });
    return NextResponse.json(s, { status: s.ok ? 200 : 400 });
  }

  const tab: 0 | 1 = b.tab === 1 ? 1 : 0;
  const dno = String(b.dno || "").trim();

  if (!name) return NextResponse.json({ ok: false, error: "주문자 성명을 입력해 주세요." }, { status: 400 });
  if (tab === 0 && !dno) return NextResponse.json({ ok: false, error: "주문번호를 입력해 주세요." }, { status: 400 });
  if (tab === 1 && !hp) return NextResponse.json({ ok: false, error: "휴대폰번호를 입력해 주세요." }, { status: 400 });

  const r = await guestOrderLookup({ tab, name, dno, hp, sendId: Number(b.send_id || 0), code: String(b.code || "") }, clientIp);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });

  const secure = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "")) === "https";
  const res = NextResponse.json({ ok: true, count: r.count });
  // guest 액세스 토큰(수명은 토큰 만료에 맞춤). 조회 목적이라 세션성으로 짧게 유지.
  res.cookies.set(GUEST_TOKEN_COOKIE, r.access_token, {
    httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: atCookieMaxAge(r.expires_in),
  });
  return res;
}
