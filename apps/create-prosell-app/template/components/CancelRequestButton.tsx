"use client";

import { useState } from "react";
import CancelRequestModal, { type CancelLine } from "@/components/CancelRequestModal";
import type { CancelInit } from "@/lib/prosell";

export type { CancelLine };

// 취소접수 버튼 + 모달 트리거. ono=주문서번호, lines=취소가능 상품(can_cancel). unpaid=결제 전(입금대기)→전체 주문취소.
// init(사유·약관·환불계좌)을 클릭 시 먼저 불러온 뒤 모달을 연다 → 모달이 완성된 상태로 나타나 깜빡임이 없다.
export default function CancelRequestButton({ ono, lines, unpaid = false, className }: { ono: number; lines: CancelLine[]; unpaid?: boolean; className?: string }) {
  const [init, setInit] = useState<CancelInit | null>(null);
  const [loading, setLoading] = useState(false);
  if (!lines.length) return null;

  async function open() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/order/cancel/preview?ono=${ono}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { alert(j?.error || "취소 정보를 불러올 수 없습니다."); return; }
      setInit(j.init as CancelInit);
    } catch {
      alert("취소 정보를 불러올 수 없습니다.");
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
        {loading ? "불러오는 중…" : unpaid ? "주문 취소" : "취소 접수"}
      </button>
      {init && <CancelRequestModal ono={ono} lines={lines} init={init} unpaid={unpaid} onClose={() => setInit(null)} />}
    </>
  );
}
