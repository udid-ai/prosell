"use client";

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

// IntersectionObserver 기반 지연 로딩 이미지.
// 네이티브 loading="lazy" 는 빠른(localhost) 연결에서 임계값이 커져 화면 밖 이미지도 미리 받는다.
// 이 컴포넌트는 «뷰포트 근처(rootMargin)로 실제 들어올 때만» src 를 주입해 스크롤에 맞춰 로드한다.
// - 세로 스크롤은 물론 가로(스와이프) 교차도 뷰포트 기준으로 함께 판정된다.
// - src 주입 전에도 부모 박스(aspect/h-full)로 자리를 차지하므로 레이아웃 이동/플래시가 없다.
export default function LazyImg({
  src,
  rootMargin = "200px",
  priority = false,
  className,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "loading"> & { rootMargin?: string; priority?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  // priority=true 는 화면 상단(스와이프 배너/캐러셀 등)용 — SSR 부터 src 를 넣어 «빈 박스→이미지» 깜빡임 제거.
  const [show, setShow] = useState(priority);

  useEffect(() => {
    if (show) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShow(true); // 옵저버 미지원 환경은 즉시 로드.
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShow(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show, rootMargin]);

  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={show ? (src as string) : undefined} data-lazy={show ? undefined : ""} className={className} {...rest} />;
}
