import LoginForm from "@/components/LoginForm";
import { fetchSocialProviders, fetchShopPolicy } from "@/lib/prosell";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ joined?: string; error?: string; redirect?: string }> }) {
  const { joined, error, redirect } = await searchParams;
  // 주문 정책(order_guest)은 «비회원으로 구매» 노출 판단에 쓴다 — 주문서 API 는 인증이 필요해 여기선 못 쓴다.
  const [providers, policy] = await Promise.all([fetchSocialProviders(), fetchShopPolicy()]);
  // 오픈리다이렉트 방지: 앱 내부 경로(단일 "/" 시작, "//" 제외)만 허용.
  const safeRedirect = redirect && /^\/(?!\/)/.test(redirect) ? redirect : undefined;
  return <LoginForm joined={joined === "1"} error={error} providers={providers} redirect={safeRedirect} orderGuest={policy?.order_guest ?? 0} />;
}
