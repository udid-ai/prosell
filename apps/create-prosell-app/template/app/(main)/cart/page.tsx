"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { won, deliveryFeeStatus, orderDeliveryFee } from "@/lib/format";
import { getCartGrouped, setCartQty, removeFromCart, removeManyFromCart, type CartGrouped, type CartGroup, type CartGroupItem } from "@/lib/cart";
import type { BuyItem } from "@/lib/prosell";

// 장바구니 품목(주문옵션 1줄 + 추가옵션) → 바로구매 items 로 변환.
// 추가옵션은 line_key(a-{id}-{num})만 있으면 서버가 파싱하므로 product_id 는 불필요(0).
// deliveryType: 이 품목이 속한 배송그룹의 선택 배송수단(3자리). 선택주문(fromItems)에서도 배송수단을 보존한다.
function itemToBuy(it: CartGroupItem, deliveryType?: number): BuyItem[] {
  const out: BuyItem[] = [{ line_key: it.line_key, products_id: it.products_id, product_id: it.product_id, kind: "opt", quantity: it.qty, delivery_type: deliveryType }];
  for (const a of it.addoptions) out.push({ line_key: a.line_key, products_id: it.products_id, product_id: 0, kind: "addo", quantity: a.qty });
  return out;
}

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartGrouped | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // 주문할 품목 line_key(기본 전체 선택)
  const [sideSummary, setSideSummary] = useState<CartGrouped["summary"] | null>(null); // 선택 품목 서버 재계산 요약
  const [deliveryInfo, setDeliveryInfo] = useState<CartGroup | null>(null); // 배송수단 정보 모달 대상 그룹
  const [tab, setTab] = useState<"domestic" | "country">("domestic"); // 국내/해외 배송 탭(레거시 country_onoff)
  const touched = useRef(false); // 사용자가 선택을 직접 바꿨는지(전까진 항상 전체 선택)

  function toggle(lineKey: string) {
    touched.current = true;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lineKey)) next.delete(lineKey); else next.add(lineKey);
      return next;
    });
  }

  // 국내/해외 탭 전환 — 선택 초기화(다음 로드에서 새 탭 전체 선택) 후 탭 변경 → useEffect 가 재조회.
  function switchTab(next: "domestic" | "country") {
    if (next === tab) return;
    touched.current = false;
    setSelected(new Set());
    setSideSummary(null);
    setTab(next);
  }

  // 주문하기(장바구니 전체) — 서버가 주문 세션(oid)을 발행 → /order/[oid] 로 이동(복수 탭 독립)
  async function startOrder() {
    if (ordering) return;
    setOrdering(true);
    try {
      const res = await fetch("/api/order/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = await res.json().catch(() => null);
      if (j?.ok && j.oid) router.push(`/order/${j.oid}`);
      else { alert(j?.error || "주문서 생성에 실패했습니다."); setOrdering(false); }
    } catch { alert("주문 요청 중 오류가 발생했습니다."); setOrdering(false); }
  }

  // 선택/개별 주문 — 지정 품목만 주문. fromCart=true(장바구니에서 선택주문)면 결제완료 시 해당 항목을 장바구니에서 비운다.
  async function startItems(items: BuyItem[], fromCart = true) {
    if (ordering || items.length === 0) return;
    setOrdering(true);
    try {
      const res = await fetch("/api/order/prepare", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, from_cart: fromCart ? 1 : 0 }),
      });
      const j = await res.json().catch(() => null);
      if (j?.ok && j.oid) router.push(`/order/${j.oid}`);
      else { alert(j?.error || "주문서 생성에 실패했습니다."); setOrdering(false); }
    } catch { alert("주문 요청 중 오류가 발생했습니다."); setOrdering(false); }
  }

  // 선택주문 — 체크된 품목(+추가옵션)만 주문. 그룹별 배송수단(delivery_type)을 보존해 전달.
  function orderSelected() {
    const items = groups.flatMap((g) =>
      g.items.filter((it) => selected.has(it.line_key)).flatMap((it) => itemToBuy(it, g.delivery.delivery_type))
    );
    if (items.length === 0) { alert("주문할 품목을 선택해 주세요."); return; }
    startItems(items);
  }

  useEffect(() => {
    let alive = true;
    const sync = () => { getCartGrouped(undefined, tab).then((c) => {
      if (!alive) return;
      setCart(c);
      setLoaded(true);
      // 사용자가 선택을 건드리기 전엔 항상 전체 선택. 건드린 뒤엔 존재하는 품목만 유지(삭제된 키 정리).
      const keys = (c?.groups ?? []).flatMap((g) => g.items.map((it) => it.line_key));
      setSelected((prev) => touched.current ? new Set(keys.filter((k) => prev.has(k))) : new Set(keys));
    }); };
    sync();
    window.addEventListener("cart-change", sync);
    return () => { alive = false; window.removeEventListener("cart-change", sync); };
  }, [tab]);

  const groups = cart?.groups ?? [];
  const s = cart?.summary;
  const empty = loaded && groups.length === 0;
  // 국내/해외 탭 노출 — 해외배송 사용 설정 + 카트에 품목이 하나라도 있을 때(현재 탭이 비어도 탭은 유지).
  const totalCnt = (cart?.count?.domestic ?? 0) + (cart?.count?.country ?? 0);
  const showTabs = (cart?.country_onoff ?? 0) === 1 && totalCnt > 0;

  // 사이드바 결제 예상 — 체크된 품목만 서버에서 재계산(레거시 /cart/list choices 방식). 선택 변경 시 갱신.
  useEffect(() => {
    if (!loaded || empty) { setSideSummary(null); return; }
    const keys = (cart?.groups ?? []).flatMap((g) => g.items.map((it) => it.line_key)).filter((k) => selected.has(k));
    if (keys.length === 0) {
      setSideSummary({ group_cnt: 0, item_cnt: 0, item_price: 0, bulk_discount: 0, goods_price: 0, delivery_price: 0, total_price: 0 });
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      const c = await getCartGrouped(keys, tab);
      if (alive && c?.summary) setSideSummary(c.summary);
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [selected, cart, loaded, empty, tab]);

  const sum = sideSummary ?? s; // 사이드바는 선택 재계산값 우선(없으면 전체)

  const allLineKeys = groups.flatMap((g) => g.items.map((it) => it.line_key));
  const allSelected = allLineKeys.length > 0 && allLineKeys.every((k) => selected.has(k));
  function toggleAll() {
    touched.current = true;
    setSelected(allSelected ? new Set() : new Set(allLineKeys));
  }
  // 선택 삭제 — 체크된 품목을 장바구니에서 제거.
  async function deleteSelected() {
    if (ordering) return;
    const keys = allLineKeys.filter((k) => selected.has(k));
    if (keys.length === 0) { alert("삭제할 상품을 선택해 주세요."); return; }
    if (!confirm(`선택한 ${keys.length}개 상품을 장바구니에서 삭제할까요?`)) return;
    await removeManyFromCart(keys); // 배열로 한 번에 삭제(개별 요청 X)
  }
  // 단일 주문 버튼 — 선택 품목 주문. 전체 선택이면 장바구니 주문(성공 시 비움), 일부면 바로구매 세션.
  // 레거시 getChoiceOrder 의 사전 가드 재현: ①선택 없음 ②품절/주문불가 포함 ③대량할인 상품 혼합 금지.
  function orderNow() {
    if (ordering) return;
    const selItems = groups.flatMap((g) => g.items).filter((it) => selected.has(it.line_key));
    if (selItems.length === 0) { alert("주문할 상품을 선택해 주세요."); return; }
    // ② 품절/주문불가(state≠0) 상품이 선택에 포함됨
    if (selItems.some((it) => it.soldout === 1 || (it.state ?? 0) !== 0)) {
      alert("품절되었거나 주문할 수 없는 상품이 포함되어 있습니다. 해당 상품을 선택 해제한 뒤 주문해 주세요.");
      return;
    }
    // ③ 대량구매 할인 상품은 다른 상품과 함께 주문 불가(상품 종류 2개 이상 + 대량할인 포함 시)
    const productIds = new Set(selItems.map((it) => it.products_id));
    if (productIds.size >= 2 && selItems.some((it) => (it.bulk_discount ?? 0) > 0)) {
      alert("대량구매 할인이 적용된 상품은 다른 상품과 함께 주문할 수 없습니다. 대량구매 할인 상품만 선택해 주문한 뒤 다른 상품을 주문해 주세요.");
      return;
    }
    // 해외배송 탭이 있으면(country_onoff) 전체-주문 최적화(whole-cart prepare)는 두 탭이 섞이므로 금지.
    // 항상 현재 탭의 선택 품목만 명시 주문한다(국내/해외는 배송이 달라 별도 주문).
    const hasTabs = (cart?.country_onoff ?? 0) === 1;
    if (allSelected && !hasTabs) startOrder();
    else orderSelected();
  }

  return (
    <div className="mx-auto max-w-content p-4 sm:p-6">
      <div className="flex items-center">
        <h1 className="text-2xl font-bold text-text">장바구니</h1>
      </div>

      {/* 좌: 품목 목록(비어있어도 자리 유지) · 우: 결제 요약(항상 표시) → 레이아웃 스왑 없이 깜빡임 방지 */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
        {/* 배송 그룹 목록 */}
        <div className="space-y-4">
          {/* 국내/해외 배송 탭 — 해외배송 사용(country_onoff) 시 노출. 탭별 품목 수 표시(레거시 cart index.js). */}
          {loaded && showTabs && (
            <div className="flex gap-1 rounded-2xl border border-line bg-card p-1">
              {(["domestic", "country"] as const).map((tk) => {
                const cnt = tk === "domestic" ? (cart?.count?.domestic ?? 0) : (cart?.count?.country ?? 0);
                const active = tab === tk;
                return (
                  <button key={tk} type="button" onClick={() => switchTab(tk)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition ${active ? "bg-accent text-accent-foreground" : "text-sub hover:text-text"}`}>
                    {tk === "domestic" ? "국내배송" : "해외배송"}
                    <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${active ? "bg-black/15" : "bg-line text-sub"}`}>{cnt}</span>
                  </button>
                );
              })}
            </div>
          )}
          {loaded && !empty && (
            <div className="flex items-center gap-4 rounded-2xl border border-line bg-card px-4 py-3">
              <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-text">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-accent" />
                전체 선택
              </label>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={selected.size === 0}
                className="cursor-pointer text-sm text-sub hover:text-sale disabled:cursor-not-allowed disabled:opacity-40"
              >
                선택 삭제
              </button>
            </div>
          )}
          {!loaded ? (
            <div className="rounded-2xl border border-line bg-card p-12 text-center text-sub">장바구니를 불러오는 중…</div>
          ) : empty ? (
            <div className="rounded-2xl border border-line bg-card p-12 text-center text-sub">
              {showTabs ? `${tab === "country" ? "해외배송" : "국내배송"} 상품이 없습니다.` : "장바구니가 비어 있습니다."}
              <div className="mt-4">
                <Link href="/" className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">쇼핑 계속하기</Link>
              </div>
            </div>
          ) : (
            groups.map((g) => {
            const free = g.delivery.free_price;
            const remain = free > 0 ? Math.max(0, free - g.subtotal) : 0;
            // 그룹 선택 상태 — 그룹의 모든 품목이 선택됐는지 + 토글
            const gKeys = g.items.map((it) => it.line_key);
            const gAll = gKeys.length > 0 && gKeys.every((k) => selected.has(k));
            const toggleGroup = () => {
              touched.current = true;
              setSelected((prev) => {
                const next = new Set(prev);
                if (gAll) gKeys.forEach((k) => next.delete(k));
                else gKeys.forEach((k) => next.add(k));
                return next;
              });
            };
            return (
              <section key={g.key} className="overflow-hidden rounded-2xl border border-line bg-card">
                {/* 그룹 헤더: 그룹 체크박스 + 배송수단 + 공급사 */}
                <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={gAll} onChange={toggleGroup} aria-label="이 배송그룹 전체 선택" className="h-4 w-4 accent-accent" />
                    <span className="font-semibold text-text">{g.supplier.title || "기본 배송"}</span>
                    {g.orderable === 0 && <span className="text-[12px] font-semibold text-sale">주문불가</span>}
                  </label>
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
                    {/* 해외직구(delivery_use=2)는 배송수단 앞에 «해외직구» 표시 */}
                    {g.delivery.delivery_use === 2 && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-bold text-accent">해외직구</span>}
                    <span className="text-sub">{g.delivery.method_name || "배송"}</span>
                    {(() => {
                      // 배송비 상태는 3자리 코드로 판정(착불/선불/무료/조건부무료). shipping_fee===0 → 무료 로 오판하지 않는다.
                      const st = deliveryFeeStatus(g.delivery.delivery_type ?? 0, g.shipping_fee);
                      return st ? <span className={st === "무료배송" ? "text-accent" : "text-text"}>{st}</span> : null;
                    })()}
                    <button
                      type="button"
                      onClick={() => setDeliveryInfo(g)}
                      aria-label="배송수단 정보"
                      className="grid h-4 w-4 cursor-pointer place-items-center rounded-full border border-line text-[10px] text-sub hover:bg-surface hover:text-text"
                    >?</button>
                  </span>
                </header>

                {/* 무료배송 임계 안내 */}
                {free > 0 && remain > 0 && (
                  <p className="border-b border-line bg-surface/60 px-4 py-2 text-[12px] text-sub">
                    <b className="text-accent">{won(remain)}</b> 더 담으면 무료배송 (조건 {won(free)})
                  </p>
                )}

                {/* 품목(주문옵션 라인 = 품목, 추가옵션 중첩) */}
                <ul className="divide-y divide-line">
                  {g.items.map((it) => (
                    <CartItemRow
                      key={it.line_key}
                      it={it}
                      checked={selected.has(it.line_key)}
                      onToggle={() => toggle(it.line_key)}
                      onBuy={() => startItems(itemToBuy(it, g.delivery.delivery_type))}
                      busy={ordering}
                    />
                  ))}
                </ul>

                {/* 그룹 소계 — 상품금액 · 할인금액 · 배송비 · 주문금액 한 줄 정렬 */}
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 border-t border-line px-4 py-3 text-[13px] text-sub">
                  <span>상품금액 <b className="text-text">{won(g.subtotal)}</b></span>
                  {g.discount > 0 && <span>할인금액 <b className="text-sale">-{won(g.discount)}</b></span>}
                  <span>배송비 <b className="text-text">{(() => { const t = orderDeliveryFee(g.delivery.delivery_type ?? 0, g.shipping_fee); return /^\d/.test(t) ? `+${t}` : t; })()}</b></span>
                  <span>주문금액 <b className="text-text">{won(g.subtotal - g.discount + g.shipping_fee)}</b></span>
                </div>
              </section>
            );
          })
          )}
        </div>

        {/* 결제 요약 */}
        <aside className="space-y-4 lg:sticky lg:top-32">
          {/* 포인트 적립안내(레거시 side.subject.point) — 선택 품목 기준 예정 적립 */}
          {((sum?.complete_point ?? 0) > 0 || (sum?.review_point ?? 0) > 0) && (
            <div className="rounded-2xl border border-line bg-card p-5">
              <p className="text-base font-bold text-text">포인트 적립안내</p>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-sub">상품구매 확정 포인트</dt>
                  <dd className="font-semibold text-accent">{(sum?.complete_point ?? 0).toLocaleString()}P</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-sub">구매후기 작성 포인트</dt>
                  <dd className="font-semibold text-accent">{(sum?.review_point ?? 0).toLocaleString()}P</dd>
                </div>
              </dl>
            </div>
          )}

          <div className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-base font-bold text-text">장바구니 합계</h2>
          {/* 레거시 index.js 사이드: 상품금액·배송비·할인금액(총 할인)+세부(등급/대량/할인)·선택합계 */}
          <dl className="mt-4 space-y-2.5 text-sm">
            <Row k="상품금액" v={won(sum?.item_price ?? 0)} />
            {(sum?.delivery_price ?? 0) > 0 && <Row k="배송비" v={`+${won(sum!.delivery_price)}`} />}
            {(sum?.benefit_discount ?? 0) > 0 && (
              <>
                <Row k="할인금액" v={`-${won(sum!.benefit_discount!)}`} sale />
                {(sum?.level_discount ?? 0) > 0 && (
                  <div className="flex justify-between gap-4 pl-3 text-[12px]"><dt className="text-sub">· 등급할인</dt><dd className="text-sale"><WonText s={`-${won(sum!.level_discount!)}`} /></dd></div>
                )}
                {(sum?.bulk_discount ?? 0) > 0 && (
                  <div className="flex justify-between gap-4 pl-3 text-[12px]"><dt className="text-sub">· 대량구매 할인</dt><dd className="text-sale"><WonText s={`-${won(sum!.bulk_discount!)}`} /></dd></div>
                )}
                {(sum?.exclusive_discount ?? 0) > 0 && (
                  <div className="flex justify-between gap-4 pl-3 text-[12px]"><dt className="text-sub">· 상품할인</dt><dd className="text-sale"><WonText s={`-${won(sum!.exclusive_discount!)}`} /></dd></div>
                )}
              </>
            )}
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-sub">선택 합계</span>
            <span className="text-2xl font-extrabold text-text"><WonText s={won(sum?.total_price ?? 0)} /></span>
          </div>
          <button
            type="button"
            onClick={orderNow}
            disabled={ordering || selected.size === 0}
            className="mt-4 h-12 w-full cursor-pointer rounded-md bg-accent text-sm font-bold text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ordering ? "주문서 생성 중…" : "주문하기"}
          </button>
          </div>
        </aside>
      </div>

      {/* 배송수단 정보 모달 — 레거시 index.js getDelivery(real_delivery_type 3자리 코드 + 지역할증) */}
      {deliveryInfo && (() => {
        const d = deliveryInfo.delivery;
        const dt = d.delivery_type ?? 0;
        // 3자리 코드: 1자리=수단, 2자리=배송비유형(1무료/2조건부무료/3유료), 3자리=결제(0무료/1선불/2착불)
        const feeDigit = Math.floor((dt % 100) / 10);
        const payDigit = dt % 10;
        const isParcel = (d.method ?? 1) === 1;
        const feeType = !isParcel ? ""
          : feeDigit === 1 ? "무료배송"
          : feeDigit === 2 ? "조건부 무료배송"
          : feeDigit === 3 ? "유료배송"
          : "";
        const isLater = payDigit === 2;
        const basic = d.basic_price ?? 0;
        const area1 = d.area1_price ?? 0;
        const area2 = d.area2_price ?? 0;
        const free = d.free_price ?? 0;
        const basicText = feeDigit === 1
          ? (payDigit === 1 ? `${won(basic)} (추가 배송비 발생 시 선불)` : payDigit === 2 ? `${won(basic)} (추가 배송비 발생 시 착불)` : won(basic))
          : feeDigit === 2
          ? (payDigit === 2 ? `${won(basic)} (무료배송 조건 미달 시 배송비 착불, 예상금액)` : `${won(basic)} (무료배송 조건 미달 시 배송비 선불)`)
          : (payDigit === 2 ? `${won(basic)} (착불, 예상금액)` : `${won(basic)} (선불)`);
        // 제주·도서산간 할증 및 무게/구간/반복 추가배송비는 «택배»에만 적용된다(레거시 guide — 퀵/직접/방문/해외 제외).
        const extras: string[] = [];
        if (isParcel) {
          if (area1 > 0) extras.push(`제주지역: +${won(area1)} 추가${isLater ? " (예상금액)" : ""}`);
          if (area2 > 0) extras.push(`도서산간: +${won(area2)} 추가${isLater ? " (예상금액)" : ""}`);
          const ec = d.extra_charge ?? 0;
          if (ec === 1 && (d.weight ?? 0) > 0) extras.push(`※ 상품/수량 합계 ${d.weight}Kg 단위 전체 배송비 반복 부과`);
          if (ec === 2) extras.push(`※ ${(d.range2_from ?? 0) + 1}개 이상 구매 시 추가 배송비 ${won(d.range2_price ?? 0)}`);
          if (ec === 3) { extras.push(`※ ${(d.range2_from ?? 0) + 1}~${d.range3_from ?? 0}개까지 추가 배송비 ${won(d.range2_price ?? 0)}`); extras.push(`※ ${(d.range3_from ?? 0) + 1}개 이상 구매 시 추가 배송비 ${won(d.range3_price ?? 0)}`); }
          if (ec === 9) extras.push(`※ 상품/수량 합계 ${d.repeat_quantity ?? 0}개마다 기본 배송비 반복 부과`);
        }
        // 미배송(0)=이용안내만, 해외직구(2)=상단에 해외직구 카드(상품페이지와 동일).
        const du = d.delivery_use ?? 1;
        const isNothing = du === 0 || dt === 0;
        const overseas = du === 2 ? d.overseas : null;
        const omd = overseas?.date ? overseas.date.split("-") : null; // [Y,M,D]
        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setDeliveryInfo(null)}>
            <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <p className="text-base font-bold text-text">{isNothing ? "이용안내" : `${d.method_name || "택배"} 배송안내`}</p>
                <button type="button" onClick={() => setDeliveryInfo(null)} className="cursor-pointer text-sub hover:text-text" aria-label="닫기">✕</button>
              </div>

              {/* 해외직구 상품 안내(레거시 getOverseas) — 모달 상단, 상품페이지 카드와 동일 구성 */}
              {overseas && (
                <div className="mt-4 rounded-lg border border-line bg-surface/40 p-4">
                  <p className="text-[15px] font-bold text-text">해외직구 상품</p>
                  <p className="mt-0.5 text-[12px] text-sub">해외에서 국내로 배송되는 상품입니다.</p>
                  <dl className="mt-2.5 space-y-1.5 text-[13px]">
                    {overseas.country ? <div className="flex justify-between gap-3"><dt className="shrink-0 text-sub">배송국가</dt><dd className="text-right text-text">{overseas.country}</dd></div> : null}
                    {overseas.day > 0 && <div className="flex justify-between gap-3"><dt className="shrink-0 text-sub">배송기간</dt><dd className="text-right text-text">약 {overseas.day}일 소요 예정{omd ? ` (${Number(omd[1])}월 ${Number(omd[2])}일)` : ""}</dd></div>}
                    <div className="flex justify-between gap-3"><dt className="shrink-0 text-sub">관부가세</dt><dd className="text-right text-text">{overseas.customs === 1 ? "포함" : "미포함"}{overseas.return_price > 0 ? ` / 반품 배송비 ${won(overseas.return_price)}` : ""}</dd></div>
                  </dl>
                </div>
              )}

              {isNothing ? (
                /* 미배송 — 배송비 카드는 숨기고, 타이틀=nothing_guide / 본문=nothing_detail */
                <div className="mt-4 rounded-lg border border-line bg-surface/40 p-4">
                  <p className="text-[15px] font-bold text-text">{d.guide || "이용안내"}</p>
                  {d.guide_detail ? <p className="mt-1.5 whitespace-pre-line text-[13px] text-sub">{d.guide_detail}</p> : null}
                </div>
              ) : (
              <>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-sub">공급자</dt><dd className="font-medium text-text">{deliveryInfo.supplier.title || "기본 배송"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-sub">배송수단</dt><dd className="font-medium text-text">{d.method_name || "택배"}</dd>
                </div>
                {isParcel && d.parcel_title && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-sub">택배사</dt><dd className="font-medium text-text">{d.parcel_title}</dd>
                  </div>
                )}
                {feeType && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-sub">배송비 유형</dt><dd className="font-medium text-text">{feeType}{isLater ? " (착불)" : ""}</dd>
                  </div>
                )}
                {isParcel && basic > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="shrink-0 text-sub">기본 배송비</dt><dd className="text-right font-medium text-text">{basicText}</dd>
                  </div>
                )}
                {free > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-sub">무료배송 조건</dt><dd className="font-medium text-text">{won(free)} 이상 구매</dd>
                  </div>
                )}
                {dt !== 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-sub">현재 배송비</dt>
                    <dd className="font-medium text-text">
                      {(() => {
                        // 3자리 코드 기준(착불→"착불", 무료→무료배송, 유료→금액). fee=0 을 무료로 오판하지 않는다.
                        const st = deliveryFeeStatus(dt, deliveryInfo.shipping_fee);
                        if (st === "무료배송") return <span className="text-accent">무료배송</span>;
                        if (st === "착불") return "착불";
                        return deliveryInfo.shipping_fee > 0 ? won(deliveryInfo.shipping_fee) : (st || "무료");
                      })()}
                    </dd>
                  </div>
                )}
              </dl>

              {extras.length > 0 && (
                <div className="mt-4 rounded-md border border-line bg-surface/50 p-3">
                  <p className="text-[13px] font-semibold text-text">추가 배송비</p>
                  <ul className="mt-1.5 space-y-1 text-[12px] text-sub">
                    {extras.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}

              {isLater && (
                <p className="mt-3 text-[12px] leading-relaxed text-sub">※ 착불 배송 상품은 지역 사정에 따라 배송비가 상이할 수 있습니다.</p>
              )}
              <p className="mt-2 text-[12px] leading-relaxed text-sub">
                장바구니 배송비는 기본 지역 기준 예상금액이며, 제주·도서산간은 주문서(배송지 입력) 단계에서 확정됩니다. 배송비는 배송그룹(공급자·배송수단) 단위로 합산됩니다.
              </p>
              </>
              )}
              <button type="button" onClick={() => setDeliveryInfo(null)}
                className="mt-4 h-10 w-full cursor-pointer rounded-md border border-line text-sm font-medium text-text hover:bg-surface">닫기</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// 품목 = 주문옵션 1라인 + 추가옵션(중첩). 레거시 cart row + row.addoption[] 대응.
function CartItemRow({ it, checked, onToggle, onBuy, busy }: {
  it: CartGroupItem;
  checked: boolean;
  onToggle: () => void;
  onBuy: () => void;
  busy: boolean;
}) {
  // 수량 직접 입력 — 로컬 상태로 타이핑, 확정(blur/Enter) 시 서버 반영. 외부(±/삭제) 변경은 동기화.
  const [qv, setQv] = useState(String(it.qty));
  useEffect(() => { setQv(String(it.qty)); }, [it.qty]);
  function commitQty() {
    const n = Math.max(1, Number(qv.replace(/[^0-9]/g, "")) || 1);
    setQv(String(n));
    if (n !== it.qty) setCartQty(it.line_key, n);
  }
  // 가격 표시(판매가 + 취소선 정가) — 모바일/데스크톱 두 곳에서 재사용
  const priceBlock = () => (
    <div className="text-right leading-tight">
      <span className="block text-[15px] font-bold text-text">{won(it.item_total)}</span>
      {(it.original ?? 0) > it.item_total && (
        <span className="block text-[12px] text-sub line-through">{won(it.original!)}</span>
      )}
    </div>
  );
  // 즉시구매 버튼(단독) — 모바일 full-width
  const buyButton = (extra: string) => (
    <button
      type="button"
      onClick={onBuy}
      disabled={busy || it.soldout === 1}
      className={`rounded-md border border-accent px-4 py-2 text-[13px] font-bold text-accent transition-colors hover:bg-accent/5 disabled:cursor-not-allowed disabled:border-line disabled:text-sub ${extra}`}
    >
      즉시구매
    </button>
  );

  return (
    <li className="relative px-3 py-4 sm:px-4">
      {/* 삭제 — 품목 우측 상단 절대배치 */}
      <button type="button" onClick={() => removeFromCart(it.line_key)} aria-label="삭제"
        className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full text-sub hover:bg-surface hover:text-sale">✕</button>
      <div className="flex gap-3 sm:gap-4">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label="선택주문 대상 선택"
          className="mt-1 h-4 w-4 shrink-0 accent-accent"
        />
        <Link href={`/products/${it.products_id}`} className="shrink-0">
          {it.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.thumb} alt="" className="h-20 w-20 rounded-lg object-cover sm:h-24 sm:w-24" />
          ) : (
            <div className="h-20 w-20 rounded-lg bg-surface sm:h-24 sm:w-24" />
          )}
        </Link>

        {/* 본문 — 레거시: 옵션상품은 상품페이지명(tit1) + 옵션명(tit2), 단일상품은 옵션명만 */}
        <div className="min-w-0 flex-1">
          {(it.option_type ?? 0) > 0 ? (
            <>
              <Link href={`/products/${it.products_id}`} className="line-clamp-2 pr-7 text-sm font-semibold text-text hover:text-accent">{it.title}</Link>
              {it.option_label && <p className="mt-0.5 text-[13px] text-sub">{it.option_label}</p>}
            </>
          ) : (
            <Link href={`/products/${it.products_id}`} className="line-clamp-2 pr-7 text-sm font-semibold text-text hover:text-accent">{it.option_label || it.title}</Link>
          )}
          {it.soldout ? <p className="mt-1 text-[12px] font-semibold text-sale">품절</p> : null}

          {/* 추가옵션(중첩) — 레거시 표기: 「{옵션명} : {선택값} ({가격} / {수량}개)」 */}
          {it.addoptions.length > 0 && (
            <div className="mt-1.5 text-[12px] text-sub">
              <p className="font-medium text-text/70">추가옵션</p>
              <ul className="mt-0.5 space-y-0.5">
                {it.addoptions.map((a, i) => {
                  const paren: string[] = [];
                  if (a.line_total) paren.push(won(a.line_total));
                  if (a.qty > 1) paren.push(`${a.qty}개`);
                  const suffix = paren.length ? ` (${paren.join(" / ")})` : "";
                  return (
                    <li key={`${a.line_key}-${i}`} className="truncate">
                      {a.title} : {a.option_label}{suffix}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* 수량 + (모바일 전용 가격) */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="inline-flex items-center rounded-md border border-line">
              <button type="button" onClick={() => setCartQty(it.line_key, it.qty - 1)} className="grid h-8 w-8 place-items-center text-text hover:bg-surface">−</button>
              <input
                value={qv}
                inputMode="numeric"
                aria-label="수량"
                onChange={(e) => setQv(e.target.value.replace(/[^0-9]/g, ""))}
                onBlur={commitQty}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className="h-8 w-12 border-x border-line bg-transparent text-center text-sm text-text outline-none"
              />
              <button type="button" onClick={() => setCartQty(it.line_key, it.qty + 1)} className="grid h-8 w-8 place-items-center text-text hover:bg-surface">+</button>
            </div>
            <div className="sm:hidden">{priceBlock()}</div>
          </div>
        </div>

        {/* 데스크톱: 가격 셀 — 세로선은 pseudo 로 li 상하 패딩까지 닿게(-inset-y-4) */}
        <div className="relative hidden shrink-0 flex-col items-end justify-center self-stretch pl-4 before:absolute before:left-0 before:-inset-y-4 before:w-px before:bg-line sm:flex sm:w-28">
          {priceBlock()}
        </div>

        {/* 데스크톱: 즉시구매 단독 우측 — 가격과 사이에 세로선(pseudo, 상하 패딩까지) */}
        <div className="relative hidden shrink-0 items-center pl-4 before:absolute before:left-0 before:-inset-y-4 before:w-px before:bg-line sm:flex">
          {buyButton("")}
        </div>
      </div>

      {/* 모바일: 즉시구매 단독(가로 전체) */}
      <div className="mt-3 sm:hidden">
        {buyButton("w-full")}
      </div>
    </li>
  );
}

// 금액 표기 — 끝의 "원"은 굵게 제외하고 숫자와 사이에 여백을 준다.
function WonText({ s }: { s: string }) {
  if (s.endsWith("원")) return <>{s.slice(0, -1)}<span className="ml-0.5 text-[0.75em] font-normal">원</span></>;
  return <>{s}</>;
}

function Row({ k, v, sale }: { k: string; v: string; sale?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-sub">{k}</dt>
      <dd className={`font-bold ${sale ? "text-sale" : "text-text"}`}><WonText s={v} /></dd>
    </div>
  );
}
