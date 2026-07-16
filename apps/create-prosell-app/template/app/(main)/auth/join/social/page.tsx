import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchMemberConfig, type SocialProfile } from "@/lib/prosell";
import SocialJoinForm from "@/components/SocialJoinForm";

export const dynamic = "force-dynamic";

const SWAIT = "pa_social_wait";

// 소셜 신규 가입 랜딩 — 콜백이 member_wait 저장 후 wait 쿠키와 함께 보낸다.
// 프로필 프리필 + 약관 동의 + (설정 시) 본인확인을 거쳐 가입완료.
export default async function SocialJoinPage() {
  const raw = (await cookies()).get(SWAIT)?.value;
  if (!raw) redirect("/auth/login"); // wait 정보 없으면 진입 불가

  let provider = "";
  let profile: SocialProfile = { name: "", nick: "", email: "", hp: "", birth: "", gender: 0 };
  try {
    const d = JSON.parse(Buffer.from(raw!, "base64").toString("utf8")) as { provider?: string; profile?: Partial<SocialProfile> };
    provider = String(d.provider || "");
    const p = d.profile ?? {};
    profile = { name: String(p.name || ""), nick: String(p.nick || ""), email: String(p.email || ""), hp: String(p.hp || ""), birth: String(p.birth || ""), gender: Number(p.gender || 0) };
  } catch {
    redirect("/auth/login");
  }

  const config = await fetchMemberConfig();
  return <SocialJoinForm provider={provider} profile={profile} config={config} />;
}
