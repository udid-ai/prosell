import Link from "next/link";
import { getToken, fetchAccount, fetchMemberConfig } from "@/lib/prosell";
import EditGate from "@/components/EditGate";

export const dynamic = "force-dynamic";

// 폭·중앙정렬·상하 여백은 account/layout 이 담당 → 카드는 콘텐츠 열을 채운다.
const cardCls = "rounded-md border border-line bg-card p-6";

export default async function EditPage() {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">회원정보 수정</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }

  const [acc, config] = await Promise.all([fetchAccount(token), fetchMemberConfig()]);
  if (!acc) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">회원정보 수정</h1>
        <p className="mt-2 text-sale">회원정보를 불러오지 못했습니다. 다시 로그인해 주세요.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }

  // 소셜 로그인(account>0)은 비밀번호가 없어 재인증 없이 바로 접근, 비번 계정은 EditGate 에서 현재 비밀번호 확인.
  const isSocial = Number(acc.origin.account ?? 0) > 0;
  return <EditGate isSocial={isSocial} account={acc} config={config} />;
}
