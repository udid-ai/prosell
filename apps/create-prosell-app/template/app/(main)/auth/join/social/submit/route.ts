import { NextRequest, NextResponse } from "next/server";
import { completeSocialSignup, clientIpFromHeaders, mergeServerCart, memberCartOwner, setAuthCookies, type SocialCompleteInput } from "@/lib/prosell";

export const dynamic = "force-dynamic";

const SWAIT = "pa_social_wait";
const CART_COOKIE = "cart_id";

// 소셜 가입완료 — SWAIT 쿠키의 wait_token/provider + 랜딩 입력값 → member 생성 + 토큰 쿠키.
export async function POST(req: NextRequest) {
  const raw = req.cookies.get(SWAIT)?.value;
  if (!raw) return NextResponse.json({ ok: false, error: "가입 정보가 만료되었습니다. 다시 시도해 주세요." }, { status: 400 });

  let wait_token = "", provider = "";
  try {
    const d = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as { wait_token?: string; provider?: string };
    wait_token = String(d.wait_token || "");
    provider = String(d.provider || "");
  } catch { return NextResponse.json({ ok: false, error: "가입 정보를 확인할 수 없습니다." }, { status: 400 }); }
  if (!wait_token) return NextResponse.json({ ok: false, error: "가입 정보가 없습니다." }, { status: 400 });

  const b = (await req.json().catch(() => ({}))) as Partial<SocialCompleteInput>;
  if (!b.agree_service || !b.agree_privacy || !b.agree_age) {
    return NextResponse.json({ ok: false, error: "필수 약관에 동의해 주세요." }, { status: 400 });
  }

  const str = (v: unknown) => (v ? String(v).trim() : undefined);
  const r = await completeSocialSignup({
    wait_token, provider,
    name: str(b.name), nick: str(b.nick), email: str(b.email), hp: str(b.hp),
    birth: str(b.birth), gender: b.gender ? Number(b.gender) : undefined,
    agree_service: true, agree_privacy: true, agree_age: true,
    email_receive: !!b.email_receive, hp_receive: !!b.hp_receive,
    // 본인인증 값 전달 → 백엔드 complete 가 send_id+code 재확인
    send_hp_id: b.send_hp_id ? Number(b.send_hp_id) : undefined,
    hp_code: str(b.hp_code),
    send_email_id: b.send_email_id ? Number(b.send_email_id) : undefined,
    email_code: str(b.email_code),
    certify_id: str(b.certify_id),
  }, clientIpFromHeaders(req.headers));

  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });

  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "") || "http";
  const secure = proto === "https";
  const res = NextResponse.json({ ok: true });
  setAuthCookies(res, r, secure);
  res.cookies.delete(SWAIT);

  // 비회원 장바구니 → 회원 장바구니 이전(로그인과 동일)
  if (r.mid) {
    const memberOwner = memberCartOwner(r.mid);
    const guest = req.cookies.get(CART_COOKIE)?.value;
    if (guest && /^[\w-]{8,64}$/.test(guest) && guest !== memberOwner) await mergeServerCart(guest, memberOwner);
    res.cookies.set(CART_COOKIE, memberOwner, { httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: 60 * 60 * 24 * 90 });
  }
  return res;
}
