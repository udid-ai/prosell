import { fetchMemberConfig } from "@/lib/prosell";
import JoinStep2 from "@/components/JoinStep2";

export const dynamic = "force-dynamic";

// 2단계: 가입 정보 입력
export default async function JoinInfoPage() {
  const config = await fetchMemberConfig();
  return <JoinStep2 config={config} />;
}
