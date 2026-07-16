"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addToCart } from "@/lib/cart";
import { toast } from "@/lib/toast";
import QuickOrderModal from "./QuickOrderModal";
import CartAddedModal from "./CartAddedModal";

// 목록 카드 hover 액션 레이어(레거시 category PREVIEW).
// · 이미지 위에 반투명 레이어로 액션 버튼(장바구니/바로구매/관심상품) 노출(group-hover).
// · 주문옵션/추가옵션이 있으면 → 빠른주문 모달에서 옵션 선택 후 담기.
// · 옵션 없는 단일상품이면 → 바로 장바구니 담기 / 바로구매(주문서 생성).
// 카드 전체가 <Link> 라 버튼은 preventDefault/stopPropagation 으로 상세 이동을 막는다.
export default function ProductCardActions({
  productsId, optionId, title, hasOptions, soldout, canOrder = true,
}: {
  productsId: number; optionId: number; title?: string | null; hasOptions: boolean; soldout?: boolean;
  canOrder?: boolean; // 주문 권한(가격 공개=open_price 등급 충족). false 면 구매/장바구니 버튼 숨김.
}) {
  const router = useRouter();
  const [modal, setModal] = useState(false); // 옵션 상품 → 빠른주문 모달 열림
  const [added, setAdded] = useState(false); // 장바구니 담기 완료 모달
  const [busy, setBusy] = useState(false);
  const [wished, setWished] = useState(false);

  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };

  // 단일상품 장바구니 즉시 담기(옵션 라인 1개)
  const quickAdd = async (): Promise<boolean> => {
    const ok = await addToCart([{
      line_key: `${productsId}:o-${optionId}`, products_id: productsId, product_id: optionId, kind: "opt", title: title ?? "", quantity: 1,
    }]);
    if (!ok) alert("장바구니 담기에 실패했습니다.");
    return ok;
  };

  const onCart = async (e: React.MouseEvent) => {
    stop(e);
    if (soldout) return;
    if (hasOptions) { setModal(true); return; }
    if (busy) return;
    setBusy(true);
    const ok = await quickAdd();
    setBusy(false);
    if (ok) setAdded(true);
  };

  const onBuy = async (e: React.MouseEvent) => {
    stop(e);
    if (soldout) return;
    if (hasOptions) { setModal(true); return; }
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/order/prepare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ line_key: `${productsId}:o-${optionId}`, products_id: productsId, product_id: optionId, kind: "opt", quantity: 1 }] }),
      });
      const j = await res.json().catch(() => null);
      setBusy(false);
      if (j?.ok && j.oid) router.push(`/order/${j.oid}`);
      else alert(j?.error || "주문서 생성에 실패했습니다.");
    } catch { setBusy(false); alert("주문 요청 중 오류가 발생했습니다."); }
  };

  const onWish = async (e: React.MouseEvent) => {
    stop(e);
    const prev = wished;
    setWished(!prev); // 낙관적
    try {
      const res = await fetch("/api/account/wishlist", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products_id: productsId }),
      });
      if (res.status === 401) { setWished(prev); router.push("/auth/login"); return; }
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setWished(prev); toast("관심상품 처리에 실패했습니다.", "error"); return; }
      const now = !!j.wished;
      setWished(now);
      toast(now ? "관심상품에 추가했습니다." : "관심상품에서 해제했습니다.", "success");
    } catch { setWished(prev); toast("통신 오류가 발생했습니다.", "error"); }
  };

  const btn = "grid h-10 w-10 place-items-center rounded-full bg-white/95 text-text shadow-md transition hover:bg-accent hover:text-accent-foreground disabled:opacity-50";

  return (
    <>
      {/* hover 레이어 — 이미지 위 어둡게 + 액션 버튼(카드 group-hover 로 표시). 품절이면 버튼 숨김. */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 bg-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <div className="pointer-events-auto flex items-center gap-2">
          {/* 구매/장바구니 — 품절 아니고 주문 권한 있을 때만(가격 미공개=권한 없음이면 숨김) */}
          {!soldout && canOrder && (
            <>
              <button type="button" onClick={onCart} disabled={busy} aria-label="장바구니 담기" title="장바구니" className={btn}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.4 12.4a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6" /></svg>
              </button>
              <button type="button" onClick={onBuy} disabled={busy} aria-label="바로구매" title="바로구매" className={btn}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 9.5h19M6 15h4" /></svg>
              </button>
            </>
          )}
          {/* 관심상품 — 권한과 무관하게 노출 */}
          <button type="button" onClick={onWish} aria-label="관심상품" title="관심상품" className={`${btn} ${wished ? "text-sale" : ""}`}>
            <span className="text-lg leading-none">{wished ? "♥" : "♡"}</span>
          </button>
        </div>
      </div>

      {modal && <QuickOrderModal productsId={productsId} title={title} onClose={() => setModal(false)} />}
      {added && <CartAddedModal onClose={() => setAdded(false)} onGoCart={() => { setAdded(false); router.push("/cart"); }} />}
    </>
  );
}
