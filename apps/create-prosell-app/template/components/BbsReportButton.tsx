"use client";

import { useState } from "react";
import BbsReportModal from "./BbsReportModal";

// 신고 버튼 + 모달. compact=댓글용 소형 텍스트. loggedIn 아니면 클릭 시 로그인 안내.
export default function BbsReportButton({
  bbsId, articleId, replyId, reasons, loggedIn, compact,
}: {
  bbsId: string; articleId: number; replyId?: number; reasons: string[]; loggedIn: boolean; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const onClick = () => {
    if (!loggedIn) { alert("신고는 로그인 후 이용할 수 있습니다."); return; }
    setOpen(true);
  };

  return (
    <>
      {compact ? (
        <button type="button" onClick={onClick} className="hover:text-sale">신고</button>
      ) : (
        <button type="button" onClick={onClick}
          className="inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-[13px] text-sub hover:border-sale hover:text-sale">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
          신고
        </button>
      )}
      {open && (
        <BbsReportModal bbsId={bbsId} articleId={articleId} replyId={replyId} reasons={reasons} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
