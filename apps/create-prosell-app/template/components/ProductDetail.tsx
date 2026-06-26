"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { won } from "@/lib/format";
import type { ProductView, ProductViewOption, Addoption } from "@/lib/prosell";
import { addToCart, isWished, toggleWish, type AddItem } from "@/lib/cart";

// 선택 라인 — 상품옵션(opt)과 추가옵션(addo)을 통일된 형태로 누적(둘 다 "추가"된다).
type Line = { key: string; label: string; price: number; qty: number; kind: "opt" | "addo"; refId: number };

export default function ProductDetail({ pv, addoptions = [] }: { pv: ProductView; addoptions?: Addoption[] }) {
  const router = useRouter();
  const levels = Math.min(3, Math.max(0, pv.option_type));
  const hasOptions = levels >= 1 && pv.options.length > 0;

  const [img, setImg] = useState(0);
  const gallery = pv.gallery.length ? pv.gallery : [{ src: "", thumb: "" }];

  const [sel, setSel] = useState<(string | null)[]>([null, null, null]);
  const [addoKey, setAddoKey] = useState<Record<number, string>>({}); // 셀렉트 표시값(추가 후 리셋)
  const [requestText, setRequestText] = useState("");
  const [wished, setWished] = useState(false);
  const [showDelivery, setShowDelivery] = useState(false);
  const [showCards, setShowCards] = useState(false);

  const single: ProductViewOption = pv.options[0] ?? {
    id: pv.id, label: pv.title ?? "", o1: null, o2: null, o3: null,
    price: pv.price.original, sale_price: pv.price.sale, stock: 9999, soldout: pv.soldout,
  };
  // 주문옵션 라벨: 옵션명(option_titles) + 선택값 → "품목: 바나나맛 / 사이즈: M". 기존 스킨의 long_title 형태.
  const optLabel = (o: ProductViewOption): string => {
    const vals = [o.o1, o.o2, o.o3];
    const parts = pv.option_titles
      .map((t, i) => (vals[i] != null && vals[i] !== "" ? (t ? `${t}: ${vals[i]}` : String(vals[i])) : null))
      .filter(Boolean) as string[];
    return parts.length ? parts.join(" / ") : (o.label || pv.title || "");
  };
  // 주문옵션이 없으면 기본 1개 라인을 초기값으로 둔다(SSR·CSR 동일 → 새로고침 깜빡임 방지).
  const [lines, setLines] = useState<Line[]>(() =>
    hasOptions ? [] : [{ key: `o-${single.id}`, label: optLabel(single), price: single.sale_price, qty: 1, kind: "opt", refId: single.id }]
  );
  useEffect(() => setWished(isWished(pv.id)), [pv.id]);

  // 라인 추가(있으면 수량 +1) — "교체"가 아니라 "누적"
  const addLine = (l: Omit<Line, "qty">) =>
    setLines((cur) => {
      const ex = cur.find((x) => x.key === l.key);
      return ex ? cur.map((x) => (x.key === l.key ? { ...x, qty: x.qty + 1 } : x)) : [...cur, { ...l, qty: 1 }];
    });
  const setQty = (key: string, qty: number) => setLines((cur) => cur.map((l) => (l.key === key ? { ...l, qty: Math.max(1, qty) } : l)));
  const removeLine = (key: string) => setLines((cur) => cur.filter((l) => l.key !== key));

  // 상품옵션 선택
  const choicesAt = (level: number): { value: string; soldout: boolean }[] => {
    const prev = sel.slice(0, level);
    const matched = pv.options.filter((o) => prev.every((v, i) => v == null || [o.o1, o.o2, o.o3][i] === v));
    const seen = new Map<string, boolean>();
    for (const o of matched) {
      const v = [o.o1, o.o2, o.o3][level];
      if (v == null || v === "") continue;
      seen.set(v, (seen.has(v) ? seen.get(v)! : true) && o.soldout === 1);
    }
    return [...seen.entries()].map(([value, soldout]) => ({ value, soldout }));
  };
  const pickLevel = (level: number, value: string) => {
    const next = [...sel];
    next[level] = value || null;
    for (let i = level + 1; i < 3; i++) next[i] = null;
    setSel(next);
    if (level === levels - 1 && value) {
      const leaf = pv.options.find((o) => [o.o1, o.o2, o.o3].slice(0, levels).every((ov, i) => ov === next[i]));
      if (leaf && leaf.soldout !== 1) {
        addLine({ key: `o-${leaf.id}`, label: optLabel(leaf), price: leaf.sale_price, kind: "opt", refId: leaf.id });
        setSel([null, null, null]);
      }
    }
  };

  // 추가옵션 선택 → 라인 "추가" 후 셀렉트 리셋(동일/다른 옵션 계속 추가 가능)
  const pickAddo = (ao: Addoption, idxStr: string) => {
    if (idxStr === "") return;
    const idx = Number(idxStr);
    const o = ao.options[idx];
    if (o) addLine({ key: `a-${ao.id}-${idx}`, label: `${ao.title}: ${o.name}`, price: o.price, kind: "addo", refId: ao.id });
    setAddoKey((s) => ({ ...s, [ao.id]: "" })); // 리셋
  };

  const productLines = lines.filter((l) => l.kind === "opt");
  const addoLines = lines.filter((l) => l.kind === "addo");
  const reqMissing = addoptions.some((a) => a.req_type === 1 && !lines.some((l) => l.kind === "addo" && l.refId === a.id));
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const totalQty = productLines.reduce((s, l) => s + l.qty, 0);
  const canBuy = productLines.length > 0 && pv.soldout !== 1 && !reqMissing;

  const toCartItems = (): AddItem[] => {
    return lines.map((l) => ({
      line_key: `${pv.id}:${l.key}`,
      products_id: pv.id,
      product_id: l.kind === "opt" ? l.refId : 0,
      kind: l.kind === "opt" ? "opt" : "addo",
      title: pv.title ?? "",
      label: l.label,
      price: l.price,
      quantity: l.qty,
    }));
  };
  const [busy, setBusy] = useState(false);
  const onAddCart = async () => {
    if (!canBuy || busy) return;
    setBusy(true);
    const ok = await addToCart(toCartItems());
    setBusy(false);
    alert(ok ? "장바구니에 담았습니다." : "장바구니 담기에 실패했습니다.");
  };
  const onBuyNow = async () => {
    if (!canBuy || busy) return;
    setBusy(true);
    // 바로구매: 장바구니를 건드리지 않고 서버가 해당 품목만으로 주문 세션(oid) 발행
    try {
      const items = toCartItems().map((c) => ({ line_key: c.line_key, products_id: c.products_id, product_id: c.product_id, kind: c.kind, quantity: c.quantity }));
      const res = await fetch("/api/order/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      const j = await res.json().catch(() => null);
      setBusy(false);
      if (j?.ok && j.oid) router.push(`/order/${j.oid}?src=buynow`);
      else alert(j?.error || "주문서 생성에 실패했습니다.");
    } catch { setBusy(false); alert("주문 요청 중 오류가 발생했습니다."); }
  };
  const onWish = () => setWished(toggleWish(pv.id));

  const discount = pv.price.discount_percent;
  const ranged = pv.price.sale_high > pv.price.sale;
  const labelCls = "text-[13px] font-semibold text-text";
  const infoBtnCls = "grid h-[18px] w-[18px] shrink-0 cursor-pointer place-items-center rounded-full bg-sub text-[11px] font-bold leading-none text-white hover:bg-accent";
  const bulk = pv.bulk_discount;
  const bulkUnit = (v: number) => (bulk?.unit === "rate" ? `${v}%` : won(v));
  const bulkBase = (r: number) => (bulk?.type === "quantity" ? `${r}개 이상` : `${won(r)} 이상`);

  const renderLine = (l: Line) => (
    <li key={l.key} className="rounded-md bg-card p-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-text">{l.label}</span>
        {(hasOptions || l.kind === "addo") && <button type="button" onClick={() => removeLine(l.key)} aria-label="삭제" className="text-sub hover:text-sale">✕</button>}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="inline-flex items-center rounded-md border border-line bg-bg">
          <button type="button" onClick={() => setQty(l.key, l.qty - 1)} className="grid h-8 w-8 place-items-center text-text">−</button>
          <input value={l.qty} onChange={(e) => setQty(l.key, parseInt(e.target.value) || 1)} inputMode="numeric"
            className="h-8 w-10 border-x border-line bg-bg text-center text-sm text-text outline-none" />
          <button type="button" onClick={() => setQty(l.key, l.qty + 1)} className="grid h-8 w-8 place-items-center text-text">+</button>
        </div>
        <span className="font-bold text-text">{won(l.price * l.qty)}</span>
      </div>
    </li>
  );

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* 갤러리 */}
      <div>
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          {gallery[img]?.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={gallery[img].src} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <div className="grid aspect-square w-full place-items-center text-sub">이미지 없음</div>
          )}
        </div>
        {gallery.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {gallery.map((gimg, i) => (
              <button key={i} type="button" onClick={() => setImg(i)} className={`h-16 w-16 overflow-hidden rounded-md border ${i === img ? "border-accent" : "border-line"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gimg.thumb || gimg.src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 정보 + 구매 */}
      <div>
        <h1 className="text-2xl font-bold leading-snug text-text">{pv.title}</h1>
        {pv.summary ? <p className="mt-1.5 text-sm text-sub">{pv.summary}</p> : null}

        {pv.report.review_cnt > 0 && (
          <div className="mt-2 flex items-center gap-1 text-sm">
            <span className="text-[#f5a623]">★</span>
            <span className="font-semibold text-text">{pv.report.review_score.toFixed(1)}</span>
            <span className="text-sub">리뷰 {pv.report.review_cnt.toLocaleString("ko-KR")}</span>
          </div>
        )}

        {/* 가격 */}
        <div className="mt-4 border-t border-line pt-4">
          {discount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-sale">{discount}%</span>
              <span className="text-sm text-sub line-through">{won(pv.price.original)}</span>
            </div>
          )}
          <div className="mt-0.5 text-[26px] font-extrabold text-text">
            {won(pv.price.sale)}{ranged ? <span className="text-base font-normal text-sub"> ~ {won(pv.price.sale_high)}</span> : null}
          </div>
        </div>

        {/* 구매혜택 (배송비 포함, 동일 패턴) */}
        <dl className="mt-3 space-y-1.5 border-y border-line py-3 text-[13px]">
          <Benefit k="배송비">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-text">{pv.delivery.fee > 0 ? won(pv.delivery.fee) : "무료배송"}</span>
              {pv.delivery.free_over > 0 ? <span className="text-sub">· {won(pv.delivery.free_over)} 이상 무료</span> : null}
              <button type="button" onClick={() => setShowDelivery(true)} aria-label="배송정보" className={infoBtnCls}>?</button>
            </span>
          </Benefit>
          {pv.card_benefits.length > 0 && (
            <Benefit k="무이자">
              <span className="inline-flex items-center gap-1.5">
                <span className="text-text">카드사별 무이자 할부</span>
                <button type="button" onClick={() => setShowCards(true)} aria-label="무이자 할부 안내" className={infoBtnCls}>?</button>
              </span>
            </Benefit>
          )}
          {pv.price.point > 0 && <Benefit k="적립금">구매 시 <b className="text-text">{won(pv.price.point)}</b> 적립</Benefit>}
          {pv.price.coupon === 1 && <Benefit k="쿠폰">쿠폰 사용 가능 상품</Benefit>}
          {bulk && bulk.tiers.length > 0 && (
            <Benefit k="대량구매">
              <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                {bulk.tiers.map((t, i) => (
                  <span key={i} className="text-text">{bulkBase(t.range)} <b>{bulkUnit(t.value)}</b> 할인</span>
                ))}
              </span>
            </Benefit>
          )}
        </dl>

        {pv.soldout === 1 ? (
          <p className="mt-4 rounded-md bg-bg p-3 text-center text-sm font-semibold text-sale">품절된 상품입니다.</p>
        ) : (
          <>
            {/* 상품옵션 */}
            {hasOptions && (
              <div className="mt-4 space-y-3">
                <p className={labelCls}>주문옵션</p>
                {Array.from({ length: levels }).map((_, level) => {
                  const enabled = level === 0 || sel[level - 1] != null;
                  return (
                    <select key={level} value={sel[level] ?? ""} disabled={!enabled} onChange={(e) => pickLevel(level, e.target.value)}
                      className="h-11 w-full cursor-pointer rounded-md border border-line bg-card px-3 text-sm text-text outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50">
                      <option value="">{pv.option_titles[level] || `옵션 ${level + 1}`} 선택</option>
                      {choicesAt(level).map((c) => (
                        <option key={c.value} value={c.value} disabled={c.soldout}>{c.value}{c.soldout ? " (품절)" : ""}</option>
                      ))}
                    </select>
                  );
                })}
              </div>
            )}

            {/* 추가 주문옵션 — 선택 시 라인 추가 */}
            {addoptions.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className={labelCls}>추가 주문옵션</p>
                {addoptions.map((ao) => (
                  <select key={ao.id} value={addoKey[ao.id] ?? ""} onChange={(e) => pickAddo(ao, e.target.value)}
                    className="h-11 w-full cursor-pointer rounded-md border border-line bg-card px-3 text-sm text-text outline-none focus:border-accent">
                    <option value="">{ao.title}{ao.req_type === 1 ? " (필수)" : ""} 선택</option>
                    {ao.options.map((o, i) => (
                      <option key={i} value={i}>{o.name}{o.price > 0 ? ` (+${won(o.price)})` : ""}</option>
                    ))}
                  </select>
                ))}
              </div>
            )}

            {/* 선택된 상품 — 주문옵션 그룹 → 추가옵션 그룹 순 */}
            {productLines.length > 0 && (
              <div className="mt-4">
                {hasOptions && <p className={`mb-2 ${labelCls}`}>주문옵션</p>}
                <ul className="space-y-2">{productLines.map(renderLine)}</ul>
              </div>
            )}
            {addoLines.length > 0 && (
              <div className="mt-4">
                <p className={labelCls}>추가옵션</p>
                <ul className="mt-2 space-y-2">{addoLines.map(renderLine)}</ul>
              </div>
            )}

            {/* 요청사항 안내 — 총 수량 위쪽 */}
            {pv.request.use === 1 && (
              <div className="mt-4">
                <p className={labelCls}>요청사항{pv.request.required === 1 ? <span className="text-sale"> *</span> : null}</p>
                {pv.request.text ? <p className="mt-1 whitespace-pre-line text-[13px] text-sub">{pv.request.text}</p> : null}
                <textarea value={requestText} onChange={(e) => setRequestText(e.target.value)} rows={2} placeholder="요청사항을 입력해 주세요."
                  className="mt-2 w-full resize-none rounded-md border border-line bg-card p-3 text-sm text-text outline-none focus:border-accent" />
              </div>
            )}

            {/* 합계 */}
            {lines.length > 0 && (
              <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
                <span className="text-sm text-sub">총 수량 {totalQty}개</span>
                <span className="text-sm text-sub">합계 <b className="text-xl text-text">{won(total)}</b></span>
              </div>
            )}

            {reqMissing && <p className="mt-2 text-[13px] text-sale">필수 추가옵션을 선택해 주세요.</p>}

            {/* 버튼 */}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={onWish} aria-label="관심상품"
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-md border ${wished ? "border-sale text-sale" : "border-line text-sub"} hover:border-accent`}>
                {wished ? "♥" : "♡"}
              </button>
              <button type="button" onClick={onAddCart} disabled={!canBuy || busy}
                className="h-12 flex-1 cursor-pointer rounded-md border border-accent bg-card text-sm font-bold text-accent hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50">장바구니</button>
              <button type="button" onClick={onBuyNow} disabled={!canBuy || busy}
                className="h-12 flex-[1.4] cursor-pointer rounded-md border-0 bg-accent text-sm font-bold text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">바로구매</button>
            </div>
          </>
        )}
      </div>

      {/* 배송정보 모달 */}
      {showDelivery && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="배송정보">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDelivery(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text">배송정보</h2>
              <button type="button" onClick={() => setShowDelivery(false)} aria-label="닫기" className="grid h-8 w-8 place-items-center rounded-full text-text hover:bg-line">✕</button>
            </div>
            <dl className="mt-4 space-y-2.5 text-sm">
              <Row k="배송방법" v={pv.delivery.parcel_type ? "택배" : "배송"} />
              <Row k="기본 배송비" v={pv.delivery.fee > 0 ? won(pv.delivery.fee) : "무료"} />
              {pv.delivery.free_over > 0 && <Row k="무료배송" v={`${won(pv.delivery.free_over)} 이상 구매 시`} />}
              {pv.delivery.area1_price > 0 && <Row k="지역 추가" v={`도서·산간 +${won(pv.delivery.area1_price)}`} />}
              {pv.delivery.area2_price > 0 && <Row k="제주 추가" v={`+${won(pv.delivery.area2_price)}`} />}
              <Row k="묶음배송" v={pv.delivery.bundle === 0 ? "가능" : "불가"} />
            </dl>
            {pv.delivery.guide ? <p className="mt-3 whitespace-pre-line text-[13px] text-sub">{pv.delivery.guide}</p> : null}
            <p className="mt-4 text-[12px] text-sub">상품 수령 후 7일 이내 교환·반품이 가능합니다.</p>
          </div>
        </div>
      )}

      {/* 카드사별 무이자 할부 모달 */}
      {showCards && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="무이자 할부">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCards(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text">카드사별 무이자 할부</h2>
              <button type="button" onClick={() => setShowCards(false)} aria-label="닫기" className="grid h-8 w-8 place-items-center rounded-full text-text hover:bg-line">✕</button>
            </div>
            <ul className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto text-sm">
              {pv.card_benefits.map((c, i) => (
                <li key={i} className="flex justify-between gap-4 border-b border-line pb-2 last:border-0">
                  <span className="shrink-0 font-medium text-text">{c.card}</span>
                  <span className="text-right text-sub">{c.months}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[12px] text-sub">* 법인·체크·기프트카드 및 일부 가맹점은 제외됩니다. 타 혜택과 중복 적용되지 않을 수 있습니다.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Benefit({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 text-sub">{k}</dt>
      <dd className="min-w-0 flex-1 text-text">{children}</dd>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-sub">{k}</dt>
      <dd className="text-right text-text">{v}</dd>
    </div>
  );
}
