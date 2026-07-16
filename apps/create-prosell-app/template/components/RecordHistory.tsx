"use client";

import { useEffect } from "react";

// 최근 본 상품 기록 — PDP 진입 시 1회 POST(로그인 회원만). UI 없음.
export default function RecordHistory({ productsId, enabled }: { productsId: number; enabled: boolean }) {
  useEffect(() => {
    if (!enabled || !productsId) return;
    fetch("/api/account/history", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products_id: productsId }),
    }).catch(() => {});
  }, [productsId, enabled]);
  return null;
}
