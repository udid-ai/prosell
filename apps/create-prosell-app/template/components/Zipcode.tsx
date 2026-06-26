"use client";

import { useEffect, useRef } from "react";
import { kakaoPostcodeScript, getPostcodeCtor, formatPostcode, type PostcodeResult } from "@/lib/kakaoPostcode";

export type ZipcodeResult = PostcodeResult;

// 공통 우편번호 검색 모달. 선택 시 onClose(result), 닫기 시 onClose(null).
// 모바일=전체화면 / 데스크톱=중앙 카드. 추가 의존성 없이 Tailwind 로 구현.
export default function Zipcode({ onClose }: { onClose: (v: ZipcodeResult | null) => void }) {
  const embedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(null); }
    window.addEventListener("keydown", onKey);

    kakaoPostcodeScript()
      .then(() => {
        if (!mounted) return;
        const Ctor = getPostcodeCtor();
        if (!Ctor || !embedRef.current) return;
        requestAnimationFrame(() => {
          if (!mounted || !embedRef.current) return;
          new Ctor({
            oncomplete: (data) => onClose(formatPostcode(data)),
            width: "100%",
            height: "100%",
          }).embed(embedRef.current);
        });
      })
      .catch(() => { if (mounted) onClose(null); });

    return () => {
      mounted = false;
      window.removeEventListener("keydown", onKey);
      if (embedRef.current) embedRef.current.innerHTML = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={() => onClose(null)}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden bg-card sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-[512px] sm:rounded-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center justify-center border-b border-line py-3">
          <span className="text-[15px] font-bold text-text">주소 검색</span>
          <button
            type="button"
            aria-label="닫기"
            onClick={() => onClose(null)}
            className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center bg-transparent text-xl text-sub hover:text-text"
          >
            ✕
          </button>
        </div>
        <div className="flex-1">
          <div ref={embedRef} className="h-[70vh] w-full sm:h-[500px]" />
        </div>
      </div>
    </div>
  );
}
