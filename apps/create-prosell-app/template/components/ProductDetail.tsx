"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { won } from "@/lib/format";
import type { ProductView, ProductViewOption, Addoption, ProductCoupon } from "@/lib/prosell";
import { addToCart, type AddItem } from "@/lib/cart";
import { toast } from "@/lib/toast";
import CartAddedModal from "./CartAddedModal";
import RestockModal from "./RestockModal";
import LazyImg from "./LazyImg";

// 선택 라인 — 상품옵션(opt)과 추가옵션(addo)을 통일된 형태로 누적(둘 다 "추가"된다).
// opt 라인은 레거시 leaf row 의 수량 제한/재고/묶음을 함께 실어 수량 가드에 사용한다.
type Line = {
  key: string; label: string; price: number; qty: number; kind: "opt" | "addo"; refId: number;
  stock?: number; qmin?: number; qmax?: number; bundle?: number;
  req?: string; // 요청사항 각각입력(request.group=0) 시 옵션 라인별 요청값
  up?: Record<number, { id: number; name: string }>; // 파일접수 각각(upload_group=0) 시 라인별 업로드(항목 index→파일)
};

// 남은 초 → "D일 HH:MM:SS" (일이 0이면 HH:MM:SS). 레거시 sale_dday 표기와 동일 개념.
function countdown(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return (d > 0 ? `${d}일 ` : "") + `${p2(h)}:${p2(m)}:${p2(s)}`;
}

export default function ProductDetail({ pv, addoptions = [], coupons = [], wished: initialWished = false, loggedIn = false, reviewSummary }: { pv: ProductView; addoptions?: Addoption[]; coupons?: ProductCoupon[]; wished?: boolean; loggedIn?: boolean; reviewSummary?: { count: number; average: number } }) {
  const router = useRouter();
  // 로그인 회원은 서버 관심상품(계정 보관함)과 동기화, 비회원은 로컬 저장(localStorage) 폴백.
  // loggedIn 은 서버(products page)가 토큰 유무로 판정해 내려준다(pv.state.logged_in 은 가격노출 게이트라 신뢰 불가).
  const wishLoggedIn = loggedIn;
  // 타임세일 카운트다운(레거시 sale_dday) — 서버가 준 remain_sec 를 로컬로 1초씩 감소. 0 도달 시 새로고침(세일가/타이머 갱신).
  const tsActive = pv.timesale?.active === 1 && (pv.timesale?.remain_sec ?? 0) > 0;
  const [remain, setRemain] = useState(pv.timesale?.remain_sec ?? 0);
  useEffect(() => {
    if (!tsActive) return;
    setRemain(pv.timesale!.remain_sec);
    const t = setInterval(() => setRemain((s) => {
      if (s <= 1) { clearInterval(t); router.refresh(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [tsActive, pv.timesale?.remain_sec, router]);
  // 다운로드 쿠폰 상태(발급됨/진행중)
  const [couponDone, setCouponDone] = useState<Record<number, boolean>>({});
  const [couponBusy, setCouponBusy] = useState<number | null>(null);
  async function downloadCoupon(id: number) {
    if (couponBusy !== null || couponDone[id]) return;
    setCouponBusy(id);
    try {
      const r = await fetch("/api/products/coupon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coupon_id: id }) });
      const j = await r.json().catch(() => null);
      if (j?.ok) setCouponDone((p) => ({ ...p, [id]: true }));
      else alert(j?.error || "쿠폰을 받지 못했습니다.");
    } catch { alert("통신 오류가 발생했습니다."); }
    finally { setCouponBusy(null); }
  }
  function couponBenefit(c: ProductCoupon) {
    const base = c.discount_type === 2
      ? `${c.discount_percent}% 할인${c.discount_max_price > 0 ? ` (최대 ${won(c.discount_max_price)})` : ""}`
      : `${won(c.discount_price)} 할인`;
    return base + (c.discount_terms_price > 0 ? ` · ${won(c.discount_terms_price)} 이상` : "");
  }
  // 쿠폰 1장을 판매가에 적용했을 때의 할인액(최소주문금액 미달이면 0). 정률은 최대할인 상한 반영.
  function couponDiscount(c: ProductCoupon, base: number) {
    if (base <= 0) return 0;
    if (c.discount_terms_price > 0 && base < c.discount_terms_price) return 0;
    if (c.discount_type === 2) {
      let d = Math.floor((base * c.discount_percent) / 100);
      if (c.discount_max_price > 0) d = Math.min(d, c.discount_max_price);
      return d;
    }
    return Math.min(c.discount_price, base);
  }
  // 받을 수 있는 쿠폰 중 «최대 할인» 1장 기준 «나의 할인가».
  const bestCouponDiscount = coupons.reduce((m, c) => Math.max(m, couponDiscount(c, pv.price.sale)), 0);
  const myPrice = Math.max(0, pv.price.sale - bestCouponDiscount);
  // 1개로는 최소주문금액(조건) 미달이지만, 최소수량 이상 사면 조건 충족되는 쿠폰 → 그때의 «개당 단가»(가장 저렴한 것).
  const couponUnitDeal = (() => {
    const base = pv.price.sale;
    if (base <= 0) return null;
    let best: { qty: number; unit: number } | null = null;
    for (const c of coupons) {
      // 1개로 이미 조건 충족(=나의 할인가로 표시됨)은 제외.
      if (c.discount_terms_price <= base) continue;
      const qty = Math.ceil(c.discount_terms_price / base); // 조건 충족 최소 수량
      const total = base * qty;
      const d = couponDiscount(c, total);
      if (d <= 0) continue;
      const unit = Math.floor((total - d) / qty); // 할인 후 개당 단가
      if (!best || unit < best.unit) best = { qty, unit };
    }
    return best;
  })();
  const levels = Math.min(3, Math.max(0, pv.option_type));
  const hasOptions = levels >= 1 && pv.options.length > 0;

  const [img, setImg] = useState(0);
  const gallery = pv.gallery.length ? pv.gallery : [{ src: "", thumb: "" }];

  const [sel, setSel] = useState<(string | null)[]>([null, null, null]);
  const [addoKey, setAddoKey] = useState<Record<number, string>>({}); // 셀렉트 표시값(추가 후 리셋)
  const [requestText, setRequestText] = useState("");
  // 주문 파일접수: group=1(한 묶음) 공유 업로드 상태. 항목 index → 업로드 파일.
  const [groupUp, setGroupUp] = useState<Record<number, { id: number; name: string }>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null); // 업로드 진행중 표시
  const [wished, setWished] = useState(initialWished);
  const [showDelivery, setShowDelivery] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [showCoupons, setShowCoupons] = useState(false);
  const [showDeliverySelect, setShowDeliverySelect] = useState(false);
  // 우측 «떠다니는 사이드 주문패널» 포털 대상(페이지 Tabs 우측 슬롯). 헤더 옵션과 같은 상태를 공유해 자동 동기화.
  const [sideSlot, setSideSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setSideSlot(document.getElementById("pd-side-slot")); }, []);

  // 배송수단 선택지(레거시 PRODUCTS_DELIVERY 매핑) — parcel/courier/direct/visit/country_type 로 코드·라벨 생성.
  const deliveryOpts = useMemo<{ value: number; label: string }[]>(() => {
    const d = pv.delivery;
    const o: { value: number; label: string }[] = [];
    // delivery_use: 0=미배송, 1=배송, 2=해외직구. 미배송만 배송선택 없음.
    if (d.use === 0) { o.push({ value: 0, label: d.guide || "미배송 상품입니다." }); return o; }
    const p = d.parcel_type, c = d.courier_type, dir = d.direct_type, ct = d.country_type;
    if (p === 10) o.push({ value: 110, label: "택배 (무료배송)" });
    if (p === 11) o.push({ value: 111, label: "택배 (무료배송)" });
    if (p === 12) o.push({ value: 112, label: "택배 (무료배송)" });
    if (p === 21 || p === 23) o.push({ value: 121, label: `택배 (주문금액 ${won(d.free_over)} 이상 무료배송)` });
    if (p === 22 || p === 23) o.push({ value: 122, label: `택배 (주문금액 ${won(d.free_over)} 이상 무료배송)` });
    if (p === 31 || p === 33) o.push({ value: 131, label: `택배 (배송비 ${won(d.fee)} 선불)` });
    if (p === 32 || p === 33) o.push({ value: 132, label: "택배 (배송비 착불)" });
    if (d.night_use) o.push({ value: 731, label: d.night_price ? `당일배송 (배송비 ${won(d.night_price)} 선불)` : "당일배송 (무료배송)" });
    if (d.dawn_use) o.push({ value: 831, label: d.dawn_price ? `새벽배송 (배송비 ${won(d.dawn_price)} 선불)` : "새벽배송 (무료배송)" });
    if (c === 10) o.push({ value: 210, label: "퀵배송 (무료배송)" });
    else if (c === 31) o.push({ value: 231, label: "퀵배송 (배송비 선불)" });
    else if (c === 32) o.push({ value: 232, label: "퀵배송 (배송비 착불)" });
    if (dir === 10) o.push({ value: 310, label: "직접배송 (무료배송)" });
    else if (dir === 31) o.push({ value: 331, label: "직접배송 (배송비 선불)" });
    else if (dir === 32) o.push({ value: 332, label: "직접배송 (배송비 착불)" });
    if (d.visit_type) o.push({ value: 410, label: "방문수령" });
    if (ct === 10) o.push({ value: 510, label: "해외배송 (무료배송)" });
    else if (ct === 31) o.push({ value: 531, label: `해외배송 (배송비 ${won(d.country_price)} 선불)` });
    else if (ct === 32) o.push({ value: 532, label: "해외배송 (배송비 착불)" });
    else if (ct === 33) o.push({ value: 533, label: "해외배송 (상품 주문 후 배송비 2차 결제)" });
    return o;
  }, [pv]);
  const [deliveryType, setDeliveryType] = useState<number>(() => deliveryOpts[0]?.value ?? 0);

  const single: ProductViewOption = pv.options[0] ?? {
    id: pv.id, label: pv.title ?? "", o1: null, o2: null, o3: null,
    price: pv.price.original, sale_price: pv.price.sale, stock: 9999, soldout: pv.soldout,
    quantity_min: pv.quantity_min, quantity_max: pv.quantity_max, bundle: 0, onoff: 1,
  };
  // 합산수량 제한 모드(옵션 있음 + quantity_type=2): 옵션별 min/max 무시, 옵션 전체 합계로 min/max 적용(레거시 동일).
  const summed = pv.option_type > 0 && pv.quantity_type === 2;
  // 요청사항 각각입력(group=0)이면 옵션 라인마다, 한번(group=1)이면 단일 공유 입력.
  const reqEach = pv.request.use === 1 && pv.request.group === 0;
  // 주문 파일접수: 사용여부 / 각각(upload_group=0=옵션 라인마다) vs 한 묶음(=1). 항목 목록(제목·필수).
  const uploadUse = pv.request.upload_use === 1;
  const uploadEach = uploadUse && pv.request.upload_group === 0;
  const uploadItems = uploadUse ? pv.request.uploads : [];

  // 파일 업로드 → order_file id 반환. key 로 진행중 표시.
  async function doUpload(key: string, file: File): Promise<{ id: number; name: string } | null> {
    setUploadingKey(key);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("products_id", String(pv.id));
      const r = await fetch("/api/order/upload", { method: "POST", body: fd });
      const j = await r.json().catch(() => null);
      setUploadingKey(null);
      if (j?.ok && j.id) return { id: Number(j.id), name: String(j.name || file.name) };
      alert(j?.error || "파일 업로드에 실패했습니다.");
      return null;
    } catch { setUploadingKey(null); alert("파일 업로드 통신 오류가 발생했습니다."); return null; }
  }
  const setLineUp = (key: string, idx: number, v: { id: number; name: string } | null) =>
    setLines((cur) => cur.map((l) => {
      if (l.key !== key) return l;
      const up = { ...(l.up || {}) };
      if (v) up[idx] = v; else delete up[idx];
      return { ...l, up };
    }));
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
    hasOptions ? [] : [{
      key: `o-${single.id}`, label: optLabel(single), price: single.sale_price,
      qty: Math.max(1, single.quantity_min || 1), kind: "opt", refId: single.id,
      stock: single.stock, qmin: single.quantity_min, qmax: single.quantity_max, bundle: single.bundle,
    }]
  );
  // 관심상품 담김 상태는 서버가 내려준 initialWished 를 사용(회원). 비회원은 항상 빈 하트(클릭 시 로그인 유도).

  // 옵션 라인 수량 클램프(레거시 choicePlus/choiceQuantity 규칙):
  //  · 최소: 합산모드=1, 아니면 옵션 quantity_min(≥1)  · 재고: stock 초과 불가
  //  · 최대: 비합산이면 옵션 quantity_max, 합산이면 옵션 전체 합계 ≤ 상품 quantity_max
  const clampOptQty = (line: Line, desired: number, all: Line[]): { q: number; msg?: string } => {
    const qmin = summed ? 1 : Math.max(1, line.qmin || 1);
    let q = Math.max(qmin, Math.floor(desired) || qmin);
    let msg: string | undefined;
    if (line.stock != null && line.stock > 0 && q > line.stock) { q = line.stock; msg = `재고수량(${line.stock}개)을 초과할 수 없습니다.`; }
    if (!summed && line.qmax && line.qmax > 0 && q > line.qmax) { q = line.qmax; msg = `최대 구매수량은 ${line.qmax}개입니다.`; }
    if (summed && pv.quantity_max > 0) {
      const others = all.filter((l) => l.kind === "opt" && l.key !== line.key).reduce((s, l) => s + l.qty, 0);
      if (others + q > pv.quantity_max) { q = Math.max(qmin, pv.quantity_max - others); msg = `최대 ${pv.quantity_max}개까지 구매할 수 있습니다.`; }
    }
    return { q, msg };
  };

  // 라인 추가(있으면 수량 +1, 재고/최대 가드) — "교체"가 아니라 "누적"
  const addLine = (l: Omit<Line, "qty">) => {
    // 묶음불가(bundle=1) 상품은 추가옵션이 있는 상품에서 다른 라인과 함께 담을 수 없다(레거시 cart 026/027).
    // 새 상품이 묶음불가거나 기존에 묶음불가 라인이 있으면, 선택을 초기화하고 이 상품만 담는다.
    if (l.kind === "opt" && addoptions.length > 0 && lines.length > 0 && !lines.some((x) => x.key === l.key)) {
      const conflict = (l.bundle || 0) === 1 || lines.some((x) => x.kind === "opt" && (x.bundle || 0) === 1);
      if (conflict) {
        alert("묶음배송이 불가한 상품은 다른 상품·추가옵션과 함께 담을 수 없어 선택을 초기화합니다.");
        setAddoKey({});
        setLines([{ ...l, qty: summed ? 1 : Math.max(1, l.qmin || 1) }]);
        return;
      }
    }
    const ex = lines.find((x) => x.key === l.key);
    if (ex) {
      if (ex.kind === "opt") {
        const { q, msg } = clampOptQty(ex, ex.qty + 1, lines);
        if (q === ex.qty) { if (msg) alert(msg); return; }
        setLines((cur) => cur.map((x) => (x.key === l.key ? { ...x, qty: q } : x)));
      } else {
        setLines((cur) => cur.map((x) => (x.key === l.key ? { ...x, qty: x.qty + 1 } : x)));
      }
      return;
    }
    const initial = l.kind === "opt" ? (summed ? 1 : Math.max(1, l.qmin || 1)) : 1;
    setLines((cur) => [...cur, { ...l, qty: initial }]);
  };
  const setQty = (key: string, qty: number) => {
    const line = lines.find((l) => l.key === key);
    if (!line) return;
    if (line.kind !== "opt") { setLines((cur) => cur.map((l) => (l.key === key ? { ...l, qty: Math.max(1, Math.floor(qty) || 1) } : l))); return; }
    const { q, msg } = clampOptQty(line, qty, lines);
    if (msg) alert(msg);
    setLines((cur) => cur.map((l) => (l.key === key ? { ...l, qty: q } : l)));
  };
  const setLineReq = (key: string, v: string) => setLines((cur) => cur.map((l) => (l.key === key ? { ...l, req: v } : l)));
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
  // ── 마지막 옵션 레벨 = 디자인된 상품 picker(레거시 옵션 리스트, 클릭 시 열리는 레이어) ──
  const lastLevel = levels - 1;
  const [optOpen, setOptOpen] = useState(false); // 마지막 레벨 레이어 열림(메인)
  const optRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!optOpen) return;
    const onDoc = (e: MouseEvent) => { if (optRef.current && !optRef.current.contains(e.target as Node)) setOptOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOptOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [optOpen]);
  const [optOpenSide, setOptOpenSide] = useState(false); // 마지막 레벨 레이어 열림(사이드 패널 — 메인과 독립)
  const optRefSide = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!optOpenSide) return;
    const onDoc = (e: MouseEvent) => { if (optRefSide.current && !optRefSide.current.contains(e.target as Node)) setOptOpenSide(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOptOpenSide(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [optOpenSide]);

  const pickLevel = (level: number, value: string) => {
    const next = [...sel];
    next[level] = value || null;
    for (let i = level + 1; i < 3; i++) next[i] = null;
    setSel(next);
    // 앞 단계를 바꾸면 열려있던 주문옵션 레이어는 닫는다(자동으로 열지는 않음 — 트리거 클릭 시 오픈).
    setOptOpen(false);
  };

  // 마지막 레벨 앞 단계가 모두 선택됐는지(단일 레벨이면 항상 true).
  const prevChosen = sel.slice(0, lastLevel).every((v) => v != null);
  // 현재 앞 단계 선택에 해당하는 leaf(주문 가능한 실제 옵션) 목록.
  const leafOptions: ProductViewOption[] = prevChosen
    ? pv.options.filter((o) => sel.slice(0, lastLevel).every((v, i) => [o.o1, o.o2, o.o3][i] === v))
    : [];
  const pickLeaf = (o: ProductViewOption) => {
    if (o.soldout === 1) return;
    addLine({
      key: `o-${o.id}`, label: optLabel(o), price: o.sale_price, kind: "opt", refId: o.id,
      stock: o.stock, qmin: o.quantity_min, qmax: o.quantity_max, bundle: o.bundle,
    });
    setSel([null, null, null]);
    setOptOpen(false);
    setOptOpenSide(false);
  };
  // 마지막 레벨 «디자인된 상품 picker» 리스트(이미지·가격·재고·재입고) — 메인/사이드 공용.
  const leafListUI = () => (
    <ul className="absolute left-0 right-0 z-30 mt-1 max-h-[360px] space-y-2 overflow-y-auto rounded-md border border-line bg-card p-2 shadow-lg">
      {leafOptions.map((o) => {
        const soldout = o.soldout === 1;
        const thumb = o.thumb || fallbackThumb;
        return (
          <li key={o.id}
            className={`flex items-center gap-3 rounded-lg border p-2 transition-colors ${soldout ? "border-line bg-surface/40" : "border-line hover:border-accent hover:bg-accent/5"}`}>
            <button type="button" onClick={() => pickLeaf(o)} disabled={soldout}
              className={`flex min-w-0 flex-1 items-center gap-3 text-left ${soldout ? "cursor-default" : "cursor-pointer"}`}>
              <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-line bg-surface">
                {thumb ? (
                  <LazyImg src={thumb} alt="" className={`h-full w-full object-cover ${soldout ? "opacity-40" : ""}`} />
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  {soldout && <span className="rounded bg-line px-1 py-0.5 text-[10px] font-bold text-sub">품절</span>}
                  <span className={`truncate text-sm font-medium ${soldout ? "text-sub" : "text-text"}`}>{leafName(o)}</span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={`text-sm font-bold ${soldout ? "text-sub" : "text-text"}`}>{won(o.sale_price)}</span>
                  {!soldout && o.stock > 0 && (
                    <span className="shrink-0 text-[12px] text-sub">재고 {o.stock}개</span>
                  )}
                </span>
              </span>
            </button>
            {soldout && restockEnabled && (
              <button type="button" onClick={() => setRestockPid(o.id)}
                className="shrink-0 cursor-pointer rounded-md border border-accent bg-card px-2.5 py-1.5 text-[12px] font-bold text-accent hover:bg-accent/5">
                재입고 알림
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
  // leaf 항목에 표시할 이름(마지막 레벨 값 우선, 없으면 라벨).
  const leafName = (o: ProductViewOption): string => {
    const v = [o.o1, o.o2, o.o3][lastLevel];
    return (v != null && v !== "") ? String(v) : (o.label || pv.title || "");
  };
  const fallbackThumb = pv.gallery[0]?.thumb || pv.gallery[0]?.src || "";

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
  // 필수 추가옵션(req_type=1) 미선택 여부
  const reqMissing = addoptions.some((a) => a.req_type === 1 && !lines.some((l) => l.kind === "addo" && l.refId === a.id));
  // 필수 요청사항(request.required=1) 미입력 여부 — 레거시 request_req 대응.
  //  · 각각(group=0): 주문옵션 라인마다 검사  · 한번(group=1): 단일 공유 입력 검사
  const requestRequired = pv.request.use === 1 && pv.request.required === 1;
  const requestMissing = requestRequired && (reqEach
    ? productLines.some((l) => (l.req || "").trim() === "")
    : requestText.trim() === "");
  // 금칙문자(^N/^S) — 레거시 choiceData 구분자라 요청사항에 포함 불가.
  const badChar = (s: string) => /\^N|\^S/.test(s);
  const requestBad = pv.request.use === 1 && (reqEach
    ? productLines.some((l) => badChar(l.req || ""))
    : badChar(requestText));
  // 필수 파일접수 미첨부 여부(레거시 orderupload req). 각각=옵션 라인마다, 한 묶음=공유.
  const uploadReqIdx = uploadUse ? uploadItems.map((u, i) => ({ i, req: (u.req ?? 0) === 1 })).filter((x) => x.req).map((x) => x.i) : [];
  const uploadMissing = uploadReqIdx.length > 0 && (uploadEach
    ? productLines.some((l) => uploadReqIdx.some((i) => !l.up?.[i]))
    : uploadReqIdx.some((i) => !groupUp[i]));
  const optionTotal = productLines.reduce((s, l) => s + l.price * l.qty, 0); // 옵션 금액(할인 전, 추가옵션 제외)
  const addoTotal = addoLines.reduce((s, l) => s + l.price * l.qty, 0);      // 추가옵션 금액(할인 대상 아님)
  const totalQty = productLines.reduce((s, l) => s + l.qty, 0);
  // 합산수량 제한(quantity_type=2) — 레거시 update: 옵션 합계가 상품 quantity_min/max 범위여야 함.
  //  · 최소 미달: totalQty < quantity_min  · 최대 초과: totalQty > quantity_max
  //  (증분 +는 clampOptQty 가 실시간으로 막지만, 새 옵션 라인 추가로 합계가 넘칠 수 있어 제출 시점에도 차단)
  const summedMin = summed && pv.quantity_min > 0 && productLines.length > 0 && totalQty < pv.quantity_min;
  const summedMax = summed && pv.quantity_max > 0 && totalQty > pv.quantity_max;
  const canBuy = productLines.length > 0 && pv.soldout !== 1 && !reqMissing && !requestMissing && !requestBad && !summedMin && !summedMax && !uploadMissing;

  const toCartItems = (): AddItem[] => {
    const shared = pv.request.use === 1 && !reqEach ? requestText.trim() : "";
    // 파일접수 orderupload = 항목 순서대로 파일 id(미첨부는 "0"). 레거시 choiceData 규격(항목수 == 파일수).
    const groupUpStr = uploadUse && !uploadEach ? uploadItems.map((_, i) => groupUp[i]?.id ?? 0).join(",") : "";
    let firstOpt = true;
    return lines.map((l) => {
      let orderupload = "";
      if (l.kind === "opt" && uploadUse) {
        if (uploadEach) orderupload = uploadItems.map((_, i) => l.up?.[i]?.id ?? 0).join(",");
        else if (firstOpt) { orderupload = groupUpStr; firstOpt = false; }
      }
      return {
        line_key: `${pv.id}:${l.key}`,
        products_id: pv.id,
        product_id: l.kind === "opt" ? l.refId : 0,
        kind: l.kind === "opt" ? "opt" : "addo",
        title: pv.title ?? "",
        label: l.label,
        price: l.price,
        quantity: l.qty,
        // 요청사항은 주문옵션(opt) 라인에만(레거시 cart.request). 각각=라인별, 한번=공유.
        request: l.kind === "opt" ? (reqEach ? (l.req || "").trim() : shared) : "",
        orderupload,
        // 선택 배송수단(opt 라인에만). 미선택/미배송이면 0 → 서버가 상품 기본 배송수단으로 처리.
        delivery_type: l.kind === "opt" ? deliveryType : undefined,
      };
    });
  };
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false); // 장바구니 담기 완료 모달
  const [restockPid, setRestockPid] = useState<number | null>(null); // 재입고 알림 모달(대상 옵션 product_id)
  // 재입고 알림 허용(쇼핑몰 설정). 옵션 없는 상품은 단일 옵션 id 를, 옵션 상품은 옵션 picker 에서 각 옵션 id 를 대상으로 한다.
  const restockEnabled = pv.restock?.enabled === 1;
  const singleRestockId = pv.options[0]?.id ?? 0;
  const canRestock = restockEnabled && pv.option_type === 0 && singleRestockId > 0;
  // 옵션 상품이 전체 품절이어도 «품절 안내 한 줄»로 막지 않고 옵션 picker 를 노출한다.
  //  → 사용자가 옵션 레이어를 열어 원하는(품절) 옵션의 재입고 알림을 신청할 수 있게(레거시 동일).
  const soldoutOptionPicker = pv.state.block === "soldout" && pv.option_type > 0;
  const onAddCart = async () => {
    if (!canBuy || busy) return;
    setBusy(true);
    const ok = await addToCart(toCartItems());
    setBusy(false);
    if (!ok) { alert("장바구니 담기에 실패했습니다."); return; }
    // 담기 성공 → 완료 모달(계속 쇼핑 / 장바구니 이동).
    setAdded(true);
  };
  const onBuyNow = async () => {
    if (!canBuy || busy) return;
    setBusy(true);
    // 바로구매: 장바구니를 건드리지 않고 서버가 해당 품목만으로 주문 세션(oid) 발행
    try {
      const items = toCartItems().map((c) => ({ line_key: c.line_key, products_id: c.products_id, product_id: c.product_id, kind: c.kind, quantity: c.quantity, request: c.request, orderupload: c.orderupload, delivery_type: c.delivery_type }));
      const res = await fetch("/api/order/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      const j = await res.json().catch(() => null);
      setBusy(false);
      if (j?.ok && j.oid) router.push(`/order/${j.oid}`);
      else alert(j?.error || "주문서 생성에 실패했습니다.");
    } catch { setBusy(false); alert("주문 요청 중 오류가 발생했습니다."); }
  };
  const onWish = async () => {
    // 비회원: 관심상품은 로그인 필요 → 로그인 페이지로 이동. 회원: 서버 관심상품 토글(계정 보관함 반영).
    if (!wishLoggedIn) { router.push("/auth/login"); return; }
    const prev = wished;
    setWished(!prev); // 낙관적
    try {
      const res = await fetch("/api/account/wishlist", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ products_id: pv.id }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setWished(prev); toast("관심상품 처리에 실패했습니다.", "error"); return; }
      const now = !!j.wished;
      setWished(now);
      toast(now ? "관심상품에 추가했습니다." : "관심상품에서 해제했습니다.", "success");
    } catch { setWished(prev); toast("통신 오류가 발생했습니다.", "error"); }
  };

  const discount = pv.price.discount_percent;
  // 가격 공개 가드(레거시 open_price) — price_open=0 이면 가격 대신 안내 문구.
  const priceOpen = (pv.state.price_open ?? 1) !== 0;
  const labelCls = "text-[13px] font-semibold text-text";
  const infoBtnCls = "grid h-[18px] w-[18px] shrink-0 cursor-pointer place-items-center rounded-full bg-sub text-[11px] font-bold leading-none text-white hover:bg-accent";
  const bulk = pv.bulk_discount;
  const bulkUnit = (v: number) => (bulk?.unit === "rate" ? `${v}%` : won(v));
  const bulkBase = (r: number) => (bulk?.type === "quantity" ? `${r}개 이상` : `${won(r)} 이상`);
  // 대량구매 할인 계산 — 레거시 common.js choiceUpdate 동일: 옵션 기준(추가옵션 제외),
  // 기준값(수량/금액) ≥ range 중 최대 구간, rate=원금×%, 정액=값(원금 초과 불가).
  let bulkDiscount = 0;
  if (bulk && bulk.tiers.length > 0) {
    const criteria = bulk.type === "quantity" ? totalQty : optionTotal;
    let val = 0;
    for (const t of bulk.tiers) { if (criteria >= t.range) val = t.value; else break; }
    if (val > 0) bulkDiscount = bulk.unit === "rate" ? Math.round(optionTotal * (val / 100)) : Math.min(val, optionTotal);
  }
  const total = optionTotal - bulkDiscount + addoTotal; // 최종 합계(대량구매 할인 반영)

  // 파일접수 항목 렌더러(그룹/라인 공용). get/set 으로 저장소를 주입.
  const renderUploads = (get: (i: number) => { id: number; name: string } | undefined, set: (i: number, v: { id: number; name: string } | null) => void, keyPrefix: string) => (
    <div className="mt-2 space-y-2">
      {uploadItems.map((u, i) => {
        const f = get(i);
        const k = `${keyPrefix}-${i}`;
        return (
          <div key={i} className="rounded-md border border-line bg-card p-2.5">
            <p className="text-[13px] font-medium text-text">{u.title || `첨부파일 ${i + 1}`}{(u.req ?? 0) === 1 ? <span className="text-sale"> *</span> : null}</p>
            {f ? (
              <div className="mt-1.5 flex items-center gap-2 text-[13px]">
                <span className="min-w-0 truncate text-accent">{f.name}</span>
                <button type="button" onClick={() => set(i, null)} className="ml-auto shrink-0 text-sub hover:text-sale">삭제</button>
              </div>
            ) : (
              <label className="mt-1.5 inline-flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-1.5 text-[12px] text-text hover:border-accent">
                {uploadingKey === k ? "업로드 중…" : "파일 선택"}
                <input type="file" className="hidden" disabled={uploadingKey !== null}
                  onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; const r = await doUpload(k, file); if (r) set(i, r); }} />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderLine = (l: Line) => (
    <li key={l.key} className="rounded-md border border-line bg-surface/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-text">{l.label}</span>
        {(hasOptions || l.kind === "addo") && <button type="button" onClick={() => removeLine(l.key)} aria-label="삭제" className="text-sub hover:text-sale">✕</button>}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="inline-flex items-center rounded-md border border-line bg-card">
          <button type="button" onClick={() => setQty(l.key, l.qty - 1)} className="grid h-8 w-8 place-items-center text-text hover:bg-surface">−</button>
          <input value={l.qty} onChange={(e) => setQty(l.key, parseInt(e.target.value) || 1)} inputMode="numeric"
            className="h-8 w-12 border-x border-line bg-transparent text-center text-sm text-text outline-none" />
          <button type="button" onClick={() => setQty(l.key, l.qty + 1)} className="grid h-8 w-8 place-items-center text-text hover:bg-surface">+</button>
        </div>
        <span className="font-bold text-text">{won(l.price * l.qty)}</span>
      </div>
      {/* 요청사항 각각입력(request.group=0): 주문옵션 라인마다 개별 입력 */}
      {reqEach && l.kind === "opt" && (
        <textarea
          value={l.req || ""}
          onChange={(e) => setLineReq(l.key, e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="요청사항을 입력해 주세요."
          className="mt-2 w-full resize-none rounded-md border border-input bg-card p-2.5 text-[13px] text-text outline-none focus:border-accent"
        />
      )}
      {/* 파일접수 각각(upload_group=0): 주문옵션 라인마다 개별 업로드 */}
      {uploadEach && l.kind === "opt" && (
        <div className="mt-2">
          <p className="text-[12px] font-semibold text-sub">주문 파일접수</p>
          {renderUploads((i) => l.up?.[i], (i, v) => setLineUp(l.key, i, v), `u-${l.key}`)}
        </div>
      )}
    </li>
  );

  // 사이드 주문패널(오른쪽 떠다니는 옵션+수량+가격+구매). 헤더 옵션과 «같은 상태»를 쓰므로 상호 자동 동기화.
  // 마지막 레벨은 헤더와 «동일한 디자인 picker»(이미지·가격·재고). 열림 상태만 사이드 전용(optOpenSide/optRefSide)으로 분리.
  const selSideCls = "select-arrow h-10 w-full cursor-pointer rounded-md border border-input bg-card pl-3 pr-8 text-[13px] text-text outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50";
  const renderSidePanel = () => (
    <div className="border border-line bg-card p-4">
      <p className="mb-3 line-clamp-2 text-sm font-bold text-text">{pv.title}</p>
      {soldoutOptionPicker ? (
        <div className="grid h-11 place-items-center rounded-md bg-surface text-sm font-bold text-sub">품절</div>
      ) : (
        <>
          {hasOptions && (
            <div className="space-y-2">
              {Array.from({ length: lastLevel }).map((_, level) => {
                const enabled = level === 0 || sel[level - 1] != null;
                return (
                  <select key={level} value={sel[level] ?? ""} disabled={!enabled} onChange={(e) => pickLevel(level, e.target.value)} className={selSideCls}>
                    <option value="">{pv.option_titles[level] || `옵션 ${level + 1}`} 선택</option>
                    {choicesAt(level).map((c) => <option key={c.value} value={c.value} disabled={c.soldout}>{c.value}{c.soldout ? " (품절)" : ""}</option>)}
                  </select>
                );
              })}
              {/* 마지막 레벨 — 헤더와 동일한 디자인 picker(이미지·가격·재고·재입고). 사이드 전용 열림 상태(optOpenSide) */}
              <div ref={optRefSide} className="relative">
                <button type="button" disabled={!prevChosen} onClick={() => setOptOpenSide((v) => !v)}
                  className="select-arrow flex h-10 w-full items-center rounded-md border border-input bg-card pl-3 pr-8 text-left text-[13px] text-text outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50">
                  <span className={prevChosen ? "text-text" : "text-sub"}>
                    {prevChosen ? `${pv.option_titles[lastLevel] || "주문옵션"} 선택` : "앞 옵션을 먼저 선택"}
                  </span>
                </button>
                {prevChosen && optOpenSide && leafListUI()}
              </div>
            </div>
          )}
          {addoptions.length > 0 && (
            <div className="mt-2 space-y-2">
              {addoptions.map((ao) => (
                <select key={ao.id} value={addoKey[ao.id] ?? ""} onChange={(e) => pickAddo(ao, e.target.value)} className={selSideCls}>
                  <option value="">{ao.title}{ao.req_type === 1 ? " (필수)" : ""} 선택</option>
                  {ao.options.map((o, i) => <option key={i} value={i}>{o.name}{o.price > 0 ? ` (+${won(o.price)})` : ""}</option>)}
                </select>
              ))}
            </div>
          )}
          {lines.length > 0 && (
            <ul className="mt-3 max-h-[calc(100vh-22rem)] space-y-2 overflow-y-auto">
              {lines.map((l) => (
                <li key={l.key} className="rounded-md border border-line bg-surface/50 p-2">
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[12px] leading-snug text-text">{l.label}</span>
                    {(hasOptions || l.kind === "addo") && <button type="button" onClick={() => removeLine(l.key)} aria-label="삭제" className="shrink-0 text-sub hover:text-sale">✕</button>}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <div className="inline-flex items-center rounded-md border border-line bg-card">
                      <button type="button" onClick={() => setQty(l.key, l.qty - 1)} className="grid h-7 w-7 place-items-center text-text hover:bg-surface">−</button>
                      <span className="h-7 w-9 border-x border-line text-center text-[13px] leading-7 text-text">{l.qty}</span>
                      <button type="button" onClick={() => setQty(l.key, l.qty + 1)} className="grid h-7 w-7 place-items-center text-text hover:bg-surface">+</button>
                    </div>
                    <span className="text-[13px] font-bold text-text">{won(l.price * l.qty)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {lines.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              {bulkDiscount > 0 && (
                <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                  <span className="text-sub">대량구매 할인</span>
                  <span className="font-semibold text-sale">-{won(bulkDiscount)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-sub">총 {totalQty}개</span>
                <span className="text-[13px] text-sub">합계 <b className="text-lg text-text">{won(total)}</b></span>
              </div>
            </div>
          )}
          {hasOptions && productLines.length === 0 && <p className="mt-2 text-[12px] text-sub">주문옵션을 선택해 주세요.</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onWish} aria-label="관심상품"
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-md border ${wished ? "border-sale text-sale" : "border-line text-sub"} hover:border-accent`}>
              {wished ? "♥" : "♡"}
            </button>
            <button type="button" onClick={onAddCart} disabled={!canBuy || busy}
              className="h-11 flex-1 cursor-pointer rounded-md border border-accent bg-card text-[13px] font-bold text-accent hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50">장바구니</button>
            <button type="button" onClick={onBuyNow} disabled={!canBuy || busy}
              className="h-11 flex-1 cursor-pointer rounded-md bg-accent text-[13px] font-bold text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">바로구매</button>
          </div>
        </>
      )}
    </div>
  );

  // 사이드 패널은 주문 UI 가 노출되는 경우에만(차단상태 제외, 품절옵션 picker 는 포함).
  const sideOrderVisible = !pv.state.block || soldoutOptionPicker;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* 갤러리 */}
      <div>
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          {gallery[img]?.src ? (
            <LazyImg src={gallery[img].src} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <div className="grid aspect-square w-full place-items-center text-sub">이미지 없음</div>
          )}
        </div>
        {gallery.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {gallery.map((gimg, i) => (
              <button key={i} type="button" onClick={() => setImg(i)} className={`h-16 w-16 overflow-hidden rounded-md border ${i === img ? "border-accent" : "border-line"}`}>
                <LazyImg src={gimg.thumb || gimg.src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 정보 + 구매 */}
      <div>
        {/* 상품 아이콘(상품명 위) — 레거시 view_title 아이콘 표기 */}
        {pv.icon?.title ? (
          <span className="mb-1.5 inline-block rounded bg-accent/10 px-2 py-0.5 text-[12px] font-bold text-accent">{pv.icon.title}</span>
        ) : null}
        <h1 className="text-2xl font-bold leading-snug text-text">{pv.title}</h1>
        {pv.summary ? <p className="mt-1.5 text-sm text-sub">{pv.summary}</p> : null}

        {(() => {
          // 리뷰 요약 우선(통합/개별 게시판 모두 인지하는 상품평 엔드포인트 값) — 상품평 섹션과 항상 일치.
          // 폴백: report(개별 게시판 전용 denormalized 컬럼). report.review_score 는 별점 «합계»(SUM)라 평균=합계/건수.
          const rvCount = reviewSummary && reviewSummary.count > 0 ? reviewSummary.count : pv.report.review_cnt;
          const rvAvg = reviewSummary && reviewSummary.count > 0
            ? reviewSummary.average
            : (pv.report.review_cnt > 0 ? pv.report.review_score / pv.report.review_cnt : 0);
          return rvCount > 0 ? (
            <div className="mt-2 flex items-center gap-1 text-sm">
              <span className="text-[#f5a623]">★</span>
              <span className="font-semibold text-text">{rvAvg.toFixed(1)}</span>
              <span className="text-sub">리뷰 {rvCount.toLocaleString("ko-KR")}</span>
            </div>
          ) : null;
        })()}

        {/* 가격 + 구매혜택 그룹 — 블록 간 간격은 gap 으로 일관 적용(mt 미사용) */}
        <div className="mt-3 flex flex-col gap-3">
        {/* 가격 */}
        <div className="border-t border-line pt-3">
          {/* 타임세일 카운트다운(레거시 sale_dday) — 세일 진행 중일 때 종료까지 남은 시간 */}
          {tsActive && remain > 0 && (
            <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-sale/10 px-2.5 py-1.5">
              <span className="text-[12px] font-bold text-sale">타임세일</span>
              <span className="font-mono text-[13px] font-bold tabular-nums text-sale">{countdown(remain)}</span>
              <span className="text-[11px] text-sale/80">남음</span>
            </div>
          )}
          {priceOpen ? (
            <>
              {discount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-sale">{discount}%</span>
                  <span className="text-sm text-sub line-through">{won(pv.price.original)}</span>
                </div>
              )}
              <div className="mt-0.5 text-[26px] text-text">
                <b className="font-extrabold">{pv.price.sale.toLocaleString("ko-KR")}</b>
                <span className="relative bottom-[2px] inline-block pl-1 text-base font-normal">원</span>
              </div>
              {/* 쿠폰 적용가(나의 할인가) + 쿠폰받기 — 이 행을 relative 로 잡아 버튼이 영역 밖으로 삐져나가지 않게 */}
              {coupons.length > 0 && (
                <div className="relative -mt-1 flex items-center gap-3 pr-28">
                  {bestCouponDiscount > 0 ? (
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-[26px] text-sale">
                        <b className="font-extrabold">{myPrice.toLocaleString("ko-KR")}</b>
                        <span className="relative bottom-[2px] inline-block pl-1 text-base font-normal">원</span>
                      </span>
                      <span className="relative bottom-[2px] inline-block text-[13px] font-bold text-sale">나의 할인가</span>
                    </span>
                  ) : couponUnitDeal ? (
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-[26px] text-sale">
                        <b className="font-extrabold">{couponUnitDeal.unit.toLocaleString("ko-KR")}</b>
                        <span className="relative bottom-[2px] inline-block pl-1 text-base font-normal">원</span>
                      </span>
                      <span className="relative bottom-[2px] inline-block text-[13px] font-bold text-sale">{couponUnitDeal.qty}개 이상 구매 시 개당</span>
                    </span>
                  ) : (
                    <span className="text-[13px] text-sub">쿠폰 다운로드 가능</span>
                  )}
                  {/* 쿠폰받기 — 행 우측에 절대 배치, 행 높이 기준 세로 중앙정렬 */}
                  <button
                    type="button"
                    onClick={() => setShowCoupons(true)}
                    className="absolute right-0 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-md border border-sale px-3 py-1.5 text-[13px] font-bold text-sale hover:bg-sale/5"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V8z" />
                      <path d="M13 6v12" strokeDasharray="2 2" />
                    </svg>
                    쿠폰 받기
                  </button>
                </div>
              )}
            </>
          ) : (
            // 가격 미공개(open_price 등급 미달) — 판매가 대신 안내(하단 게이트에서 로그인/등급 안내)
            <div className="text-[18px] font-bold text-sub">회원 등급에 따라 가격이 공개됩니다</div>
          )}
        </div>

        {/* 구매혜택 (배송비 포함, 동일 패턴) */}
        <dl className="flex flex-col gap-2 border-y border-line py-3 text-[13px]">
          {/* 적립 — 구매확정 / 상품평 / 포토리뷰 별도 표시. 단위는 «포인트». */}
          {(pv.price.point > 0 || (pv.price.point_review ?? 0) > 0 || (pv.price.point_review_photo ?? 0) > 0) && (
            <Benefit k="적립">
              <span className="flex flex-col gap-0.5">
                {pv.price.point > 0 && <span>구매확정 시 <b className="text-text">{pv.price.point.toLocaleString("ko-KR")}포인트</b> 적립</span>}
                {(pv.price.point_review ?? 0) > 0 && <span className="text-[12px] text-sub">상품평 작성 시 <b className="text-text">{pv.price.point_review!.toLocaleString("ko-KR")}포인트</b> 추가 적립</span>}
                {(pv.price.point_review_photo ?? 0) > 0 && <span className="text-[12px] text-sub">포토리뷰 작성 시 <b className="text-text">{pv.price.point_review_photo!.toLocaleString("ko-KR")}포인트</b> 추가 적립</span>}
              </span>
            </Benefit>
          )}
          {/* 혜택 그룹 — 대량구매 할인 + 무이자 정보(박스 없이 항목 나열) */}
          {((bulk && bulk.tiers.length > 0) || pv.card_benefits.length > 0) && (
            <Benefit k="혜택">
              <div className="flex flex-col gap-1.5">
                {bulk && bulk.tiers.length > 0 && (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-text">
                    {bulk.tiers.map((t, i) => (
                      <span key={i} className="text-text">{bulkBase(t.range)} <b>{bulkUnit(t.value)}</b> 할인</span>
                    ))}
                    {addoptions.length > 0 && <span className="w-full text-[12px] text-sub">※ 추가 주문옵션은 할인대상에서 제외됩니다.</span>}
                  </div>
                )}
                {pv.card_benefits.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-text">카드사별 무이자 할부</span>
                    <button type="button" onClick={() => setShowCards(true)} aria-label="무이자 할부 안내" className={infoBtnCls}>?</button>
                  </span>
                )}
              </div>
            </Benefit>
          )}
          {/* 배송 — 혜택 아래로 이동 */}
          <Benefit k={pv.delivery.use === 0 ? "이용안내" : "배송"}>
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
              {/* 선택된 배송수단의 상세 라벨(수단 1개면 그 수단, 여러 개면 «수단변경» 모달 선택값). 미배송은 안내문구. */}
              <span className="text-text">{deliveryOpts.find((o) => o.value === deliveryType)?.label ?? (pv.delivery.fee > 0 ? won(pv.delivery.fee) : "무료배송")}</span>
              <button type="button" onClick={() => setShowDelivery(true)} aria-label="배송정보" className={infoBtnCls}>?</button>
              {/* 배송수단 2개 이상이면 모달로 변경 */}
              {deliveryOpts.length >= 2 && deliveryOpts[0].value !== 0 && (
                <button type="button" onClick={() => setShowDeliverySelect(true)}
                  className="ml-0.5 rounded-md border border-line px-2 py-0.5 text-[12px] font-medium text-sub hover:border-accent hover:text-accent">
                  수단변경
                </button>
              )}
            </span>
          </Benefit>
          {/* 쿠폰: 받을 수 있는 쿠폰은 위쪽 «쿠폰받기» 버튼→모달로 이동. 다운로드 쿠폰이 없고 쿠폰사용 가능 상품이면 안내만. */}
          {pv.price.coupon === 1 && coupons.length === 0 && <Benefit k="쿠폰">쿠폰 사용 가능 상품</Benefit>}
        </dl>
        </div>

        {/* 첨부 다운로드 파일(레거시 dw-download) — 판매상태와 무관하게 노출 */}
        {pv.downloads.length > 0 && (
          <div className="mt-3">
            <p className={labelCls}>다운로드</p>
            <ul className="mt-2 space-y-1.5">
              {pv.downloads.map((d, i) => (
                <li key={i}>
                  {d.download ? (
                    <a href={d.download} className="flex items-center gap-2 rounded-md border border-line bg-card px-3 py-2 text-[13px] text-text hover:border-accent" download>
                      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-sub" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" /></svg>
                      <span className="min-w-0 truncate font-medium">{d.title || d.name}</span>
                      {d.name && d.title ? <span className="truncate text-sub">{d.name}</span> : null}
                      {d.size ? <span className="ml-auto shrink-0 text-sub">{d.size}</span> : null}
                    </a>
                  ) : (
                    <div className="rounded-md border border-line bg-surface px-3 py-2 text-[13px] text-sub">{d.title}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {pv.state.block && !soldoutOptionPicker ? (
          // 판매상태·접근 게이트(레거시 view.js 패널 우선순위). 구매 UI 대신 사유 표시.
          // 단, 옵션 상품 전체 품절(soldoutOptionPicker)은 아래 옵션 picker 를 노출해 옵션별 재입고 알림을 허용.
          (() => {
            const b = pv.state.block;
            const msg: Record<string, string> = {
              login: "로그인 후 구매하실 수 있는 상품입니다.",
              private: "구매 권한이 없는 상품입니다. (회원 등급 제한)",
              onoff: "판매가 중지된 상품입니다.",
              display: "현재 판매하지 않는 상품입니다.",
              soldout: "품절된 상품입니다.",
              period: pv.state.order_guide || "판매 기간이 아닙니다.",
              adult: "성인인증이 필요한 상품입니다.",
              level: "열람 권한이 없는 상품입니다. (회원 등급 제한)",
            };
            const needLogin = b === "login" || (b === "adult" && pv.state.logged_in !== 1);
            return (
              <div className="mt-3 rounded-md bg-surface p-4 text-center">
                <p className="whitespace-pre-line text-sm font-semibold text-sale">{msg[b] ?? "구매할 수 없는 상품입니다."}</p>
                {needLogin && (
                  <a href="/auth/login" className="mt-3 inline-block rounded-md bg-accent px-4 py-2 text-sm text-accent-foreground hover:opacity-90">로그인</a>
                )}
                {/* 품절 상품 재입고 알림신청 */}
                {b === "soldout" && canRestock && (
                  <button type="button" onClick={() => setRestockPid(singleRestockId)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-accent bg-card px-4 py-2 text-sm font-bold text-accent hover:bg-accent/5">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                    재입고 알림신청
                  </button>
                )}
              </div>
            );
          })()
        ) : (
          <>
            {/* 옵션 상품 전체 품절 — 옵션 레이어에서 원하는 옵션의 재입고 알림을 신청하도록 안내 */}
            {soldoutOptionPicker && (
              <div className="mt-3 rounded-md bg-surface p-3 text-center text-[13px]">
                <span className="font-semibold text-sale">품절된 상품입니다.</span>
                {restockEnabled && <span className="text-sub"> 옵션을 선택해 재입고 알림을 신청할 수 있습니다.</span>}
              </div>
            )}

            {/* 해외직구(delivery_use=2) 안내 — 배송방법 위(레거시 getOverseas): 배송국가·배송기간·관부가세·반품비 */}
            {pv.delivery.use === 2 && pv.delivery.overseas && (() => {
              const o = pv.delivery.overseas!;
              const md = o.date ? o.date.split("-") : null; // [Y,M,D]
              return (
                <div className="mt-3 rounded-lg border border-line bg-surface/40 p-4">
                  <p className="text-[15px] font-bold text-text">해외직구 상품</p>
                  <p className="mt-0.5 text-[12px] text-sub">해외에서 국내로 배송되는 상품입니다.</p>
                  <dl className="mt-2.5 space-y-1.5 text-[13px]">
                    {o.country ? <div className="flex justify-between gap-3"><dt className="shrink-0 text-sub">배송국가</dt><dd className="text-right text-text">{o.country}</dd></div> : null}
                    {o.day > 0 && <div className="flex justify-between gap-3"><dt className="shrink-0 text-sub">배송기간</dt><dd className="text-right text-text">약 {o.day}일 소요 예정{md ? ` (${Number(md[1])}월 ${Number(md[2])}일)` : ""}</dd></div>}
                    <div className="flex justify-between gap-3"><dt className="shrink-0 text-sub">관부가세</dt><dd className="text-right text-text">{o.customs === 1 ? "포함" : "미포함"}{o.return_price > 0 ? ` / 반품 배송비 ${won(o.return_price)}` : ""}</dd></div>
                  </dl>
                </div>
              );
            })()}

            {/* 배송방법 선택은 상단 «배송» 행의 «수단변경» 버튼→모달로 이동(레거시 PRODUCTS_DELIVERY). */}

            {/* 상품옵션 — 마지막 레벨 앞 단계는 셀렉트, 마지막 레벨은 디자인된 상품 picker(이미지·재고·재입고) */}
            {hasOptions && (
              <div className="mt-3">
                <p className={`mb-1 ${labelCls}`}>주문옵션</p>
                <div className="space-y-3">
                {/* 앞 단계 셀렉트(마지막 레벨 제외) */}
                {Array.from({ length: lastLevel }).map((_, level) => {
                  const enabled = level === 0 || sel[level - 1] != null;
                  return (
                    <select key={level} value={sel[level] ?? ""} disabled={!enabled} onChange={(e) => pickLevel(level, e.target.value)}
                      className="select-arrow h-11 w-full cursor-pointer rounded-md border border-input bg-card pl-3 pr-8 text-sm text-text outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50">
                      <option value="">{pv.option_titles[level] || `옵션 ${level + 1}`} 선택</option>
                      {choicesAt(level).map((c) => (
                        <option key={c.value} value={c.value} disabled={c.soldout}>{c.value}{c.soldout ? " (품절)" : ""}</option>
                      ))}
                    </select>
                  );
                })}

                {/* 마지막 레벨 = 클릭 시 열리는 주문옵션 레이어(디자인된 상품 picker) */}
                <div ref={optRef} className="relative">
                  <button type="button" disabled={!prevChosen} onClick={() => setOptOpen((v) => !v)}
                    className="select-arrow flex h-11 w-full items-center rounded-md border border-input bg-card pl-3 pr-8 text-left text-sm text-text outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50">
                    <span className={prevChosen ? "text-text" : "text-sub"}>
                      {prevChosen
                        ? `${pv.option_titles[lastLevel] || "주문옵션"} 선택`
                        : `${pv.option_titles[lastLevel - 1] || "옵션"}을(를) 먼저 선택해 주세요`}
                    </span>
                  </button>

                  {prevChosen && optOpen && leafListUI()}
                </div>
                </div>
              </div>
            )}

            {/* 추가 주문옵션 — 선택 시 라인 추가 */}
            {addoptions.length > 0 && (
              <div className="mt-3">
                <p className={`mb-1 ${labelCls}`}>추가 주문옵션</p>
                <div className="space-y-3">
                {addoptions.map((ao) => (
                  <select key={ao.id} value={addoKey[ao.id] ?? ""} onChange={(e) => pickAddo(ao, e.target.value)}
                    className="select-arrow h-11 w-full cursor-pointer rounded-md border border-input bg-card pl-3 pr-8 text-sm text-text outline-none focus:border-accent">
                    <option value="">{ao.title}{ao.req_type === 1 ? " (필수)" : ""} 선택</option>
                    {ao.options.map((o, i) => (
                      <option key={i} value={i}>{o.name}{o.price > 0 ? ` (+${won(o.price)})` : ""}</option>
                    ))}
                  </select>
                ))}
                </div>
              </div>
            )}

            {/* 선택된 상품 — 주문옵션 그룹 → 추가옵션 그룹 순 */}
            {productLines.length > 0 && (
              <div className="mt-3">
                {hasOptions && <p className={`mb-2 ${labelCls}`}>주문옵션</p>}
                <ul className="space-y-2">{productLines.map(renderLine)}</ul>
              </div>
            )}
            {addoLines.length > 0 && (
              <div className="mt-3">
                <p className={labelCls}>추가옵션</p>
                <ul className="mt-2 space-y-2">{addoLines.map(renderLine)}</ul>
              </div>
            )}

            {/* 요청사항 — 한번(group=1): 단일 공유 입력 / 각각(group=0): 옵션 라인별 입력(renderLine 내부) */}
            {pv.request.use === 1 && !reqEach && (
              <div className="mt-3">
                <p className={labelCls}>요청사항{pv.request.required === 1 ? <span className="text-sale"> *</span> : null}</p>
                {pv.request.text ? <p className="mt-1 whitespace-pre-line text-[13px] text-sub">{pv.request.text}</p> : null}
                <textarea value={requestText} onChange={(e) => setRequestText(e.target.value)} rows={2} maxLength={500} placeholder="요청사항을 입력해 주세요."
                  className="mt-2 w-full resize-none rounded-md border border-input bg-card p-3 text-sm text-text outline-none focus:border-accent" />
              </div>
            )}
            {pv.request.use === 1 && reqEach && (
              <p className="mt-3 text-[13px] text-sub">
                요청사항은 주문옵션마다 개별 입력합니다.{pv.request.required === 1 ? <span className="text-sale"> (필수)</span> : null}
                {pv.request.text ? <span className="block whitespace-pre-line">{pv.request.text}</span> : null}
              </p>
            )}

            {/* 주문 파일접수 — 한 묶음(upload_group=1): 공유 업로드 / 각각(=0): 옵션 라인별(renderLine 내부) */}
            {uploadUse && !uploadEach && uploadItems.length > 0 && (
              <div className="mt-3">
                <p className={labelCls}>주문 파일접수</p>
                {renderUploads((i) => groupUp[i], (i, v) => setGroupUp((cur) => { const n = { ...cur }; if (v) n[i] = v; else delete n[i]; return n; }), "g")}
              </div>
            )}
            {uploadEach && uploadItems.length > 0 && (
              <p className="mt-3 text-[13px] text-sub">주문 파일접수는 주문옵션마다 개별 첨부합니다.</p>
            )}

            {/* 합계 */}
            {lines.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                {bulkDiscount > 0 && (
                  <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                    <span className="text-sub">대량구매 할인</span>
                    <span className="font-semibold text-sale">-{won(bulkDiscount)}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-sub">총 수량 {totalQty}개</span>
                  <span className="text-sm text-sub">합계 <b className="text-xl text-text">{won(total)}</b></span>
                </div>
              </div>
            )}

            {hasOptions && productLines.length === 0 && <p className="mt-2 text-[13px] text-sub">주문옵션을 선택해 주세요.</p>}
            {reqMissing && <p className="mt-2 text-[13px] text-sale">필수 추가옵션을 선택해 주세요.</p>}
            {requestMissing && <p className="mt-2 text-[13px] text-sale">요청사항을 입력해 주세요.</p>}
            {requestBad && <p className="mt-2 text-[13px] text-sale">요청사항에 사용할 수 없는 문자(^N, ^S)가 포함되어 있습니다.</p>}
            {uploadMissing && <p className="mt-2 text-[13px] text-sale">필수 첨부 파일을 업로드해 주세요.</p>}
            {summedMin && <p className="mt-2 text-[13px] text-sale">최소 {pv.quantity_min}개 이상 주문해 주세요.</p>}
            {summedMax && <p className="mt-2 text-[13px] text-sale">최대 {pv.quantity_max}개까지 주문할 수 있습니다.</p>}

            {/* 버튼 */}
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={onWish} aria-label="관심상품"
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-md border ${wished ? "border-sale text-sale" : "border-line text-sub"} hover:border-accent`}>
                {wished ? "♥" : "♡"}
              </button>
              {soldoutOptionPicker ? (
                <div className="grid h-12 flex-1 place-items-center rounded-md bg-surface text-sm font-bold text-sub">품절</div>
              ) : (
                <>
                  <button type="button" onClick={onAddCart} disabled={!canBuy || busy}
                    className="h-12 flex-1 cursor-pointer rounded-md border border-accent bg-card text-sm font-bold text-accent hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50">장바구니</button>
                  <button type="button" onClick={onBuyNow} disabled={!canBuy || busy}
                    className="h-12 flex-1 cursor-pointer rounded-md border-0 bg-accent text-sm font-bold text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">바로구매</button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* 장바구니 담기 완료 모달 — confirm 대체 */}
      {added && <CartAddedModal onClose={() => setAdded(false)} onGoCart={() => { setAdded(false); router.push("/cart"); }} />}
      {restockPid != null && <RestockModal productId={restockPid} onClose={() => setRestockPid(null)} />}

      {/* 우측 사이드 주문패널 — 페이지 Tabs 우측 슬롯(#pd-side-slot)으로 포털. 헤더 옵션과 같은 상태 → 자동 동기화 */}
      {sideSlot && sideOrderVisible && createPortal(renderSidePanel(), sideSlot)}

      {/* 배송정보 모달 — 배송방법/유형/기본배송비/무료조건/지역·무게·구간·반복 할증 */}
      {showDelivery && (() => {
        const d = pv.delivery;
        // 택배 추가 배송비 안내(무게/구간/반복)
        const ec = d.extra_charge ?? 0;
        const extras: string[] = [];
        if (ec === 1 && (d.weight ?? 0) > 0) extras.push(`상품/수량 합계 ${d.weight}Kg 단위 전체 배송비 반복 부과`);
        if (ec === 2) extras.push(`${(d.range2_from ?? 0) + 1}개 이상 구매 시 추가 배송비 ${won(d.range2_price ?? 0)}`);
        if (ec === 3) { extras.push(`${(d.range2_from ?? 0) + 1}~${d.range3_from ?? 0}개까지 추가 배송비 ${won(d.range2_price ?? 0)}`); extras.push(`${(d.range3_from ?? 0) + 1}개 이상 구매 시 추가 배송비 ${won(d.range3_price ?? 0)}`); }
        if (ec === 9) extras.push(`상품/수량 합계 ${d.repeat_quantity ?? 0}개마다 기본 배송비 반복 부과`);
        const pay = (t: number) => (t === 10 ? "무료배송" : t === 31 ? "유료 (선불)" : t === 32 ? "유료 (착불)" : t === 33 ? "선불/착불 선택" : "");
        // 상품에 설정된 배송수단별 카드 구성
        type Card = { title: string; rows: [string, string][]; note?: string };
        const cards: Card[] = [];
        // 미배송(0)은 배송수단 카드를 만들지 않는다 — 아래 «상세 이용안내» 카드(nothing_detail)만 노출(장바구니/주문 모달과 동일 패턴).
        if (d.use !== 0) {
          if (d.parcel_type) {
            const rows: [string, string][] = [];
            if (d.parcel_title) rows.push(["택배사", d.parcel_title]);
            let feeLabel = "";
            if ([10, 11, 12].includes(d.parcel_type)) feeLabel = "무료배송";
            else if ([21, 22, 23].includes(d.parcel_type)) feeLabel = `조건부 무료 (${won(d.free_over)} 이상 무료)`;
            else if ([31, 33].includes(d.parcel_type)) feeLabel = "유료 (선불)";
            if ([32, 33].includes(d.parcel_type)) feeLabel = feeLabel && d.parcel_type === 33 ? feeLabel + " / 착불" : "유료 (착불)";
            rows.push(["배송유형", feeLabel]);
            if (![10, 11, 12].includes(d.parcel_type)) rows.push(["기본 배송비", d.fee > 0 ? won(d.fee) : "무료"]);
            if (d.free_over > 0) rows.push(["무료배송 조건", `${won(d.free_over)} 이상`]);
            if (d.area1_price > 0) rows.push(["제주 추가", `+${won(d.area1_price)}`]);
            if (d.area2_price > 0) rows.push(["도서산간 추가", `+${won(d.area2_price)}`]);
            rows.push(["묶음배송", d.bundle === 0 ? "가능" : d.bundle === 2 ? "부분가능" : "불가"]);
            cards.push({ title: "택배", rows, note: extras.join(" / ") || undefined });
          }
          if (d.night_use) cards.push({ title: "당일배송", rows: [["배송비", d.night_price ? `${won(d.night_price)} 선불` : "무료"]] });
          if (d.dawn_use) cards.push({ title: "새벽배송", rows: [["배송비", d.dawn_price ? `${won(d.dawn_price)} 선불` : "무료"]] });
          if (d.courier_type) cards.push({ title: "퀵배송", rows: [["배송유형", pay(d.courier_type)]] });
          if (d.direct_type) cards.push({ title: "직접배송", rows: [["배송유형", pay(d.direct_type)]] });
          if (d.visit_type) cards.push({ title: "방문수령", rows: [["안내", "매장 방문 수령"]] });
          if (d.country_type) {
            const cl = d.country_type === 10 ? "무료배송" : d.country_type === 31 ? `${won(d.country_price)} 선불` : d.country_type === 33 ? "상품 주문 후 배송비 2차 결제" : "유료 (착불)";
            cards.push({ title: "해외배송", rows: [["배송비", cl]] });
          }
        }
        return (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="배송정보">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDelivery(false)} />
          <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-xl bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-lg font-bold text-text">{pv.delivery.use === 0 ? "이용안내" : "배송정보"}</h2>
              <button type="button" onClick={() => setShowDelivery(false)} aria-label="닫기" className="grid h-8 w-8 place-items-center rounded-full text-text hover:bg-line">✕</button>
            </div>
            <div className="overflow-y-auto px-6 py-5">
              {/* 해외직구 상품 안내(레거시 getOverseas) — 모달 상단, 상품페이지 카드와 동일 구성 */}
              {d.use === 2 && d.overseas && (() => {
                const o = d.overseas!;
                const omd = o.date ? o.date.split("-") : null; // [Y,M,D]
                return (
                  <div className="mb-3 rounded-lg border border-line bg-surface/40 p-4">
                    <p className="text-[15px] font-bold text-text">해외직구 상품</p>
                    <p className="mt-0.5 text-[12px] text-sub">해외에서 국내로 배송되는 상품입니다.</p>
                    <dl className="mt-2.5 space-y-1.5 text-[13px]">
                      {o.country ? <div className="flex justify-between gap-3"><dt className="shrink-0 text-sub">배송국가</dt><dd className="text-right text-text">{o.country}</dd></div> : null}
                      {o.day > 0 && <div className="flex justify-between gap-3"><dt className="shrink-0 text-sub">배송기간</dt><dd className="text-right text-text">약 {o.day}일 소요 예정{omd ? ` (${Number(omd[1])}월 ${Number(omd[2])}일)` : ""}</dd></div>}
                      <div className="flex justify-between gap-3"><dt className="shrink-0 text-sub">관부가세</dt><dd className="text-right text-text">{o.customs === 1 ? "포함" : "미포함"}{o.return_price > 0 ? ` / 반품 배송비 ${won(o.return_price)}` : ""}</dd></div>
                    </dl>
                  </div>
                );
              })()}
              {pv.delivery.use !== 0 && <p className="mb-3 text-[13px] text-sub">이 상품에 설정된 배송수단입니다.</p>}
              <div className="space-y-3">
                {cards.map((c, ci) => (
                  <div key={ci} className="rounded-lg border border-line bg-surface/40 p-4">
                    <p className="text-[15px] font-bold text-text">{c.title}</p>
                    <dl className="mt-2 space-y-1.5 text-[13px]">
                      {c.rows.map(([k, v], ri) => (
                        <div key={ri} className="flex justify-between gap-3">
                          <dt className="shrink-0 text-sub">{k}</dt>
                          <dd className="text-right text-text">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {c.note ? <p className="mt-2 border-t border-line pt-2 text-[12px] text-sub">※ {c.note}</p> : null}
                  </div>
                ))}
              </div>
              {d.use === 0 ? (
                /* 미배송 — 타이틀=nothing_guide / 본문=nothing_detail */
                <div className="rounded-lg border border-line bg-surface/40 p-4">
                  <p className="text-[15px] font-bold text-text">{d.guide || "이용안내"}</p>
                  {d.guide_detail ? <p className="mt-1.5 whitespace-pre-line text-[13px] text-sub">{d.guide_detail}</p> : null}
                </div>
              ) : d.guide_detail ? (
                <div className="mt-3 rounded-md border border-line bg-surface/40 p-4">
                  <p className="text-[13px] font-semibold text-text">상세 이용안내</p>
                  <p className="mt-1.5 whitespace-pre-line text-[13px] text-sub">{d.guide_detail}</p>
                </div>
              ) : d.guide ? <p className="mt-3 whitespace-pre-line text-[13px] text-sub">{d.guide}</p> : null}
            </div>
          </div>
        </div>
        );
      })()}

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

      {/* 쿠폰 받기 모달 — 상품에서 받을 수 있는 다운로드 쿠폰 목록 */}
      {showCoupons && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="쿠폰 받기">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCoupons(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text">쿠폰 받기</h2>
              <button type="button" onClick={() => setShowCoupons(false)} aria-label="닫기" className="grid h-8 w-8 place-items-center rounded-full text-text hover:bg-line">✕</button>
            </div>
            <ul className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto">
              {coupons.map((c) => {
                const amt = couponDiscount(c, pv.price.sale);
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-lg border border-line p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-text">{c.name || c.title || "쿠폰"}</p>
                      <p className="mt-0.5 text-[12px] text-sub">{couponBenefit(c)}</p>
                      {amt > 0 && <p className="mt-0.5 text-[12px] font-semibold text-sale">이 상품 {won(amt)} 할인</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadCoupon(c.id)}
                      disabled={couponBusy === c.id || !!couponDone[c.id]}
                      className="h-9 shrink-0 rounded-md border border-sale px-3.5 text-[13px] font-bold text-sale hover:bg-sale/5 disabled:cursor-not-allowed disabled:border-line disabled:text-sub"
                    >
                      {couponDone[c.id] ? "받기 완료" : couponBusy === c.id ? "받는 중…" : "받기"}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-[12px] text-sub">* 받은 쿠폰은 주문 결제 시 적용할 수 있습니다. 최소 주문금액 등 사용 조건은 쿠폰마다 다를 수 있습니다.</p>
          </div>
        </div>
      )}

      {/* 배송방법 변경 모달 — 수단이 2개 이상일 때 «수단변경» 버튼으로 열림 */}
      {showDeliverySelect && (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="배송방법 변경">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDeliverySelect(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-text">배송방법 선택</h2>
              <button type="button" onClick={() => setShowDeliverySelect(false)} aria-label="닫기" className="grid h-8 w-8 place-items-center rounded-full text-text hover:bg-line">✕</button>
            </div>
            <ul className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto">
              {deliveryOpts.map((d) => {
                const active = d.value === deliveryType;
                return (
                  <li key={d.value}>
                    <button
                      type="button"
                      onClick={() => { setDeliveryType(d.value); setShowDeliverySelect(false); }}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-sm ${active ? "border-accent bg-accent/5 font-bold text-accent" : "border-line text-text hover:border-accent/60"}`}
                    >
                      <span>{d.label}</span>
                      {active && (
                        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
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
