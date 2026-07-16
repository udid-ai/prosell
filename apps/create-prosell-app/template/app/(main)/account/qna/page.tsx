import Link from "next/link";
import { getToken, fetchMyQna } from "@/lib/prosell";
import AccountQna from "@/components/AccountQna";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";
const LIMIT = 20;

// 1:1 문의 — 내 계정 하위 라우트(/account/qna). board_type 인식(통합 cs_article_board / 개별 cs_article_qna).
export default async function AccountQnaPage() {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">1:1 문의</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }

  const list = await fetchMyQna(token, { page: 1, limit: LIMIT });
  return <AccountQna items={list.items} board={list.board} />;
}
