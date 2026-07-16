"use client";

import { useState } from "react";
import type { Faq } from "@/lib/prosell";

/**
 * FAQ 아코디언 — 질문을 누르면 답변이 펼쳐진다.
 * 답변은 서버(fetchFaqs)에서 새니타이즈를 거친 HTML 만 받는다.
 */
function FaqItem({ faq }: { faq: Faq }) {
  const [open, setOpen] = useState(false);
  const images = (faq.files ?? []).filter((f) => f.thumb || f.src);
  const files = (faq.files ?? []).filter((f) => !f.thumb && !f.src);

  return (
    <li className="border-b border-line">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 px-1 py-[18px] text-left transition-colors hover:bg-surface"
        >
          {/* 질문 16px 기준 — Q 배지는 제목 크기에 맞춰 키우고, 분류는 12px 로 낮춰 위계를 만든다. */}
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-surface text-[14px] font-bold text-accent">Q</span>
          {faq.category && (
            <span className="hidden shrink-0 rounded bg-surface px-2 py-1 text-[12px] font-semibold leading-none text-sub sm:inline">
              {faq.category}
            </span>
          )}
          <span className="min-w-0 flex-1 text-base font-medium text-text">{faq.title || "자주묻는 질문"}</span>
          <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-sub transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h3>

      {open && (
        <div className="flex gap-3 bg-surface/60 px-4 py-4">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-card text-[14px] font-bold text-sub">A</span>
          <div className="min-w-0 flex-1">
            {images.length > 0 && (
              <div className="mb-3 space-y-2">
                {images.map((f) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={f.id} src={f.src || f.thumb || ""} alt={f.name || ""} className="max-w-full rounded-lg" loading="lazy" />
                ))}
              </div>
            )}

            {faq.content && (
              <div className="board-html text-[15px] leading-relaxed text-text" dangerouslySetInnerHTML={{ __html: faq.content }} />
            )}

            {faq.video_src && (
              <div className={`mt-3 overflow-hidden rounded-lg border border-line bg-black ${faq.video_src.includes("instagram.com") ? "aspect-[4/5] max-w-sm" : "aspect-video max-w-md"} w-full`}>
                <iframe src={faq.video_src} className="h-full w-full" allow="autoplay; encrypted-media" allowFullScreen scrolling="no" title="FAQ 동영상" />
              </div>
            )}

            {faq.url && (
              <a href={faq.url} target="_blank" rel="noopener noreferrer nofollow"
                className="mt-3 inline-flex max-w-full items-center gap-1 truncate text-[13px] text-accent underline underline-offset-2 hover:opacity-80">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                <span className="truncate">{faq.url}</span>
              </a>
            )}

            {files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {files.map((f) => (
                  <li key={f.id}>
                    <a href={f.download || "#"} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2.5 rounded-lg border border-line bg-card px-2.5 py-2 no-underline transition-colors hover:border-accent">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface text-sub">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-text">{f.name || "첨부파일"}</span>
                        <span className="block text-[11px] text-sub">{f.filesize || ""}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default function FaqList({ items }: { items: Faq[] }) {
  return (
    <ul className="mt-3 border-t border-text/80">
      {items.map((f) => <FaqItem key={f.id} faq={f} />)}
    </ul>
  );
}
