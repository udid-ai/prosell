"use client";

import { useState } from "react";
import PurchaseConfirmModal, { type ConfirmItem } from "@/components/PurchaseConfirmModal";

// 구매확정 버튼 + 모달 트리거. items = 이 배송그룹의 구매확정 대상 상품(can_decide).
export default function PurchaseConfirmButton({ items, className }: { items: ConfirmItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`min-w-[72px] rounded-md border px-3 py-1.5 text-center text-[12px] font-medium sm:px-0 ${className ?? "border-accent bg-accent/5 text-accent hover:bg-accent/10"}`}
      >
        구매확정
      </button>
      {open && <PurchaseConfirmModal items={items} onClose={() => setOpen(false)} />}
    </>
  );
}
