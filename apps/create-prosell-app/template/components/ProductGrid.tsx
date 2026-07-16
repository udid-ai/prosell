import { withDemoList } from "@/lib/demo";
import ProductCard from "./ProductCard";
import type { ProductItem } from "@/lib/prosell";

// 상품 그리드 — 홈/카테고리 페이지 공통.
// demoFallback: 실데이터가 없을 때 데모 상품으로 채울지 여부.
//   · 홈(기본 true): 첫 진입 화면이 비지 않도록 데모 폴백.
//   · 카테고리(false): 빈 카테고리엔 데모 대신 "등록된 상품이 없습니다" 안내(데모 혼동 방지).
export default function ProductGrid({ items, demoFallback = true, adultAllowed = false }: { items: ProductItem[]; demoFallback?: boolean; adultAllowed?: boolean }) {
  const [list, isDemo] = demoFallback ? withDemoList(items) : ([items, false] as const);

  if (list.length === 0) {
    return <p className="mt-10 text-center text-sm text-sub">등록된 상품이 없습니다.</p>;
  }

  return (
    <>
      {isDemo ? (
        <p className="mt-1 text-[13px] text-sub">
          데모 상품입니다. 쇼핑몰에 상품을 등록하면 실제 상품이 표시됩니다.
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((it) => (
          <ProductCard key={it.origin?.id} item={it} adultAllowed={adultAllowed} />
        ))}
      </div>
    </>
  );
}
