"use client";

import { useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import { formatDateTime } from "@/lib/format";
import type { ProductReview, ProductReviewSummary } from "@/lib/prosell";
import ReviewDetailModal from "./ReviewDetailModal";
import LazyImg from "./LazyImg";
import { SWIPER_COLS_CSS } from "./swiperColsStyle";

// 헤더(상품상세)와 Tabs 사이 «포토리뷰 요약» 캐러셀 — 3개씩(반응형) 노출, 내용 3줄 요약, 좌우 버튼.
function Stars({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`별점 ${score}점`}>
      {[1, 2, 3, 4, 5].map((k) => (
        <svg key={k} width={12} height={12} viewBox="0 0 20 20" className={k <= score ? "text-[#ffb020]" : "text-line"} fill="currentColor" aria-hidden="true">
          <path d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.51L10 14.6l-4.95 2.6.94-5.5-4-3.9 5.53-.8L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}

export default function ReviewSwiper({ items, summary, vertical }: { items: ProductReview[]; summary?: ProductReviewSummary; vertical?: boolean }) {
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [detail, setDetail] = useState<number | null>(null); // 클릭 시 상세 모달 인덱스

  if (!items.length) return null;

  // 점수 높은 순 정렬(동점이면 원래 순서 유지). 카드·상세 모달 공통 사용.
  const sorted = items.map((r, i) => ({ r, i })).sort((a, b) => b.r.score - a.r.score || a.i - b.i).map((x) => x.r);

  const navBtn = "grid h-8 w-8 place-items-center rounded-full border border-line bg-card text-text hover:bg-surface disabled:opacity-30";
  // 4점 이상(4·5점) 리뷰 비율 — 요약(score_counts) 기준.
  const sc = summary?.score_counts;
  const highPct = summary && summary.count > 0 && sc
    ? Math.round(((sc["5"] + sc["4"]) / summary.count) * 100)
    : null;

  return (
    <section className="mt-10">
      <style>{SWIPER_COLS_CSS}</style>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-text">
          {vertical
            ? "상품리뷰"
            : highPct !== null
              ? <>4점 이상 리뷰가 <span className="font-bold text-[#ff9f0a]">{highPct}%</span> 예요</>
              : "포토리뷰"}
        </h2>
        <div className="flex gap-1.5">
          <button ref={prevRef} type="button" aria-label="이전" className={navBtn}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button ref={nextRef} type="button" aria-label="다음" className={navBtn}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
      </div>

      <Swiper
        modules={[Navigation]}
        spaceBetween={0}
        slidesPerView={vertical ? 2 : 1.15}
        breakpoints={vertical
          ? { 640: { slidesPerView: 3 }, 1024: { slidesPerView: 4 }, 1280: { slidesPerView: 5 } }
          : { 640: { slidesPerView: 2 }, 1024: { slidesPerView: 3 } }}
        // 슬라이드 폭/높이는 globals.css 의 .hswiper/.rcols-* 로 초기화 전부터 고정(플래시 방지).
        className={"hswiper " + (vertical ? "rcols-v" : "rcols-h")}
        onBeforeInit={(swiper) => {
          const nav = swiper.params.navigation;
          if (nav && typeof nav !== "boolean") {
            nav.prevEl = prevRef.current;
            nav.nextEl = nextRef.current;
          }
        }}
      >
        {sorted.map((r, i) => {
          const photo = r.files.find((f) => f.src);
          return (
            <SwiperSlide key={r.id} className="!h-auto self-stretch">
              {vertical ? (
                // 세로형: 이미지 위 + 내용 아래.
                <button type="button" onClick={() => setDetail(i)}
                  className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-line bg-card text-left transition-colors hover:border-accent">
                  <div className="aspect-square w-full overflow-hidden bg-surface">
                    {photo ? (
                      <LazyImg src={photo.thumb || photo.src!} alt="" priority className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[12px] text-sub">사진 없음</div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col p-3">
                    <Stars score={r.score} />
                    <p className="mt-1 truncate text-[12px] text-sub">
                      <span className="font-medium text-text">{r.name || "구매자"}</span>
                      {r.dt ? <> · {formatDateTime(r.dt, false)}</> : null}
                    </p>
                    {r.title ? <p className="mt-1 truncate text-[13px] font-bold text-text">{r.title}</p> : null}
                    {r.content ? <p className="mt-1 line-clamp-2 whitespace-pre-line text-[13px] leading-relaxed text-text">{r.content}</p> : null}
                  </div>
                </button>
              ) : (
                // 가로형: 이미지 왼쪽 + 내용 오른쪽. 클릭 시 상세 모달
                <button type="button" onClick={() => setDetail(i)}
                  className="flex h-full w-full items-stretch overflow-hidden rounded-lg border border-line bg-card text-left transition-colors hover:border-accent">
                  {photo && (
                    <div className="aspect-square w-24 shrink-0 self-stretch overflow-hidden bg-surface sm:w-28">
                      <LazyImg src={photo.thumb || photo.src!} alt="" priority className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col p-3">
                    <div className="flex items-center gap-1.5">
                      <Stars score={r.score} />
                    </div>
                    <p className="mt-1 truncate text-[12px] text-sub">
                      <span className="font-medium text-text">{r.name || "구매자"}</span>
                      {r.dt ? <> · {formatDateTime(r.dt, false)}</> : null}
                    </p>
                    {r.title ? <p className="mt-1 truncate text-[13px] font-bold text-text">{r.title}</p> : null}
                    {r.content ? <p className="mt-1 line-clamp-2 whitespace-pre-line text-[13px] leading-relaxed text-text">{r.content}</p> : null}
                  </div>
                </button>
              )}
            </SwiperSlide>
          );
        })}
      </Swiper>

      {detail !== null && (
        <ReviewDetailModal
          items={sorted}
          index={detail}
          onClose={() => setDetail(null)}
          onNav={(dir) => setDetail((cur) => {
            if (cur === null) return cur;
            const n = cur + dir;
            return n >= 0 && n < items.length ? n : cur;
          })}
        />
      )}
    </section>
  );
}
