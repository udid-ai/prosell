import Link from "next/link";
import { fetchProducts, fetchCategories, fetchProductFacets, getToken } from "@/lib/prosell";
import { filterState } from "@/lib/productFilters";
import ProductListing from "@/components/ProductListing";
import CategoryFilters from "@/components/CategoryFilters";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({ title: "전체 카테고리", description: "전체 상품 카테고리를 둘러보세요." });

export const dynamic = "force-dynamic";

// /category — 전체 상품 + 대분류 바로가기 칩.
export default async function CategoryAll({ searchParams }: { searchParams: Promise<{ page?: string; order?: string; limit?: string; brand?: string; color?: string; size?: string; icon?: string; price_min?: string; price_max?: string; instock?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const order = sp.order || "1";
  const limit = sp.limit || "20";
  const { api: filterApi, query: filterQuery } = filterState(sp);

  const token = await getToken(); // 회원 등급할인(show_*) 반영
  const [{ items, total_count, viewer }, tree, facets] = await Promise.all([
    fetchProducts({ limit, page: String(page), order, ...filterApi }, token),
    fetchCategories(),
    fetchProductFacets(),
  ]);

  return (
    <div className="mx-auto max-w-content p-6">
      <CategoryFilters
        facets={facets}
        basePath="/category"
        heading={<h1 className="text-[22px] font-bold">전체 상품</h1>}
        subnav={tree.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tree.map((c) => (
              <Link key={c.id} href={`/category/${c.id}`}
                className="rounded-full border border-line bg-card px-3 py-1.5 text-[13px] text-text hover:border-accent hover:text-accent">
                {c.title}
              </Link>
            ))}
          </div>
        ) : undefined}
      />

      <ProductListing items={items} total={total_count} page={page} order={order} limit={limit} basePath="/category" query={filterQuery} demoFallback={false} adultAllowed={viewer?.adult === 1} />
    </div>
  );
}
