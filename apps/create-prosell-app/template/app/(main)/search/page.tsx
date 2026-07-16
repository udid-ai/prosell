import type { Metadata } from "next";
import { fetchProducts, fetchProductFacets, getToken } from "@/lib/prosell";
import { filterState } from "@/lib/productFilters";
import { buildMetadata } from "@/lib/seo";
import ProductCard from "@/components/ProductCard";
import SearchBar from "@/components/SearchBar";
import ListControls from "@/components/ListControls";
import Pagination from "@/components/Pagination";
import CategoryFilters from "@/components/CategoryFilters";

export const dynamic = "force-dynamic";

// 검색 랜딩은 색인 제외(noindex) — 쿼리별 중복 페이지 + /category 와의 중복 방지.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const q = ((await searchParams).q ?? "").trim();
  return buildMetadata({ title: q ? `‘${q}’ 검색 결과` : "상품 검색", noindex: true });
}

// /search — 통합 검색·브라우징 랜딩.
//  · q 있으면 키워드 검색 결과, 없으면 전체 상품 브라우징.
//  · 키워드 유무와 무관하게 페이지 내 검색바 + 패싯필터(브랜드/색상/사이즈/가격/재고) + 정렬 + 페이징을 함께 제공.
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; order?: string; limit?: string; brand?: string; color?: string; size?: string; icon?: string; price_min?: string; price_max?: string; instock?: string; filter?: string }> }) {
  const sp = await searchParams;
  const keyword = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const order = sp.order || "0";
  const limit = sp.limit || "20";
  const { api: filterApi, query: filterQuery } = filterState(sp);

  const token = await getToken(); // 회원 등급할인(show_*) 반영
  // 키워드가 있으면 keyword 조건 포함, 없으면 전체 상품. 둘 다 패싯필터·정렬·페이징 동일 적용.
  const [{ items, total_count, viewer }, facets] = await Promise.all([
    fetchProducts({ limit, page: String(page), order, ...(keyword ? { keyword } : {}), ...filterApi }, token),
    fetchProductFacets(),
  ]);

  // 페이징/정렬/필터 링크에 보존할 쿼리(키워드 포함).
  const query = { ...(keyword ? { q: keyword } : {}), ...filterQuery };
  const heading = keyword ? `‘${keyword}’ 검색 결과` : "전체 상품";

  return (
    <div className="mx-auto max-w-content p-6">
      {/* 페이지 내 검색바 — 키워드 정제/재검색(데스크탑·모바일 공통). 현재 필터는 새 검색 시 초기화. */}
      <div className="mx-auto max-w-xl">
        <SearchBar defaultValue={keyword} />
      </div>

      {/* 제목 + 우측 필터 아이콘(패싯) */}
      <div className="mt-4">
        <CategoryFilters facets={facets} basePath="/search"
          heading={<h1 className="truncate text-[22px] font-bold">{heading}</h1>} />
      </div>

      {items.length > 0 ? (
        <>
          <div className="mb-3 mt-3">
            <ListControls total={total_count} order={order} limit={limit} basePath="/search" query={query} />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((it) => (
              <ProductCard key={it.origin?.id} item={it} adultAllowed={viewer?.adult === 1} />
            ))}
          </div>
          <Pagination total={total_count} page={page} perPage={Number(limit) || 20} basePath="/search" query={{ ...query, order, limit }} />
        </>
      ) : (
        <p className="mt-6 rounded-md border border-line bg-card p-8 text-center text-sub">
          {keyword
            ? <>‘{keyword}’에 대한 상품이 없습니다. 다른 검색어를 입력해 보세요.</>
            : "등록된 상품이 없습니다."}
        </p>
      )}
    </div>
  );
}
