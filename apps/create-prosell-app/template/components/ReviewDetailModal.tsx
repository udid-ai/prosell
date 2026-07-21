"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import type { ProductReview } from "@/lib/prosell";
import LazyImg from "./LazyImg";

// 포토리뷰 상세 모달(재사용) — items[index] 리뷰를 크게 보여주고 좌우로 이동.
//  · 사진 왼쪽(여러 장이면 썸네일 전환) + 별점/작성자/옵션/제목/내용/동영상/URL/답변.
function Stars({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`별점 ${score}점`}>
      {[1, 2, 3, 4, 5].map((k) => (
        <svg key={k} width={14} height={14} viewBox="0 0 20 20" className={k <= score ? "text-[#ffb020]" : "text-line"} fill="currentColor" aria-hidden="true">
          <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.51L10 14.6l-4.95 2.6.94-5.5-4-3.9 5.53-.8L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}

export default function ReviewDetailModal({
  items, index, onClose, onNav, showProductLink = false,
}: {
  items: ProductReview[];
  index: number;
  onClose: () => void;
  onNav: (dir: 1 | -1) => void;
  showProductLink?: boolean; // 내용 하단에 «상품 상세보기» 버튼 노출(전체 리뷰 목록 등)
}) {
  const [photoIdx, setPhotoIdx] = useState(0);
  const r = items[index];

  // 리뷰가 바뀌면 대표 사진 인덱스 초기화
  useEffect(() => setPhotoIdx(0), [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onNav(1);
      else if (e.key === "ArrowLeft") onNav(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onNav]);

  if (!r) return null;
  const photos = r.files.filter((f) => f.src);
  const main = photos[photoIdx] || photos[0];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80" onClick={onClose}>
      {/* 좌 */}
      <button type="button" onClick={(e) => { e.stopPropagation(); onNav(-1); }} disabled={index <= 0}
        className="absolute left-2 top-1/2 z-10 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 disabled:opacity-30 sm:left-6 sm:h-16 sm:w-16" aria-label="이전">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
      </button>

      <div className="flex max-h-[90vh] w-[calc(100%-8rem)] max-w-4xl flex-col overflow-hidden rounded-2xl bg-card" onClick={(e) => e.stopPropagation()}>
        {/* 모달 타이틀 */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-base font-bold text-text">리뷰 상세</h3>
          <button type="button" onClick={onClose} className="text-sub hover:text-text" aria-label="닫기">✕</button>
        </div>
        {/* 본문: 사진 + 내용 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
        {/* 사진 */}
        {main && (
          <div className="flex flex-col bg-black sm:w-1/2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={main.src!} alt="" loading="lazy" className="max-h-[45vh] w-full object-contain sm:max-h-[90vh] sm:flex-1" />
            {photos.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto bg-black/60 p-2">
                {photos.map((f, i) => (
                  <button key={f.id} type="button" onClick={() => setPhotoIdx(i)}
                    className={`h-12 w-12 shrink-0 overflow-hidden rounded border ${i === photoIdx ? "border-white" : "border-transparent opacity-60"}`}>
                    <LazyImg src={f.thumb || f.src!} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {/* 내용 */}
        <div className={`flex min-h-0 flex-1 flex-col ${main ? "sm:w-1/2" : ""}`}>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="flex items-center gap-2">
              <Stars score={r.score} />
              {r.best ? <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-bold text-accent">BEST</span> : null}
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[12px] text-sub">
              <span className="font-medium text-text">{r.name || "구매자"}</span>
              {r.dt ? <><span className="opacity-40">·</span><span>{formatDateTime(r.dt, false)}</span></> : null}
            </div>
            {r.option ? <div className="mt-2 inline-block rounded bg-surface px-2 py-0.5 text-[12px] text-sub">{r.option}</div> : null}
            {r.title ? <p className="mt-2 text-sm font-bold text-text">{r.title}</p> : null}
            {r.content ? <p className={`${r.title ? "mt-1" : "mt-2"} whitespace-pre-line text-sm leading-relaxed text-text`}>{r.content}</p> : null}
            {r.video_src && (
              <div className={`mt-3 w-full overflow-hidden rounded-lg border border-line bg-black ${r.video_src.includes("instagram.com") ? "aspect-[4/5] max-w-xs" : "aspect-video"}`}>
                <iframe src={r.video_src} className="h-full w-full" allow="autoplay; encrypted-media" allowFullScreen scrolling="no" title="리뷰 동영상" />
              </div>
            )}
            {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 block truncate text-[13px] text-accent underline underline-offset-2">{r.url}</a>}
            {r.reply_content && (
              <div className="mt-3 rounded-lg bg-surface p-3">
                <div className="text-[12px] font-semibold text-text"><span className="rounded bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground">답변</span> {r.reply_name || "판매자"}</div>
                <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-sub">{r.reply_content}</p>
              </div>
            )}
            <p className="mt-4 text-right text-[12px] text-sub">{index + 1} / {items.length}</p>
          </div>
          {/* 내용 하단 — 상품 상세 이동 버튼(전체 리뷰 목록에서 진입 시) */}
          {showProductLink && r.products_id ? (
            <div className="border-t border-line p-4">
              <Link href={`/products/${r.products_id}`} onClick={onClose}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90">
                상품 상세보기
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </Link>
            </div>
          ) : null}
        </div>
        </div>
      </div>

      {/* 우 */}
      <button type="button" onClick={(e) => { e.stopPropagation(); onNav(1); }} disabled={index >= items.length - 1}
        className="absolute right-2 top-1/2 z-10 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 disabled:opacity-30 sm:right-6 sm:h-16 sm:w-16" aria-label="다음">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
      </button>
    </div>,
    document.body,
  );
}
