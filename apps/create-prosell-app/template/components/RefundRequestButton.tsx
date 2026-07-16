"use client";

import { useState } from "react";
import RefundRequestModal, { type RefundLine } from "@/components/RefundRequestModal";
import type { RefundInit } from "@/lib/prosell";

export type { RefundLine };

// 반품접수 버튼 + 모달 트리거. ono=주문서번호, lines=반품가능 상품(can_refund).
// init(사유·약관·회수지)을 클릭 시 먼저 불러온 뒤 모달을 연다 → 모달이 완성된 상태로 나타나 깜빡임이 없다.
export default function RefundRequestButton({ ono, lines, className }: { ono: number; lines: RefundLine[]; className?: string }) {
  const [init, setInit] = useState<RefundInit | null>(null);
  const [loading, setLoading] = useState(false);
  if (!lines.length) return null;

  async function open() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/order/refund/preview?ono=${ono}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { alert(j?.error || "반품 정보를 불러올 수 없습니다."); return; }
      setInit(j.init as RefundInit);
    } catch {
      alert("반품 정보를 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={loading}
        className={className ?? "flex-1 basis-0 whitespace-nowrap rounded-lg border border-line bg-surface py-3 text-sm font-semibold text-text hover:bg-line disabled:opacity-60"}
      >
        {loading ? "불러오는 중…" : "반품 접수"}
      </button>
      {init && <RefundRequestModal ono={ono} lines={lines} init={init} onClose={() => setInit(null)} />}
    </>
  );
}
