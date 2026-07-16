"use client";

import { useEffect, useState } from "react";
import { won } from "@/lib/format";
import type { CheckoutCoupon } from "@/lib/prosell";

// 체크아웃 쿠폰 선택 모달(회원). 지정 type(bundle|delivery)의 보유 쿠폰을 나열하고 하나를 적용/해제.
// 적용 성공 시 onClose(true) → 부모가 주문 세션을 다시 불러 합계(coupon_discount) 갱신.
export default function CouponModal({
  oid,
  type,
  title,
  lineId,
  applied,
  onClose,
}: {
  oid: string;
  type: "bundle" | "delivery" | "product";
  title: string;
  lineId?: number;             // 상품쿠폰 대상 cart_product.id (type=product)
  applied?: number;            // 현재 적용된 쿠폰 id(초기 선택 표시)
  onClose: (changed: boolean) => void;
}) {
  const [list, setList] = useState<CheckoutCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState(applied ?? 0); // 선택 쿠폰 id(0=선택 안 함/해제)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(false); }
    window.addEventListener("keydown", onKey);
    let alive = true;
    (async () => {
      // 묶음/배송쿠폰은 주문(oid) 컨텍스트를 넘겨 «사용가능» 쿠폰만 받는다(최소구매금액·카테고리·기간 필터).
      const q = type === "product" && lineId ? `?type=product&id=${lineId}` : `?type=${type}&oid=${encodeURIComponent(oid)}`;
      const r = await fetch(`/api/order/coupon${q}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (alive) {
        setList(Array.isArray(j?.items) ? j.items : []);
        setLoading(false);
      }
    })();
    return () => { alive = false; window.removeEventListener("keydown", onKey); };
  }, [type, lineId, onClose]);

  // 할인 표기(레거시 참고): 정률=「N% 할인 (최대 …)」, 정액=「N원 할인」
  function discountText(c: CheckoutCoupon) {
    return c.discount_type === 2
      ? `${c.discount_percent}% 할인${c.discount_max_price > 0 ? ` (최대 ${won(c.discount_max_price)})` : ""}`
      : `${won(c.discount_price)} 할인`;
  }
  const TYPE_LABEL: Record<number, string> = { 1: "상품 할인", 2: "묶음 할인", 3: "배송비 할인" };

  async function apply() {
    if (busy) return;
    setErr(""); setBusy(true);
    const r = await fetch("/api/order/coupon", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oid, type, id: lineId, coupon_id: pick }),
    });
    const j = await r.json().catch(() => null);
    if (!j?.ok) { setErr(j?.error || "쿠폰 적용에 실패했습니다."); setBusy(false); return; }
    onClose(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => onClose(false)}>
      <div className="flex h-full w-full flex-col overflow-hidden bg-card sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-[512px] sm:rounded-md" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex items-center justify-center border-b border-line py-3">
          <span className="text-[15px] font-bold text-text">{title}</span>
          <button type="button" aria-label="닫기" onClick={() => onClose(false)}
            className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center bg-transparent text-xl text-sub hover:text-text">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="py-10 text-center text-sm text-sub">불러오는 중…</p>
          ) : list.length === 0 ? (
            <p className="py-10 text-center text-sm text-sub">사용 가능한 쿠폰이 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              <li>
                <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 ${pick === 0 ? "border-accent bg-accent/5" : "border-line hover:bg-surface"}`}>
                  <input type="radio" name="coupon" checked={pick === 0} onChange={() => setPick(0)} className="accent-accent" />
                  <span className="text-[13px] text-text">쿠폰 사용 안 함(해제)</span>
                </label>
              </li>
              {list.map((c) => (
                <li key={c.id}>
                  <label className={`flex cursor-pointer gap-3 rounded-md border p-3 ${pick === c.id ? "border-accent bg-accent/5" : "border-line hover:bg-surface"}`}>
                    <input type="radio" name="coupon" checked={pick === c.id} onChange={() => setPick(c.id)} className="mt-1 shrink-0 accent-accent" />
                    <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-sm bg-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-accent">{TYPE_LABEL[c.coupon_type] ?? "할인"}</span>
                        <span className="min-w-0 truncate font-medium text-text">{c.name || "쿠폰"}</span>
                      </div>
                      <div className="mt-1 text-[15px] font-bold text-accent">{discountText(c)}</div>
                      <dl className="mt-1.5 space-y-0.5 text-[12px] text-sub">
                        <div className="flex gap-1">
                          <dt className="shrink-0 text-text/60">사용조건</dt>
                          <dd>{c.discount_terms_price > 0 ? `${won(c.discount_terms_price)} 이상 구매 시` : "구매금액 제한 없음"}</dd>
                        </div>
                        {c.category_title && (
                          <div className="flex gap-1">
                            <dt className="shrink-0 text-text/60">적용분류</dt>
                            <dd>{c.category_title}</dd>
                          </div>
                        )}
                        {c.use_dt && (
                          <div className="flex gap-1">
                            <dt className="shrink-0 text-text/60">유효기간</dt>
                            <dd>{c.use_dt.slice(0, 10)} 까지</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {err && <p className="mt-3 rounded-md bg-sale/10 px-3 py-2 text-[13px] text-sale">{err}</p>}
        </div>

        <div className="border-t border-line p-3">
          {!loading && list.length === 0 ? (
            <button type="button" onClick={() => onClose(false)}
              className="h-11 w-full rounded-md bg-accent text-sm font-medium text-accent-foreground">
              닫기
            </button>
          ) : (
            <button type="button" disabled={busy} onClick={apply}
              className="h-11 w-full rounded-md bg-accent text-sm font-medium text-accent-foreground disabled:opacity-40">
              {busy ? "적용 중…" : pick === 0 ? "쿠폰 해제" : "이 쿠폰 적용"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
