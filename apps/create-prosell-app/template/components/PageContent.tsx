"use client";

import { useEffect, useRef } from "react";

// 디자인 페이지 본문 렌더 + 목차 이동.
// 원본 스킨(page/basic/common.js) 동작 재현:
//   #item-header [data-item="N"] 클릭 → #item-list [data-item="N"] 위치로 스크롤.
// 콘텐츠는 dangerouslySetInnerHTML 로 들어오므로 이벤트 위임으로 처리한다.
export default function PageContent({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      const link = el?.closest("#item-header [data-item]") as HTMLElement | null;
      if (!link || !root.contains(link)) return;

      const id = link.getAttribute("data-item");
      if (!id) return;
      const dest = root.querySelector<HTMLElement>(`#item-list [data-item="${CSS.escape(id)}"]`);
      if (!dest) return;

      e.preventDefault();
      // 스티키 헤더 높이만큼 보정해 섹션이 가리지 않게.
      const headerH = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const y = dest.getBoundingClientRect().top + window.scrollY - headerH - 16;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
