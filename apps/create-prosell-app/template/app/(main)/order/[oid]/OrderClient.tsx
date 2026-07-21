"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { won, formatPhone, deliveryFeeStatus } from "@/lib/format";
import Zipcode from "@/components/Zipcode";
import AddressBook from "@/components/AddressBook";
import CouponModal from "@/components/CouponModal";
import type { CheckoutInit, CheckoutSession, CheckoutInput, SavedAddress, TermsId } from "@/lib/prosell";
import { PAY_SVG } from "@/lib/paySvg";

type PaySel = { key: string; kind: "general" | "easy" | "bank"; pay_payment: number; pay_method: number; label: string };

type GroupDeliveryMeta = NonNullable<CheckoutSession["groups"]>[number];
type DeliveryModal = { supplier: string; shipping_fee: number; meta: GroupDeliveryMeta | null };

const TERMS_TITLE: Record<TermsId, string> = {
  service: "서비스 이용약관 동의",
  privacy: "개인정보수집 및 이용 동의",
  order_service: "서비스 이용약관 동의",
  order_privacy: "개인정보수집 및 이용 동의",
  order_entrust: "개인정보 판매자 제공 동의",
  order_guest: "비회원 주문 동의",
};

export default function OrderClient() {
  const router = useRouter();
  const params = useParams<{ oid: string }>();
  const sp = useSearchParams();
  const oid = String(params.oid || "");
  // 로그인 화면에서 «비회원으로 구매» 를 고르면 guest=1 로 되돌아온다(레거시 ?redirect=true 와 동일 역할).
  // 로그인 페이지의 redirect(복귀 경로)와 이름이 겹치지 않도록 guest 를 쓴다.
  const guestBypass = sp.get("guest") === "1";

  const [init, setInit] = useState<CheckoutInit | null>(null);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [fromCart, setFromCart] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [authErr, setAuthErr] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const addr2Ref = useRef<HTMLInputElement | null>(null); // 상세주소 입력 — 주소찾기 반영 후 포커스 이동

  const idem = useMemo(() => (typeof crypto !== "undefined" ? crypto.randomUUID().replace(/-/g, "") : oid), [oid]);

  const [name, setName] = useState("");
  const [hp, setHp] = useState("");
  const [email, setEmail] = useState("");
  const [rName, setRName] = useState("");
  const [rHp, setRHp] = useState("");
  const [rZip, setRZip] = useState("");
  const [rAddr1, setRAddr1] = useState("");
  const [rAddr2, setRAddr2] = useState("");
  const [rAdmcode, setRAdmcode] = useState("");
  // 해외 배송지(해외배송 method=5) — 국가/우편번호/주/도시/상세주소
  const [oCountry, setOCountry] = useState("");
  const [oPostcode, setOPostcode] = useState("");
  const [oState, setOState] = useState("");
  const [oCity, setOCity] = useState("");
  const [oDetail, setODetail] = useState("");
  const [msg, setMsg] = useState("");
  const [selKey, setSelKey] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [sender, setSender] = useState("");
  const [agree, setAgree] = useState(false);
  const [zipOpen, setZipOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [couponModal, setCouponModal] = useState<"bundle" | "delivery" | null>(null);
  const [prodCoupon, setProdCoupon] = useState<{ lineId: number; applied: number } | null>(null); // 상품쿠폰 모달 대상 품목
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryModal | null>(null); // 배송수단 정보 모달
  const [termsId, setTermsId] = useState<TermsId | null>(null); // 열린 약관 모달 id
  const [termsHtml, setTermsHtml] = useState("");
  const [termsBusy, setTermsBusy] = useState(false);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [addrPick, setAddrPick] = useState(""); // 선택된 저장 배송지 id("" = 직접입력)
  const [msgPreset, setMsgPreset] = useState(""); // 배송 요청사항 프리셋("__custom__"=직접입력)
  const [msgIndividual, setMsgIndividual] = useState(false); // 배송 그룹별 개별 메시지(delivery_msgtype)
  const [groupMsgs, setGroupMsgs] = useState<string[]>([]); // 그룹별 메시지(최종 문자열)
  const [groupPresets, setGroupPresets] = useState<string[]>([]); // 그룹별 프리셋 선택("__custom__"=직접입력)
  const [pointUse, setPointUse] = useState(""); // 사용할 적립금(문자열 입력)
  // 현금영수증(무통장/가상계좌). "0"=미신청, "1"=소득공제, "2"=지출증빙, "3"=세금계산서
  const [receiptType, setReceiptType] = useState("0");
  const [receiptNum, setReceiptNum] = useState("");
  const [rcCorp, setRcCorp] = useState("");
  const [rcName, setRcName] = useState("");
  const [rcEmail, setRcEmail] = useState("");
  const [rcAddr, setRcAddr] = useState("");
  const [rcBiztype, setRcBiztype] = useState("");
  const [rcBizclass, setRcBizclass] = useState("");

  // 배송지 선택(어느 세그먼트를 눌렀는지)을 oid 단위로 기억 → 새로고침 시 값-비교 없이 그대로 복원.
  // "직접 입력"=direct, "최근 배송지"=recent, 그 외=저장 배송지 id. (자동저장 레이스로 세션값이 비어도 복원 가능)
  const pickKey = `orderAddrPick:${oid}`;
  const persistPick = (v: string) => { try { localStorage.setItem(pickKey, v); } catch { /* 무시 */ } };

  function applyRecent(r: NonNullable<CheckoutInit["recent"]>) {
    setRName(r.name || ""); setRHp(r.hp || r.tel || "");
    setRZip(r.zipcode || ""); setRAddr1(r.addr1 || ""); setRAddr2(r.addr2 || ""); setRAdmcode(r.admcode || "");
  }

  // 저장 배송지 선택 / 직접입력 전환(레거시 receive_type 0·1·2 대응).
  function selectSaved(a: SavedAddress) { setAddrPick(String(a.id)); applyAddress(a); persistPick(String(a.id)); }
  function selectRecent() {
    const r = init?.recent;
    if (!r) return;
    setAddrPick("recent"); applyRecent(r); persistPick("recent");
  }
  function selectDirect() {
    setAddrPick("");
    setRName(""); setRHp(""); setRZip(""); setRAddr1(""); setRAddr2(""); setRAdmcode("");
    persistPick("direct");
  }

  // 저장된 배송지를 받는분/연락처/주소 폼에 채운다.
  function applyAddress(a: SavedAddress) {
    setRName(a.name || "");
    setRHp(a.hp || a.tel || "");
    setRZip(a.zipcode || "");
    setRAddr1(a.addr1 || "");
    setRAddr2(a.addr2 || "");
    setRAdmcode(a.admcode || "");
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await fetch(`/api/order?oid=${encodeURIComponent(oid)}${guestBypass ? "&guest=1" : ""}`, { cache: "no-store" });
      if (!alive) return;
      if (r.status === 401) { setAuthErr(true); setLoaded(true); return; }
      const j = await r.json().catch(() => null);
      // 비회원 주문 정책 게이트는 «서버 컴포넌트»(page.tsx)가 먼저 처리한다(깜빡임 방지).
      // 여기까지 왔는데 403 이면 세션 만료 등 예외 상황 → 로그인으로 유도.
      if (r.status === 403 && j?.login_required) {
        router.replace(`/auth/login?redirect=${encodeURIComponent(`/order/${oid}`)}`);
        return;
      }
      if (!j?.ok) { setNotFound(true); setLoaded(true); return; }
      setInit(j.init); setSession(j.session);
      // 장바구니 주문 여부는 서버 세션(cart_product.cart_id>0)이 판별 — URL ?src= 파라미터 불필요.
      setFromCart((j.session?.from_cart ?? 1) === 1);
      const b = j.init?.buyer;
      const sv = j.session?.saved as CheckoutSession["saved"] | undefined;
      // 주문자: 저장값(증분 저장) 우선, 없으면 회원 프로필.
      setName(sv?.name || b?.name || "");
      setHp(sv?.hp || b?.hp || "");
      setEmail(sv?.email || b?.email || "");
      setSender(b?.name || "");
      if (j.init?.banks?.[0]) setBankCode(j.init.banks[0].code);
      const addrs: SavedAddress[] = Array.isArray(j.addresses) ? j.addresses : [];
      setAddresses(addrs);
      // ── 배송지 복원 ──────────────────────────────────────────────
      // 값: 세션 증분 저장값(sv.receive_*)이 있으면 그대로 복원(사용자 편집 보존).
      // 선택(세그먼트): 사용자가 마지막에 누른 값을 localStorage 마커로 결정 → 값-비교 추론 없이 정확히 복원.
      //   자동저장 레이스로 세션값이 비어도, 마커로 해당 배송지/최근 배송지 값을 재적용해 "값 안 불러옴"을 방지한다.
      const rec = (j.init?.recent ?? null) as CheckoutInit["recent"];
      const hasSaved = !!(sv && (sv.receive_name || sv.receive_addr1));
      const pick = (() => { try { return localStorage.getItem(pickKey); } catch { return null; } })();

      if (hasSaved && sv) {
        setRName(sv.receive_name); setRHp(sv.receive_hp);
        setRZip(sv.receive_zipcode); setRAddr1(sv.receive_addr1);
        setRAddr2(sv.receive_addr2); setRAdmcode(sv.receive_admcode);
        // 해외 배송지 복원
        setOCountry(sv.receive_country || ""); setOPostcode(sv.receive_postcode || "");
        setOState(sv.receive_state || ""); setOCity(sv.receive_city || ""); setODetail(sv.receive_detail || "");
      }

      const savedMatch = pick && /^[0-9]+$/.test(pick) ? addrs.find((a) => String(a.id) === pick) : undefined;
      if (pick === "recent" && rec) {
        setAddrPick("recent"); if (!hasSaved) applyRecent(rec);
      } else if (pick === "direct") {
        setAddrPick(""); if (!hasSaved) { setRName(b?.name || ""); setRHp(b?.hp || ""); }
      } else if (savedMatch) {
        setAddrPick(String(savedMatch.id)); if (!hasSaved) applyAddress(savedMatch);
      } else if (hasSaved && sv) {
        // 마커 없음(최초/구버전) → 저장값과 저장 배송지/최근 배송지를 주소 3요소로 비교해 최선 추정.
        const norm = (s?: string) => (s || "").replace(/\s+/g, "");
        const sameAddr = (a: { zipcode?: string; addr1?: string; addr2?: string }) =>
          norm(a.zipcode) === norm(sv.receive_zipcode) &&
          norm(a.addr1) === norm(sv.receive_addr1) &&
          norm(a.addr2) === norm(sv.receive_addr2);
        const match = addrs.find(sameAddr);
        if (match) setAddrPick(String(match.id));
        else if (rec && sameAddr(rec)) setAddrPick("recent");
        else setAddrPick("");
      } else {
        // 최초 진입(세션값·마커 모두 없음) → 기본 배송지 자동 선택.
        setRName(b?.name || ""); setRHp(b?.hp || "");
        const def = addrs.find((a) => a.is_default) ?? addrs[0];
        if (def) { setAddrPick(String(def.id)); applyAddress(def); }
      }
      // 요청사항/적립금 복원
      if (sv?.point_price) setPointUse(String(sv.point_price));
      const savedMsg = sv?.delivery_message || "";
      if ((sv?.delivery_msgtype ?? 0) === 1 && savedMsg.includes("|")) {
        setMsgIndividual(true);
        const parts = savedMsg.split("|");
        setGroupMsgs(parts);
        setGroupPresets(parts.map((p) => (p ? (DELIVERY_MSGS.includes(p) ? p : "__custom__") : "")));
      } else if (savedMsg) {
        setMsg(savedMsg);
        setMsgPreset(DELIVERY_MSGS.includes(savedMsg) ? savedMsg : "__custom__");
      }
      setLoaded(true);
    })();
    return () => { alive = false; if (pollRef.current) clearInterval(pollRef.current); };
    // guestBypass/router — 비회원 주문 정책 게이트에서 사용.
  }, [oid, guestBypass, router]);

  // 약관 모달 열기 — 본문(HTML)을 서버에서 받아 표시(레거시 [data-btn=terms] 재현).
  async function openTerms(id: TermsId) {
    setTermsId(id); setTermsHtml(""); setTermsBusy(true);
    try {
      const r = await fetch(`/api/terms?id=${id}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      setTermsHtml(j?.ok ? (j.content || "") : "");
    } catch { setTermsHtml(""); }
    setTermsBusy(false);
  }

  // 주문 세션 재조회(배송비/할인/쿠폰 갱신). admcode 있으면 도서산간/제주 할증 반영.
  async function refreshSession() {
    const q = rAdmcode ? `&admcode=${encodeURIComponent(rAdmcode)}` : "";
    const r = await fetch(`/api/order?oid=${encodeURIComponent(oid)}${q}`, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (j?.ok && j.session) setSession(j.session);
  }

  // 배송지(법정동코드) 변경 시 배송비 재견적 — 도서산간/제주 할증을 실시간 반영.
  useEffect(() => {
    if (!loaded || !rAdmcode) return;
    let alive = true;
    (async () => {
      const r = await fetch(`/api/order?oid=${encodeURIComponent(oid)}&admcode=${encodeURIComponent(rAdmcode)}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (alive && j?.ok && j.session) setSession(j.session);
    })();
    return () => { alive = false; };
  }, [rAdmcode, loaded, oid]);

  const total = session?.summary.total_price ?? 0;        // 적립금 반영 전 결제금액
  const isMember = (session?.from_mid ?? 0) > 0;          // 회원 세션(쿠폰 사용 가능)
  const point = init?.point ?? 0;                         // 보유 적립금
  const fullPointAllowed = (init?.methods.point ?? 0) === 1; // 전액 적립금 결제 허용 여부
  // 적립금 사용 조건(레거시 setup_pay pay900_*). 0 = 제한 없음.
  const itemPrice = session?.summary.item_price ?? 0;         // 판매가(할인반영) 합계 — pay900_order 비교 대상
  const pointOrderMin = session?.summary.point_order_min ?? 0; // 이 판매가 합계 이상이어야 사용 가능
  const pointMinUse = session?.summary.point_min ?? 0;         // 1회 최소 사용 포인트
  const pointMaxUse = session?.summary.point_max ?? 0;         // 1회 최대 사용 포인트(0=무제한)
  // 적립금 사용 가능 여부 — 레거시 Cart\Order::is_point 가드.
  //  ① 포인트 사용불가 상품이 1개라도 포함되면 불가(point_allow=0)
  //  ② 판매가 합계가 pay900_order 미만이면 불가
  //  ③ 보유 적립금이 pay900_min 미만이면 불가(최소 사용액도 못 채움)
  const pointAllowProduct = (session?.summary.point_allow ?? 1) !== 0;
  const orderMinOk = pointOrderMin <= 0 || itemPrice >= pointOrderMin;
  const balanceMinOk = pointMinUse <= 0 || point >= pointMinUse;
  const pointAllow = pointAllowProduct && orderMinOk && balanceMinOk;

  // 사용 가능한 적립금 = min(보유, 결제금액, 최대 사용한도). 입력값은 이 범위로 클램프.
  const pointMax = pointAllow ? Math.min(point, total, pointMaxUse > 0 ? pointMaxUse : Infinity) : 0;
  const pointUseNum = Math.max(0, Math.min(Number(pointUse) || 0, pointMax));
  // 최소 사용 조건 미달(0 초과 ~ 최소 미만) — 제출 차단 + 안내.
  const pointBelowMin = pointUseNum > 0 && pointMinUse > 0 && pointUseNum < pointMinUse;
  const fullPoint = total > 0 && pointUseNum >= total; // 적립금이 결제금액 전액을 덮음
  const payTotal = Math.max(0, total - pointUseNum);   // 실제 결제할 금액

  // 주문서 입력값 → cart_order 증분 저장 페이로드(레거시 Update.php 규격).
  //  - 개별(msgtype=1)만 그룹 n=1..cnt 를 "|" 로 결합, 공통은 단일 문자열(반복 없음).
  const buildDraft = useCallback(() => {
    const cnt = session?.delivery_cnt ?? 1;
    const deliveryMessage = (cnt > 1 && msgIndividual)
      ? Array.from({ length: cnt }, (_, i) => groupMsgs[i] || "").join("|")
      : msg;
    return {
      oid,
      fields: {
        name, hp, email,
        receive_name: rName, receive_hp: rHp, receive_zipcode: rZip,
        receive_addr1: rAddr1, receive_addr2: rAddr2, receive_admcode: rAdmcode,
        receive_country: oCountry, receive_postcode: oPostcode, receive_state: oState, receive_city: oCity, receive_detail: oDetail,
        delivery_message: deliveryMessage,
        delivery_msgtype: cnt > 1 && msgIndividual ? 1 : 0,
        point_price: pointUseNum,
      },
    };
  }, [oid, name, hp, email, rName, rHp, rZip, rAddr1, rAddr2, rAdmcode, oCountry, oPostcode, oState, oCity, oDetail, msg, msgIndividual, groupMsgs, pointUseNum, session?.delivery_cnt]);

  const saveDraft = useCallback(() => {
    if (!loaded) return;
    fetch("/api/order", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildDraft()),
    }).catch(() => {});
  }, [loaded, buildDraft]);

  // 레거시처럼 입력 즉시 저장 — 변경 후 800ms 디바운스(+ 커스텀 입력은 blur 시 즉시 저장으로 보완).
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(saveDraft, 800);
    return () => clearTimeout(t);
  }, [loaded, saveDraft]);

  // 결제수단 순서 — 레거시 order.js: 간편결제(2) → 일반결제(1) → 무통장(3).
  const options: PaySel[] = useMemo(() => {
    if (!init) return [];
    const o: PaySel[] = [];
    for (const m of init.methods.easy) o.push({ key: `easy:${m.method}`, kind: "easy", pay_payment: 2, pay_method: m.method, label: m.label });
    for (const m of init.methods.general) o.push({ key: `general:${m.method}`, kind: "general", pay_payment: 1, pay_method: m.method, label: m.label });
    if (init.methods.bank) o.push({ key: "bank:300", kind: "bank", pay_payment: 3, pay_method: 300, label: "무통장입금" });
    return o;
  }, [init]);

  useEffect(() => {
    // 선택된 결제수단이 없으면 첫 번째 수단으로 기본 선택(무통장 강제 아님). options 순서=일반→간편→무통장.
    if (!selKey && options.length) setSelKey(options[0].key);
  }, [options, selKey]);

  const sel = options.find((o) => o.key === selKey) || null;
  const isBank = sel?.kind === "bank";
  // 현금영수증 신청 가능 결제수단(레거시 order.js getReceipt 와 동일):
  //  · 일반결제(1) 계좌이체(120)·가상계좌(130)  · 간편결제(2) 202·203·204·210  · 무통장입금(3→300)
  const RECEIPT_METHODS: Record<number, number[]> = { 1: [120, 130], 2: [202, 203, 204, 210], 3: [300] };
  const isCash = !fullPoint && !!sel && (RECEIPT_METHODS[sel.pay_payment]?.includes(sel.pay_method) ?? false);
  // 세금계산서(type 3)는 무통장입금(300) + 쇼핑몰이 세금계산서 발행 허용일 때만.
  const taxInvoiceOk = isCash && sel?.pay_method === 300 && (init?.taxinvoice ?? 0) === 1;

  // 결제수단이 바뀌어 현재 현금영수증 선택이 무효가 되면 되돌린다(세금계산서→무통장 아님, 현금성 아님).
  useEffect(() => {
    if (receiptType === "3" && !taxInvoiceOk) setReceiptType("0");
    else if (!isCash && receiptType !== "0") setReceiptType("0");
  }, [isCash, taxInvoiceOk, receiptType]);

  // 현금영수증 검증: 미신청이거나, 번호 입력(세금계산서는 상호·대표자까지) 시 유효.
  const receiptOk = !isCash || receiptType === "0" || (!!receiptNum && (receiptType !== "3" || (!!rcCorp && !!rcName)));
  // 결제수단 검증: 적립금이 전액을 덮으면(전액포인트 허용 시) 수단 불필요, 아니면 수단 필수.
  const paymentOk = fullPoint
    ? fullPointAllowed
    : (!!sel && (isBank ? !!bankCode && !!sender : true));
  // 배송 성격 — 세션 그룹의 배송수단(첫자리)으로 판정.
  //  · 미배송(0)·방문수령(4): 배송지 입력 불필요  · 해외배송(5): 해외 배송지 폼  · 그 외: 국내 배송지
  const grpMethods = (session?.groups ?? []).map((g) => g.method ?? 0);
  const needsAddress = grpMethods.length === 0 ? true : grpMethods.some((m) => m !== 0 && m !== 4);
  const isOverseas = grpMethods.some((m) => m === 5);
  // 배송지 필수 검증: 미배송/방문이면 생략, 해외면 국가·도시·성명·연락처, 국내면 우편·주소.
  const addressOk = !needsAddress
    ? true
    : isOverseas
    ? (!!rName && !!rHp && !!oCountry && !!oCity && !!oPostcode)
    : (!!rName && !!rHp && !!rZip && !!rAddr1);
  const valid = addressOk && !!hp && agree && paymentOk && receiptOk && !pointBelowMin;

  function stopPoll() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }

  function startPolling(pno: string, payurl: string) {
    setPaying(true);
    if (payurl) window.open(payurl, "payOrder", "width=800,height=700,scrollbars=1");
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/order?callback=1&pno=${encodeURIComponent(pno)}`, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!j?.ok) return;
        if (j.state === "complete") { stopPoll(); if (fromCart) window.dispatchEvent(new Event("cart-change")); router.replace(`/order/complete/${pno}`); }
        else if (j.state === "failed") { stopPoll(); setPaying(false); setBusy(false); setErr("결제가 취소되었거나 실패했습니다."); }
      } catch { /* 다음 폴링 */ }
    }, 4000);
  }

  async function submit() {
    if (!valid || busy) return;
    setErr(""); setBusy(true);
    // 레거시 Update.php 규격: 개별(msgtype=1)만 그룹 n=1..cnt 를 "|" 로 결합, 공통은 단일 문자열(반복 없음).
    const deliveryCnt = session?.delivery_cnt ?? 1;
    const deliveryMessage = (deliveryCnt > 1 && msgIndividual)
      ? Array.from({ length: deliveryCnt }, (_, i) => groupMsgs[i] || "").join("|")
      : msg;
    const base = {
      oid, from_cart: fromCart, name, hp, email,
      receive_name: rName, receive_hp: rHp, receive_zipcode: rZip,
      receive_addr1: rAddr1, receive_addr2: rAddr2, receive_admcode: rAdmcode,
      receive_country: oCountry, receive_postcode: oPostcode, receive_state: oState, receive_city: oCity, receive_detail: oDetail,
      delivery_message: deliveryMessage,
      delivery_msgtype: deliveryCnt > 1 && msgIndividual ? 1 : 0,
    };
    const pointPart = pointUseNum > 0 ? { point_price: pointUseNum } : {};
    // 현금영수증 신청(현금성 결제 + 신청 선택 시). 세금계산서(3)는 회사정보 포함.
    const receiptPart = isCash && receiptType !== "0"
      ? {
          pay_receipt_type: Number(receiptType),
          pay_receipt_num: receiptNum.replace(/-/g, ""),
          ...(receiptType === "3" ? {
            pay_receipt_corpname: rcCorp, pay_receipt_name: rcName, pay_receipt_email: rcEmail,
            pay_receipt_address: rcAddr, pay_receipt_biztype: rcBiztype, pay_receipt_bizclass: rcBizclass,
          } : {}),
        }
      : {};
    // 적립금이 결제금액 전액을 덮으면 전액 적립금 결제(pay_method 900), 아니면 선택 수단 + 부분 적립금.
    const input: CheckoutInput =
      fullPoint
        ? { ...base, pay_payment: 0, pay_method: 900, point_price: total }
        : sel!.kind === "bank"
          ? { ...base, pay_payment: 3, pay_method: 300, pay_bank_code: bankCode, pay_bank_name: sender, ...pointPart, ...receiptPart }
          : { ...base, pay_payment: sel!.pay_payment, pay_method: sel!.pay_method, ...pointPart, ...receiptPart };
    try {
      const res = await fetch("/api/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input, idempotency_key: idem }) });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error || "주문에 실패했습니다."); setBusy(false); return; }
      if (j.polling === 1) startPolling(String(j.pno), String(j.payurl || ""));
      else { if (fromCart) window.dispatchEvent(new Event("cart-change")); router.replace(`/order/complete/${j.pno}`); }
    } catch { setErr("주문 요청 중 오류가 발생했습니다."); setBusy(false); }
  }

  if (loaded && authErr) return <Notice msg="주문하려면 로그인이 필요합니다." href="/auth/login" cta="로그인" />;
  if (loaded && notFound) return <Notice msg="주문 세션을 찾을 수 없습니다(만료되었거나 잘못된 접근)." href="/cart" cta="장바구니로" />;
  if (loaded && (session?.items.length ?? 0) === 0) return <Notice msg="주문할 상품이 없습니다." href="/" cta="쇼핑 계속하기" />;

  const items = session?.items ?? [];
  const s = session?.summary;

  // 배송그룹핑(레거시 getProduct) — 상품 순서는 서버 list 순서를 그대로 보존한다.
  // 그룹은 "품목이 처음 등장한 순서"로 형성(레거시가 consecutive list 를 group 헤더/푸터로 감싸는 것과 동일).
  // 배송비/공급자는 session.groups 메타에서 key 로 조회. 메타/그룹키가 없으면 단일 그룹으로 폴백.
  type GroupMeta = NonNullable<CheckoutSession["groups"]>[number];
  const productGroups = (() => {
    const metaMap = new Map((session?.groups ?? []).map((m) => [m.key, m]));
    const order: string[] = [];
    const byKey = new Map<string, { key: string; supplier_title: string; shipping_fee: number; meta: GroupMeta | null; items: typeof items }>();
    for (const it of items) {
      const key = it.group ?? "";
      if (!byKey.has(key)) {
        const m = metaMap.get(key);
        byKey.set(key, {
          key,
          supplier_title: m?.supplier_title ?? it.supplier_title ?? "",
          shipping_fee: m?.shipping_fee ?? 0,
          meta: m ?? null,
          items: [],
        });
        order.push(key);
      }
      byKey.get(key)!.items.push(it);
    }
    if (order.length === 0) return [{ key: "_", supplier_title: "", shipping_fee: s?.delivery_price ?? 0, meta: null, items }];
    return order.map((k) => byKey.get(k)!);
  })();

  return (
    <div className="mx-auto max-w-content px-4 py-4 sm:py-6">
      <h1 className="text-2xl font-bold text-text">주문/결제</h1>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-5">
          <Section title="주문자 정보">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="이름"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} /></Field>
              <Field label="휴대폰 *"><input value={formatPhone(hp)} onChange={(e) => setHp(e.target.value.replace(/\D/g, ""))} className={inp} placeholder="010-0000-0000" /></Field>
              <Field label="이메일" full><input value={email} onChange={(e) => setEmail(e.target.value)} className={inp} /></Field>
            </div>
          </Section>

          {needsAddress && (
          <Section
            title={isOverseas ? "해외 배송지" : "배송지"}
            action={(() => {
              const btnCls = "shrink-0 rounded-full border border-line px-2.5 py-0.5 text-[12px] text-sub hover:bg-surface hover:text-text";
              // 비회원: 주소록이 없어 매번 입력해야 하므로 «주문자 정보와 동일»(받는분·연락처 복사) 제공.
              const same = !isMember ? (
                <button key="same" type="button" onClick={() => { setRName(name); setRHp(hp); }} className={btnCls}>주문자 정보와 동일</button>
              ) : null;
              const book = (!isOverseas && addresses.length > 0) ? (
                <button key="book" type="button" onClick={() => setBookOpen(true)} className={btnCls}>배송지 선택</button>
              ) : null;
              return same || book ? <div className="flex items-center gap-1.5">{same}{book}</div> : null;
            })()}
          >
            {!isOverseas && addresses.length > 0 && (() => {
              // 기본 배송지 버튼 = 주소록 저장 배송지(기본 우선, 없으면 첫 항목).
              // 배송지 관리 모달에서 기본이든 추가든 어떤 저장 배송지를 고르든 이 버튼이 활성화된다.
              const defaultAddr = addresses.find((a) => a.is_default) ?? addresses[0] ?? null;
              const hasRecent = !!init?.recent;
              const isRecentSel = addrPick === "recent";
              const isDirect = addrPick === "";
              const isDefaultSel = !isRecentSel && !isDirect; // 그 외(저장 배송지 id) = 기본 배송지 버튼 활성
              const seg = (active: boolean) =>
                `rounded-full border px-3 py-1.5 text-[13px] ${active ? "border-accent bg-accent/10 font-medium text-text" : "border-line text-sub hover:bg-surface"}`;
              return (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {defaultAddr && <button type="button" onClick={() => selectSaved(defaultAddr)} className={seg(isDefaultSel)}>기본 배송지</button>}
                  {hasRecent && <button type="button" onClick={selectRecent} className={seg(isRecentSel)}>최근 배송지</button>}
                  <button type="button" onClick={selectDirect} className={seg(isDirect)}>직접 입력</button>
                </div>
              );
            })()}
            <div className="grid gap-3 sm:grid-cols-2">
              {isOverseas ? (
                // 해외 배송지 폼(레거시 해외배송 수신정보) — 성명/휴대폰/국가/우편번호/주/도시/상세주소
                <>
                  <Field label="성명 (Recipient) *"><input value={rName} onChange={(e) => setRName(e.target.value)} className={inp} placeholder="영문 실명" /></Field>
                  <Field label="휴대폰 (Mobile) *"><input value={rHp} onChange={(e) => setRHp(e.target.value)} className={inp} placeholder="국가번호 포함" /></Field>
                  <Field label="국가 (Country) *">
                    {(session?.countries?.length ?? 0) > 0 ? (
                      <select value={oCountry} onChange={(e) => setOCountry(e.target.value)} className={selCls}>
                        <option value="">국가 선택</option>
                        {session!.countries!.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </select>
                    ) : (
                      <input value={oCountry} onChange={(e) => setOCountry(e.target.value)} className={inp} placeholder="예: US, JP, 일본" />
                    )}
                  </Field>
                  <Field label="우편번호 (Zip code) *"><input value={oPostcode} onChange={(e) => setOPostcode(e.target.value)} className={inp} /></Field>
                  <Field label="주 (State/Province)"><input value={oState} onChange={(e) => setOState(e.target.value)} className={inp} /></Field>
                  <Field label="도시 (City) *"><input value={oCity} onChange={(e) => setOCity(e.target.value)} className={inp} /></Field>
                  <Field label="상세주소 (Detail)" full><input value={oDetail} onChange={(e) => setODetail(e.target.value)} className={inp} placeholder="Street address" /></Field>
                </>
              ) : (
                <>
                  <Field label="받는분 *"><input value={rName} onChange={(e) => setRName(e.target.value)} className={inp} /></Field>
                  <Field label="연락처 *"><input value={formatPhone(rHp)} onChange={(e) => setRHp(e.target.value.replace(/\D/g, ""))} className={inp} placeholder="010-0000-0000" /></Field>
                  <Field label="우편번호 *" full>
                    <div className="flex gap-2">
                      <input value={rZip} readOnly className={`${inp} flex-1`} placeholder="주소찾기로 입력" />
                      <button type="button" onClick={() => setZipOpen(true)}
                        className="h-10 shrink-0 rounded-md border border-line px-4 text-sm font-medium text-text hover:bg-surface">주소찾기</button>
                    </div>
                  </Field>
                  <Field label="주소 *" full><input value={rAddr1} onChange={(e) => setRAddr1(e.target.value)} className={inp} placeholder="도로명/지번 주소" /></Field>
                  <Field label="상세주소" full><input ref={addr2Ref} value={rAddr2} onChange={(e) => setRAddr2(e.target.value)} className={inp} /></Field>
                </>
              )}
              {/* 배송 요청사항: 체크박스+다중 입력이라 Field(label 래핑) 대신 div 사용 — label 로 감싸면 빈 공간 클릭이 체크박스를 토글함 */}
              <div className="sm:col-span-2">
                <span className="mb-1 block text-[12px] font-medium text-sub">배송 요청사항</span>
                {(session?.delivery_cnt ?? 1) > 1 && (
                  <label className="mb-2 inline-flex w-fit cursor-pointer items-center gap-2 text-[13px] text-sub">
                    <input type="checkbox" checked={msgIndividual} onChange={(e) => setMsgIndividual(e.target.checked)} />
                    배송 그룹({session?.delivery_cnt}개)별로 요청사항 개별 입력
                  </label>
                )}
                {(session?.delivery_cnt ?? 1) > 1 && msgIndividual ? (
                  <div className="space-y-3">
                    {(session?.delivery_groups ?? []).map((g, i) => {
                      const preset = groupPresets[i] ?? "";
                      const setPreset = (v: string) => {
                        setGroupPresets((prev) => { const n = [...prev]; n[i] = v; return n; });
                        setGroupMsgs((prev) => { const n = [...prev]; n[i] = v === "__custom__" ? "" : v; return n; });
                      };
                      return (
                        <div key={i}>
                          <p className="mb-1 text-[12px] font-medium text-sub">배송 {i + 1} · {g.del_title}</p>
                          {/* 단일 필드와 동일: 셀렉트 우선 → 직접 입력 시에만 텍스트 입력 노출 */}
                          <select value={preset} onChange={(e) => setPreset(e.target.value)} className={selCls}>
                            <option value="">선택 안 함</option>
                            {DELIVERY_MSGS.map((m) => <option key={m} value={m}>{m}</option>)}
                            <option value="__custom__">직접 입력</option>
                          </select>
                          {preset === "__custom__" && (
                            <input
                              value={groupMsgs[i] || ""}
                              onChange={(e) => setGroupMsgs((prev) => { const n = [...prev]; n[i] = e.target.value; return n; })}
                              onBlur={saveDraft}
                              maxLength={50} className={`${inp} mt-2`} placeholder="요청사항 (최대 50자)"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    <select
                      value={msgPreset}
                      onChange={(e) => { const v = e.target.value; setMsgPreset(v); setMsg(v === "__custom__" ? "" : v); }}
                      className={selCls}
                    >
                      <option value="">선택 안 함</option>
                      {DELIVERY_MSGS.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value="__custom__">직접 입력</option>
                    </select>
                    {msgPreset === "__custom__" && (
                      <input value={msg} onChange={(e) => setMsg(e.target.value)} onBlur={saveDraft} maxLength={50} className={`${inp} mt-2`} placeholder="배송 요청사항을 입력하세요 (최대 50자)" />
                    )}
                  </>
                )}
              </div>
            </div>
          </Section>
          )}

          {/* 주문 상품 — 레거시 getProduct. 배송그룹 사이=실선, 동일 그룹 품목 사이=도트라인. */}
          <div className="overflow-hidden rounded-2xl border border-line bg-card divide-y divide-line">
            {productGroups.map((g) => {
              return (
                <section key={g.key}>
                  {/* 그룹 헤더: 공급자 + 배송비 + 배송수단 안내(?) */}
                  <header className="flex items-center justify-between gap-2 border-b border-line bg-surface/60 px-4 py-3">
                    <span className="text-sm font-semibold text-text">{g.supplier_title || "기본 배송"}</span>
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-text">
                      {/* 해외직구(delivery_use=2)는 배송수단 앞에 «해외직구» 표시 */}
                      {g.meta?.delivery_use === 2 && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-bold text-accent">해외직구</span>}
                      <span className="text-sub">{g.meta?.method_name || "배송"}</span>
                      {(() => {
                        // 3자리 코드로 배송비 상태 판정(착불/선불/무료/조건부무료) — fee=0 을 무료로 오판하지 않음.
                        const st = deliveryFeeStatus(g.meta?.delivery_type ?? 0, g.shipping_fee);
                        return st ? <span className={st === "무료배송" ? "text-accent" : "text-text"}>{st}</span> : null;
                      })()}
                      <button
                        type="button"
                        onClick={() => setDeliveryInfo({ supplier: g.supplier_title, shipping_fee: g.shipping_fee, meta: g.meta })}
                        aria-label="배송수단 정보"
                        className="grid h-4 w-4 cursor-pointer place-items-center rounded-full border border-line text-[10px] text-sub hover:bg-surface hover:text-text"
                      >?</button>
                    </span>
                  </header>

                  {/* 품목 — 그룹 내부는 도트라인(divide-dashed)으로 구분 */}
                  <ul className="divide-y divide-dashed divide-line">
                    {g.items.map((it, i) => (
                      <li key={i} className="flex gap-3 px-4 py-4 sm:gap-4">
                        <Link href={`/products/${it.products_id}`} className="shrink-0">
                          {it.thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.thumb} alt="" className="h-20 w-20 rounded-lg object-cover sm:h-24 sm:w-24" />
                          ) : <div className="h-20 w-20 rounded-lg bg-surface sm:h-24 sm:w-24" />}
                        </Link>

                        {/* 본문 — 레거시 getProduct: option_type>0 은 상품페이지명(tit1)+옵션명(tit2), option_type=0 은 상품페이지명만 */}
                        <div className="min-w-0 flex-1">
                          <Link href={`/products/${it.products_id}`} className="line-clamp-2 text-sm font-semibold text-text hover:text-accent">{it.title}</Link>
                          {(it.option_type ?? 0) > 0 && it.option_label && (
                            <p className="mt-0.5 text-[13px] text-sub">{it.option_label}</p>
                          )}
                          {it.soldout ? <p className="mt-1 text-[12px] font-semibold text-sale">품절</p> : null}

                          <p className="mt-2 text-[13px] text-sub">수량 {it.qty}개</p>

                          {/* 추가 주문옵션 — 수량 아래 배치. 레거시 표기 「{옵션명} : {선택값} ({가격} / {수량}개)」 */}
                          {it.addoptions.length > 0 && (
                            <div className="mt-2 rounded-md border border-line bg-surface/50 px-2.5 py-2 text-[12px] text-sub">
                              <p className="font-semibold text-text/70">추가 주문옵션</p>
                              <ul className="mt-1 space-y-0.5">
                                {it.addoptions.map((a, k) => {
                                  const paren: string[] = [];
                                  if (a.line_total) paren.push(won(a.line_total));
                                  if (a.qty > 1) paren.push(`${a.qty}개`);
                                  return <li key={k} className="truncate">{a.title} : {a.name}{paren.length ? ` (${paren.join(" / ")})` : ""}</li>;
                                })}
                              </ul>
                            </div>
                          )}

                          {/* 주문 파일접수 — 업로드한 첨부 파일 정보(레거시 arrayOrderUpload) */}
                          {it.uploads && it.uploads.length > 0 && (
                            <div className="mt-2 rounded-md border border-line bg-surface/50 px-2.5 py-2 text-[12px] text-sub">
                              <p className="font-semibold text-text/70">주문 파일접수</p>
                              <ul className="mt-1 space-y-0.5">
                                {it.uploads.map((u, k) => (
                                  <li key={k} className="flex items-center gap-1.5 truncate">
                                    <span className="text-text/70">{u.title || `첨부 ${k + 1}`}:</span>
                                    {u.name ? (
                                      u.download
                                        ? <a href={u.download} className="truncate text-accent hover:underline" download>{u.name}</a>
                                        : <span className="truncate text-text">{u.name}</span>
                                    ) : <span className="text-sale">미첨부</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* 가격 + (회원·상품쿠폰 보유 시) 쿠폰적용 버튼 — 사이 세로선은 pseudo(-inset-y-4)로 li 상하 패딩까지 100% */}
                        <div className="flex shrink-0 items-stretch">
                          <div className="flex flex-col justify-center pr-4 text-right leading-tight">
                            <span className="block text-[15px] font-bold text-text">{won(it.item_total)}</span>
                            {(it.original ?? 0) > it.item_total && (
                              <span className="block text-[12px] text-sub line-through">{won(it.original!)}</span>
                            )}
                            {(it.coupon_price ?? 0) > 0 && (
                              <span className="block text-[12px] text-sale">쿠폰 -{won(it.coupon_price!)}</span>
                            )}
                          </div>
                          {isMember && (session?.is_coupon_product ?? 0) === 1 && (it.line_id ?? 0) > 0 && (
                            <div className="relative flex items-center pl-4 before:absolute before:left-0 before:-inset-y-4 before:border-l before:border-dashed before:border-line">
                              <button
                                type="button"
                                onClick={() => setProdCoupon({ lineId: it.line_id!, applied: it.coupon_id ?? 0 })}
                                className="whitespace-nowrap rounded-md border border-accent px-3 py-2 text-[13px] font-bold text-accent transition-colors hover:bg-accent/5"
                              >
                                {(it.coupon_id ?? 0) > 0 ? "쿠폰변경" : "쿠폰적용"}
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          {(isMember || point > 0) && (() => {
            // 할인/포인트 박스 — 레거시 order.js cart-benefit 재현.
            // 즉시할인·상품할인 쿠폰(합계)·묶음할인 쿠폰·배송할인 쿠폰·포인트를 한 박스에 모음.
            const benefit = Math.max(0, (s?.goods_price ?? s?.item_price ?? 0) - (s?.item_price ?? 0)); // 즉시할인(등급/대량/상품)
            const prodCouponPrice = session?.coupons?.product_price ?? 0;      // 상품할인 쿠폰 합계
            const couponRows = ([
              { type: "bundle" as const, label: "묶음할인 쿠폰", applied: session?.coupons?.bundle },
              { type: "delivery" as const, label: "배송할인 쿠폰", applied: session?.coupons?.delivery },
            ]);
            // 왼쪽 정렬: [항목명 | 금액 | 버튼]을 좌측부터 나란히. 라벨·금액 열은 고정폭이라 세로로 맞음.
            const rowCls = "flex items-center gap-3 py-3";
            const labelCls = "w-24 shrink-0 text-sm font-medium text-text";
            const amtCls = "w-28 shrink-0 text-sm font-semibold";      // 금액 열(좌측 정렬)
            const ctrlBtn = "h-9 w-[4.75rem] shrink-0 rounded-md border px-2 text-[13px] font-medium"; // 버튼 열
            return (
              <Section title="할인/포인트">
                <div className="divide-y divide-line">
                  {benefit > 0 && (
                    <div className={rowCls}>
                      <span className={labelCls}>즉시할인</span>
                      <span className={`${amtCls} text-sale`}>-{won(benefit)}</span>
                    </div>
                  )}
                  {isMember && (session?.is_coupon_product ?? 0) === 1 && (
                    <div className={rowCls}>
                      <span className={labelCls}>상품할인 쿠폰</span>
                      <span className={`${amtCls} ${prodCouponPrice > 0 ? "text-sale" : "text-sub"}`}>
                        {prodCouponPrice > 0 ? `-${won(prodCouponPrice)}` : "-"}
                      </span>
                    </div>
                  )}
                  {isMember && couponRows.map((c) => {
                    const on = (c.applied?.id ?? 0) > 0;
                    return (
                      <div key={c.type} className={rowCls}>
                        <span className={labelCls}>{c.label}</span>
                        <span className={`${amtCls} ${on && (c.applied?.price ?? 0) > 0 ? "text-sale" : "text-sub"}`}>
                          {on && (c.applied?.price ?? 0) > 0 ? `-${won(c.applied!.price)}` : "-"}
                        </span>
                        <button type="button" onClick={() => setCouponModal(c.type)}
                          className={`${ctrlBtn} ${on ? "border-accent text-accent hover:bg-accent/5" : "border-input text-text hover:bg-surface"}`}>
                          {on ? "쿠폰변경" : "쿠폰적용"}
                        </button>
                      </div>
                    );
                  })}
                  {/* 적립금 사용 불가 사유 안내(레거시 is_point 가드) — 상품/판매가/보유 순으로 판정 */}
                  {point > 0 && !pointAllow && (
                    <div className={`${rowCls} flex-wrap`}>
                      <span className={labelCls}>포인트</span>
                      <span className="text-[13px] text-sub">
                        {!pointAllowProduct
                          ? "적립금 사용이 불가한 상품이 포함되어 있습니다."
                          : !orderMinOk
                            ? `판매가 합계 ${won(pointOrderMin)} 이상 구매 시 사용할 수 있습니다.`
                            : `적립금 ${won(pointMinUse)} 이상 보유 시 사용할 수 있습니다.`}
                      </span>
                    </div>
                  )}
                  {point > 0 && pointAllow && (
                    <>
                      <div className={rowCls}>
                        <span className={labelCls}>포인트</span>
                        <input
                          inputMode="numeric"
                          value={pointUse}
                          onChange={(e) => {
                            const n = Math.max(0, Math.min(Number(e.target.value.replace(/[^0-9]/g, "")) || 0, pointMax));
                            setPointUse(n ? String(n) : "");
                          }}
                          onBlur={saveDraft}
                          placeholder="0"
                          className="h-9 w-28 shrink-0 rounded-md border border-input bg-surface px-2 text-right text-sm text-text outline-none focus:border-accent"
                        />
                        <button type="button" onClick={() => setPointUse(String(pointMax))}
                          className={`${ctrlBtn} border-input text-text hover:bg-surface`}>전액적용</button>
                        <span className="text-[13px] text-sub">보유 {won(point)}</span>
                      </div>
                      {/* 사용 조건 도움말 — 최소/최대 한도(설정된 값만 표기) */}
                      {(pointMinUse > 0 || pointMaxUse > 0) && (
                        <ul className="mt-2 pb-1 pl-1 text-[12px] text-sub">
                          {pointMinUse > 0 && <li>· 최소 {won(pointMinUse)} 이상 사용 가능</li>}
                          {pointMaxUse > 0 && <li>· 최대 {won(pointMaxUse)} 이하 사용 가능</li>}
                        </ul>
                      )}
                      {pointBelowMin && (
                        <p className="mt-2 pb-3 text-[12px] text-sale">최소 {won(pointMinUse)} 이상 사용하거나 0으로 입력해 주세요.</p>
                      )}
                      {fullPoint && !fullPointAllowed && (
                        <p className="pb-3 text-[12px] text-sale">이 쇼핑몰은 전액 적립금 결제를 지원하지 않습니다. 결제금액이 남도록 적립금을 줄여주세요.</p>
                      )}
                    </>
                  )}
                </div>
              </Section>
            );
          })()}

          <Section title="결제수단">
            {fullPoint ? (
              <p className="rounded-md bg-surface px-3 py-2.5 text-sm text-sub">적립금으로 전액 결제됩니다. 추가 결제수단이 필요 없습니다.</p>
            ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((o) => {
                const svg = PAY_SVG[o.pay_method]; // 간편결제 브랜드 로고(있으면 라벨 대신 아이콘만)
                return (
                  <label key={o.key} title={o.label}
                    className={`flex h-12 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm text-text ${selKey === o.key ? "border-accent bg-accent/5" : "border-line"}`}>
                    {/* radio 는 숨기고 선택 상태는 테두리/배경으로 표시 */}
                    <input type="radio" name="pay" checked={selKey === o.key} onChange={() => setSelKey(o.key)} className="sr-only" />
                    {svg
                      ? <span aria-label={o.label} className="pay-svg inline-flex items-center [&_svg]:h-5 [&_svg]:w-auto [&_svg]:max-w-[110px]" dangerouslySetInnerHTML={{ __html: svg }} />
                      : <span className="font-medium">{o.label}</span>}
                  </label>
                );
              })}
            </div>
            )}
            {!fullPoint && isBank && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="입금 은행">
                  <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} className={selCls}>
                    {(init?.banks ?? []).map((b) => <option key={b.code} value={b.code}>{b.title} {b.num} ({b.holder})</option>)}
                  </select>
                </Field>
                <Field label="입금자명"><input value={sender} onChange={(e) => setSender(e.target.value)} className={inp} /></Field>
              </div>
            )}
          </Section>

          {isCash && (
            <Section title="현금영수증">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="신청 구분">
                  <select value={receiptType} onChange={(e) => setReceiptType(e.target.value)} className={selCls}>
                    <option value="0">신청 안 함</option>
                    <option value="1">소득공제용(개인)</option>
                    <option value="2">지출증빙용(사업자)</option>
                    {taxInvoiceOk && <option value="3">세금계산서</option>}
                  </select>
                </Field>
                {receiptType !== "0" && (
                  <Field label={receiptType === "1" ? "휴대폰/현금영수증카드 번호" : "사업자등록번호"}>
                    <input value={receiptNum} onChange={(e) => setReceiptNum(e.target.value)} className={inp}
                      placeholder={receiptType === "1" ? "010-0000-0000" : "000-00-00000"} />
                  </Field>
                )}
              </div>
              {receiptType === "3" && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="상호(법인명) *"><input value={rcCorp} onChange={(e) => setRcCorp(e.target.value)} className={inp} /></Field>
                  <Field label="대표자명 *"><input value={rcName} onChange={(e) => setRcName(e.target.value)} className={inp} /></Field>
                  <Field label="이메일" full><input value={rcEmail} onChange={(e) => setRcEmail(e.target.value)} className={inp} placeholder="세금계산서 수신 이메일" /></Field>
                  <Field label="사업장 주소" full><input value={rcAddr} onChange={(e) => setRcAddr(e.target.value)} className={inp} /></Field>
                  <Field label="업태"><input value={rcBiztype} onChange={(e) => setRcBiztype(e.target.value)} className={inp} /></Field>
                  <Field label="종목"><input value={rcBizclass} onChange={(e) => setRcBizclass(e.target.value)} className={inp} /></Field>
                </div>
              )}
              <p className="mt-2 text-[12px] text-sub">현금영수증은 입금 확인(결제 완료) 후 신청 정보로 발행됩니다.</p>
            </Section>
          )}
        </div>

        <aside className="rounded-2xl border border-line bg-card p-5 lg:sticky lg:top-32">
          <h2 className="text-base font-bold text-text">결제 금액</h2>
          {/* 레거시 index.js 사이드 구성(장바구니 동일): 상품금액·배송비·혜택(총 상품할인)+세부·쿠폰·적립금 */}
          {(() => {
            const goods = s?.goods_price ?? s?.item_price ?? 0;     // 상품금액(정가)
            const benefit = Math.max(0, goods - (s?.item_price ?? 0)); // 총 상품할인(등급+대량+즉시)
            const lvl = s?.level_discount ?? 0;
            const blk = s?.bulk_discount ?? 0;
            const prod = Math.max(0, benefit - lvl - blk);           // 상품할인(잔여)
            return (
              <dl className="mt-4 space-y-2.5 text-sm">
                <Row k="상품금액" v={won(goods)} />
                {(s?.delivery_price ?? 0) > 0 && <Row k="배송비" v={`+${won(s!.delivery_price)}`} />}
                {benefit > 0 && (
                  <>
                    <Row k="혜택" v={`-${won(benefit)}`} sale />
                    {lvl > 0 && <SubRow k="등급할인" v={`-${won(lvl)}`} />}
                    {blk > 0 && <SubRow k="대량구매 할인" v={`-${won(blk)}`} />}
                    {prod > 0 && <SubRow k="상품할인" v={`-${won(prod)}`} />}
                  </>
                )}
                {(s?.coupon_discount ?? 0) > 0 && <Row k="쿠폰할인" v={`-${won(s!.coupon_discount!)}`} sale />}
                {pointUseNum > 0 && <Row k="포인트 사용" v={`-${won(pointUseNum)}`} sale />}
              </dl>
            );
          })()}
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-sub">{isBank && !fullPoint ? "입금 금액" : "결제 금액"}</span>
            <span className="text-2xl font-extrabold text-text"><WonText s={won(payTotal)} /></span>
          </div>
          {err && <p className="mt-3 rounded-md bg-sale/10 px-3 py-2 text-[13px] text-sale">{err}</p>}
          <button type="button" onClick={submit} disabled={!valid || busy}
            className="mt-4 h-12 w-full cursor-pointer rounded-md bg-accent text-sm font-bold text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "처리 중…" : "결제하기"}
          </button>
          <div className="mt-4 rounded-md border border-line p-3">
            <label className="flex cursor-pointer items-start gap-2 text-[13px] font-medium text-text">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
              주문/결제 진행 필수 동의
            </label>
            <div className="mt-2 flex flex-col gap-1 pl-6 text-[12px] text-sub">
              <button type="button" onClick={() => openTerms("order_privacy")} className="w-fit cursor-pointer underline underline-offset-2 hover:text-text">
                개인정보수집 및 이용 동의
              </button>
              <button type="button" onClick={() => openTerms("order_entrust")} className="w-fit cursor-pointer underline underline-offset-2 hover:text-text">
                개인정보 판매자 제공 동의
              </button>
              {!isMember && (
                <button type="button" onClick={() => openTerms("order_service")} className="w-fit cursor-pointer underline underline-offset-2 hover:text-text">
                  서비스 이용약관 동의
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {paying && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
          <div className="rounded-2xl bg-card p-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
            <p className="mt-3 text-sm text-text">결제 진행 중…</p>
            <p className="mt-1 text-[12px] text-sub">결제창에서 결제를 완료해 주세요.</p>
            <button type="button" onClick={() => { stopPoll(); setPaying(false); setBusy(false); }} className="mt-4 text-[13px] text-sub underline">취소</button>
          </div>
        </div>
      )}

      {/* 주소찾기 — 팝업창(window.open) 대신 인페이지 임베드 모달(가입/마이페이지와 동일). 모바일 웹앱에서도 안전. */}
      {zipOpen && (
        <Zipcode onClose={(v) => {
          setZipOpen(false);
          // 폼에서 직접 주소를 검색하면 저장/최근 배송지가 아니라 직접 입력으로 전환된 것.
          if (v) {
            setAddrPick(""); setRZip(v.zipcode); setRAddr1(v.address); setRAdmcode(v.admcode); persistPick("direct");
            // 주소 반영 직후 상세주소 입력으로 포커스(모달 언마운트 후 다음 프레임에).
            requestAnimationFrame(() => addr2Ref.current?.focus());
          }
        }} />
      )}

      {/* 쿠폰 선택(묶음/배송) — 적용 후 세션 재조회로 쿠폰할인 반영 */}
      {couponModal && (
        <CouponModal
          oid={oid}
          type={couponModal}
          title={couponModal === "bundle" ? "묶음 할인 쿠폰" : "배송비 쿠폰"}
          onClose={(changed) => { setCouponModal(null); if (changed) refreshSession(); }}
        />
      )}

      {/* 상품 쿠폰 — 품목(cart_product)별 적용. 레거시 product-coupon 모달 재현 */}
      {prodCoupon && (
        <CouponModal
          oid={oid}
          type="product"
          title="상품 할인 쿠폰"
          lineId={prodCoupon.lineId}
          applied={prodCoupon.applied}
          onClose={(changed) => { setProdCoupon(null); if (changed) refreshSession(); }}
        />
      )}

      {/* 배송지 관리 — 저장된 배송지(기본/추가) 전체를 모달 리스트로 보여주고 선택(읽기전용). */}
      {bookOpen && (
        <AddressBook
          addresses={addresses}
          currentId={addrPick && addrPick !== "recent" ? Number(addrPick) : null}
          onClose={(a) => {
            setBookOpen(false);
            if (a) { setAddrPick(String(a.id)); applyAddress(a); persistPick(String(a.id)); }
          }}
        />
      )}

      {/* 약관 내용 모달 — 레거시 getTerms 재현(본문 HTML 표시). */}
      {termsId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setTermsId(null)}>
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <p className="text-base font-bold text-text">{TERMS_TITLE[termsId]}</p>
              <button type="button" onClick={() => setTermsId(null)} className="cursor-pointer text-sub hover:text-text" aria-label="닫기">✕</button>
            </div>
            <div className="overflow-y-auto px-5 py-4 text-[13px] leading-relaxed text-sub">
              {termsBusy ? (
                <p className="py-8 text-center text-sub">불러오는 중…</p>
              ) : termsHtml ? (
                <div className="prose-terms" dangerouslySetInnerHTML={{ __html: termsHtml }} />
              ) : (
                <p className="py-8 text-center text-sub">약관 내용을 불러올 수 없습니다.</p>
              )}
            </div>
            <div className="border-t border-line px-5 py-3 text-right">
              <button type="button" onClick={() => setTermsId(null)}
                className="h-9 cursor-pointer rounded-md border border-line px-5 text-sm font-medium text-text hover:bg-surface">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 배송수단 정보 모달 — 레거시 order.js getDelivery 계산식(3자리 코드 + 지역 할증). 실제 배송지 기준 견적. */}
      {deliveryInfo && (() => {
        const m = deliveryInfo.meta;
        const dt = m?.delivery_type ?? 0;
        // 레거시 3자리 코드: 1자리=수단, 2자리=배송비유형(1무료/2조건부무료/3유료), 3자리=결제(0무료/1선불/2착불)
        const feeDigit = Math.floor((dt % 100) / 10);
        const payDigit = dt % 10;
        const isParcel = (m?.method ?? 1) === 1;  // 택배
        const feeType = !isParcel ? ""
          : feeDigit === 1 ? "무료배송"
          : feeDigit === 2 ? "조건부 무료배송"
          : feeDigit === 3 ? "유료배송"
          : "";
        const isLater = payDigit === 2; // 착불
        const basic = m?.basic_price ?? 0;
        const area1 = m?.area1_price ?? 0;        // 제주
        const area2 = m?.area2_price ?? 0;        // 도서산간
        const free = m?.free_price ?? 0;
        // 기본 배송비 문구(레거시 guide.PRICE_TYxxx)
        const basicText = feeDigit === 1
          ? (payDigit === 1 ? `${won(basic)} (추가 배송비 발생 시 선불)` : payDigit === 2 ? `${won(basic)} (추가 배송비 발생 시 착불)` : won(basic))
          : feeDigit === 2
          ? (payDigit === 2 ? `${won(basic)} (무료배송 조건 미달 시 배송비 착불, 예상금액)` : `${won(basic)} (무료배송 조건 미달 시 배송비 선불)`)
          : (payDigit === 2 ? `${won(basic)} (착불, 예상금액)` : `${won(basic)} (선불)`);
        // 추가 배송비(할증)는 «택배»에만 적용(레거시 guide EXTRA_PRICE — 퀵/직접/방문/해외 제외).
        const extras: string[] = [];
        if (isParcel) {
          if (area1 > 0) extras.push(`제주지역: +${won(area1)} 추가${payDigit === 2 ? " (예상금액)" : ""}`);
          if (area2 > 0) extras.push(`도서산간: +${won(area2)} 추가${payDigit === 2 ? " (예상금액)" : ""}`);
          const ec = m?.extra_charge ?? 0;
          if (ec === 1 && (m?.weight ?? 0) > 0) extras.push(`※ 상품/수량 합계 ${m?.weight}Kg 단위 전체 배송비 반복 부과`);
          if (ec === 2) extras.push(`※ ${(m?.range2_from ?? 0) + 1}개 이상 구매 시 추가 배송비 ${won(m?.range2_price ?? 0)}`);
          if (ec === 3) { extras.push(`※ ${(m?.range2_from ?? 0) + 1}~${m?.range3_from ?? 0}개까지 추가 배송비 ${won(m?.range2_price ?? 0)}`); extras.push(`※ ${(m?.range3_from ?? 0) + 1}개 이상 구매 시 추가 배송비 ${won(m?.range3_price ?? 0)}`); }
          if (ec === 9) extras.push(`※ 상품/수량 합계 ${m?.repeat_quantity ?? 0}개마다 기본 배송비 반복 부과`);
        }
        // 미배송(0)=이용안내만, 해외직구(2)=상단에 해외직구 카드(상품페이지와 동일).
        const du = m?.delivery_use ?? 1;
        const isNothing = du === 0 || dt === 0;
        const overseas = du === 2 ? (m?.overseas ?? null) : null;
        const omd = overseas?.date ? overseas.date.split("-") : null; // [Y,M,D]
        return (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setDeliveryInfo(null)}>
            <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-card p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <p className="text-base font-bold text-text">{isNothing ? "이용안내" : `${m?.method_name || "택배"} 배송안내`}</p>
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
                  <p className="text-[15px] font-bold text-text">{m?.guide || "이용안내"}</p>
                  {m?.guide_detail ? <p className="mt-1.5 whitespace-pre-line text-[13px] text-sub">{m.guide_detail}</p> : null}
                </div>
              ) : (
              <>
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-sub">공급자</dt><dd className="font-medium text-text">{deliveryInfo.supplier || "기본 배송"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-sub">배송수단</dt><dd className="font-medium text-text">{m?.method_name || "택배"}</dd>
                </div>
                {isParcel && m?.parcel_title && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-sub">택배사</dt><dd className="font-medium text-text">{m.parcel_title}</dd>
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
                    <dt className="text-sub">이 주문 배송비</dt>
                    <dd className="font-medium text-text">
                      {(() => {
                        // 3자리 코드 기준(착불→"착불", 무료→무료배송, 유료→금액).
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
                배송비는 실제 배송지 기준으로 산정되며 제주·도서산간 할증이 반영됩니다. 배송비는 배송그룹(공급자·배송수단) 단위로 합산됩니다.
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

const inp = "h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-text outline-none focus:border-accent";
// 셀렉트 전용 — 색상(배경/테두리)은 입력폼(inp)과 완전히 동일(border-line·bg-surface).
// 화살표만 커스텀(.select-arrow)으로 우측 여백 안쪽 배치(+pr-9 로 텍스트 여유).
// 이름은 selCls — 컴포넌트 내 `sel`(결제수단 선택 객체)과 충돌 방지.
const selCls = "select-arrow h-10 w-full cursor-pointer rounded-md border border-line bg-surface pl-3 pr-9 text-sm text-text outline-none focus:border-accent";

// 배송 요청사항 프리셋(레거시 배송 메모 옵션과 동일한 흔한 문구).
const DELIVERY_MSGS = [
  "배송 전 연락 바랍니다.",
  "부재 시 경비실에 맡겨주세요.",
  "부재 시 문 앞에 놓아주세요.",
  "배송 전 미리 연락 후 방문해주세요.",
  "파손 위험 상품입니다. 취급 주의해주세요.",
];

function Notice({ msg, href, cta }: { msg: string; href: string; cta: string }) {
  return (
    <div className="mx-auto max-w-content px-4 py-6">
      <h1 className="text-2xl font-bold text-text">주문하기</h1>
      <div className="mt-6 rounded-md border border-line bg-card p-12 text-center text-sub">
        {msg}
        <div className="mt-4"><Link href={href} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">{cta}</Link></div>
      </div>
    </div>
  );
}
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-base font-bold text-text">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return <label className={`block ${full ? "sm:col-span-2" : ""}`}><span className="mb-1 block text-[12px] font-medium text-sub">{label}</span>{children}</label>;
}
// 금액 표기 — 끝의 "원"은 굵기 제외 + 상대 크기 축소, 숫자와 여백(장바구니와 동일).
function WonText({ s }: { s: string }) {
  if (s.endsWith("원")) return <>{s.slice(0, -1)}<span className="ml-0.5 text-[0.75em] font-normal">원</span></>;
  return <>{s}</>;
}
function Row({ k, v, sale }: { k: string; v: string; sale?: boolean }) {
  return <div className="flex justify-between gap-4"><dt className="text-sub">{k}</dt><dd className={`font-bold ${sale ? "text-sale" : "text-text"}`}><WonText s={v} /></dd></div>;
}
// 혜택 세부(들여쓴 소항목)
function SubRow({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4 pl-3 text-[12px]"><dt className="text-sub">· {k}</dt><dd className="text-sale"><WonText s={v} /></dd></div>;
}
