import { NextRequest, NextResponse } from "next/server";

// 액세스 토큰 선제 갱신 proxy(Next 16에서 middleware → proxy 로 규칙명 변경).
// AT 쿠키는 실제 토큰 만료 5분 전(AT_SKEW) 만료되도록 발급된다(lib/prosell.ts atCookieMaxAge).
// → AT 쿠키가 사라졌지만 RT 쿠키가 남아있으면, 여기서 refresh_token 으로 재발급해
//   같은 요청부터 로그인 상태를 유지한다(만료 직전 리프레시 누락 방지).
// Edge 런타임이라 next/headers 를 쓰는 lib/prosell.ts 는 임포트하지 않고 상수/요청을 자체 정의한다.

const AT = "pa_at"; // access token 쿠키
const RT = "pa_rt"; // refresh token 쿠키
const EXP = "pa_exp"; // 만료 힌트(비-httpOnly) — 클라이언트 SessionKeeper 스케줄용
const NAME = "pa_name"; // 표시이름 캐시(비-httpOnly) — 헤더 «N님» 용. 여기선 수명만 연장(재조회 없음).

export async function proxy(req: NextRequest) {
  const at = req.cookies.get(AT)?.value;
  const rt = req.cookies.get(RT)?.value;

  // AT 유효 → 통과. RT 없음 → 갱신 불가(비회원/완전 만료).
  if (at || !rt) return NextResponse.next();

  // 실제 문서 내비게이션에서만 갱신한다. 백엔드가 refresh 시 이전 RT 를 즉시 폐기(회전)하므로,
  // 프리페치/에셋/병렬 fetch 등 동시요청이 같은 RT 로 refresh 하면 레이스로 로그아웃될 수 있다.
  const isPrefetch = !!req.headers.get("next-router-prefetch") || req.headers.get("purpose") === "prefetch";
  if (req.headers.get("sec-fetch-dest") !== "document" || isPrefetch) return NextResponse.next();

  const base = process.env.PROSELL_API_BASE;
  const clientId = process.env.PROSELL_CLIENT_ID;
  const clientSecret = process.env.PROSELL_CLIENT_SECRET;
  if (!base || !clientId || !clientSecret) return NextResponse.next();

  const secure = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "")) === "https";

  try {
    const r = await fetch(`${base}/api/v2/member/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: rt }),
      cache: "no-store",
    });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;

    if (!r.ok || !d.access_token) {
      // 갱신 실패 → «비파괴» 통과. RT 를 지우지 않는다.
      //  · 클라이언트 SessionKeeper 가 동시에 회전 성공시켜 놓은 RT 를, 레이스에서 진 proxy 가
      //    삭제해 로그아웃시키는 사고를 방지(회전 토큰 특성).
      //  · RT 가 진짜 만료면 AT 부재만으로 UI 는 이미 로그아웃 표시(getToken=AT 기준). 남은 쿠키는
      //    이후 요청에서 자연히 실패·정리되며 유해하지 않다.
      return NextResponse.next();
    }

    const newAt = String(d.access_token);
    const newRt = d.refresh_token ? String(d.refresh_token) : rt; // 회전 시 새 RT, 아니면 기존 유지
    const expiresIn = typeof d.expires_in === "number" ? d.expires_in : 10800;
    const atMaxAge = Math.max(60, expiresIn - 300); // AT_SKEW=300
    const rtMaxAge = typeof d.refresh_token_expires_in === "number" && d.refresh_token_expires_in > 0
      ? d.refresh_token_expires_in : 2592000;

    // 같은 요청의 downstream(RSC/route)이 새 AT 를 읽도록 요청 쿠키도 갱신.
    req.cookies.set(AT, newAt);
    req.cookies.set(RT, newRt);
    const res = NextResponse.next({ request: { headers: req.headers } });
    res.cookies.set(AT, newAt, { httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: atMaxAge });
    res.cookies.set(RT, newRt, { httpOnly: true, path: "/", sameSite: "lax", secure, maxAge: rtMaxAge });
    // 만료 힌트(실제 만료 epoch ms) — 클라이언트 SessionKeeper 가 읽어 선제 갱신 스케줄
    res.cookies.set(EXP, String(Date.now() + expiresIn * 1000), { httpOnly: false, path: "/", sameSite: "lax", secure, maxAge: rtMaxAge });
    // 표시이름 쿠키가 있으면 RT 수명에 맞춰 연장(엣지라 재조회는 안 함 — 로그인/갱신 라우트가 최초 심음).
    const name = req.cookies.get(NAME)?.value;
    if (name) res.cookies.set(NAME, name, { httpOnly: false, path: "/", sameSite: "lax", secure, maxAge: rtMaxAge });
    return res;
  } catch {
    return NextResponse.next();
  }
}

// 정적 자산·이미지·favicon 제외한 모든 경로에서 동작(페이지·API 요청 시 선제 갱신).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map|woff2?|ttf)$).*)"],
};
