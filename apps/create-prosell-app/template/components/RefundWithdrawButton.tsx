"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 반품 철회 버튼 — 반품접수(ref_state 10, del_state 80) 상태에서만 노출(부모가 판정).
// 확인 후 POST /api/order/refund/withdraw → 목록으로 이동.
export default function RefundWithdrawButton({ rno, className }: { rno: number; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/order/refund/withdraw", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rno }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error || "반품철회에 실패했습니다."); setBusy(false); return; }
      setOpen(false);
      router.push("/account/refunds");
      router.refresh();
    } catch { setErr("반품철회 요청 중 오류가 발생했습니다."); setBusy(false); }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "rounded-md border border-line px-4 py-2 text-[13px] font-semibold text-text hover:bg-surface"}
      >
        반품 철회
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => !busy && setOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-card p-5 shadow-xl">
            <h2 className="text-base font-bold text-text">반품 철회</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-sub">이 반품접수를 철회하시겠습니까? 철회 후에는 다시 접수해야 합니다.</p>
            {err && <p className="mt-2 text-[13px] text-sale">{err}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={busy} className="flex-1 rounded-md border border-line py-2.5 text-sm font-medium text-text hover:bg-surface disabled:opacity-50">닫기</button>
              <button type="button" onClick={submit} disabled={busy} className="flex-1 rounded-md bg-accent py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50">{busy ? "처리 중…" : "반품 철회"}</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
