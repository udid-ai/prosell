"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatDateTime } from "@/lib/format";
import type { ProductReview } from "@/lib/prosell";
import LazyImg from "./LazyImg";

// 상품페이지 «포토리뷰» 갤러리 — 리뷰 목록 위 1열 사진 스트립 + 더보기.
//  · 더보기 → 그리드 모달, 사진 클릭 → 리뷰 상세(모달 내), 상세에서 좌우 큰 버튼으로 포토 이동.
//  · 사진은 photo=1 필터 리뷰를 페이지 단위로 로드해 flatten.

type PhotoItem = { key: string; src: string; thumb: string | null; review: ProductReview };

function flatten(reviews: ProductReview[]): PhotoItem[] {
  const out: PhotoItem[] = [];
  for (const r of reviews) {
    r.files.forEach((f, i) => {
      if (f.src) out.push({ key: `${r.id}-${f.id ?? i}`, src: f.src, thumb: f.thumb, review: r });
    });
  }
  return out;
}

function Stars({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 align-middle" aria-label={`별점 ${score}점`}>
      {[1, 2, 3, 4, 5].map((k) => (
        <svg key={k} width={14} height={14} viewBox="0 0 20 20" className={k <= score ? "text-[#ffb020]" : "text-line"} fill="currentColor" aria-hidden="true">
          <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.51L10 14.6l-4.95 2.6.94-5.5-4-3.9 5.53-.8L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}

export default function ReviewPhotoGallery({
  productsId,
  initialPhotoReviews,
  photoCount,
}: {
  productsId: number | string;
  initialPhotoReviews: ProductReview[];
  photoCount: number; // 포토리뷰(사진 첨부 리뷰) 총 개수 = photo=1 필터 total
}) {
  const [reviews, setReviews] = useState<ProductReview[]>(initialPhotoReviews);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);          // 모달 열림
  const [detail, setDetail] = useState<number | null>(null); // 상세: photos 인덱스(null=그리드)
  const [fromGrid, setFromGrid] = useState(false);  // 상세 진입 경로 — 그리드 경유(true) / 스트립 직접(false)

  const photos = flatten(reviews);
  const done = reviews.length >= photoCount;

  // 스트립 사진 클릭 → 그리드 없이 «상세만». 더보기 → 그리드.
  const openDetail = (i: number) => { setFromGrid(false); setDetail(i); setOpen(true); };
  const openGrid = () => { setFromGrid(true); setDetail(null); setOpen(true); };
  const closeAll = () => { setOpen(false); setDetail(null); };
  // 상세 닫기: 그리드에서 왔으면 그리드로, 스트립에서 바로 열었으면 완전 닫기(그리드 안 뜸).
  const backFromDetail = () => { if (fromGrid) setDetail(null); else closeAll(); };

  const loadMore = useCallback(async (): Promise<PhotoItem[]> => {
    if (loading || done) return photos;
    setLoading(true);
    try {
      const u = new URL("/api/reviews", window.location.origin);
      u.searchParams.set("products_id", String(productsId));
      u.searchParams.set("photo", "1");
      u.searchParams.set("page", String(page + 1));
      const res = await fetch(u.toString(), { cache: "no-store" });
      const j = (await res.json().catch(() => null)) as { items?: ProductReview[] } | null;
      const rows = j?.items ?? [];
      const next = [...reviews, ...rows];
      setReviews(next);
      setPage((p) => p + 1);
      return flatten(next);
    } finally {
      setLoading(false);
    }
  }, [loading, done, photos, productsId, page, reviews]);

  // 상세 좌우 이동 — 끝에 도달하고 더 있으면 다음 페이지 로드 후 이동.
  const move = useCallback(async (dir: 1 | -1) => {
    if (detail === null) return;
    const nextIdx = detail + dir;
    if (nextIdx < 0) return;
    if (nextIdx < photos.length) { setDetail(nextIdx); return; }
    if (dir === 1 && !done) {
      const more = await loadMore();
      if (nextIdx < more.length) setDetail(nextIdx);
    }
  }, [detail, photos.length, done, loadMore]);

  // 키보드(모달 열렸을 때)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (detail !== null) backFromDetail(); else setOpen(false); }
      else if (detail !== null && e.key === "ArrowRight") void move(1);
      else if (detail !== null && e.key === "ArrowLeft") void move(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, detail, move]);

  if (photoCount <= 0 || photos.length === 0) return null;

  // 최대 6개, 행 전체를 채우는 유동 타일. 브레이크포인트별 노출 수: 모바일 3 / sm 4 / md 5 / lg 6.
  const MAX = 6;
  const visible = photos.slice(0, MAX);
  // index 별 노출 브레이크포인트(3개 초과분은 sm/md/lg 부터 노출)
  const hideAt = (i: number) => (i < 3 ? "" : i === 3 ? "hidden sm:block" : i === 4 ? "hidden md:block" : "hidden lg:block");
  // 각 브레이크포인트의 «마지막 보이는» 타일에만 오버레이 노출(그 브레이크포인트에서만 flex, 나머지 hidden)
  const overlayVis = (i: number) => (i === 2 ? "flex sm:hidden" : i === 3 ? "hidden sm:flex md:hidden" : i === 4 ? "hidden md:flex lg:hidden" : i === 5 ? "hidden lg:flex" : "hidden");
  // 그 브레이크포인트에서 더 볼 사진이 있는가(i+1 장 노출 기준)
  const overlayMore = (i: number) => photos.length > i + 1 || !done;

  return (
    <div className="mt-5">
      {/* 1열 포토리뷰 스트립 — 행을 꽉 채우는 유동 타일. 각 브레이크포인트 마지막 사진에 «더 보기 +N» 오버레이 */}
      <div className="flex items-stretch gap-1.5 sm:gap-2">
        {visible.map((p, i) => (
          <div key={p.key} className={`relative aspect-square min-w-0 flex-1 overflow-hidden rounded-lg border border-line bg-surface ${hideAt(i)}`}>
            <button type="button" onClick={() => openDetail(i)} className="block h-full w-full">
              <LazyImg src={p.thumb || p.src} alt="" className="h-full w-full object-cover" />
            </button>
            {/* 더보기 오버레이 — 해당 브레이크포인트에서 이 타일이 마지막이고 더 볼 사진이 있을 때만 */}
            {i >= 2 && overlayMore(i) && (
              <button type="button" onClick={openGrid}
                className={`absolute inset-0 ${overlayVis(i)} flex-col items-center justify-center bg-black/60 text-white`}>
                <span className="text-[10px] font-semibold sm:text-[12px]">더 보기</span>
                <span className="flex items-center font-bold leading-none">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-6 sm:w-6" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  <span className="text-[13px] sm:text-[16px]">{photos.length.toLocaleString()}</span>
                </span>
              </button>
            )}
          </div>
        ))}
      </div>

      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/80" onClick={() => (detail !== null ? backFromDetail() : setOpen(false))}>
          {detail === null ? (
            // ── 그리드 ──
            <div className="mx-auto my-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-3xl overflow-hidden rounded-2xl bg-card" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h3 className="text-base font-bold text-text">포토리뷰 <span className="text-accent">{photos.length.toLocaleString()}{done ? "" : "+"}</span></h3>
                <button type="button" onClick={closeAll} className="text-sub hover:text-text" aria-label="닫기">✕</button>
              </div>
              <div className="max-h-[calc(90vh-8rem)] overflow-y-auto p-4">
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {photos.map((p, i) => (
                    <button key={p.key} type="button" onClick={() => setDetail(i)}
                      className="aspect-square overflow-hidden rounded-lg border border-line bg-surface">
                      <LazyImg src={p.thumb || p.src} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
                {!done && (
                  <div className="mt-4 text-center">
                    <button type="button" disabled={loading} onClick={() => void loadMore()}
                      className="rounded-lg border border-line bg-surface px-6 py-2.5 text-sm font-semibold text-text hover:bg-line disabled:opacity-60">
                      {loading ? "불러오는 중…" : "사진 더보기"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // ── 상세(포토리뷰) + 좌우 큰 이동 버튼 ──
            (() => {
              const p = photos[detail];
              const r = p.review;
              return (
                <div className="relative flex h-full w-full items-center justify-center" onClick={backFromDetail}>
                  {/* 좌 */}
                  <button type="button" onClick={(e) => { e.stopPropagation(); void move(-1); }} disabled={detail <= 0}
                    className="absolute left-2 top-1/2 z-10 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 disabled:opacity-30 sm:left-6 sm:h-16 sm:w-16" aria-label="이전">
                    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                  </button>

                  <div className="flex max-h-[90vh] w-[calc(100%-8rem)] max-w-4xl flex-col overflow-hidden rounded-2xl bg-card" onClick={(e) => e.stopPropagation()}>
                    {/* 모달 타이틀 */}
                    <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                      <h3 className="text-base font-bold text-text">리뷰 상세</h3>
                      <button type="button" onClick={backFromDetail} className="text-sub hover:text-text" aria-label="닫기">✕</button>
                    </div>
                    {/* 본문: 사진 + 내용 */}
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
                    {/* 사진 */}
                    <div className="flex items-center justify-center bg-black sm:w-1/2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.src} alt="" loading="lazy" className="max-h-[45vh] w-full object-contain sm:max-h-[90vh]" />
                    </div>
                    {/* 리뷰 내용 */}
                    <div className="flex min-h-0 flex-1 flex-col sm:w-1/2">
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
                        {r.url && (
                          <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 block truncate text-[13px] text-accent underline underline-offset-2">{r.url}</a>
                        )}
                        {r.reply_content && (
                          <div className="mt-3 rounded-lg bg-surface p-3">
                            <div className="text-[12px] font-semibold text-text"><span className="rounded bg-accent px-1.5 py-0.5 text-[11px] text-accent-foreground">답변</span> {r.reply_name || "판매자"}</div>
                            <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-sub">{r.reply_content}</p>
                          </div>
                        )}
                        <p className="mt-4 text-right text-[12px] text-sub">{detail + 1} / {done ? photos.length : `${photos.length}+`}</p>
                      </div>
                    </div>
                    </div>
                  </div>

                  {/* 우 */}
                  <button type="button" onClick={(e) => { e.stopPropagation(); void move(1); }} disabled={done && detail >= photos.length - 1}
                    className="absolute right-2 top-1/2 z-10 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 disabled:opacity-30 sm:right-6 sm:h-16 sm:w-16" aria-label="다음">
                    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                </div>
              );
            })()
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
