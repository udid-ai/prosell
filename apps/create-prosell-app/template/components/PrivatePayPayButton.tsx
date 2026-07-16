"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 개인결제 "결제하기" — 결제창을 팝업(window.open)으로 연다. 결제 완료 시 목록 새로고침.
export default function PrivatePayPayButton({ ppno, label = "결제하기" }: { ppno: number; label?: string }) {
  const router = useRouter();

  useEffect(() => {
    const onChange = () => router.refresh();
    window.addEventListener("privatepay-change", onChange);
    return () => window.removeEventListener("privatepay-change", onChange);
  }, [router]);

  function open() {
    const w = 480, h = 760;
    const left = typeof window !== "undefined" ? Math.max(0, (window.screenX ?? 0) + ((window.outerWidth ?? w) - w) / 2) : 0;
    const top = typeof window !== "undefined" ? Math.max(0, (window.screenY ?? 0) + ((window.outerHeight ?? h) - h) / 2) : 0;
    window.open(`/privatepay/${ppno}`, "privatepay", `width=${w},height=${h},left=${left},top=${top},scrollbars=1`);
  }

  return (
    <button type="button" onClick={open}
      className="w-full whitespace-nowrap rounded-md border border-accent bg-accent px-3 py-1.5 text-center text-[12px] font-bold text-accent-foreground hover:opacity-90">
      {label}
    </button>
  );
}
