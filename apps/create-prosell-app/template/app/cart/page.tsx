"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { won } from "@/lib/format";
import { getCartGrouped, setCartQty, removeFromCart, clearCart, type CartGrouped, type CartGroupItem } from "@/lib/cart";

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartGrouped | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ordering, setOrdering] = useState(false);

  // 주문하기 — 서버가 주문 세션(oid)을 발행 → /order/[oid] 로 이동(복수 탭 독립)
  async function startOrder() {
    if (ordering) return;
    setOrdering(true);
    try {
      const res = await fetch("/api/order/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await res.json().catch(() => null);
      if (j?.ok && j.oid) router.push(`/order/${j.oid}?src=cart`);
      else { alert(j?.error || "주문서 생성에 실패했습니다."); setOrdering(false); }
    } catch { alert("주문 요청 중 오류가 발생했습니다."); setOrdering(false); }
  }

  useEffect(() => {
    let alive = true;
    const sync = () => { getCartGrouped().then((c) => { if (alive) { setCart(c); setLoaded(true); } }); };
    sync();
    window.addEventListener("cart-change", sync);
    return () => { alive = false; window.removeEventListener("cart-change", sync); };
  }, []);

  const groups = cart?.groups ?? [];
  const s = cart?.summary;
  const empty = loaded && groups.length === 0;

  if (empty) {
    return (
      <main className="mx-auto max-w-content p-6">
        <h1 className="text-2xl font-bold text-text">장바구니</h1>
        <div className="mt-6 rounded-md border border-line bg-card p-12 text-center text-sub">
          장바구니가 비어 있습니다.
          <div className="mt-4">
            <Link href="/" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">쇼핑 계속하기</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-content p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text">장바구니 {s ? <span className="text-base text-sub">{s.item_cnt}개 · 배송 {s.group_cnt}건</span> : null}</h1>
        <button type="button" onClick={() => clearCart()} className="cursor-pointer text-sm text-sub hover:text-sale">전체삭제</button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
        {/* 배송 그룹 목록 */}
        <div className="space-y-4">
          {groups.map((g) => {
            const free = g.delivery.free_price;
            const remain = free > 0 ? Math.max(0, free - g.subtotal) : 0;
            return (
              <section key={g.key} className="overflow-hidden rounded-2xl border border-line bg-card">
                {/* 그룹 헤더: 공급사 + 배송수단 */}
                <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded-md bg-bg px-2 py-0.5 text-[12px] font-semibold text-sub">{g.delivery.method_label}</span>
                    <span className="font-semibold text-text">{g.supplier.title || "기본 배송"}</span>
                    {g.orderable === 0 && <span className="text-[12px] font-semibold text-sale">주문불가</span>}
                  </div>
                  <span className="text-[13px] font-semibold text-text">
                    {g.delivery.is_free || g.shipping_fee === 0 ? <span className="text-accent">무료배송</span> : `배송비 ${won(g.shipping_fee)}`}
                  </span>
                </header>

                {/* 무료배송 임계 안내 */}
                {free > 0 && remain > 0 && (
                  <p className="border-b border-line bg-bg/60 px-4 py-2 text-[12px] text-sub">
                    <b className="text-accent">{won(remain)}</b> 더 담으면 무료배송 (조건 {won(free)})
                  </p>
                )}

                {/* 품목(주문옵션 라인 = 품목, 추가옵션 중첩) */}
                <ul className="divide-y divide-line">
                  {g.items.map((it) => <CartItemRow key={it.line_key} it={it} />)}
                </ul>

                {/* 그룹 소계 */}
                <div className="flex items-center justify-end gap-4 border-t border-line px-4 py-3 text-sm">
                  {g.discount > 0 && <span className="text-sub">대량할인 <b className="text-sale">-{won(g.discount)}</b></span>}
                  <span className="text-sub">상품 <b className="text-text">{won(g.subtotal)}</b></span>
                  <span className="text-sub">배송 <b className="text-text">{g.shipping_fee === 0 ? "0" : won(g.shipping_fee)}</b></span>
                </div>
              </section>
            );
          })}
        </div>

        {/* 결제 요약 */}
        <aside className="rounded-2xl border border-line bg-card p-5 lg:sticky lg:top-20">
          <h2 className="text-base font-bold text-text">결제 예상 금액</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <Row k="상품금액" v={won(s?.item_price ?? 0)} />
            {(s?.bulk_discount ?? 0) > 0 && <Row k="대량구매 할인" v={`-${won(s!.bulk_discount)}`} sale />}
            <Row k="배송비" v={(s?.delivery_price ?? 0) === 0 ? "무료" : `+${won(s!.delivery_price)}`} />
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-sub">결제 예상</span>
            <span className="text-2xl font-extrabold text-text">{won(s?.total_price ?? 0)}</span>
          </div>
          <button
            type="button"
            onClick={startOrder}
            disabled={ordering || groups.every((g) => g.orderable === 0)}
            className="mt-4 h-12 w-full cursor-pointer rounded-md bg-accent text-sm font-bold text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ordering ? "주문서 생성 중…" : "주문하기"}
          </button>
        </aside>
      </div>
    </main>
  );
}

// 품목 = 주문옵션 1라인 + 추가옵션(중첩). 레거시 cart row + row.addoption[] 대응.
function CartItemRow({ it }: { it: CartGroupItem }) {
  return (
    <li className="px-4 py-3">
      <div className="flex gap-3">
        <Link href={`/products/${it.products_id}`} className="shrink-0">
          {it.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.thumb} alt="" className="h-20 w-20 rounded-md object-cover" />
          ) : (
            <div className="h-20 w-20 rounded-md bg-bg" />
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/products/${it.products_id}`} className="line-clamp-1 text-sm font-semibold text-text hover:text-accent">{it.title}</Link>
            <button type="button" onClick={() => removeFromCart(it.line_key)} aria-label="삭제" className="shrink-0 text-sub hover:text-sale">✕</button>
          </div>
          <p className="mt-0.5 text-[13px] text-sub">{it.option_label}</p>
          {it.soldout ? <p className="mt-0.5 text-[12px] font-semibold text-sale">품절</p> : null}
          {(it.bulk_discount ?? 0) > 0 && <p className="mt-0.5 text-[12px] text-sale">대량할인 -{won(it.bulk_discount!)}</p>}

          {/* 추가옵션(중첩) — 삭제 불가 */}
          {it.addoptions.length > 0 && (
            <div className="mt-2 rounded-md border border-dashed border-line bg-bg/50 p-2">
              <p className="mb-1 text-[11px] font-semibold text-sub">추가옵션</p>
              <ul className="space-y-1">
                {it.addoptions.map((a) => (
                  <li key={a.line_key} className="flex items-center justify-between gap-2">
                    <p className="truncate text-[12px] text-sub">{a.option_label}{a.qty > 1 ? ` ×${a.qty}` : ""}</p>
                    <span className="text-[12px] text-text">+{won(a.line_total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <div className="inline-flex items-center rounded-md border border-line">
              <button type="button" onClick={() => setCartQty(it.line_key, it.qty - 1)} className="grid h-8 w-8 place-items-center text-text">−</button>
              <span className="grid h-8 w-10 place-items-center border-x border-line text-sm">{it.qty}</span>
              <button type="button" onClick={() => setCartQty(it.line_key, it.qty + 1)} className="grid h-8 w-8 place-items-center text-text">+</button>
            </div>
            <span className="text-sm font-bold text-text">{won(it.item_total)}</span>
          </div>
        </div>
      </div>
    </li>
  );
}

function Row({ k, v, sale }: { k: string; v: string; sale?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-sub">{k}</dt>
      <dd className={sale ? "font-medium text-sale" : "text-text"}>{v}</dd>
    </div>
  );
}
