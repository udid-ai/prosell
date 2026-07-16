import Link from "next/link";
import { getToken, fetchMemberConfig } from "@/lib/prosell";
import PasswordForm from "@/components/PasswordForm";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";

export default async function PasswordPage() {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">비밀번호 변경</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }
  const config = await fetchMemberConfig(); // 비밀번호 규칙(fields.upw = req_upw)
  return <PasswordForm reqUpw={config?.fields?.upw} />;
}
