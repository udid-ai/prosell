"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 교환 회수 운송장 등록/수정 — 레거시 exchange/parcel 모달. 회수중(exc_state==20)·택배건에서만 노출(부모가 판정).
// 회수 택배사는 표시(읽기전용), 운송장 번호만 입력. PUT /api/order/exchange/parcel { eno, exc_ret_num }
export default function ExchangeParcelButton({ eno, courier, initial }: { eno: number; courier?: string | null; initial?: string | null }) {
  const [open, setOpen] = useState(false);
  const has = !!initial;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-accent bg-accent/5 px-3 py-1.5 text-[12px] font-medium text-accent hover:bg-accent/10"
      >
        {has ? "운송장 수정" : "운송장 등록"}
      </button>
      {open && <ExchangeParcelModal eno={eno} courier={courier} initial={initial} onClose={() => setOpen(false)} />}
    </>
  );
}

function ExchangeParcelModal({ eno, courier, initial, onClose }: { eno: number; courier?: string | null; initial?: string | null; onClose: () => void }) {
  const router = useRouter();
  const [num, setNum] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    const v = num.replace(/-/g, "").trim();
    if (!v || !/^[0-9A-Za-z]{1,50}$/.test(v)) return setErr("운송장 번호를 정확히 입력해 주세요.");
    setBusy(true);
    try {
      const res = await fetch("/api/order/exchange/parcel", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eno: String(eno), exc_ret_num: v }) });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error || "운송장 등록에 실패했습니다."); setBusy(false); return; }
      onClose();
      router.refresh();
    } catch { setErr("요청 중 오류가 발생했습니다."); setBusy(false); }
  }

  const inputCls = "w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent";
  const labelCls = "mb-1 block text-[13px] font-medium text-sub";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-card p-6 shadow-xl" style={{ maxHeight: "90vh" }}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text">회수 운송장 등록</h2>
          <button type="button" onClick={onClose} className="text-sub hover:text-text" aria-label="닫기">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>회수 택배사</label>
            <input className={`${inputCls} bg-surface`} value={courier || "-"} readOnly />
          </div>
          <div>
            <label className={labelCls}>운송장 번호</label>
            <input className={inputCls} value={num} onChange={(e) => setNum(e.target.value)} inputMode="numeric" placeholder="'-' 없이 숫자만" maxLength={50} />
          </div>
          <p className="text-[12px] leading-relaxed text-sub">교환 상품을 위 택배사로 발송하신 뒤 운송장 번호를 등록해 주세요. 검수 완료 후 교환 상품이 재배송됩니다.</p>

          {err && <p className="text-[13px] text-sale">{err}</p>}

          <div className="mt-2 flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-md border border-line py-2.5 text-sm font-medium text-text hover:bg-surface">취소</button>
            <button type="button" onClick={submit} disabled={busy} className="flex-1 rounded-md bg-accent py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50">
              {busy ? "등록 중…" : "등록하기"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
