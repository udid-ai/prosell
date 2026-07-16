"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MyQna, QnaBoard } from "@/lib/prosell";
import { formatDateTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import QnaFormModal from "./QnaFormModal";

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function QnaCard({ q, unified, onEdit, onDelete }: { q: MyQna; unified: boolean; onEdit: (q: MyQna) => void; onDelete: (q: MyQna) => void }) {
  const [open, setOpen] = useState(false);
  const secret = q.secret === 1;
  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-surface text-[13px] font-bold text-accent">Q</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {q.category && <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-sub">{q.category}</span>}
          {secret && <LockIcon className="h-3.5 w-3.5 shrink-0 text-sub" />}
          <span className="truncate text-sm font-medium text-text">{q.title || "1:1 문의"}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${q.answered ? "bg-accent/10 text-accent" : "bg-surface text-sub"}`}>
          {q.answered ? "답변완료" : "답변대기"}
        </span>
        <span className="hidden shrink-0 text-[12px] text-sub sm:inline">{q.dt ? formatDateTime(q.dt, false) : ""}</span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-sub transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="border-t border-line px-4 py-3.5">
          {/* 문의대상 상품 — 선택했다면 «어떤 상품 문의인지» 표시(상품 상세로 이동). */}
          {q.target_products && q.target_products.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {q.target_products.map((p, i) => (
                <a key={`${p.products_id}-${i}`} href={`/products/${p.products_id}`}
                  className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2 no-underline transition-colors hover:border-accent">
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-card">
                    {p.thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">{p.title || "상품"}</span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-sub" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </a>
              ))}
            </div>
          )}
          {/* 본문은 위지윅(HTML) — 서버(fetchMyQna)에서 새니타이즈를 거친 값만 렌더한다. */}
          {q.content && <div className="board-html text-sm leading-relaxed text-text" dangerouslySetInnerHTML={{ __html: q.content }} />}
          {/* 첨부파일 · 동영상 · 참고 URL — 통합 게시판 전용.
              이미지는 썸네일, 일반 파일은 다운로드 카드로 표시한다. */}
          {q.files && q.files.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {q.files.some((f) => f.thumb || f.src) && (
                <div className="flex flex-wrap gap-2">
                  {q.files.filter((f) => f.thumb || f.src).map((f) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={f.id} href={f.src || f.thumb || "#"} target="_blank" rel="noopener noreferrer" className="h-20 w-20 overflow-hidden rounded-lg border border-line bg-surface">
                      <img src={f.thumb || f.src || ""} alt={f.name || ""} className="h-full w-full object-cover" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
              {q.files.filter((f) => !f.thumb && !f.src).map((f) => (
                <a key={f.id} href={f.download || "#"} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2.5 rounded-lg border border-line bg-card px-2.5 py-2 transition-colors hover:border-accent">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface text-sub">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-text">{f.name || "첨부파일"}</span>
                    <span className="block text-[11px] text-sub">{f.filesize || ""}</span>
                  </span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-sub" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                </a>
              ))}
            </div>
          )}
          {q.video_src && (
            <div className={`mt-3 overflow-hidden rounded-lg border border-line bg-black ${q.video_src.includes("instagram.com") ? "aspect-[4/5] max-w-sm" : "aspect-video max-w-md"} w-full`}>
              <iframe src={q.video_src} className="h-full w-full" allow="autoplay; encrypted-media" allowFullScreen scrolling="no" title="문의 동영상" />
            </div>
          )}
          {q.url && (
            <a href={q.url} target="_blank" rel="noopener noreferrer nofollow"
              className="mt-3 inline-flex max-w-full items-center gap-1 truncate text-[13px] text-accent underline underline-offset-2 hover:opacity-80">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              <span className="truncate">{q.url}</span>
            </a>
          )}
          {q.reply_content && (
            <div className="mt-3 rounded-lg bg-surface p-3">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-text">
                <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground">답변</span>
                {q.reply_name || "판매자"}
                {q.reply_dt ? <span className="font-normal text-sub">· {formatDateTime(q.reply_dt, false)}</span> : null}
              </div>
              <div className="board-html mt-1.5 text-[13px] leading-relaxed text-sub" dangerouslySetInnerHTML={{ __html: q.reply_content }} />
            </div>
          )}
          {!q.answered && (
            <div className="mt-3 flex justify-end gap-1.5">
              <button type="button" onClick={() => onEdit(q)} className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-text hover:bg-surface">수정</button>
              <button type="button" onClick={() => onDelete(q)} className="rounded-md border border-line px-3 py-1.5 text-[12px] font-medium text-text hover:border-sale hover:text-sale">삭제</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function AccountQna({ items, board }: { items: MyQna[]; board: QnaBoard }) {
  const router = useRouter();
  const unified = board.unified === 1;
  const [writeOpen, setWriteOpen] = useState(false);
  const [editItem, setEditItem] = useState<MyQna | null>(null);

  const onDelete = async (q: MyQna) => {
    if (!window.confirm("이 문의를 삭제할까요?")) return;
    const res = await fetch("/api/qna", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: q.id }) });
    const j = await res.json().catch(() => null);
    if (!j?.ok) { toast(j?.error || "문의 삭제에 실패했습니다.", "error"); return; }
    toast("문의를 삭제했습니다.", "success");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text">1:1 문의</h1>
        <button type="button" onClick={() => setWriteOpen(true)} className="shrink-0 rounded-lg border border-accent bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-90">문의하기</button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-line bg-card p-12 text-center text-sub">등록한 1:1 문의가 없습니다.</div>
      ) : (
        <ul className="space-y-3">
          {items.map((q) => <QnaCard key={q.id} q={q} unified={unified} onEdit={setEditItem} onDelete={onDelete} />)}
        </ul>
      )}

      {writeOpen && (
        <QnaFormModal categories={board.categories} unified={unified} boardSecret={board.secret} notifyHp={board.notify_hp} notifyEmail={board.notify_email}
          fileCount={board.file_count} fileSizeMb={board.file_size_mb}
          onClose={() => setWriteOpen(false)} onSaved={() => router.refresh()} />
      )}
      {editItem && (
        <QnaFormModal categories={board.categories} unified={unified} boardSecret={board.secret} notifyHp={board.notify_hp} notifyEmail={board.notify_email}
          fileCount={board.file_count} fileSizeMb={board.file_size_mb}
          editing={editItem} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); router.refresh(); }} />
      )}
    </div>
  );
}
