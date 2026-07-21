import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { RT, NAME, refreshMember, setAuthCookies, setMemberNameCookie, stampMemberName } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 클라이언트 SessionKeeper 전용 선제 갱신 엔드포인트.
//  · RT(httpOnly)는 서버에서만 읽어 client_secret 과 함께 재발급(회전) → 새 AT/RT/EXP 쿠키로 교체.
//  · «관용적» 실패 처리: 단일 실패(회전 레이스/일시 네트워크 오류)로는 쿠키를 지우지 않는다.
//    RT 만료 등 확정 로그아웃 정리는 미들웨어(문서 내비 시)가 담당 → keeper 오작동이 로그아웃을 유발하지 않게.
export async function POST(req: NextRequest) {
  const c = await cookies();
  const rt = c.get(RT)?.value;
  if (!rt) return NextResponse.json({ ok: false }, { status: 401 });

  const r = await refreshMember(rt);
  if (!r.ok || !r.access_token) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const secure = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "")) === "https";
  const res = NextResponse.json({ ok: true, exp: Date.now() + (r.expires_in ?? 10800) * 1000 });
  setAuthCookies(res, r, secure);
  // 표시이름 쿠키 유지 — 기존 값 있으면 수명만 연장(재조회 없음), 없으면 1회 조회해 심는다.
  const rtMaxAge = typeof r.refresh_token_expires_in === "number" && r.refresh_token_expires_in > 0 ? r.refresh_token_expires_in : 2592000;
  const existingName = c.get(NAME)?.value;
  if (existingName) setMemberNameCookie(res, decodeURIComponent(existingName), secure, rtMaxAge);
  else await stampMemberName(res, r, secure);
  return res;
}
