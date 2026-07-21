"use client";

import { useEffect, useState } from "react";

// 게시물/댓글 신고 모달 — 사유 선택 후 제출. reply_id 있으면 댓글 신고.
export default function BbsReportModal({
  bbsId, articleId, replyId, reasons, onClose,
}: {
  bbsId: string; articleId: number; replyId?: number; reasons: string[]; onClose: () => void;
}) {
  const [ct, setCt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // body 스크롤 잠금 + ESC 닫기
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const submit = async () => {
    if (busy) return;
    if (!ct) { setErr("신고 사유를 선택해 주세요."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/bbs/report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bbs_id: bbsId, article_id: articleId, reply_id: replyId, ct }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setErr(j.error || "신고에 실패했습니다."); setBusy(false); return; }
      alert("신고가 접수되었습니다.");
      onClose();
    } catch { setErr("통신 오류가 발생했습니다."); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-lg border border-line bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-text">{replyId ? "댓글 신고" : "게시물 신고"}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="grid h-8 w-8 place-items-center rounded-full text-sub hover:bg-line">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <p className="mt-1 text-[13px] text-sub">신고 사유를 선택해 주세요.</p>

        <div className="mt-3 space-y-1.5">
          {reasons.map((r) => (
            <label key={r} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${ct === r ? "border-accent bg-accent/5 text-text" : "border-line text-sub hover:bg-surface"}`}>
              <input type="radio" name="report-reason" value={r} checked={ct === r} onChange={() => { setCt(r); setErr(""); }} className="h-4 w-4 accent-accent" />
              {r}
            </label>
          ))}
        </div>

        {err && <p className="mt-2 text-[13px] text-sale">{err}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-line px-4 py-2 text-sm text-text hover:border-accent">취소</button>
          <button type="button" onClick={submit} disabled={busy || !ct}
            className="rounded-md bg-sale px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "접수 중…" : "신고하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
