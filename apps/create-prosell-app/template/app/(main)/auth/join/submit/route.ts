import { NextRequest, NextResponse } from "next/server";
import { signup, loginMember, clientIpFromHeaders, setAuthCookies, stampMemberName, type SignupInput } from "@/lib/prosell";
import { resolvePassword } from "@/lib/pwcrypto";

export const dynamic = "force-dynamic";

// JoinForm(클라이언트 위저드)용 가입 프록시 — client_id 를 서버에만 두고 가입을 중계한다.
// 비밀번호는 클라이언트가 RSA 암호화(enc_upw)해 전송 → 여기서 복호화 후 백엔드로 전달(ISMS).
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Partial<SignupInput> & Record<string, unknown> & { enc_upw?: string };
  if (!b.agree_service || !b.agree_privacy) {
    return NextResponse.json({ ok: false, error: "이용약관과 개인정보 수집·이용에 동의해 주세요." }, { status: 400 });
  }
  if (!b.agree_age) {
    return NextResponse.json({ ok: false, error: "만 14세 이상 가입에 동의해 주세요." }, { status: 400 });
  }
  const ip = clientIpFromHeaders(req.headers);
  const upw = resolvePassword(b); // enc_upw 복호화(없으면 upw 평문 폴백)
  const str = (v: unknown) => (v ? String(v).trim() : undefined);
  const r = await signup({
    uid: String(b.uid || "").trim(),
    upw,
    name: str(b.name),
    nick: str(b.nick),
    email: str(b.email),
    hp: str(b.hp),
    birth: str(b.birth),
    gender: b.gender ? Number(b.gender) : undefined,
    tel: str(b.tel),
    zipcode: str(b.zipcode),
    addr1: str(b.addr1),
    addr2: str(b.addr2),
    admcode: str(b.admcode),
    place: str(b.place),
    bank: b.bank ? Number(b.bank) : undefined,
    banknum: str(b.banknum),
    bankholder: str(b.bankholder),
    interest: str(b.interest),
    profile: str(b.profile),
    recommend: str(b.recommend),
    agree_service: true,
    agree_privacy: true,
    agree_age: !!b.agree_age,
    email_receive: !!b.email_receive,
    hp_receive: !!b.hp_receive,
    send_hp_id: b.send_hp_id ? Number(b.send_hp_id) : undefined,
    hp_code: b.hp_code ? String(b.hp_code) : undefined,
    send_email_id: b.send_email_id ? Number(b.send_email_id) : undefined,
    email_code: b.email_code ? String(b.email_code) : undefined,
    certify_id: b.certify_id ? String(b.certify_id) : undefined,
  }, ip);
  if (!r.ok) return NextResponse.json(r, { status: 400 });

  // 가입 성공 → 자동 로그인(앱키 비밀번호 그랜트) 후 토큰 쿠키 설정.
  // 승인대기 등으로 즉시 로그인이 안 되는 쇼핑몰이면 loggedIn:false 로 완료 페이지에서 안내.
  const uid = String(b.uid || "").trim();
  const login = await loginMember(uid, upw, ip);
  if (!login.ok) {
    return NextResponse.json({ ok: true, uid: r.uid, mid: r.mid, loggedIn: false });
  }

  const secure = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "")) === "https";
  const res = NextResponse.json({ ok: true, uid: login.uid, mid: login.mid, loggedIn: true });
  setAuthCookies(res, login, secure);
  await stampMemberName(res, login, secure);
  return res;
}
