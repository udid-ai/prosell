import { fetchProducts, getToken } from "@/lib/prosell";
import ProductListing from "@/components/ProductListing";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({ description: "다양한 상품을 만나보세요." });

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string; order?: string; limit?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const order = sp.order || "0";
  const limit = sp.limit || "20";

  // 회원 토큰 전달 → 목록 가격도 등급할인(show_*) 반영. 비회원은 ISR 캐시 유지.
  const token = await getToken();
  const { items, total_count, viewer } = await fetchProducts({ limit, page: String(page), order }, token);

  return (
    <div className="mx-auto max-w-content p-6">
      <h1 className="text-[22px] font-bold">상품</h1>
      <ProductListing items={items} total={total_count} page={page} order={order} limit={limit} basePath="/" adultAllowed={viewer?.adult === 1} />
    </div>
  );
}
