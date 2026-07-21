"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// 게시물 수정/삭제 액션(작성자·관리자에게만 노출됨).
export default function BbsArticleActions({
  bbsId, id, canEdit, canDelete, listHref,
}: {
  bbsId: string; id: number; canEdit: boolean; canDelete: boolean; listHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (busy) return;
    if (!confirm("이 게시물을 삭제하시겠습니까?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/bbs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bbs_id: bbsId, article_id: id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { alert(j.error || "삭제에 실패했습니다."); setBusy(false); return; }
      router.push(listHref);
      router.refresh();
    } catch { alert("통신 오류가 발생했습니다."); setBusy(false); }
  };

  return (
    <div className="flex items-center gap-2">
      {canEdit && (
        <a href={`/board/${bbsId}/write?id=${id}`} className="rounded-md border border-line px-4 py-2 text-sm text-text hover:border-accent hover:text-accent">
          수정
        </a>
      )}
      {canDelete && (
        <button type="button" onClick={remove} disabled={busy}
          className="rounded-md border border-line px-4 py-2 text-sm text-red-600 hover:border-red-400 disabled:opacity-50">
          {busy ? "삭제 중…" : "삭제"}
        </button>
      )}
    </div>
  );
}
