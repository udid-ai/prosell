import { NextRequest, NextResponse } from "next/server";
import { requestVerify, confirmVerify, certifyLaunchUrl, fetchCertifyProfile, discardCertify } from "@/lib/prosell";

export const dynamic = "force-dynamic";

// 클라이언트(JoinForm)용 서버 프록시 — client_id 를 서버에만 두고 인증 API 를 중계한다.
export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (b.kind === "send") {
      return NextResponse.json(await requestVerify(b.channel as "sms" | "email", String(b.target)));
    }
    if (b.kind === "confirm") {
      return NextResponse.json(
        await confirmVerify(b.channel as "sms" | "email", Number(b.send_id), String(b.code), String(b.target))
      );
    }
    if (b.kind === "certify-launch") {
      // 본인확인 결과는 스토어 origin 으로만 postMessage 되므로 redirect_uri 를 동일 origin 으로 고정.
      // 브라우저의 실제 origin(window.location.origin)을 받아 사용한다. (서버 req.url 은 0.0.0.0 으로 잡힐 수 있음)
      const o = String(b.origin || "");
      const p = o ? new URL(o) : new URL(req.url);
      const okHost = p.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(p.hostname);
      if (!okHost) return NextResponse.json({ error: "허용되지 않는 origin 입니다." }, { status: 400 });
      // 복귀 경로(모바일 폴백 리다이렉트 대상). 같은 origin 의 경로만 허용. 기본 /auth/join.
      let rp = String(b.return_path || "/auth/join");
      if (!rp.startsWith("/")) rp = "/auth/join";
      return NextResponse.json({ launch_url: certifyLaunchUrl(`${p.origin}${rp}`, String(b.state || "")) });
    }
    if (b.kind === "certify-profile") {
      return NextResponse.json((await fetchCertifyProfile(String(b.certify_id || ""))) || {});
    }
    if (b.kind === "certify-discard") {
      return NextResponse.json({ discarded: await discardCertify(String(b.certify_id || "")) });
    }
    return NextResponse.json({ error: "unknown kind" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "오류" }, { status: 400 });
  }
}
