import Link from "next/link";
import { getToken, fetchMemberOrderByDno, fetchProductView, fetchReviewTitleEnabled } from "@/lib/prosell";
import OrderDetailView from "@/components/OrderDetailView";
import { type ExchangeOption } from "@/components/ExchangeRequestButton";

export const dynamic = "force-dynamic";

const cardCls = "rounded-md border border-line bg-card p-6";

export default async function OrderGroupDetailPage({ params }: {
  params: Promise<{ dno: string }>;
}) {
  const token = await getToken();
  if (!token) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">주문 상세</h1>
        <p className="mt-2 text-sub">로그인이 필요합니다.</p>
        <Link href="/auth/login" className="mt-3 inline-block rounded-sm bg-accent px-4 py-2 text-accent-foreground">로그인</Link>
      </div>
    );
  }
  const { dno } = await params;
  const res = await fetchMemberOrderByDno(token, dno);
  const order = res?.order ?? null;
  const pointReward = res?.pointReward ?? { review: 0, review_photo: 0 };
  const items = (order?.items ?? []).filter((it) => String(it.product.dno || it.delivery?.dno || 0) === String(dno));

  if (!order || items.length === 0) {
    return (
      <div className={cardCls}>
        <h1 className="text-xl">주문 상세</h1>
        <p className="mt-2 text-sub">주문 정보를 찾을 수 없습니다.</p>
        <Link href="/account/orders" className="mt-3 inline-block rounded-md border border-line px-4 py-2 text-sm text-text hover:bg-surface">주문 내역으로</Link>
      </div>
    );
  }

  // 교환접수 대상 상품의 옵션 목록(옵션변경용) — 상품상세에서 조회해 첨부.
  const exchProductsIds = [...new Set(
    items.filter((it) => it.actions?.can_exchange === 1).map((it) => it.product.products_id),
  )];
  const exchOptionMap = new Map<number, ExchangeOption[]>();
  await Promise.all(
    exchProductsIds.map(async (pid) => {
      const pv = await fetchProductView(String(pid), token);
      const opts: ExchangeOption[] = (pv?.options ?? []).map((o) => ({
        id: o.id, label: o.label, price: o.sale_price || o.price, soldout: o.soldout,
      }));
      exchOptionMap.set(pid, opts);
    }),
  );

  const reviewTitleEnabled = await fetchReviewTitleEnabled(token);

  return <OrderDetailView order={order} dno={dno} pointReward={pointReward} exchOptionMap={exchOptionMap} reviewTitleEnabled={reviewTitleEnabled} />;
}
