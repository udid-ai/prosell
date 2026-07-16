"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { formatPhone } from "@/lib/format";

// 재입고 알림신청 모달 — 품절 상품에 휴대폰 번호를 등록해 재입고 시 알림받기.
// 회원은 기존 신청/휴대폰이 프리필되며 번호 변경(update)도 가능. 비회원은 번호만 입력해 신청.
export default function RestockModal({ productId, onClose }: { productId: number; onClose: () => void }) {
  const [hp, setHp] = useState("");
  const [isUpdate, setIsUpdate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await fetch("/api/restock", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check", product_id: String(productId) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!alive) return;
      if (d.ok) { setHp(String(d.hp || "")); setIsUpdate(!!d.is_update); }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [productId]);

  async function submit() {
    setMsg("");
    if (!/^[0-9]{10,11}$/.test(hp)) return setMsg("휴대폰 번호를 정확히 입력해 주세요.");
    setBusy(true);
    const r = await fetch("/api/restock", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", product_id: String(productId), hp }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!d.ok) return setMsg(String(d.error || "신청에 실패했습니다."));
    setDone(true);
  }

  if (typeof document === "undefined") return null;
  return createPortal((
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="재입고 알림신청"
      onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-card p-6 shadow-2xl">
        <button type="button" onClick={onClose} aria-label="닫기"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-sub hover:bg-line">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>

        {done ? (
          <div className="py-4 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/10 text-success">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </span>
            <h2 className="mt-4 text-base font-bold text-text">{isUpdate ? "휴대폰 번호가 변경되었습니다" : "재입고 알림을 신청했습니다"}</h2>
            <p className="mt-1 text-[13px] text-sub">재입고 시 입력하신 번호로 알려드립니다.</p>
            <button type="button" onClick={onClose} className="mt-5 h-11 w-full cursor-pointer rounded-md bg-accent text-sm font-bold text-accent-foreground hover:opacity-90">확인</button>
          </div>
        ) : (
          <>
            <h2 className="text-base font-bold text-text">{isUpdate ? "재입고 알림 휴대폰 변경" : "재입고 알림신청"}</h2>
            <p className="mt-1 text-[13px] text-sub">
              {isUpdate ? "알림받을 휴대폰 번호를 변경할 수 있습니다." : "품절 상품이 재입고되면 문자로 알려드립니다."}
            </p>

            <label className="mt-4 block text-[13px] text-sub">휴대폰 번호</label>
            <input
              value={formatPhone(hp)}
              onChange={(e) => setHp(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              inputMode="numeric" maxLength={13} placeholder="휴대폰번호 (- 없이)"
              disabled={loading}
              className="mt-2 w-full rounded-sm border border-line bg-card px-3 py-3 text-[15px] text-text outline-none focus:border-accent disabled:bg-readonly"
            />

            {msg && <div className="mt-3 text-[13px] text-sale">{msg}</div>}

            <button type="button" onClick={submit} disabled={busy || loading}
              className={`mt-5 h-11 w-full rounded-md text-sm font-bold ${busy || loading ? "cursor-not-allowed bg-muted text-accent-foreground" : "cursor-pointer bg-accent text-accent-foreground hover:opacity-90"}`}>
              {busy ? "처리 중…" : isUpdate ? "휴대폰 번호 변경" : "알림신청"}
            </button>
          </>
        )}
      </div>
    </div>
  ), document.body);
}
