import { NextRequest, NextResponse } from "next/server";
import { requestFacebookDeletion, clientIpFromHeaders } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 페이스북 데이터 삭제 콜백(Data Deletion Callback).
// 페이스북 앱 대시보드 → Facebook Login → "Data Deletion Callback URL" 에 이 경로(/api/facebook/deletion)를 등록한다.
// 페이스북이 signed_request 를 application/x-www-form-urlencoded 로 POST → 백엔드에서 서명검증·회원탈퇴(정책 B) →
// 페이스북 필수 응답 { url, confirmation_code } 반환. url 은 사용자가 삭제 상태를 조회하는 페이지.
export async function POST(req: NextRequest) {
  let signedRequest = "";
  try {
    const form = await req.formData();
    signedRequest = String(form.get("signed_request") || "");
  } catch {
    const b = (await req.json().catch(() => ({}))) as { signed_request?: string };
    signedRequest = String(b.signed_request || "");
  }
  if (!signedRequest) return NextResponse.json({ error: "signed_request required" }, { status: 400 });

  const r = await requestFacebookDeletion(signedRequest, clientIpFromHeaders(req.headers));
  if (!r.ok || !r.confirmation_code) return NextResponse.json({ error: r.error || "deletion failed" }, { status: 400 });

  const host = req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "") || "https";
  const origin = `${proto}://${host}`;

  // 페이스북 스펙: url(상태조회 페이지) + confirmation_code 둘 다 필수.
  return NextResponse.json({
    url: `${origin}/leave/facebook/${r.confirmation_code}`,
    confirmation_code: r.confirmation_code,
  });
}
