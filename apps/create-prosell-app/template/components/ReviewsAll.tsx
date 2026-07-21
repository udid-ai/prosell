"use client";

import { useCallback, useState } from "react";
import type { ProductReview, ProductReviewSummary } from "@/lib/prosell";
import ReviewGrid from "./ReviewGrid";

const PAGE_SIZE = 20;

// 상품리뷰 전체보기 랜딩 — 전역(products_id=0) 리뷰를 그리드로 보여주고 «더보기»로 이어붙인다.
export default function ReviewsAll({
  initialItems,
  total,
  summary,
}: {
  initialItems: ProductReview[];
  total: number;
  summary: ProductReviewSummary;
}) {
  const [items, setItems] = useState<ProductReview[]>(initialItems);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initialItems.length >= total);

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const next = page + 1;
      const u = new URL("/api/reviews", window.location.origin);
      u.searchParams.set("products_id", "0"); // 전역
      u.searchParams.set("page", String(next));
      u.searchParams.set("limit", String(PAGE_SIZE));
      const res = await fetch(u.toString());
      const j = (await res.json().catch(() => null)) as { items?: ProductReview[]; total_count?: number } | null;
      const rows = j?.items ?? [];
      setItems((prev) => {
        const merged = [...prev, ...rows];
        setDone(rows.length < PAGE_SIZE || merged.length >= Number(j?.total_count ?? total));
        return merged;
      });
      setPage(next);
    } finally {
      setLoading(false);
    }
  }, [page, total]);

  if (!items.length) {
    return <p className="py-16 text-center text-sub">아직 등록된 리뷰가 없습니다.</p>;
  }

  return (
    <div>
      <ReviewGrid items={items} />

      {!done && (
        <div className="mt-8 text-center">
          <button type="button" disabled={loading} onClick={loadMore}
            className="rounded-lg border border-line bg-surface px-6 py-2.5 text-sm font-semibold text-text hover:bg-line disabled:opacity-60">
            {loading ? "불러오는 중…" : "리뷰 더보기"}
          </button>
        </div>
      )}
    </div>
  );
}
