"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { won } from "@/lib/format";
import type { CheckoutInit, CheckoutSession, CheckoutInput } from "@/lib/prosell";

type PaySel = { key: string; kind: "general" | "easy" | "bank" | "point"; pay_payment: number; pay_method: number; label: string };

export default function OrderPage() {
  const router = useRouter();
  const params = useParams<{ oid: string }>();
  const oid = String(params.oid || "");

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
  const [msg, setMsg] = useState("");
  const [selKey, setSelKey] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [sender, setSender] = useState("");
  const [agree, setAgree] = useState(false);

  useEffect(() => {
    let alive = true;
    const src = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("src") : "cart";
    setFromCart(src !== "buynow");
    (async () => {
      const r = await fetch(`/api/order?oid=${encodeURIComponent(oid)}`, { cache: "no-store" });
      if (!alive) return;
      if (r.status === 401) { setAuthErr(true); setLoaded(true); return; }
      const j = await r.json().catch(() => null);
      if (!j?.ok) { setNotFound(true); setLoaded(true); return; }
      setInit(j.init); setSession(j.session);
      const b = j.init?.buyer;
      if (b) { setName(b.name); setHp(b.hp); setEmail(b.email); setRName(b.name); setRHp(b.hp); setSender(b.name); }
      if (j.init?.banks?.[0]) setBankCode(j.init.banks[0].code);
      setLoaded(true);
    })();
    return () => { alive = false; if (pollRef.current) clearInterval(pollRef.current); };
  }, [oid]);

  const total = session?.summary.total_price ?? 0;
  const point = init?.point ?? 0;
  const canPoint = (init?.methods.point ?? 0) === 1 && point >= total && total > 0;

  const options: PaySel[] = useMemo(() => {
    if (!init) return [];
    const o: PaySel[] = [];
    for (const m of init.methods.general) o.push({ key: `general:${m.method}`, kind: "general", pay_payment: 1, pay_method: m.method, label: m.label });
    for (const m of init.methods.easy) o.push({ key: `easy:${m.method}`, kind: "easy", pay_payment: 2, pay_method: m.method, label: m.label });
    if (init.methods.bank) o.push({ key: "bank:300", kind: "bank", pay_payment: 3, pay_method: 300, label: "무통장입금" });
    if (init.methods.point) o.push({ key: "point:900", kind: "point", pay_payment: 0, pay_method: 900, label: "전액 포인트" });
    return o;
  }, [init]);

  useEffect(() => {
    if (!selKey && options.length) setSelKey(options.find((o) => o.kind === "bank")?.key ?? options[0].key);
  }, [options, selKey]);

  const sel = options.find((o) => o.key === selKey) || null;
  const isPoint = sel?.kind === "point";
  const isBank = sel?.kind === "bank";

  const valid = !!rName && !!rHp && !!rZip && !!rAddr1 && !!hp && agree && !!sel && (isPoint ? canPoint : isBank ? !!bankCode && !!sender : true);

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
    if (!valid || busy || !sel) return;
    setErr(""); setBusy(true);
    const base = {
      oid, from_cart: fromCart, name, hp, email,
      receive_name: rName, receive_hp: rHp, receive_zipcode: rZip,
      receive_addr1: rAddr1, receive_addr2: rAddr2, receive_admcode: rAdmcode, delivery_message: msg,
    };
    const input: CheckoutInput =
      sel.kind === "point" ? { ...base, pay_payment: 0, pay_method: 900, point_price: total }
      : sel.kind === "bank" ? { ...base, pay_payment: 3, pay_method: 300, pay_bank_code: bankCode, pay_bank_name: sender }
      : { ...base, pay_payment: sel.pay_payment, pay_method: sel.pay_method };
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

  return (
    <main className="mx-auto max-w-content p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-text">주문/결제 {!fromCart && <span className="align-middle text-sm font-medium text-accent">바로구매</span>}</h1>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-5">
          <Section title="주문 상품">
            <ul className="divide-y divide-line">
              {items.map((it, i) => (
                <li key={i} className="py-3">
                  <div className="flex items-center gap-3">
                    {it.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.thumb} alt="" className="h-14 w-14 rounded-md object-cover" />
                    ) : <div className="h-14 w-14 rounded-md bg-bg" />}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-semibold text-text">{it.title}</p>
                      <p className="text-[13px] text-sub">{it.option_label ? it.option_label + " · " : ""}{it.qty}개</p>
                      {it.addoptions.map((a, k) => (
                        <p key={k} className="text-[12px] text-sub">+ {a.title}: {a.name}{a.qty > 1 ? ` ×${a.qty}` : ""} ({won(a.line_total)})</p>
                      ))}
                    </div>
                    <span className="text-sm font-bold text-text">{won(it.item_total)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="주문자 정보">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="이름"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} /></Field>
              <Field label="휴대폰 *"><input value={hp} onChange={(e) => setHp(e.target.value)} className={inp} placeholder="010-0000-0000" /></Field>
              <Field label="이메일" full><input value={email} onChange={(e) => setEmail(e.target.value)} className={inp} /></Field>
            </div>
          </Section>

          <Section title="배송지">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="받는분 *"><input value={rName} onChange={(e) => setRName(e.target.value)} className={inp} /></Field>
              <Field label="연락처 *"><input value={rHp} onChange={(e) => setRHp(e.target.value)} className={inp} placeholder="010-0000-0000" /></Field>
              <Field label="우편번호 *" full>
                <div className="flex gap-2">
                  <input value={rZip} readOnly className={`${inp} flex-1`} placeholder="주소찾기로 입력" />
                  <button type="button" onClick={() => openPostcode((r) => { setRZip(r.zonecode); setRAddr1(r.address); setRAdmcode(r.bcode || ""); })}
                    className="h-10 shrink-0 rounded-md border border-line px-4 text-sm font-medium text-text hover:bg-bg">주소찾기</button>
                </div>
              </Field>
              <Field label="주소 *" full><input value={rAddr1} onChange={(e) => setRAddr1(e.target.value)} className={inp} placeholder="도로명/지번 주소" /></Field>
              <Field label="상세주소" full><input value={rAddr2} onChange={(e) => setRAddr2(e.target.value)} className={inp} /></Field>
              <Field label="배송 요청사항" full><input value={msg} onChange={(e) => setMsg(e.target.value)} className={inp} placeholder="예) 부재 시 경비실에 맡겨주세요" /></Field>
            </div>
          </Section>

          <Section title="결제수단">
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((o) => {
                const disabled = o.kind === "point" && !canPoint;
                return (
                  <label key={o.key} className={`flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm ${selKey === o.key ? "border-accent bg-accent/5" : "border-line"} ${disabled ? "cursor-not-allowed text-sub" : "cursor-pointer text-text"}`}>
                    <input type="radio" name="pay" disabled={disabled} checked={selKey === o.key} onChange={() => setSelKey(o.key)} />
                    {o.label}
                    {o.kind === "point" && <span className="text-[12px] text-sub">(보유 {won(point)})</span>}
                    {disabled && <span className="text-[12px] text-sale">· 부족</span>}
                  </label>
                );
              })}
            </div>
            {isBank && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="입금 은행">
                  <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} className={inp}>
                    {(init?.banks ?? []).map((b) => <option key={b.code} value={b.code}>{b.title} {b.num} ({b.holder})</option>)}
                  </select>
                </Field>
                <Field label="입금자명"><input value={sender} onChange={(e) => setSender(e.target.value)} className={inp} /></Field>
              </div>
            )}
            {sel && (sel.kind === "general" || sel.kind === "easy") && (
              <p className="mt-3 rounded-md bg-bg px-3 py-2 text-[12px] text-sub">결제하기를 누르면 {sel.label} 결제창이 열립니다. 결제 완료 시 자동으로 주문이 확정됩니다.</p>
            )}
          </Section>
        </div>

        <aside className="rounded-2xl border border-line bg-card p-5 lg:sticky lg:top-20">
          <h2 className="text-base font-bold text-text">결제 금액</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <Row k="상품금액" v={won(s?.item_price ?? 0)} />
            <Row k="배송비" v={(s?.delivery_price ?? 0) === 0 ? "무료" : `+${won(s!.delivery_price)}`} />
            {isPoint && <Row k="포인트 사용" v={`-${won(total)}`} sale />}
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-sub">{isPoint ? "결제 금액" : isBank ? "입금 금액" : "결제 금액"}</span>
            <span className="text-2xl font-extrabold text-text">{won(isPoint ? 0 : total)}</span>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-2 text-[13px] text-sub">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
            주문 내용을 확인했으며 결제에 동의합니다. (필수)
          </label>
          {err && <p className="mt-3 rounded-md bg-sale/10 px-3 py-2 text-[13px] text-sale">{err}</p>}
          <button type="button" onClick={submit} disabled={!valid || busy}
            className="mt-4 h-12 w-full cursor-pointer rounded-md bg-accent text-sm font-bold text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "처리 중…" : isPoint ? "포인트로 주문" : isBank ? `${won(total)} 입금 주문` : `${won(total)} 결제하기`}
          </button>
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
    </main>
  );
}

function openPostcode(cb: (r: { zonecode: string; address: string; bcode?: string }) => void) {
  const run = () => {
    // @ts-expect-error 외부 스크립트 전역
    new window.daum.Postcode({ oncomplete: (data: { zonecode: string; address: string; bcode?: string }) => cb(data) }).open();
  };
  if ((window as unknown as { daum?: { Postcode?: unknown } }).daum?.Postcode) return run();
  const sc = document.createElement("script");
  sc.src = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
  sc.onload = run;
  document.body.appendChild(sc);
}

const inp = "h-10 w-full rounded-md border border-line bg-bg px-3 text-sm text-text outline-none focus:border-accent";

function Notice({ msg, href, cta }: { msg: string; href: string; cta: string }) {
  return (
    <main className="mx-auto max-w-content p-6">
      <h1 className="text-2xl font-bold text-text">주문하기</h1>
      <div className="mt-6 rounded-md border border-line bg-card p-12 text-center text-sub">
        {msg}
        <div className="mt-4"><Link href={href} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">{cta}</Link></div>
      </div>
    </main>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-line bg-card p-5"><h2 className="mb-3 text-base font-bold text-text">{title}</h2>{children}</section>;
}
function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return <label className={`block ${full ? "sm:col-span-2" : ""}`}><span className="mb-1 block text-[12px] font-medium text-sub">{label}</span>{children}</label>;
}
function Row({ k, v, sale }: { k: string; v: string; sale?: boolean }) {
  return <div className="flex justify-between gap-4"><dt className="text-sub">{k}</dt><dd className={sale ? "font-medium text-sale" : "text-text"}>{v}</dd></div>;
}
