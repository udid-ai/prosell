import Link from "next/link";
import { getToken, fetchDropoutInfo } from "@/lib/prosell";
import DropoutForm from "@/components/DropoutForm";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";

export default async function DropoutPage() {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">회원 탈퇴</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }

  const info = await fetchDropoutInfo(token);
  if (!info) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">회원 탈퇴</h1>
        <p className="mt-2 text-sale">탈퇴 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
      </div>
    );
  }
  return <DropoutForm info={info} />;
}
