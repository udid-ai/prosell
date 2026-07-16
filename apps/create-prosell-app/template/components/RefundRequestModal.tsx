"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { won } from "@/lib/format";
import Zipcode, { type ZipcodeResult } from "@/components/Zipcode";
import type { RefundInit, RefundPreview, RefundItemInput } from "@/lib/prosell";

// 반품접수 대상 라인 — 메인 상품 + 추가옵션(item_type 1). 메인을 전량 반품하면 추가옵션도 함께 반품.
export type RefundLine = {
  prno: number; title: string; option?: string; thumb?: string; quantity: number; price: number;
  addons: { prno: number; quantity: number; title: string }[];
};

type Step = "select" | "confirm";

// init(사유·약관·수거지)은 버튼에서 미리 불러와 prop 으로 전달 → 모달은 열리는 순간 완성된 상태(깜빡임 없음).
export default function RefundRequestModal({ ono, lines, init, onClose }: { ono: number; lines: RefundLine[]; init: RefundInit; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("select");

  const [checked, setChecked] = useState<Set<number>>(new Set(lines.map((l) => l.prno)));
  const [qty, setQty] = useState<Record<number, number>>(() => Object.fromEntries(lines.map((l) => [l.prno, l.quantity])));
  const [reason, setReason] = useState("");
  const [memo, setMemo] = useState("");

  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [bank, setBank] = useState<{ code: string; num: string; holder: string }>(() => ({
    code: init.member_bank?.code || "0", num: init.member_bank?.num || "", holder: init.member_bank?.holder || "",
  }));
  const [agree, setAgree] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // 수거지 주소(기본=주문 배송지). 회원이 변경하면 addrChanged=true → 제출 시 addressInfo 전송.
  const [addr, setAddr] = useState(() => ({ ...init.return_address }));
  const [addrChanged, setAddrChanged] = useState(false);
  const [editAddr, setEditAddr] = useState(false);
  const [zipOpen, setZipOpen] = useState(false);

  const toggle = (prno: number) => setChecked((prev) => {
    const n = new Set(prev);
    if (n.has(prno)) n.delete(prno); else n.add(prno);
    return n;
  });
  const allChecked = checked.size === lines.length && lines.length > 0;
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(lines.map((l) => l.prno)));

  // 대량구매 할인 주문은 전체 반품만 가능(부분 불가).
  const forceAll = init.is_product_all;

  // 선택 → 서버 전송용 items(전량 반품 시 추가옵션 prno 포함 — 취소접수와 동일 규칙)
  function buildItems(): RefundItemInput[] {
    const out: RefundItemInput[] = [];
    for (const l of lines) {
      if (!forceAll && !checked.has(l.prno)) continue;
      const q = forceAll ? l.quantity : Math.max(1, Math.min(qty[l.prno] || l.quantity, l.quantity));
      out.push({ prno: l.prno, quantity: q });
      if (q === l.quantity) for (const a of l.addons) out.push({ prno: a.prno, quantity: a.quantity });
    }
    return out;
  }

  async function goConfirm() {
    setErr("");
    if (!reason) return setErr("반품사유를 선택해 주세요.");
    if (addrChanged) {
      if (!addr.name.trim()) return setErr("수거지 받는분을 입력해 주세요.");
      if (!addr.addr1.trim()) return setErr("수거지 주소(우편번호 검색)를 입력해 주세요.");
      if (!addr.addr2.trim()) return setErr("수거지 상세주소를 입력해 주세요.");
    }
    const items = buildItems();
    if (items.length === 0) return setErr("반품할 상품을 선택해 주세요.");
    setBusy(true);
    try {
      const res = await fetch("/api/order/refund/preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ono, items, ref_ct: reason }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error || "반품금액을 계산할 수 없습니다."); setBusy(false); return; }
      setPreview(j.preview as RefundPreview);
      setStep("confirm");
      setBusy(false);
    } catch { setErr("반품금액 계산 중 오류가 발생했습니다."); setBusy(false); }
  }

  async function submit() {
    setErr("");
    if (preview?.needs_bank) {
      if (!bank.code || bank.code === "0") return setErr("환불받을 은행을 선택해 주세요.");
      if (!bank.num.trim()) return setErr("환불 계좌번호를 입력해 주세요.");
      if (!bank.holder.trim()) return setErr("예금주를 입력해 주세요.");
    }
    if (!agree) return setErr("반품 안내에 동의해 주세요.");
    setBusy(true);
    try {
      const res = await fetch("/api/order/refund", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ono, items: buildItems(), ref_ct: reason, ref_content: memo, bank: preview?.needs_bank ? bank : null, address: addrChanged ? addr : null }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error || "반품접수에 실패했습니다."); setBusy(false); return; }
      // 반품 상세(진행상태) 랜딩으로 이동
      if (j?.rno) { router.push(`/account/refunds/${j.rno}`); return; }
      onClose();
      router.refresh();
    } catch { setErr("반품접수 요청 중 오류가 발생했습니다."); setBusy(false); }
  }

  const addrLine = [addr?.zipcode ? `(${addr.zipcode})` : "", addr?.addr1, addr?.addr2].filter(Boolean).join(" ");
  function onZip(r: ZipcodeResult | null) {
    setZipOpen(false);
    if (!r) return;
    setAddr((p) => ({ ...p, zipcode: r.zipcode, addr1: r.address, admcode: r.admcode }));
    setAddrChanged(true);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-line bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-text">{step === "select" ? "반품 접수" : "반품 확인"}</h2>
          <button type="button" onClick={onClose} className="text-sub hover:text-text" aria-label="닫기">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === "select" ? (
            <div className="space-y-4">
              {/* 대량구매 할인 → 전체반품만 가능 안내 */}
              {forceAll && (
                <p className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-[13px] text-text">
                  대량구매 할인이 적용된 주문은 <b>전체 반품만</b> 가능합니다. (부분 반품 불가)
                </p>
              )}
              {/* 상품 선택 */}
              <div>
                {!forceAll && (
                  <label className="mb-2 flex cursor-pointer items-center gap-2 border-b border-line pb-2 text-sm font-medium text-text">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 accent-[var(--accent,#2563eb)]" />
                    전체 선택 ({checked.size}/{lines.length})
                  </label>
                )}
                <ul className="space-y-2">
                  {lines.map((l) => {
                    const on = forceAll || checked.has(l.prno);
                    const q = Math.max(1, Math.min(qty[l.prno] || l.quantity, l.quantity));
                    return (
                      <li key={l.prno} className="rounded-lg border border-line p-2.5">
                        <div className="flex items-start gap-3">
                          {!forceAll && <input type="checkbox" checked={on} onChange={() => toggle(l.prno)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent,#2563eb)]" />}
                          {l.thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={l.thumb} alt="" className="h-12 w-12 shrink-0 rounded-md border border-line object-cover" />
                          ) : <div className="h-12 w-12 shrink-0 rounded-md border border-line bg-surface" />}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-[13px] font-medium text-text">{l.title}</p>
                            {l.option && <p className="mt-0.5 text-[12px] text-sub">{l.option}</p>}
                            {l.addons.map((a) => <p key={a.prno} className="mt-0.5 text-[12px] text-sub">{a.title}</p>)}
                            <p className="mt-0.5 text-[12px] text-sub">전체수량 {l.quantity}개 · {won(l.price)}</p>
                          </div>
                        </div>
                        {!forceAll && on && l.quantity > 1 && (
                          <div className="mt-2 flex items-center justify-end gap-2 text-[13px]">
                            <span className="text-sub">반품수량</span>
                            <input
                              type="number" min={1} max={l.quantity} value={q}
                              onChange={(e) => setQty((p) => ({ ...p, [l.prno]: Math.max(1, Math.min(Number(e.target.value) || 1, l.quantity)) }))}
                              className="w-16 rounded-md border border-line bg-card px-2 py-1 text-right text-text"
                            />
                            <span className="text-sub">/ {l.quantity}개</span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* 반품사유 */}
              <div>
                <p className="mb-2 text-sm font-medium text-text">반품사유 <span className="text-sale">*</span></p>
                <div className="space-y-1.5">
                  {init.categories.length === 0 && <p className="text-[13px] text-sub">등록된 반품사유가 없습니다.</p>}
                  {init.categories.map((c) => (
                    <label key={c} className="flex cursor-pointer items-center gap-2 text-[13px] text-text">
                      <input type="radio" name="refund-reason" checked={reason === c} onChange={() => setReason(c)} className="h-4 w-4 accent-[var(--accent,#2563eb)]" />
                      {c}
                    </label>
                  ))}
                </div>
              </div>

              {/* 상세 내용 */}
              <div>
                <p className="mb-2 text-sm font-medium text-text">상세 내용</p>
                <textarea
                  value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} rows={3}
                  placeholder="자세한 반품 사유를 입력해 주세요. (선택)"
                  className="w-full resize-none rounded-md border border-line bg-card px-3 py-2 text-[13px] text-text placeholder:text-sub focus:border-accent focus:outline-none"
                />
              </div>

              {/* 수거지 — 기본=주문 배송지, "변경"으로 수정 가능 */}
              <div className="rounded-md border border-line bg-surface p-3 text-[12px] text-sub">
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-medium text-text">수거지</p>
                  <button type="button" onClick={() => setEditAddr((v) => !v)} className="text-[12px] text-accent underline">{editAddr ? "접기" : "변경"}</button>
                </div>
                {!editAddr ? (
                  <>
                    <p>{addr.name}{addr.hp ? ` · ${addr.hp}` : ""}</p>
                    {addrLine && <p className="mt-0.5">{addrLine}</p>}
                    <p className="mt-1 text-[11px]">반품 상품을 회수할 주소입니다. 기본값은 주문 배송지입니다.</p>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <input value={addr.name} onChange={(e) => { setAddr((p) => ({ ...p, name: e.target.value })); setAddrChanged(true); }} placeholder="받는분" className="w-full rounded-md border border-line bg-card px-2.5 py-1.5 text-[13px] text-text placeholder:text-sub focus:border-accent focus:outline-none" />
                    <input value={addr.hp} onChange={(e) => { setAddr((p) => ({ ...p, hp: e.target.value })); setAddrChanged(true); }} placeholder="연락처" className="w-full rounded-md border border-line bg-card px-2.5 py-1.5 text-[13px] text-text placeholder:text-sub focus:border-accent focus:outline-none" />
                    <div className="flex gap-1.5">
                      <input value={addr.zipcode} readOnly placeholder="우편번호" className="w-24 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-text" />
                      <button type="button" onClick={() => setZipOpen(true)} className="rounded-md border border-line bg-card px-3 py-1.5 text-[13px] font-medium text-text hover:bg-surface">우편번호 검색</button>
                    </div>
                    <input value={addr.addr1} readOnly placeholder="주소" className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-text" />
                    <input value={addr.addr2} onChange={(e) => { setAddr((p) => ({ ...p, addr2: e.target.value })); setAddrChanged(true); }} placeholder="상세주소" className="w-full rounded-md border border-line bg-card px-2.5 py-1.5 text-[13px] text-text placeholder:text-sub focus:border-accent focus:outline-none" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            preview && <ConfirmStep lines={lines} checked={checked} qty={qty} preview={preview} bank={bank} setBank={setBank} banks={init.banks} agree={agree} setAgree={setAgree} showTerms={showTerms} setShowTerms={setShowTerms} terms={init.terms} />
          )}

          {err && <p className="mt-3 text-[13px] text-sale">{err}</p>}
        </div>

        <div className="flex gap-2 border-t border-line px-5 py-4">
          {step === "select" ? (
            <>
              <button type="button" onClick={onClose} className="flex-1 rounded-md border border-line py-2.5 text-sm font-medium text-text hover:bg-surface">닫기</button>
              <button type="button" onClick={goConfirm} disabled={busy || (!forceAll && checked.size === 0)} className="flex-1 rounded-md bg-accent py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50">
                {busy ? "확인 중…" : "다음"}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { setStep("select"); setErr(""); }} className="flex-1 rounded-md border border-line py-2.5 text-sm font-medium text-text hover:bg-surface">이전</button>
              {preview?.is_submit ? (
                <button type="button" onClick={submit} disabled={busy} className="flex-1 rounded-md bg-accent py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50">
                  {busy ? "접수 중…" : "반품 접수"}
                </button>
              ) : (
                <button type="button" onClick={onClose} className="flex-1 rounded-md border border-line py-2.5 text-sm font-medium text-text hover:bg-surface">닫기</button>
              )}
            </>
          )}
        </div>
      </div>
      {zipOpen && <Zipcode onClose={onZip} />}
    </>
  );
}

function ConfirmStep({ lines, checked, qty, preview, bank, setBank, banks, agree, setAgree, showTerms, setShowTerms, terms }: {
  lines: RefundLine[]; checked: Set<number>; qty: Record<number, number>; preview: RefundPreview;
  bank: { code: string; num: string; holder: string }; setBank: (v: { code: string; num: string; holder: string }) => void;
  banks: { code: string; name: string }[];
  agree: boolean; setAgree: (v: boolean) => void; showTerms: boolean; setShowTerms: (v: boolean) => void; terms: string;
}) {
  const selected = lines.filter((l) => checked.has(l.prno));
  const w = preview.warnings;
  const d = preview.details;
  const hasBreakdown = (d.ret_cost === 1 && (d.ret_price ?? 0) !== 0) || (preview.amount.ref_point ?? 0) > 0;
  return (
    <div className="space-y-4">
      {/* 선택 상품 요약 */}
      <ul className="space-y-2">
        {selected.map((l) => {
          const q = Math.max(1, Math.min(qty[l.prno] || l.quantity, l.quantity));
          return (
            <li key={l.prno} className="flex items-center gap-3 rounded-lg border border-line p-2.5">
              {l.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.thumb} alt="" className="h-11 w-11 shrink-0 rounded-md border border-line object-cover" />
              ) : <div className="h-11 w-11 shrink-0 rounded-md border border-line bg-surface" />}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-[13px] font-medium text-text">{l.title}</p>
                {l.option && <p className="text-[12px] text-sub">{l.option}</p>}
              </div>
              <span className="shrink-0 text-[12px] text-sub">반품 {q}개</span>
            </li>
          );
        })}
      </ul>

      {/* 경고(쿠폰/배송비 변동) */}
      {preview.is_warning && (
        <div className="rounded-lg border border-sale/30 bg-sale/5 p-3 text-[12px] text-sale">
          <ul className="space-y-1">
            {w.product_coupon && <li>· 반품으로 인해 적용된 상품할인 쿠폰이 회수됩니다.</li>}
            {w.product_change && <li>· 반품으로 인해 상품할인 쿠폰 금액이 변경됩니다.</li>}
            {w.bundle_coupon && <li>· 반품으로 인해 묶음할인 쿠폰이 회수됩니다.</li>}
            {w.bundle_change && <li>· 반품으로 인해 묶음할인 쿠폰 금액이 변경됩니다.</li>}
            {w.delivery_coupon && <li>· 반품으로 인해 배송비 할인 쿠폰이 회수됩니다.</li>}
            {w.delivery_change && <li>· 무료배송 조건 미달로 배송비가 환수됩니다.</li>}
          </ul>
          <dl className="mt-2 space-y-0.5 border-t border-sale/20 pt-2 text-text">
            {(d.product_price ?? 0) !== 0 && <RowSm k="상품금액" v={won(d.product_price)} />}
            {w.product_coupon && <RowSm k="상품쿠폰 회수" v={won(d.product_coupon_price)} />}
            {(w.bundle_coupon || w.bundle_change) && <RowSm k="묶음쿠폰" v={won(d.bundle_coupon_price)} />}
            {w.delivery_coupon && <RowSm k="배송쿠폰 회수" v={won(d.delivery_coupon_price)} />}
            {w.delivery_change && <RowSm k="배송비 환수" v={won(d.delivery_price)} />}
          </dl>
        </div>
      )}

      {/* 환불 예상 금액 */}
      {preview.is_minus_price ? (
        <div className="rounded-lg border border-sale/30 bg-sale/5 p-3 text-[13px] text-sale">
          반품 시 결제금액을 초과하는 할인이 발생하여 회원님이 직접 접수할 수 없습니다. 고객센터로 문의해 주세요.
        </div>
      ) : (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-4">
          <dl className="space-y-2 text-sm">
            {/* 회수 배송비 — 협의(ret_cost 0) 또는 고객부담 금액 */}
            <div className="flex justify-between gap-4">
              <dt className="text-sub">회수 배송비</dt>
              <dd className="text-right text-text">{d.ret_cost === 0 ? "협의" : won(d.ret_price)}</dd>
            </div>
            {(preview.amount.ref_point ?? 0) > 0 && <Row k="반환 포인트" v={`${preview.amount.ref_point.toLocaleString()} P`} />}
            <div className={`flex items-baseline justify-between${hasBreakdown ? " border-t border-accent/20 pt-2" : ""}`}>
              <span className="text-sub">환불 예상 금액</span>
              <span className="text-lg font-extrabold text-text">{won(preview.amount.ref_price)}</span>
            </div>
          </dl>
        </div>
      )}

      {/* 추가결제 필요(접수 불가) */}
      {!preview.is_submit && !preview.is_minus_price && preview.amount.ref_bring_price > 0 && (
        <div className="rounded-lg border border-sale/30 bg-sale/5 p-3 text-[13px] text-sale">
          반품 시 추가결제({won(preview.amount.ref_bring_price)})가 발생하여 회원님이 직접 접수할 수 없습니다. 고객센터로 문의해 주세요.
        </div>
      )}

      {/* 환불 계좌(휴대폰/가상계좌/무통장) */}
      {preview.is_submit && preview.needs_bank && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-text">환불 계좌</p>
          <select value={String(bank.code || "0")} onChange={(e) => setBank({ ...bank, code: e.target.value })} className="w-full rounded-md border border-line bg-card px-3 py-2 text-[13px] text-text focus:border-accent focus:outline-none">
            <option value="0">은행 선택</option>
            {(banks ?? []).map((b) => <option key={b.code} value={String(b.code)}>{b.name}</option>)}
          </select>
          <input value={bank.num} onChange={(e) => setBank({ ...bank, num: e.target.value })} maxLength={50} placeholder="계좌번호 ( - 없이 입력)" className="w-full rounded-md border border-line bg-card px-3 py-2 text-[13px] text-text placeholder:text-sub focus:border-accent focus:outline-none" />
          <input value={bank.holder} onChange={(e) => setBank({ ...bank, holder: e.target.value })} maxLength={50} placeholder="예금주" className="w-full rounded-md border border-line bg-card px-3 py-2 text-[13px] text-text placeholder:text-sub focus:border-accent focus:outline-none" />
          <p className="text-[12px] font-medium text-sale">※ 환불계좌의 예금주명은 반드시 주문자명과 일치해야 합니다.</p>
        </div>
      )}

      {/* 약관 동의 */}
      {preview.is_submit && (
        <div className="border-t border-line pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-text">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="h-4 w-4 accent-[var(--accent,#2563eb)]" />
            반품 안내사항을 확인하였으며 이에 동의합니다.
            {terms && <button type="button" onClick={() => setShowTerms(!showTerms)} className="ml-auto text-[12px] text-accent underline">{showTerms ? "접기" : "내용보기"}</button>}
          </label>
          {showTerms && terms && (
            <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-surface p-3 text-[12px] leading-relaxed text-sub">{terms}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-sub">{k}</dt><dd className="text-right text-text">{v}</dd></div>;
}
function RowSm({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4 text-[12px]"><dt className="text-sub">{k}</dt><dd className="text-right">{v}</dd></div>;
}
