"use client";

import { useState } from "react";

// 게시물/댓글 추천·반대 버튼. reply_id 있으면 댓글. compact=댓글용 소형.
export default function BbsVote({
  bbsId, articleId, replyId, good, nogood, showGood, showNogood, compact,
}: {
  bbsId: string; articleId: number; replyId?: number;
  good: number; nogood: number; showGood: boolean; showNogood: boolean; compact?: boolean;
}) {
  const [g, setG] = useState(good);
  const [n, setN] = useState(nogood);
  const [busy, setBusy] = useState(false);

  const vote = async (mode: 1 | 2) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/bbs/good", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bbs_id: bbsId, article_id: articleId, reply_id: replyId, mode }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { alert(j.error || "처리에 실패했습니다."); return; }
      setG(j.good); setN(j.nogood);
    } finally { setBusy(false); }
  };

  if (compact) {
    return (
      <span className="inline-flex items-center gap-2 text-[12px] text-sub">
        {showGood && (
          <button type="button" onClick={() => vote(1)} disabled={busy} className="inline-flex items-center gap-0.5 hover:text-accent disabled:opacity-50">
            <ThumbUp className="h-3.5 w-3.5" /> {g}
          </button>
        )}
        {showNogood && (
          <button type="button" onClick={() => vote(2)} disabled={busy} className="inline-flex items-center gap-0.5 hover:text-sale disabled:opacity-50">
            <ThumbDown className="h-3.5 w-3.5" /> {n}
          </button>
        )}
      </span>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3">
      {showGood && (
        <button type="button" onClick={() => vote(1)} disabled={busy}
          className="flex min-w-[5.5rem] flex-col items-center gap-1 rounded-lg border border-line px-6 py-3 text-text transition-colors hover:border-accent hover:text-accent disabled:opacity-50">
          <ThumbUp className="h-5 w-5" />
          <span className="text-[13px] font-bold">추천 {g}</span>
        </button>
      )}
      {showNogood && (
        <button type="button" onClick={() => vote(2)} disabled={busy}
          className="flex min-w-[5.5rem] flex-col items-center gap-1 rounded-lg border border-line px-6 py-3 text-text transition-colors hover:border-sale hover:text-sale disabled:opacity-50">
          <ThumbDown className="h-5 w-5" />
          <span className="text-[13px] font-bold">반대 {n}</span>
        </button>
      )}
    </div>
  );
}

function ThumbUp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10v11" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
    </svg>
  );
}
function ThumbDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 14V3" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
    </svg>
  );
}
