import { won, type MemberOrderItem } from "@/lib/prosell";

// 추가 주문옵션 박스 — 주문페이지와 동일 디자인.
// 표기: 「{옵션명} : {선택값} ({가격} / {수량}개)」 (레거시 order 표기와 동일).
export default function OrderAddonBox({ addons, className = "" }: { addons: MemberOrderItem[]; className?: string }) {
  if (!addons.length) return null;
  return (
    <div className={`mt-2 rounded-md border border-line bg-surface/50 px-2.5 py-2 text-[12px] text-sub ${className}`}>
      <p className="font-semibold text-text/70">추가 주문옵션</p>
      <ul className="mt-1 space-y-0.5">
        {addons.map((a) => {
          const p = a.product;
          const title = p.option_title || p.pro_title || "추가옵션";
          const name = p.option_name || "";
          const paren: string[] = [];
          if (p.pro_amount_price > 0) paren.push(won(p.pro_amount_price));
          if (p.pro_quantity > 1) paren.push(`${p.pro_quantity}개`);
          const label = (name ? `${title} : ${name}` : title) + (paren.length ? ` (${paren.join(" / ")})` : "");
          return <li key={p.prno} className="truncate">{label}</li>;
        })}
      </ul>
    </div>
  );
}
