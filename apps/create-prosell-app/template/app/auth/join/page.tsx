import { fetchMemberConfig } from "@/lib/prosell";
import JoinStep1 from "@/components/JoinStep1";

export const dynamic = "force-dynamic";

// 1단계: 약관·본인확인
export default async function JoinPage() {
  const config = await fetchMemberConfig();
  return <JoinStep1 config={config} />;
}
