import type { Metadata } from "next";
import FindForm from "@/components/FindForm";
import { fetchMemberConfig } from "@/lib/prosell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "아이디·비밀번호 찾기" };

// 아이디/비밀번호 찾기 — ?tab=pw 로 비밀번호 탭 진입.
// 비밀번호 규칙(fields.upw = req_upw)은 회원가입과 동일 소스에서 가져와 새 비밀번호 폼에 표시.
export default async function FindPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const config = await fetchMemberConfig();
  return <FindForm initialTab={tab === "pw" ? "pw" : "id"} reqUpw={config?.fields?.upw} />;
}
