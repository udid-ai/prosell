import { NextRequest, NextResponse } from "next/server";

// 토큰 쿠키 이름(lib/prosell.ts 의 AT/RT 와 동일)
const AT = "pa_at";
const RT = "pa_rt";
// 선제 갱신 skew(lib/prosell.ts AT_SKEW 와 동일) — AT 쿠키를 실제 만료보다 5분 일찍 죽인다.
// next/headers 를 import 하는 prosell.ts 는 proxy(edge)에서 못 쓰므로 값만 인라인.
const AT_SKEW = 300;

// 액세스 토큰(쿠키) 자동 갱신 proxy(구 middleware — Next 16에서 규칙명이 proxy 로 바뀜).
// AT 쿠키 maxAge = expires_in - AT_SKEW(5분)이라, 실제 토큰이 죽기 5분 전에 브라우저가 삭제한다.
// → AT 쿠키가 없고 RT 쿠키만 있으면(=만료 임박/만료) refresh_token 으로 선제 재발급한다.
// 백엔드: POST /api/v2/oauth/token (grant_type=refresh_token, form-encoded, client_secret 필요).
export async function proxy(req: NextRequest) {
  const at = req.cookies.get(AT)?.value;
  const rt = req.cookies.get(RT)?.value;

  // 액세스 토큰 살아있거나, RT 없으면(비로그인) 아무것도 안 함
  if (at || !rt) return NextResponse.next();

  const base = process.env.PROSELL_API_BASE;
  const cid = process.env.PROSELL_CLIENT_ID;
  const sec = process.env.PROSELL_CLIENT_SECRET;
  if (!base || !cid || !sec) return NextResponse.next();

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: rt,
      client_id: cid,
      client_secret: sec,
    });
    const r = await fetch(`${base}/api/v2/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const d = (await r.json().catch(() => null)) as
      | { access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number }
      | null;

    // 리프레시 만료/실패 → RT 제거(로그아웃 상태)
    if (!r.ok || !d?.access_token) {
      const res = NextResponse.next();
      res.cookies.delete(RT);
      return res;
    }

    const newAt = String(d.access_token);
    const newRt = d.refresh_token ? String(d.refresh_token) : rt;

    // 현재 요청에도 새 AT 를 노출 → 이번 렌더부터 로그인 인식(1요청 지연 제거)
    const reqHeaders = new Headers(req.headers);
    const cookieHeader = req.headers.get("cookie") || "";
    reqHeaders.set("cookie", `${cookieHeader ? cookieHeader + "; " : ""}${AT}=${newAt}`);
    const res = NextResponse.next({ request: { headers: reqHeaders } });

    const secure = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "")) === "https";
    res.cookies.set(AT, newAt, {
      httpOnly: true, path: "/", sameSite: "lax", secure,
      maxAge: Math.max(60, (typeof d.expires_in === "number" ? d.expires_in : 10800) - AT_SKEW),
    });
    res.cookies.set(RT, newRt, {
      httpOnly: true, path: "/", sameSite: "lax", secure,
      // 폴백 30일 — 로그인 라우트(2592000)와 통일. 서버는 refresh_token_expires_in 을 항상 반환하므로 평소엔 미사용.
      maxAge: typeof d.refresh_token_expires_in === "number" ? d.refresh_token_expires_in : 2592000,
    });
    return res;
  } catch {
    return NextResponse.next();
  }
}

export const config = {
  // 정적 자산 제외(나머지 페이지·API 라우트에서 갱신). AT 살아있으면 즉시 통과라 비용 미미.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
