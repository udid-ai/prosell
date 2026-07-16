"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { formatDateTime } from "@/lib/format";
import type { QnaItem } from "@/lib/prosell";

// 문의대상 유형 — 0=일반(대상 없음) / 1~4=상품 소스. 레거시 cs:M0~M4.
const TYPES = [
  { value: 0, label: "일반 문의" },
  { value: 1, label: "주문 상품" },
  { value: 2, label: "장바구니" },
  { value: 3, label: "보관 상품" },
  { value: 4, label: "최근 본 상품" },
] as const;

export type QnaTarget = { itemType: 0 | 1 | 2 | 3 | 4; itemIds: string[] };

/**
 * 1:1 문의 «문의대상» 선택 — 유형 탭 + 해당 소스 상품 목록에서 체크.
 * 선택 결과(itemType/itemIds)를 onChange 로 올린다. item_ids 는 소스별 형식이 다르지만(주문=prno,
 * 장바구니=products_id|product_id, 보관·최근본=products_id) 프론트는 item_id 문자열을 그대로 다룬다.
 */
export default function QnaItemPicker({ value, onChange }: {
  value: QnaTarget;
  onChange: (v: QnaTarget) => void;
}) {
  const [items, setItems] = useState<QnaItem[]>([]);
  const [loading, setLoading] = useState(false);
  // 이미 조회한 소스는 캐시(탭을 오갈 때 재요청 방지)
  const cache = useRef<Map<number, QnaItem[]>>(new Map());
  const selected = new Set(value.itemIds);

  useEffect(() => {
    const t = value.itemType;
    if (t === 0) { setItems([]); return; }
    if (cache.current.has(t)) { setItems(cache.current.get(t)!); return; }

    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/qna?items=${t}`, { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (!alive) return;
        if (!j?.ok) { toast(j?.error || "상품 목록을 불러오지 못했습니다.", "error"); setItems([]); return; }
        const list = (j.items ?? []) as QnaItem[];
        cache.current.set(t, list);
        setItems(list);
      } catch { if (alive) { toast("상품 목록을 불러오지 못했습니다.", "error"); setItems([]); } }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [value.itemType]);

  const setType = (itemType: 0 | 1 | 2 | 3 | 4) => {
    // 유형을 바꾸면 선택은 초기화(소스마다 item_id 형식이 달라 섞이면 안 된다).
    onChange({ itemType, itemIds: [] });
  };

  const toggle = (itemId: string) => {
    const next = new Set(value.itemIds);
    if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
    onChange({ itemType: value.itemType, itemIds: Array.from(next) });
  };

  return (
    <div>
      {/* 유형 탭 */}
      <div className="flex flex-wrap gap-1.5">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
              value.itemType === t.value
                ? "border-accent bg-accent font-semibold text-accent-foreground"
                : "border-line text-sub hover:border-accent hover:text-accent"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 상품 목록 — 유형이 1~4 일 때만 */}
      {value.itemType !== 0 && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line bg-surface">
          {loading ? (
            <p className="p-4 text-center text-[13px] text-sub">불러오는 중…</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-center text-[13px] text-sub">선택할 상품이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-line">
              {items.map((it, idx) => {
                const on = selected.has(it.item_id);
                return (
                  <li key={`${it.item_id}-${idx}`}>
                    <label className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors ${on ? "bg-accent/5" : "hover:bg-card"}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle(it.item_id)} className="h-4 w-4 shrink-0 accent-accent" />
                      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-card">
                        {it.thumb && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-text">{it.title || "상품"}</span>
                        <span className="block text-[11px] text-sub">
                          {/* 주문상품은 주문일 — 다른 소스의 dt(담은 날/본 날)와 구분되게 유형이 1일 때만 노출. */}
                          {value.itemType === 1 && it.dt && <>주문일 {formatDateTime(it.dt, false)}</>}
                          {value.itemType === 1 && it.dt && it.quantity > 0 && " · "}
                          {it.quantity > 0 && <>수량 {it.quantity}개</>}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {value.itemType !== 0 && value.itemIds.length > 0 && (
        <p className="mt-1.5 text-[12px] text-sub">{value.itemIds.length}개 상품 선택됨</p>
      )}
    </div>
  );
}
