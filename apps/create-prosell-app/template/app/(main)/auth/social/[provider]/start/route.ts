import { NextRequest, NextResponse } from "next/server";
import { fetchSocialProviders } from "@/lib/prosell";

export const dynamic = "force-dynamic";

const SST = "pa_sstate"; // social oauth state (일회용)

// SNS 버튼 클릭 → provider authorize 로 리다이렉트 (state 쿠키 발급).
// redirect_uri 는 이 앱의 콜백(=provider 콘솔에 등록해야 함).
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const providers = await fetchSocialProviders();
  const p = providers.find((x) => x.provider === provider);

  const host = req.headers.get("host") || req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(/:$/, "") || "http";
  const origin = `${proto}://${host}`;
  if (!p) return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent("지원하지 않는 SNS 입니다.")}`);

  const redirectUri = `${origin}/auth/social/${provider}`;
  const state = crypto.randomUUID();

  const u = new URL(p.authorize_url);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.client_id);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  if (p.scope) u.searchParams.set("scope", p.scope);

  const res = NextResponse.redirect(u.toString());
  res.cookies.set(SST, `${provider}:${state}`, { httpOnly: true, path: "/", sameSite: "lax", secure: proto === "https", maxAge: 600 });
  return res;
}
