import { withDemoList } from "@/lib/demo";
import ProductCard from "./ProductCard";
import type { ProductItem } from "@/lib/prosell";

// 상품 그리드(데모 폴백 포함) — 홈/카테고리 페이지에서 공통 사용.
export default function ProductGrid({ items }: { items: ProductItem[] }) {
  // never-empty: 실데이터 없으면 데모로 폴백 → 화면이 비지 않는다.
  const [list, isDemo] = withDemoList(items);

  return (
    <>
      {isDemo ? (
        <p className="mt-1 text-[13px] text-sub">
          데모 상품입니다. 쇼핑몰에 상품을 등록하면 실제 상품이 표시됩니다.
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
        {list.map((it) => (
          <ProductCard key={it.origin?.id} item={it} />
        ))}
      </div>
    </>
  );
}
