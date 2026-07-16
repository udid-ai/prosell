"use client";

import { useState } from "react";
import ReviewWriteModal, { type ReviewTarget } from "@/components/ReviewWriteModal";

// 상품평 작성 버튼 + 모달 트리거. 구매확정/교환완료(can_review) 상품에 노출.
export default function ReviewWriteButton({ target, className, titleEnabled = false }: { target: ReviewTarget; className?: string; titleEnabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`min-w-[72px] rounded-md border px-3 py-1.5 text-center text-[12px] font-bold sm:px-0 ${className ?? "border-success/40 bg-success/10 text-success hover:bg-success/20"}`}
      >
        리뷰작성
      </button>
      {open && <ReviewWriteModal target={target} onClose={() => setOpen(false)} titleEnabled={titleEnabled} />}
    </>
  );
}
