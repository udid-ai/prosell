"use client";

import { useRef, type ReactNode } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import { SWIPER_COLS_CSS } from "./swiperColsStyle";

// 홈 상단 «가로 스와이프» 상품 진열(판매량순 등). 좌우 버튼 노출.
// 카드는 서버(page)에서 ProductCard 로 렌더해 slides 로 전달 → 클라이언트 번들에 prosell(next/headers) 유입 방지.
export default function ProductSwiper({ title, slides }: { title: string; slides: ReactNode[] }) {
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  if (!slides.length) return null;

  const navBtn = "grid h-8 w-8 place-items-center rounded-full border border-line bg-card text-text hover:bg-surface disabled:opacity-30";

  return (
    <section className="mb-8">
      <style>{SWIPER_COLS_CSS}</style>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[22px] font-bold text-text">{title}</h2>
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
        slidesPerView={2}
        breakpoints={{ 640: { slidesPerView: 3 }, 1024: { slidesPerView: 4 } }}
        // 슬라이드 폭/높이는 globals.css 의 .hswiper/.pcols 로 초기화 전부터 고정(플래시 방지).
        className="hswiper pcols"
        onBeforeInit={(swiper) => {
          const nav = swiper.params.navigation;
          if (nav && typeof nav !== "boolean") {
            nav.prevEl = prevRef.current;
            nav.nextEl = nextRef.current;
          }
        }}
      >
        {slides.map((slide, i) => (
          <SwiperSlide key={i} className="!h-auto self-stretch">
            {slide}
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}
