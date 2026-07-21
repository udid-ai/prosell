"use client";

import Link from "next/link";
import { useState } from "react";
import type { BbsArticleDetail, BbsBoard, BbsReply } from "@/lib/prosell";
import { renderContent } from "@/lib/sanitize";
import BbsReplies from "./BbsReplies";

// 비밀글 열람 게이트 — 비회원이 비밀번호로 본문을 연다(회원 본인/관리자는 서버에서 이미 열려 이 화면 미노출).
export default function BbsSecretGate({
  bbsId, id, listHref, board, isGuestAuthor,
}: {
  bbsId: string; id: number; listHref: string; board: BbsBoard | null; isGuestAuthor: boolean;
}) {
  const [upw, setUpw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [article, setArticle] = useState<BbsArticleDetail | null>(null);
  const [replies, setReplies] = useState<BbsReply[]>([]);

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !upw.trim()) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/bbs?bbs_id=${bbsId}&id=${id}&upw=${encodeURIComponent(upw)}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setErr(j.error || "비밀번호가 일치하지 않습니다."); return; }
      setArticle(j.article as BbsArticleDetail);
      setReplies(Array.isArray(j.replies) ? (j.replies as BbsReply[]) : []);
    } finally { setBusy(false); }
  };

  if (article) {
    return (
      <>
        <h1 className="text-center text-2xl font-bold text-text">{board?.title}</h1>
        <article className="mt-6 border-t-2 border-text/80">
          <header className="border-b border-line py-5">
            <div className="flex flex-wrap items-center gap-2">
              {article.category && <span className="rounded bg-surface px-2 py-0.5 text-[12px] text-sub">{article.category}</span>}
              <h2 className="text-lg font-bold text-text">{article.title}</h2>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 text-[13px] text-sub">
              <span>{article.name || "비회원"}</span><span>{article.dt}</span><span>조회 {article.view}</span>
            </div>
          </header>
          <div className="board-html min-h-[120px] break-words py-6 text-[15px] leading-relaxed text-text"
            dangerouslySetInnerHTML={{ __html: renderContent(article.content ?? "") }} />
          {article.files.length > 0 && (
            <div className="border-t border-line py-4 text-[13px]">
              <p className="mb-2 font-semibold text-text">첨부파일</p>
              <ul className="space-y-1.5">
                {article.files.map((f) => (
                  <li key={f.id}><a href={f.href} className="text-accent hover:underline">{f.name}</a></li>
                ))}
              </ul>
            </div>
          )}
        </article>
        <div className="mt-4">
          <Link href={listHref} className="rounded-md border border-line px-4 py-2 text-sm text-text hover:border-accent hover:text-accent">목록</Link>
        </div>
        {board?.reply === 1 && <BbsReplies bbsId={bbsId} articleId={id} initial={replies} loggedIn={false} />}
      </>
    );
  }

  // 회원이 작성한 비밀글은 작성자 본인/관리자만 열람(비밀번호 개념 없음) → 비번창 대신 안내.
  if (!isGuestAuthor) {
    return (
      <div className="mx-auto max-w-sm rounded-md border border-line bg-card p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-surface">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-sub" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-text">비밀글입니다</h1>
        <p className="mt-1 text-[13px] text-sub">작성자 본인과 관리자만 열람할 수 있습니다.</p>
        <Link href={listHref} className="mt-5 inline-block rounded-md border border-line px-4 py-2 text-[13px] text-text hover:border-accent hover:text-accent">목록으로</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm rounded-md border border-line bg-card p-8 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-surface">
        <svg viewBox="0 0 24 24" className="h-6 w-6 text-sub" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <h1 className="text-lg font-bold text-text">비밀글입니다</h1>
      <p className="mt-1 text-[13px] text-sub">작성 시 입력한 비밀번호를 입력해 주세요.</p>
      <form onSubmit={unlock} className="mt-5 flex flex-col gap-2">
        <input type="password" value={upw} onChange={(e) => setUpw(e.target.value)} placeholder="비밀번호"
          className="rounded-md border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent" />
        {err && <p className="text-[13px] text-red-500">{err}</p>}
        <button type="submit" disabled={busy || !upw.trim()}
          className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50">
          {busy ? "확인 중…" : "확인"}
        </button>
      </form>
      <Link href={listHref} className="mt-4 inline-block text-[13px] text-sub hover:text-accent">목록으로</Link>
    </div>
  );
}
