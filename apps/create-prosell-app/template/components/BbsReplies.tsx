"use client";

import { useState } from "react";
import type { BbsReply } from "@/lib/prosell";
import { renderContent } from "@/lib/sanitize";
import BbsVote from "./BbsVote";
import BbsReportButton from "./BbsReportButton";

// 댓글 목록 + 작성/수정/삭제/대댓글. 작성은 로그인 필요.
export default function BbsReplies({
  bbsId, articleId, initial, loggedIn, replyGood = 0, police = 0, reportReasons = [],
}: {
  bbsId: string; articleId: number; initial: BbsReply[]; loggedIn: boolean;
  replyGood?: number; police?: number; reportReasons?: string[];
}) {
  const [replies, setReplies] = useState<BbsReply[]>(initial);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<number | null>(null);   // 대댓글 대상 원댓글 id(인라인 입력)
  const [replyText, setReplyText] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const refresh = async () => {
    const res = await fetch(`/api/bbs/reply?bbs_id=${bbsId}&article_id=${articleId}`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    if (j.ok) setReplies(j.replies as BbsReply[]);
  };

  // 최상위 댓글 등록(하단 폼).
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !content.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/bbs/reply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bbs_id: bbsId, article_id: articleId, content, reply_id: 0 }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { alert(j.error || "댓글 등록에 실패했습니다."); return; }
      setContent("");
      await refresh();
    } finally { setBusy(false); }
  };

  // 대댓글 등록(댓글 바로 밑 인라인 입력).
  const submitReply = async (parentId: number) => {
    if (busy || !replyText.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/bbs/reply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bbs_id: bbsId, article_id: articleId, content: replyText, reply_id: parentId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { alert(j.error || "답글 등록에 실패했습니다."); return; }
      setReplyText(""); setReplyTo(null);
      await refresh();
    } finally { setBusy(false); }
  };

  const saveEdit = async (r: BbsReply) => {
    if (busy || !editText.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/bbs/reply", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bbs_id: bbsId, article_id: articleId, reply_id: r.id, content: editText }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { alert(j.error || "수정에 실패했습니다."); return; }
      setEditId(null); setEditText("");
      await refresh();
    } finally { setBusy(false); }
  };

  const remove = async (r: BbsReply) => {
    if (busy || !confirm("댓글을 삭제하시겠습니까?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/bbs/reply", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bbs_id: bbsId, article_id: articleId, reply_id: r.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { alert(j.error || "삭제에 실패했습니다."); return; }
      await refresh();
    } finally { setBusy(false); }
  };

  return (
    <section className="mt-10">
      <h3 className="mb-3 text-sm font-bold text-text">댓글 <span className="text-accent">{replies.length}</span></h3>

      <ul className="divide-y divide-line border-t border-line">
        {replies.map((r) => (
          <li key={r.id} className={`px-2 py-3 ${r.is_reply ? "bg-surface/50 pl-6" : ""}`}>
            <div className="flex items-center gap-2 text-[13px]">
              {r.is_reply === 1 && <span className="text-sub">↳</span>}
              <span className="font-semibold text-text">{r.name || "비회원"}</span>
              <span className="text-sub">{r.dt?.slice(0, 16)}</span>
            </div>
            {editId === r.id ? (
              <div className="mt-2 flex flex-col gap-2">
                <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2}
                  className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent" />
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(r)} disabled={busy} className="rounded-md bg-accent px-3 py-1.5 text-[13px] text-accent-foreground disabled:opacity-50">저장</button>
                  <button onClick={() => { setEditId(null); setEditText(""); }} className="rounded-md border border-line px-3 py-1.5 text-[13px] text-sub">취소</button>
                </div>
              </div>
            ) : (
              <>
                {r.blind === 1 ? (
                  <p className="mt-1 text-sm text-sub">블라인드 처리된 댓글입니다.</p>
                ) : (
                  // 댓글은 평문 — 백엔드가 개행을 <br> 로, 이모티콘을 <img> 로 내려준다. 정제 후 렌더.
                  <div className="board-html mt-1 break-words text-sm text-text"
                    dangerouslySetInnerHTML={{ __html: renderContent(r.content) }} />
                )}
                <div className="mt-1 flex items-center gap-3 text-[12px] text-sub">
                  {replyGood > 0 && r.blind !== 1 && (
                    <BbsVote bbsId={bbsId} articleId={articleId} replyId={r.id} good={r.good} nogood={r.nogood}
                      showGood={replyGood === 1 || replyGood === 3} showNogood={replyGood === 2 || replyGood === 3} compact />
                  )}
                  {loggedIn && r.can_reply === 1 && (
                    <button onClick={() => { setReplyTo((v) => (v === r.id ? null : r.id)); setReplyText(""); }} className="hover:text-accent">
                      {replyTo === r.id ? "답글 취소" : "답글"}
                    </button>
                  )}
                  {r.can_edit === 1 && <button onClick={() => { setEditId(r.id); setEditText(r.content); }} className="hover:text-accent">수정</button>}
                  {r.can_delete === 1 && <button onClick={() => remove(r)} className="hover:text-red-500">삭제</button>}
                  {police > 0 && r.is_mine !== 1 && r.blind !== 1 && (
                    <BbsReportButton bbsId={bbsId} articleId={articleId} replyId={r.id} reasons={reportReasons} loggedIn={loggedIn} compact />
                  )}
                </div>
                {/* 답글 입력 — 이 댓글 바로 밑 */}
                {replyTo === r.id && (
                  <div className="mt-2 border-l-2 border-accent/40 pl-3">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={2}
                      autoFocus
                      placeholder="답글을 입력하세요"
                      className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                    <div className="mt-1.5 flex justify-end gap-2">
                      <button onClick={() => { setReplyTo(null); setReplyText(""); }} className="rounded-md border border-line px-3 py-1.5 text-[13px] text-sub">취소</button>
                      <button onClick={() => submitReply(r.id)} disabled={busy || !replyText.trim()}
                        className="rounded-md bg-accent px-4 py-1.5 text-[13px] font-medium text-accent-foreground disabled:opacity-50">
                        {busy ? "등록 중…" : "답글 등록"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {loggedIn ? (
        <form onSubmit={submit} className="mt-4">
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="댓글을 입력하세요"
            className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent" />
          <div className="mt-2 flex justify-end">
            <button type="submit" disabled={busy || !content.trim()}
              className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50">
              {busy ? "등록 중…" : "댓글 등록"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-4 rounded-md border border-line bg-surface px-4 py-3 text-center text-[13px] text-sub">
          댓글을 작성하려면 <a href="/auth/login" className="text-accent hover:underline">로그인</a>이 필요합니다.
        </p>
      )}
    </section>
  );
}
