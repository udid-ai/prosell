import Link from "next/link";
import { priceOf, thumbOf, won, type ProductItem } from "@/lib/prosell";

// 디자인 레이어 — 카드 모양/스타일은 여기서 자유롭게 변경.
export default function ProductCard({ item }: { item: ProductItem }) {
  const id = item.origin?.id;
  const thumb = thumbOf(item);
  const { price, base } = priceOf(item);

  return (
    <Link href={`/products/${id}`} className="text-text">
      <div className="overflow-hidden rounded-md border border-line bg-card transition-shadow hover:shadow-card">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="block aspect-square w-full object-cover" />
        ) : (
          <div className="grid aspect-square w-full place-items-center bg-bg text-xs text-sub">
            이미지 없음
          </div>
        )}
        <div className="p-3">
          <div className="min-h-9 text-sm leading-tight">{item.origin?.title}</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-extrabold">{won(price)}</span>
            {base ? <span className="text-xs text-sub line-through">{won(base)}</span> : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
