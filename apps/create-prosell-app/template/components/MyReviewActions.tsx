"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import type { MyReview } from "@/lib/prosell";
import ReviewEditModal from "./ReviewEditModal";

// 내 작성 리뷰 수정/삭제 액션 — shop.review_edit 허용 시 노출.
//  · 통합 게시판은 답변(reply_content)이 있으면 수정 불가(삭제는 가능).
export default function MyReviewActions({ review, unified }: { review: MyReview; unified: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit = !unified || !review.reply_content; // 통합+답변있음 → 수정 불가

  const onDelete = async () => {
    if (busy) return;
    if (!window.confirm("이 상품평을 삭제할까요?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/review/${review.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { toast(j?.error || "상품평 삭제에 실패했습니다.", "error"); setBusy(false); return; }
      toast("상품평을 삭제했습니다.", "success");
      router.refresh();
    } catch { toast("요청 중 오류가 발생했습니다.", "error"); setBusy(false); }
  };

  const btn = "rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-text hover:bg-surface disabled:opacity-50";

  return (
    <div className="flex gap-1.5">
      {canEdit && <button type="button" onClick={() => setEdit(true)} className={btn}>수정</button>}
      <button type="button" onClick={onDelete} disabled={busy} className={`${btn} hover:border-sale hover:text-sale`}>삭제</button>
      {edit && <ReviewEditModal review={review} onClose={() => setEdit(false)} titleEnabled={unified} />}
    </div>
  );
}
