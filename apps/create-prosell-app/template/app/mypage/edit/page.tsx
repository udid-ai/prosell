import Link from "next/link";
import { getToken, fetchAccount, fetchMemberConfig } from "@/lib/prosell";
import EditForm from "@/components/EditForm";

export const dynamic = "force-dynamic";

const cardCls = "mx-auto my-6 max-w-[560px] rounded-md border border-line bg-card p-6";

export default async function EditPage() {
  const token = await getToken();
  if (!token) {
    return (
      <main className={cardCls}>
        <h1 className="text-xl">회원정보 수정</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </main>
    );
  }

  const [acc, config] = await Promise.all([fetchAccount(token), fetchMemberConfig()]);
  if (!acc) {
    return (
      <main className={cardCls}>
        <h1 className="text-xl">회원정보 수정</h1>
        <p className="mt-2 text-sale">회원정보를 불러오지 못했습니다. 다시 로그인해 주세요.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </main>
    );
  }

  return <EditForm account={acc} config={config} />;
}
