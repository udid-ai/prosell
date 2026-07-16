"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 비회원 주문완료 → 재입력 없이 «내 주문조회»로 진입.
//  · cart_id(방금 주문 세션)로 guest 토큰을 발급받아(gt 쿠키) /order/guest 로 이동.
//  · 실패 시(세션 만료 등) 기존 입력식 주문조회 페이지로 폴백.
export default function GuestOrderViewButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const go = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/order/guest-session", { method: "POST", cache: "no-store" });
      const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      // 성공/실패 모두 /order/guest 로 이동(성공이면 gt 로 목록 즉시 노출, 실패면 입력폼 노출).
      router.push("/order/guest");
      router.refresh();
      void j;
    } catch {
      router.push("/order/guest");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button type="button" onClick={go} disabled={loading}
      className={className ?? "grid h-11 place-items-center rounded-md border border-line text-sm font-medium text-text hover:bg-surface disabled:opacity-60"}>
      {loading ? "조회 중…" : "비회원 주문조회"}
    </button>
  );
}
