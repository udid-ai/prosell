import { fetchProductReviews } from "@/lib/prosell";
import ReviewsAll from "@/components/ReviewsAll";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({ title: "상품리뷰", description: "고객님들이 남겨주신 상품리뷰 전체를 확인해보세요." });

export default async function ReviewsPage() {
  // 전역(products_id=0) 리뷰 첫 페이지. best DESC · id DESC.
  const { items, total_count, summary } = await fetchProductReviews("0", { page: 1, limit: 20 });

  return (
    <div className="mx-auto max-w-content px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-[22px] font-bold text-text">상품리뷰</h1>
        {total_count > 0 && (
          <p className="text-[13px] text-sub">
            총 <b className="text-text">{total_count.toLocaleString("ko-KR")}</b>개
            {summary.average > 0 ? <> · 평균 <b className="text-text">{summary.average.toFixed(1)}</b>점</> : null}
          </p>
        )}
      </div>

      <ReviewsAll initialItems={items} total={total_count} summary={summary} />
    </div>
  );
}
