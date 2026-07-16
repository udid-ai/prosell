"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ProductView, Addoption, ProductCoupon } from "@/lib/prosell";
import ProductDetail from "./ProductDetail";

// 목록 카드 hover 액션 → "빠른주문" 모달.
// 상품페이지의 이미지·주문옵션 상단 영역(ProductDetail)을 그대로 재사용해 옵션 선택/장바구니/바로구매를 100% 동일 동작으로 제공.
// 상품 상세 데이터는 열릴 때 /api/products/view 로 지연 로드(목록은 경량 데이터만 보유).
type ViewResponse = {
  ok: boolean; error?: string;
  pv: ProductView; addoptions: Addoption[]; coupons: ProductCoupon[]; wished: boolean; loggedIn: boolean;
};

export default function QuickOrderModal({ productsId, title, onClose }: { productsId: number; title?: string | null; onClose: () => void }) {
  const [data, setData] = useState<ViewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/products/view?id=${productsId}`, { cache: "no-store" });
        const j = (await res.json().catch(() => null)) as ViewResponse | null;
        if (!alive) return;
        if (j?.ok) setData(j);
        else setError(j?.error || "상품 정보를 불러오지 못했습니다.");
      } catch {
        if (alive) setError("통신 오류가 발생했습니다.");
      }
    })();
    return () => { alive = false; };
  }, [productsId]);

  // ESC 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // 카드 <Link> 앵커 밖(body)으로 포탈 렌더 — 모달 내부 클릭이 상세 이동을 유발하지 않도록.
  if (typeof document === "undefined") return null;
  // portal 은 DOM 상 body 로 나가지만 React 이벤트는 React 트리(카드 <Link> 하위)로 버블링한다.
  // 모달 내부의 모든 클릭(닫기/오버레이/옵션선택 등)이 상위 Link 로 전파돼 상세 이동되는 것을 루트에서 차단.
  return createPortal((
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="빠른주문"
      onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="min-w-0 truncate pr-3 text-base font-bold text-text">{title || "상품 주문"}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text hover:bg-line">✕</button>
        </div>
        <div className="overflow-y-auto p-5">
          {error ? (
            <p className="py-16 text-center text-sm text-sale">{error}</p>
          ) : !data ? (
            <p className="py-16 text-center text-sm text-sub">상품 정보를 불러오는 중…</p>
          ) : (
            <ProductDetail pv={data.pv} addoptions={data.addoptions} coupons={data.coupons} wished={data.wished} loggedIn={data.loggedIn} />
          )}
        </div>
      </div>
    </div>
  ), document.body);
}
