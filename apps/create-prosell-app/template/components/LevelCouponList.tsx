"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { won } from "@/lib/format";
import type { LevelCoupon } from "@/lib/prosell";

// 등급쿠폰 목록 + 다운로드(1건/전체). 레거시 coupon/index 등급쿠폰 영역.
function discountText(c: { discount_type: number; discount_percent: number; discount_price: number; discount_max_price: number }) {
  return c.discount_type === 2
    ? `${c.discount_percent}% 할인${c.discount_max_price > 0 ? ` (최대 ${won(c.discount_max_price)})` : ""}`
    : `${won(c.discount_price)} 할인`;
}

export default function LevelCouponList({ coupons }: { coupons: LevelCoupon[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [err, setErr] = useState("");

  const anyDownloadable = coupons.some((c) => c.downloadable);

  async function download(body: Record<string, unknown>, key: number | "all") {
    if (busy) return;
    setErr(""); setBusy(key);
    try {
      const res = await fetch("/api/account/coupons", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error || "쿠폰을 받을 수 없습니다."); setBusy(null); return; }
      router.refresh();
      setBusy(null);
    } catch { setErr("쿠폰 다운로드 중 오류가 발생했습니다."); setBusy(null); }
  }

  return (
    <section className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-text">등급 쿠폰</h2>
        {coupons.length > 1 && anyDownloadable && (
          <button type="button" onClick={() => download({ action: "download_all" }, "all")} disabled={!!busy}
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50">
            {busy === "all" ? "받는 중…" : "전체 받기"}
          </button>
        )}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {coupons.map((c) => (
          <li key={`${c.num}-${c.id}`} className="flex items-center gap-3 rounded-lg border border-line bg-card p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-text">{c.title || "등급 쿠폰"}</p>
              <p className="mt-0.5 text-[15px] font-bold text-accent">{discountText(c)}</p>
              <p className="mt-0.5 text-[12px] text-sub">{c.discount_terms_price > 0 ? `${won(c.discount_terms_price)} 이상 구매 시` : "구매금액 제한 없음"}</p>
            </div>
            {c.downloadable ? (
              <button type="button" onClick={() => download({ action: "download", num: c.num }, c.num)} disabled={!!busy}
                className="shrink-0 rounded-md border border-accent bg-card px-3 py-2 text-[12px] font-bold text-accent hover:bg-accent/10 disabled:opacity-50">
                {busy === c.num ? "받는 중…" : "받기"}
              </button>
            ) : (
              <span className="shrink-0 rounded-md border border-line px-3 py-2 text-[12px] font-medium text-sub">받음</span>
            )}
          </li>
        ))}
      </ul>
      {err && <p className="mt-2 text-[13px] text-sale">{err}</p>}
    </section>
  );
}
