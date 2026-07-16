"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 구매확정 모달 — 대상 상품을 체크박스(전체 선택 기본)로 보여주고 확인 시 일괄 처리.
// 추가 주문옵션은 서버가 메인 상품과 함께 확정하므로 목록엔 메인 상품만 노출.
export type ConfirmItem = { prno: number; title: string; option?: string; thumb?: string; quantity?: number };

export default function PurchaseConfirmModal({ items, onClose }: { items: ConfirmItem[]; onClose: () => void }) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<number>>(new Set(items.map((i) => i.prno)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const allChecked = checked.size === items.length && items.length > 0;
  const toggle = (prno: number) => {
    setChecked((prev) => {
      const n = new Set(prev);
      if (n.has(prno)) n.delete(prno); else n.add(prno);
      return n;
    });
  };
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(items.map((i) => i.prno)));

  async function submit() {
    setErr("");
    const prnos = items.filter((i) => checked.has(i.prno)).map((i) => i.prno);
    if (prnos.length === 0) return setErr("구매확정할 상품을 선택해 주세요.");
    setBusy(true);
    try {
      const res = await fetch("/api/order/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prno: prnos }) });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error || "구매확정에 실패했습니다."); setBusy(false); return; }
      onClose();
      router.refresh();
    } catch { setErr("요청 중 오류가 발생했습니다."); setBusy(false); }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-line bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-bold text-text">구매확정</h2>
          <button type="button" onClick={onClose} className="text-sub hover:text-text" aria-label="닫기">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <label className="mb-2 flex cursor-pointer items-center gap-2 border-b border-line pb-2 text-sm font-medium text-text">
            <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 accent-[var(--accent,#2563eb)]" />
            전체 선택 ({checked.size}/{items.length})
          </label>

          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.prno}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-2.5 hover:bg-surface/50">
                  <input type="checkbox" checked={checked.has(it.prno)} onChange={() => toggle(it.prno)} className="h-4 w-4 shrink-0 accent-[var(--accent,#2563eb)]" />
                  {it.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.thumb} alt="" className="h-12 w-12 shrink-0 rounded-md border border-line object-cover" />
                  ) : <div className="h-12 w-12 shrink-0 rounded-md border border-line bg-surface" />}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-medium text-text">{it.title}</p>
                    {it.option && <p className="mt-0.5 text-[12px] text-sub">{it.option}</p>}
                    {it.quantity ? <p className="text-[12px] text-sub">수량 {it.quantity}개</p> : null}
                  </div>
                </label>
              </li>
            ))}
          </ul>

          {err && <p className="mt-3 text-[13px] text-sale">{err}</p>}
        </div>

        <div className="flex gap-2 border-t border-line px-6 py-4">
          <button type="button" onClick={onClose} className="flex-1 rounded-md border border-line py-2.5 text-sm font-medium text-text hover:bg-surface">취소</button>
          <button type="button" onClick={submit} disabled={busy || checked.size === 0} className="flex-1 rounded-md bg-accent py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50">
            {busy ? "처리 중…" : `구매확정 (${checked.size})`}
          </button>
        </div>
      </div>
    </>
  );
}
