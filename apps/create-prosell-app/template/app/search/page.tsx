import { fetchProducts } from "@/lib/prosell";
import ProductCard from "@/components/ProductCard";
import SearchBar from "@/components/SearchBar";
import ListControls from "@/components/ListControls";
import Pagination from "@/components/Pagination";

export const dynamic = "force-dynamic";

// /search?q= — 키워드 상품 검색 결과.
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; order?: string; limit?: string }> }) {
  const sp = await searchParams;
  const keyword = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const order = sp.order || "1";
  const limit = sp.limit || "20";

  const { items, total_count } = keyword
    ? await fetchProducts({ limit, page: String(page), order, keyword })
    : { items: [], total_count: 0 };

  const query = { q: keyword };

  return (
    <main className="mx-auto max-w-content p-6">
      <div className="md:hidden">
        <SearchBar defaultValue={keyword} />
      </div>

      <h1 className="mt-4 text-[22px] font-bold md:mt-0">
        {keyword ? <>‘{keyword}’ 검색 결과</> : "상품 검색"}
      </h1>

      {!keyword ? (
        <p className="mt-2 text-[13px] text-sub">검색어를 입력하면 상품을 찾아 드립니다.</p>
      ) : null}

      {keyword && items.length > 0 ? (
        <>
          <div className="mb-3 mt-3">
            <ListControls total={total_count} order={order} limit={limit} basePath="/search" query={query} />
          </div>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {items.map((it) => (
              <ProductCard key={it.origin?.id} item={it} />
            ))}
          </div>
          <Pagination total={total_count} page={page} perPage={Number(limit) || 20} basePath="/search" query={{ ...query, order, limit }} />
        </>
      ) : null}

      {keyword && items.length === 0 ? (
        <p className="mt-6 rounded-md border border-line bg-card p-8 text-center text-sub">
          ‘{keyword}’에 대한 상품이 없습니다. 다른 검색어를 입력해 보세요.
        </p>
      ) : null}
    </main>
  );
}
