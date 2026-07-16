"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addToCart, type AddItem } from "@/lib/cart";
import CartAddedModal from "./CartAddedModal";

// 상품 목록 행 버튼(관심상품·최근본상품 공용) — 바로구매·장바구니·삭제.
// removeBase = 삭제 API 경로(예: "/api/account/wishlist"). ?products_id= 로 DELETE.
// 대표 옵션(product_first)으로 수량 1 담기/바로구매. 품절이면 구매 버튼 비활성.
export default function ProductRowActions({
  productsId, productId, title, price, soldout, removeBase, canOrder = true,
}: { productsId: number; productId: number; title: string; price: number; soldout: boolean; removeBase: string; canOrder?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "cart" | "buy" | "del">("");
  const [added, setAdded] = useState(false); // 장바구니 담기 완료 모달

  const item = (): AddItem => ({
    line_key: `${productsId}:opt-${productId}`,
    products_id: productsId, product_id: productId, kind: "opt",
    title, label: "", price, quantity: 1,
  });

  async function onCart() {
    if (busy) return;
    if (!productId) { router.push(`/products/${productsId}`); return; } // 옵션 선택 필요 → 상세로
    setBusy("cart");
    const ok = await addToCart([item()]);
    setBusy("");
    if (!ok) { alert("장바구니 담기에 실패했습니다."); return; }
    setAdded(true);
  }

  async function onBuy() {
    if (busy) return;
    if (!productId) { router.push(`/products/${productsId}`); return; }
    setBusy("buy");
    try {
      const it = item();
      const res = await fetch("/api/order/prepare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ line_key: it.line_key, products_id: it.products_id, product_id: it.product_id, kind: it.kind, quantity: it.quantity }] }),
      });
      const j = await res.json().catch(() => null);
      if (j?.ok && j.oid) { router.push(`/order/${j.oid}`); return; }
      alert(j?.error || "주문서 생성에 실패했습니다.");
    } finally { setBusy(""); }
  }

  async function onDel() {
    if (busy) return;
    setBusy("del");
    try {
      const res = await fetch(`${removeBase}?products_id=${productsId}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (j?.ok) router.refresh();
    } finally { setBusy(""); }
  }

  // 모바일: 1열 가로 배치(각 버튼 flex-1로 균등). sm+: 우측 세로열(각 버튼 전체폭).
  // 주문내역 액션 버튼 규격(px-3 py-1.5 text-[12px]) 복원, 폰트만 굵게.
  const btn = "flex-1 sm:w-full sm:flex-none whitespace-nowrap rounded-md border px-3 py-1.5 text-[12px] font-bold disabled:opacity-50";
  return (
    <>
    {added && <CartAddedModal onClose={() => setAdded(false)} onGoCart={() => { setAdded(false); router.push("/cart"); }} />}
    <div className="flex w-full flex-row items-stretch justify-center gap-1.5 sm:w-28 sm:flex-col">
      {soldout ? (
        <span className="flex-1 sm:w-full sm:flex-none rounded-md border border-line bg-surface px-3 py-2 text-center text-[12px] font-medium text-sub">품절</span>
      ) : !canOrder ? (
        // 등급제한(가격 미공개=주문 권한 없음) — 바로구매·장바구니 숨기고 안내만
        <span className="flex-1 sm:w-full sm:flex-none rounded-md border border-line bg-surface px-3 py-2 text-center text-[12px] font-medium text-sub">회원 전용</span>
      ) : (
        <>
          <button type="button" onClick={onBuy} disabled={!!busy} className={`${btn} border-accent bg-accent text-accent-foreground hover:opacity-90`}>{busy === "buy" ? "…" : "바로구매"}</button>
          <button type="button" onClick={onCart} disabled={!!busy} className={`${btn} border-line bg-card text-text hover:bg-surface`}>{busy === "cart" ? "…" : "장바구니"}</button>
        </>
      )}
      <button type="button" onClick={onDel} disabled={!!busy} className={`${btn} border-line bg-card text-sub hover:text-sale`}>{busy === "del" ? "…" : "삭제"}</button>
    </div>
    </>
  );
}
