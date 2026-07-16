"use client";

import { useMemo, useRef, useState } from "react";
import { won, htmlToText } from "@/lib/format";
import { PAY_SVG } from "@/lib/paySvg";
import PopupCloseButton from "@/components/PopupCloseButton";
import { DepositCard } from "@/components/PrivatePayDeposit";
import type { PrivatePayCheckoutInit, PrivatePayBank } from "@/lib/prosell";

type Opt = { key: string; kind: "general" | "easy" | "bank"; pay_payment: number; pay_method: number; label: string };

// 개인결제 결제창(공개 팝업) — 결제수단 UI는 주문서(order/[oid])와 동일 패턴. 금액은 고정(개인결제 발급액).
// 공개 URL 이므로 결제자 성명은 표시하지 않는다.
export default function PrivatePayCheckout({ init }: { init: PrivatePayCheckoutInit }) {
  // 결제수단 순서 — 간편(2) → 일반(1) → 무통장(3). 주문서와 동일.
  const options = useMemo<Opt[]>(() => {
    const o: Opt[] = [];
    const m = init.methods;
    if (m) {
      for (const x of m.easy) o.push({ key: `easy:${x.method}`, kind: "easy", pay_payment: 2, pay_method: x.method, label: x.label });
      for (const x of m.general) o.push({ key: `general:${x.method}`, kind: "general", pay_payment: 1, pay_method: x.method, label: x.label });
      if (m.bank) o.push({ key: "bank:300", kind: "bank", pay_payment: 3, pay_method: 300, label: "무통장입금" });
    }
    return o;
  }, [init.methods]);

  const [selKey, setSelKey] = useState<string>(options[0]?.key ?? "");
  const sel = options.find((o) => o.key === selKey) ?? null;
  const isBank = sel?.kind === "bank";

  const banks = init.banks ?? [];
  const [bankCode, setBankCode] = useState<string>(banks[0]?.code ?? "");
  const [sender, setSender] = useState<string>(""); // 공개 URL — 결제자가 직접 입력

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<null | { kind: "paid" | "bank"; message: string; bank?: PrivatePayBank | null }>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const money = init.pay_currency && init.pay_currency !== "KRW" ? `${init.pay_price.toLocaleString()} ${init.pay_currency}` : won(init.pay_price);

  const valid = !!sel && (!isBank || (!!bankCode && sender.trim().length > 0));

  function stopPoll() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }

  function startPolling(payurl: string) {
    if (payurl) window.open(payurl, "privatePayPG", "width=800,height=740,scrollbars=1");
    let tries = 0;
    stopPoll();
    pollRef.current = setInterval(async () => {
      tries++;
      try {
        const res = await fetch(`/api/privatepay?ppno=${init.ppno}&callback=1`, { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (j?.ok && j.paid) {
          stopPoll(); setBusy(false);
          // 가상계좌면 발급된 입금계좌 정보를 함께 표시(그 외는 결제완료).
          setDone(j.bank ? { kind: "bank", message: "가상계좌가 발급되었습니다. 아래 계좌로 입금해 주세요.", bank: j.bank } : { kind: "paid", message: "결제가 완료되었습니다." });
          try { window.opener?.dispatchEvent(new Event("privatepay-change")); } catch {}
        } else if (j?.ok && j.failed) {
          stopPoll(); setBusy(false); setErr("결제가 취소되었거나 실패했습니다. 다시 시도해 주세요.");
        }
      } catch {}
      if (tries > 180) { stopPoll(); setBusy(false); } // 최대 ~15분
    }, 5000);
  }

  async function submit() {
    if (!valid || busy) return;
    setErr(""); setBusy(true);
    const input: Record<string, string | number> = { ppno: init.ppno, pay_payment: sel!.pay_payment, pay_method: sel!.pay_method };
    if (isBank) { input.pay_bank_code = bankCode; input.pay_bank_name = sender.trim(); }
    try {
      const res = await fetch("/api/privatepay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error || "결제 처리에 실패했습니다."); setBusy(false); return; }
      if (j.polling === 1 && j.payurl) {
        startPolling(String(j.payurl));
      } else if (isBank) {
        // 무통장 접수 완료 — 저장된 입금계좌 정보를 조회해 함께 표시.
        const st = await fetch(`/api/privatepay?ppno=${init.ppno}&callback=1`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
        setBusy(false);
        setDone({ kind: "bank", message: "무통장 입금 접수가 완료되었습니다. 아래 계좌로 입금해 주세요.", bank: st?.bank ?? null });
        try { window.opener?.dispatchEvent(new Event("privatepay-change")); } catch {}
      } else {
        setBusy(false);
        setErr("결제창을 열 수 없습니다. 잠시 후 다시 시도하거나 다른 결제수단을 선택해 주세요.");
      }
    } catch { setErr("결제 요청 중 오류가 발생했습니다."); setBusy(false); }
  }

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="w-full rounded-2xl border border-line bg-card p-8">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent/15 text-2xl text-accent">✓</div>
          <h1 className="mt-3 text-xl font-bold text-text">{done.kind === "paid" ? "결제 완료" : "입금 접수 완료"}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-sub">{done.message}</p>
          {done.bank ? (
            <DepositCard bank={done.bank} className="mt-4 text-left" />
          ) : (
            <dl className="mt-4 space-y-2 rounded-md bg-surface/60 p-4 text-left text-sm">
              <Row k="결제창번호" v={init.no} />
              <Row k="결제금액" v={money} strong />
            </dl>
          )}
          <div className="mt-5 flex justify-center"><PopupCloseButton /></div>
        </div>
      </div>
    );
  }

  const inp = "w-full rounded-md border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent";

  return (
    <div className="mx-auto min-h-screen max-w-md p-5">
      <h1 className="text-lg font-extrabold text-text">개인 결제</h1>

      {/* 결제 대상 — 결제자 성명 미표시(공개 URL) */}
      <section className="mt-4 rounded-2xl border border-line bg-card p-5">
        <div className="flex items-start gap-3">
          {init.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={init.thumb} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-line object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text">{init.title || init.ct_text || "개인 결제"}</p>
            {init.product_title && <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-sub">{init.product_title}</p>}
            <p className="mt-1 text-[12px] text-sub">결제창번호 {init.no}</p>
          </div>
        </div>
      </section>

      {/* 안내 메시지 — 별도 카드. 내용 없으면 숨김. <br> 등은 개행 처리(HTML 렌더 아님). */}
      {(() => {
        const guide = htmlToText(init.content);
        if (!guide) return null;
        return (
          <section className="mt-4 rounded-2xl border border-accent/40 bg-accent/5 p-5">
            <h2 className="mb-2 text-sm font-bold text-text">안내</h2>
            <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text">{guide}</p>
          </section>
        );
      })()}

      {/* 결제수단 — 주문서와 동일 UI */}
      <section className="mt-4 rounded-2xl border border-line bg-card p-5">
        <h2 className="mb-3 text-base font-bold text-text">결제수단</h2>
        {options.length === 0 ? (
          <p className="rounded-md bg-surface px-3 py-2.5 text-sm text-sub">사용 가능한 결제수단이 없습니다. 쇼핑몰에 문의해 주세요.</p>
        ) : (
          <div className="grid gap-2 min-[380px]:grid-cols-2">
            {options.map((o) => {
              const svg = PAY_SVG[o.pay_method];
              return (
                <label key={o.key} title={o.label}
                  className={`flex h-12 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm text-text ${selKey === o.key ? "border-accent bg-accent/5" : "border-line"}`}>
                  <input type="radio" name="pay" checked={selKey === o.key} onChange={() => setSelKey(o.key)} className="sr-only" />
                  {svg
                    ? <span aria-label={o.label} className="pay-svg inline-flex items-center [&_svg]:h-5 [&_svg]:w-auto [&_svg]:max-w-[110px]" dangerouslySetInnerHTML={{ __html: svg }} />
                    : <span className="font-medium">{o.label}</span>}
                </label>
              );
            })}
          </div>
        )}
        {isBank && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-sub">입금 은행</label>
              <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} className={inp}>
                {banks.map((b) => <option key={b.code} value={b.code}>{b.title} {b.num} ({b.holder})</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-sub">입금자명</label>
              <input value={sender} onChange={(e) => setSender(e.target.value)} className={inp} placeholder="입금자명" />
            </div>
          </div>
        )}
      </section>

      {/* 결제 금액 + 버튼 */}
      <section className="mt-4 rounded-2xl border border-line bg-card p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sub">{isBank ? "입금 금액" : "결제 금액"}</span>
          <span className="text-2xl font-extrabold text-text">{money}</span>
        </div>
        {err && <p className="mt-3 rounded-md bg-sale/10 px-3 py-2 text-[13px] text-sale">{err}</p>}
        <button type="button" onClick={submit} disabled={!valid || busy}
          className="mt-4 h-12 w-full cursor-pointer rounded-md bg-accent text-sm font-bold text-accent-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? "결제 진행 중…" : `${money} 결제하기`}
        </button>
        {busy && <p className="mt-2 text-center text-[12px] text-sub">결제창에서 결제를 완료하면 자동으로 처리됩니다. 창을 닫지 마세요.</p>}
      </section>

      {/* 사업자 정보 — 푸터 */}
      {init.company && <CompanyFooter c={init.company} />}
    </div>
  );
}

function CompanyFooter({ c }: { c: NonNullable<PrivatePayCheckoutInit["company"]> }) {
  const line1 = [c.ceo && `대표자 ${c.ceo}`, c.biznum && `사업자등록번호 ${c.biznum}`, c.salenum && `통신판매업신고 ${c.salenum}`].filter(Boolean).join(" · ");
  const line2 = [c.addr && `주소 ${c.addr}`].filter(Boolean).join(" · ");
  const line3 = [c.tel && `고객센터 ${c.tel}`, c.email && `이메일 ${c.email}`].filter(Boolean).join(" · ");
  return (
    <footer className="mt-6 border-t border-line px-1 py-5 text-[11px] leading-relaxed text-sub">
      {c.name && <p className="font-semibold text-text/70">{c.name}</p>}
      {line1 && <p className="mt-1">{line1}</p>}
      {line2 && <p>{line2}</p>}
      {line3 && <p>{line3}</p>}
    </footer>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-sub">{k}</dt>
      <dd className={`text-right ${strong ? "text-base font-bold text-accent" : "text-text"}`}>{v}</dd>
    </div>
  );
}
