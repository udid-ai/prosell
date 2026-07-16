"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 쿠폰 등록(PIN) 버튼 + 모달. 레거시 couponcode. 성공 시 목록 새로고침.
export default function CouponRegisterButton({ className }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pincode, setPincode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  function close() {
    if (busy) return;
    setOpen(false); setPincode(""); setErr(""); setDone(false);
  }

  async function submit() {
    setErr("");
    const code = pincode.trim();
    if (!code) return setErr("쿠폰 번호를 입력해 주세요.");
    if (!/^[a-zA-Z0-9]+$/.test(code)) return setErr("쿠폰 번호는 영문·숫자만 입력할 수 있습니다.");
    setBusy(true);
    try {
      const res = await fetch("/api/account/coupons", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "code", pincode: code }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error || "쿠폰을 등록할 수 없습니다."); setBusy(false); return; }
      setDone(true); setBusy(false);
      router.refresh();
    } catch { setErr("쿠폰 등록 중 오류가 발생했습니다."); setBusy(false); }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={className ?? "rounded-md bg-accent px-4 py-2 text-[13px] font-bold text-accent-foreground hover:opacity-90"}>
        쿠폰 등록
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={close} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-card p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-text">쿠폰 등록</h2>
              <button type="button" onClick={close} className="text-sub hover:text-text" aria-label="닫기">✕</button>
            </div>
            {done ? (
              <div className="mt-4 space-y-3">
                <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-[13px] text-success">쿠폰이 보관함에 등록되었습니다.</p>
                <button type="button" onClick={close} className="w-full rounded-md bg-accent py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90">확인</button>
              </div>
            ) : (
              <>
                <p className="mt-2 text-[13px] leading-relaxed text-sub">보유하신 쿠폰(PIN) 번호를 입력하면 보관함에 등록됩니다.</p>
                <input
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                  maxLength={20} placeholder="쿠폰 번호 입력" autoFocus
                  className="mt-3 w-full rounded-md border border-line bg-card px-3 py-2.5 text-sm text-text placeholder:text-sub focus:border-accent focus:outline-none"
                />
                {err && <p className="mt-2 text-[13px] text-sale">{err}</p>}
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={close} disabled={busy} className="flex-1 rounded-md border border-line py-2.5 text-sm font-medium text-text hover:bg-surface disabled:opacity-50">닫기</button>
                  <button type="button" onClick={submit} disabled={busy} className="flex-1 rounded-md bg-accent py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50">{busy ? "등록 중…" : "등록"}</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
