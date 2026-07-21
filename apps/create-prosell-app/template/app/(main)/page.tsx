import Link from "next/link";
import { fetchProducts, fetchBestReviews, fetchFooter, getToken } from "@/lib/prosell";
import ProductListing from "@/components/ProductListing";
import ProductCard from "@/components/ProductCard";
import ProductSwiper from "@/components/ProductSwiper";
import HomeBanner from "@/components/HomeBanner";
import ReviewGrid from "@/components/ReviewGrid";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

// 홈 타이틀도 연결된 쇼핑몰 상호명(shop/footer.service)으로 — 고정 "프로셀 AI 스토어" 대신.
export async function generateMetadata() {
  const footer = await fetchFooter();
  return buildMetadata({ description: "다양한 상품을 만나보세요.", siteName: footer?.service });
}

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string; order?: string; limit?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const order = sp.order || "1";     // 전시순서순(전체상품 페이지와 동일)
  const limit = sp.limit || "20";    // 기본 20개

  // 회원 토큰 전달 → 목록 가격도 등급할인(show_*) 반영. 비회원은 ISR 캐시 유지.
  const token = await getToken();
  const [{ items, total_count, viewer }, best, fresh, reviews] = await Promise.all([
    fetchProducts({ limit, page: String(page), order }, token),
    fetchProducts({ limit: "10", page: "1", order: "2" }, token), // 판매량순 상단 진열
    fetchProducts({ limit: "10", page: "1", order: "8" }, token), // 신상품순 진열
    fetchBestReviews({ limit: 5, photo: 1 }),
  ]);

  return (
    <>
      {/* 풀폭 와이드 스와이프 배너 */}
      <HomeBanner />

      <div className="mx-auto max-w-content px-4 py-6">
        {/* 판매량순 상품 스와이프(전체상품 위) — 카드는 서버에서 렌더 */}
        <ProductSwiper
          title="판매량순"
          slides={best.items.map((it) => (
            <ProductCard key={it.origin?.id} item={it} adultAllowed={viewer?.adult === 1} priority />
          ))}
        />

        {/* 신상품순 상품 스와이프 */}
        <ProductSwiper
          title="신상품순"
          slides={fresh.items.map((it) => (
            <ProductCard key={it.origin?.id} item={it} adultAllowed={viewer?.adult === 1} priority />
          ))}
        />

        <h1 className="text-[22px] font-bold">전체상품</h1>
        <ProductListing items={items} total={total_count} page={page} order={order} limit={limit} basePath="/" adultAllowed={viewer?.adult === 1} showControls={false} showPagination={false} />

        {/* 하단 상품리뷰 — 스와이프 없이 정적 그리드 + 전체보기(/reviews) */}
        {reviews.items.length > 0 && (
          <section className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-text">상품리뷰</h2>
              <Link href="/reviews" className="inline-flex items-center gap-0.5 text-[13px] text-sub hover:text-accent">
                전체보기
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </Link>
            </div>
            <ReviewGrid items={reviews.items} />
          </section>
        )}
      </div>
    </>
  );
}
