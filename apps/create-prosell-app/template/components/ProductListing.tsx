import ListControls from "./ListControls";
import ProductGrid from "./ProductGrid";
import Pagination from "./Pagination";
import type { ProductItem } from "@/lib/prosell";

// 상품 목록 공통 묶음: 상단 컨트롤(총 개수 + 정렬/개수) + 그리드 + 하단 페이징.
// 목록 페이지(홈/카테고리/검색)에서 재사용.
export default function ProductListing({
  items,
  total,
  page,
  order,
  limit,
  basePath,
  query = {},
  demoFallback = true,
  adultAllowed = false,
}: {
  items: ProductItem[];
  total: number;
  page: number;
  order: string;
  limit: string;
  basePath: string;
  query?: Record<string, string>;
  demoFallback?: boolean; // 실데이터 없을 때 데모 폴백 여부(홈만 true, 카테고리는 false)
  adultAllowed?: boolean; // 뷰어 성인 권한(성인상품 이미지 노출 허용)
}) {
  return (
    <>
      {total > 0 && (
        <div className="mb-3 mt-2">
          <ListControls total={total} order={order} limit={limit} basePath={basePath} query={query} />
        </div>
      )}
      <ProductGrid items={items} demoFallback={demoFallback} adultAllowed={adultAllowed} />
      <Pagination total={total} page={page} perPage={Number(limit) || 20} basePath={basePath} query={{ ...query, order, limit }} />
    </>
  );
}
