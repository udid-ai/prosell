"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ProductReview, ProductReviewSummary } from "@/lib/prosell";
import { formatDateTime } from "@/lib/format";
import ReviewPhotoGallery from "./ReviewPhotoGallery";

// 상품 상세 «상품평» 읽기 전용 뷰.
//  · 작성/수정/삭제/베스트/답변 등 관리 기능 없음(작성은 마이페이지 회원 스코프에서).
//  · 요약(평균·별점분포·포토수) + 필터(전체/포토/별점) + 더보기 페이징.
//  · 초기 목록은 서버(ISR 캐시)에서 주입, 추가 페이지·필터는 /api/reviews 프록시 사용.

function Stars({ score, size = 14 }: { score: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 align-middle" aria-label={`별점 ${score}점`}>
      {[1, 2, 3, 4, 5].map((k) => (
        <svg key={k} width={size} height={size} viewBox="0 0 20 20" className={k <= score ? "text-[#ffb020]" : "text-line"}
          fill="currentColor" aria-hidden="true">
          <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.51L10 14.6l-4.95 2.6.94-5.5-4-3.9 5.53-.8L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="max-h-[90vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      <button type="button" onClick={onClose} aria-label="닫기"
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25">✕</button>
    </div>,
    document.body,
  );
}

function ReviewCard({ r, onPhoto }: { r: ProductReview; onPhoto: (src: string) => void }) {
  const photos = r.files.filter((f) => f.src);
  return (
    <li className="border-b border-line py-5 first:pt-0">
      <div className="flex items-center gap-2">
        <Stars score={r.score} />
        {r.best ? <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-bold text-accent">BEST</span> : null}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[12px] text-sub">
        <span className="font-medium text-text">{r.name || "구매자"}</span>
        {r.dt ? <><span className="opacity-40">·</span><span>{formatDateTime(r.dt, false)}</span></> : null}
      </div>
      {r.option ? (
        <div className="mt-2 inline-block rounded bg-surface px-2 py-0.5 text-[12px] text-sub">{r.option}</div>
      ) : null}
      {r.title ? <p className="mt-2 text-sm font-bold text-text">{r.title}</p> : null}
      {r.content ? <p className={`${r.title ? "mt-1" : "mt-2"} whitespace-pre-line text-sm leading-relaxed text-text`}>{r.content}</p> : null}

      {photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {photos.map((f) => (
            <button key={f.id} type="button" onClick={() => onPhoto(f.src!)}
              className="h-20 w-20 overflow-hidden rounded-lg border border-line bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.thumb || f.src!} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {r.video_src && (
        <div className={`mt-3 overflow-hidden rounded-lg border border-line bg-black ${r.video_src.includes("instagram.com") ? "aspect-[4/5] max-w-sm" : "aspect-video max-w-md"} w-full`}>
          <iframe src={r.video_src} className="h-full w-full" allow="autoplay; encrypted-media" allowFullScreen scrolling="no" title="리뷰 동영상" />
        </div>
      )}

      {r.url && (
        <a href={r.url} target="_blank" rel="noopener noreferrer nofollow"
          className="mt-3 inline-flex max-w-full items-center gap-1 truncate text-[13px] text-accent underline underline-offset-2 hover:opacity-80">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
          <span className="truncate">{r.url}</span>
        </a>
      )}

      {r.reply_content && (
        <div className="mt-3 rounded-lg bg-surface p-3">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-text">
            <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground">답변</span>
            {r.reply_name || "판매자"}
            {r.reply_dt ? <span className="font-normal text-sub">· {formatDateTime(r.reply_dt, false)}</span> : null}
          </div>
          <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-sub">{r.reply_content}</p>
        </div>
      )}
    </li>
  );
}

function ReviewSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="mt-4" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="animate-pulse border-b border-line py-5 first:pt-0">
          <div className="h-3.5 w-24 rounded bg-line" />
          <div className="mt-2 h-3 w-32 rounded bg-line/70" />
          <div className="mt-3 h-3 w-full rounded bg-line/60" />
          <div className="mt-1.5 h-3 w-4/5 rounded bg-line/60" />
        </li>
      ))}
    </ul>
  );
}

type Filter = { score?: number; photo?: 1 };

export default function ProductReviews({
  productsId,
  initialItems,
  summary,
  photoItems = [],
}: {
  productsId: number | string;
  initialItems: ProductReview[];
  summary: ProductReviewSummary;
  photoItems?: ProductReview[]; // photo=1 필터 첫 페이지(포토리뷰 갤러리 초기값)
}) {
  const [items, setItems] = useState<ProductReview[]>(initialItems);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>({});
  const [loading, setLoading] = useState(false);
  const [replacing, setReplacing] = useState(false); // 필터 전환(목록 교체) 로딩 여부 → 스켈레톤 표시
  const [done, setDone] = useState(initialItems.length >= summary.count);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number, f: Filter, replace: boolean) => {
    setLoading(true);
    setReplacing(replace);
    try {
      const u = new URL("/api/reviews", window.location.origin);
      u.searchParams.set("products_id", String(productsId));
      u.searchParams.set("page", String(nextPage));
      if (f.score) u.searchParams.set("score", String(f.score));
      if (f.photo) u.searchParams.set("photo", "1");
      const res = await fetch(u.toString());
      const j = (await res.json().catch(() => null)) as { items?: ProductReview[]; total_count?: number } | null;
      const rows = j?.items ?? [];
      setItems((prev) => (replace ? rows : [...prev, ...rows]));
      const loaded = (replace ? 0 : items.length) + rows.length;
      setDone(rows.length < 10 || loaded >= Number(j?.total_count ?? 0));
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }, [productsId, items.length]);

  const applyFilter = (f: Filter) => {
    // 목록을 비우지 않고(깜빡임·레이아웃 점프 방지) 로딩 중 흐리게만 처리 → 결과 도착 시 교체.
    setFilter(f);
    load(1, f, true);
  };

  const dist = summary.score_counts;
  const maxCount = Math.max(1, dist["5"], dist["4"], dist["3"], dist["2"], dist["1"]);
  const activeAll = !filter.score && !filter.photo;

  if (summary.count === 0) {
    return <p className="py-6 text-center text-sub">아직 등록된 리뷰가 없습니다.</p>;
  }

  return (
    <div>
      {/* 요약(통계) */}
      <div className="flex flex-col gap-6 rounded-2xl border border-line bg-card p-5 sm:flex-row sm:items-center sm:gap-10">
        <div className="flex shrink-0 flex-col items-center justify-center sm:w-40">
          <div className="text-4xl font-extrabold text-text">{summary.average.toFixed(1)}</div>
          <Stars score={Math.round(summary.average)} size={18} />
          <div className="mt-1 text-[13px] text-sub">리뷰 {summary.count.toLocaleString()}개</div>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {[5, 4, 3, 2, 1].map((s) => {
            const c = dist[String(s) as "1" | "2" | "3" | "4" | "5"];
            return (
              <div key={s} className="flex items-center gap-2 text-[12px] text-sub">
                <span className="w-8 shrink-0">{s}점</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                  <span className="block h-full rounded-full bg-[#ffb020]" style={{ width: `${(c / maxCount) * 100}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums">{c.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 포토리뷰 스트립 — 통계 밑(사진 없으면 컴포넌트가 null → 여백 없음) */}
      <ReviewPhotoGallery productsId={productsId} initialPhotoReviews={photoItems} photoCount={summary.photo_count} />

      {/* 필터 */}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => applyFilter({})}
          className={`rounded-full border px-3.5 py-1.5 text-[13px] ${activeAll ? "border-accent bg-accent text-accent-foreground" : "border-line text-sub hover:text-text"}`}>
          전체
        </button>
        {summary.photo_count > 0 && (
          <button type="button" onClick={() => applyFilter({ photo: 1 })}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] ${filter.photo ? "border-accent bg-accent text-accent-foreground" : "border-line text-sub hover:text-text"}`}>
            포토리뷰
          </button>
        )}
        {[5, 4, 3, 2, 1].map((s) => (
          <button key={s} type="button" onClick={() => applyFilter({ score: s })}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] ${filter.score === s ? "border-accent bg-accent text-accent-foreground" : "border-line text-sub hover:text-text"}`}>
            {s}점
          </button>
        ))}
      </div>

      {/* 목록 — 필터 전환 중엔 스켈레톤으로 레이아웃 고정(빈 화면·문장 깜빡임 방지) */}
      {loading && replacing ? (
        <ReviewSkeleton />
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sub">조건에 맞는 리뷰가 없습니다.</p>
      ) : (
        <>
          <ul className="mt-4">
            {items.map((r) => <ReviewCard key={r.id} r={r} onPhoto={setLightbox} />)}
          </ul>
          {/* 더보기 로딩 중엔 하단에 스켈레톤 몇 줄을 이어 붙여 자연스럽게 확장 */}
          {loading && !replacing && <ReviewSkeleton rows={2} />}
        </>
      )}

      {!done && !(loading && replacing) && (
        <div className="mt-6 text-center">
          <button type="button" disabled={loading} onClick={() => load(page + 1, filter, false)}
            className="rounded-lg border border-line bg-surface px-6 py-2.5 text-sm font-semibold text-text hover:bg-line disabled:opacity-60">
            {loading ? "불러오는 중…" : "리뷰 더보기"}
          </button>
        </div>
      )}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
