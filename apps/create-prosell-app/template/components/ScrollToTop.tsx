"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * 라우트 이동 시 맨 위로 스크롤 — Chrome 보정.
 *
 * Next App Router 는 새 네비게이션에서 스크롤을 (0,0) 으로 되돌리지만, Chrome 은 스크롤 앵커링/복원이
 * 개입해 이전 위치가 남는 경우가 있다(Firefox 는 정상). pathname 이 바뀌면 명시적으로 최상단으로 올린다.
 *
 * 단, «뒤로/앞으로»(popstate)는 브라우저·Next 의 스크롤 복원에 맡긴다(목록→상세→뒤로 시 위치 유지).
 */
export default function ScrollToTop() {
  const pathname = usePathname();
  const isPop = useRef(false);
  const first = useRef(true);

  useEffect(() => {
    const onPop = () => { isPop.current = true; };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    // 첫 마운트(새로고침·직접 진입)는 브라우저의 스크롤 복원에 맡긴다 — «실제 라우트 이동»일 때만 올린다.
    if (first.current) { first.current = false; return; }
    // 뒤로/앞으로 이동이면 복원을 존중하고 이번 한 번은 건너뛴다.
    if (isPop.current) { isPop.current = false; return; }
    // 해시 이동(#앵커)은 브라우저 기본 동작을 살린다.
    if (window.location.hash) return;
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
