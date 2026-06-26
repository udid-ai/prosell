import LoginForm from "@/components/LoginForm";
import { fetchSocialProviders } from "@/lib/prosell";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ joined?: string; error?: string }> }) {
  const { joined, error } = await searchParams;
  const providers = await fetchSocialProviders();
  return <LoginForm joined={joined === "1"} error={error} providers={providers} />;
}
