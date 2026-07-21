import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { fetchMemberOrderByDno, fetchReviewTitleEnabled, GUEST_TOKEN_COOKIE } from "@/lib/prosell";
import OrderDetailView from "@/components/OrderDetailView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "비회원 주문 상세", robots: { index: false } };

const outerCls = "mx-auto my-8 w-full max-w-content px-4 py-8 sm:px-4";
const cardCls = "rounded-md border border-line bg-card p-6";

// 비회원 주문 상세 — guest 토큰으로 조회. 회원 상세와 동일 UI, 클레임/영수증 등 회원 전용 액션은 숨김.
export default async function GuestOrderDetailPage({ params }: { params: Promise<{ dno: string }> }) {
  const gt = (await cookies()).get(GUEST_TOKEN_COOKIE)?.value || "";
  const { dno } = await params;

  if (!gt) {
    return (
      <div className={outerCls}>
        <div className={`mx-auto max-w-[560px] ${cardCls}`}>
          <h1 className="text-xl">비회원 주문 상세</h1>
          <p className="mt-2 text-sub">주문조회 후 이용해 주세요.</p>
          <Link href="/order/guest" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">비회원 주문조회</Link>
        </div>
      </div>
    );
  }

  const res = await fetchMemberOrderByDno(gt, dno);
  const order = res?.order ?? null;
  const pointReward = res?.pointReward ?? { review: 0, review_photo: 0 };
  const items = (order?.items ?? []).filter((it) => String(it.product.dno || it.delivery?.dno || 0) === String(dno));

  if (!order || items.length === 0) {
    return (
      <div className={outerCls}>
        <div className={`mx-auto max-w-[560px] ${cardCls}`}>
          <h1 className="text-xl">비회원 주문 상세</h1>
          <p className="mt-2 text-sub">주문 정보를 찾을 수 없습니다.</p>
          <Link href="/order/guest" className="mt-3 inline-block rounded-md border border-line px-4 py-2 text-sm text-text hover:bg-surface">주문조회로</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={outerCls}>
      <div className="mx-auto w-full max-w-[860px]">
        <div className="mb-4">
          <Link href="/order/guest" className="text-[13px] text-sub hover:text-accent">← 주문목록으로</Link>
        </div>
        <OrderDetailView order={order} dno={dno} pointReward={pointReward} guest reviewTitleEnabled={await fetchReviewTitleEnabled(gt)} />
      </div>
    </div>
  );
}
