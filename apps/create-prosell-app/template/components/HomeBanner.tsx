"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination, Navigation } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/navigation";

// 홈 상단 와이드 스와이프 배너(샘플). 실제 배너 데이터 연동 전 임시 슬라이드.
const SLIDES = [
  { title: "NEW ARRIVALS", sub: "새로 들어온 상품을 가장 먼저 만나보세요", bg: "from-indigo-500 via-violet-500 to-purple-600" },
  { title: "BEST SELLERS", sub: "지금 가장 인기 있는 상품", bg: "from-rose-500 via-pink-500 to-orange-500" },
  { title: "SPECIAL SALE", sub: "한정 기간 특별 할인, 지금 만나보세요", bg: "from-emerald-500 via-teal-500 to-cyan-600" },
];

export default function HomeBanner() {
  return (
    <section className="w-full">
      <Swiper
        modules={[Autoplay, Pagination, Navigation]}
        autoplay={{ delay: 4500, disableOnInteraction: false }}
        pagination={{ clickable: true }}
        navigation
        loop
        className="h-[300px] w-full sm:h-[420px] lg:h-[500px]"
        style={{
          // 슬라이드가 밝지 않으므로 네비/페이지네이션을 흰색으로.
          ["--swiper-navigation-color" as string]: "#fff",
          ["--swiper-pagination-color" as string]: "#fff",
          ["--swiper-navigation-size" as string]: "28px",
        }}
      >
        {SLIDES.map((s, i) => (
          <SwiperSlide key={i}>
            <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${s.bg} px-6 text-center text-white`}>
              <div>
                <h2 className="text-3xl font-black tracking-tight drop-shadow-sm sm:text-5xl">{s.title}</h2>
                <p className="mt-3 text-sm opacity-90 sm:text-lg">{s.sub}</p>
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}
