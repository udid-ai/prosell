"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { won } from "@/lib/format";
import Zipcode, { type ZipcodeResult } from "@/components/Zipcode";
import type { ExchangeInit, ExchangePreview, ExchangeItemInput } from "@/lib/prosell";

// 교환접수 대상 라인 — 메인 상품 + 추가옵션(item_type 1). 전량 교환 시 추가옵션도 함께.
// options = 같은 상품의 선택 가능한 옵션(옵션변경용). 비어있으면 동일재교환만 가능(단일옵션 상품).
export type ExchangeOption = { id: number; label: string; price: number; soldout: number };
export type ExchangeLine = {
  prno: number; title: string; option?: string; thumb?: string; quantity: number; price: number;
  products_id: number; product_id: number;
  options: ExchangeOption[];
  addons: { prno: number; quantity: number; title: string }[];
};

type Step = "select" | "confirm";
type Mode = "same" | "change"; // same=동일 재교환(불량) / change=옵션 변경(사이즈·색상)

// init(사유·약관·수거지)은 버튼에서 미리 불러와 prop 으로 전달 → 모달은 열리는 순간 완성(깜빡임 없음).
export default function ExchangeRequestModal({ ono, lines, init, onClose }: { ono: number; lines: ExchangeLine[]; init: ExchangeInit; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("select");

  const [checked, setChecked] = useState<Set<number>>(new Set(lines.map((l) => l.prno)));
  const [qty, setQty] = useState<Record<number, number>>(() => Object.fromEntries(lines.map((l) => [l.prno, l.quantity])));
  const [mode, setMode] = useState<Record<number, Mode>>(() => Object.fromEntries(lines.map((l) => [l.prno, "same"])));
  const [newOpt, setNewOpt] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [memo, setMemo] = useState("");

  const [preview, setPreview] = useState<ExchangePreview | null>(null);
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

  // 옵션변경(다른 옵션)은 전량 교환만 가능(레거시 제약: pro_quantity == exc_pro_quantity).
  function setLineMode(l: ExchangeLine, m: Mode) {
    setMode((p) => ({ ...p, [l.prno]: m }));
    if (m === "change") setQty((p) => ({ ...p, [l.prno]: l.quantity }));
    else setNewOpt((p) => { const n = { ...p }; delete n[l.prno]; return n; });
  }

  // 선택 → 서버 전송용 items(전량 교환 시 추가옵션 prno 포함)
  function buildItems(): ExchangeItemInput[] {
    const out: ExchangeItemInput[] = [];
    for (const l of lines) {
      if (!checked.has(l.prno)) continue;
      const changing = mode[l.prno] === "change" && !!newOpt[l.prno];
      const q = changing ? l.quantity : Math.max(1, Math.min(qty[l.prno] || l.quantity, l.quantity));
      const item: ExchangeItemInput = { prno: l.prno, quantity: q, product_id: l.product_id };
      if (changing) item.exc_product_id = newOpt[l.prno];
      out.push(item);
      if (q === l.quantity) for (const a of l.addons) out.push({ prno: a.prno, quantity: a.quantity });
    }
    return out;
  }

  // 선택 라인 검증 — 옵션변경 선택 시 새 옵션 필수
  function validateSelection(): string {
    for (const l of lines) {
      if (!checked.has(l.prno)) continue;
      if (mode[l.prno] === "change" && !newOpt[l.prno]) return "교환할 옵션을 선택해 주세요.";
    }
    return "";
  }

  async function goConfirm() {
    setErr("");
    if (checked.size === 0) return setErr("교환할 상품을 선택해 주세요.");
    if (!reason) return setErr("교환사유를 선택해 주세요.");
    const v = validateSelection();
    if (v) return setErr(v);
    if (addrChanged) {
      if (!addr.name.trim()) return setErr("수거지 받는분을 입력해 주세요.");
      if (!addr.addr1.trim()) return setErr("수거지 주소(우편번호 검색)를 입력해 주세요.");
      if (!addr.addr2.trim()) return setErr("수거지 상세주소를 입력해 주세요.");
    }
    const items = buildItems();
    if (items.length === 0) return setErr("교환할 상품을 선택해 주세요.");
    setBusy(true);
    try {
      const res = await fetch("/api/order/exchange/preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ono, items, exc_ct: reason }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error || "교환배송비를 계산할 수 없습니다."); setBusy(false); return; }
      setPreview(j.preview as ExchangePreview);
      setStep("confirm");
      setBusy(false);
    } catch { setErr("교환배송비 계산 중 오류가 발생했습니다."); setBusy(false); }
  }

  async function submit() {
    setErr("");
    if (!agree) return setErr("교환 안내에 동의해 주세요.");
    setBusy(true);
    try {
      const res = await fetch("/api/order/exchange", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ono, items: buildItems(), exc_ct: reason, exc_content: memo, address: addrChanged ? addr : null }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { setErr(j?.error || "교환접수에 실패했습니다."); setBusy(false); return; }
      // 교환 상세(진행상태) 랜딩으로 이동
      if (j?.eno) { router.push(`/account/exchanges/${j.eno}`); return; }
      onClose();
      router.refresh();
    } catch { setErr("교환접수 요청 중 오류가 발생했습니다."); setBusy(false); }
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
          <h2 className="text-lg font-bold text-text">{step === "select" ? "교환 접수" : "교환 확인"}</h2>
          <button type="button" onClick={onClose} className="text-sub hover:text-text" aria-label="닫기">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {step === "select" ? (
            <div className="space-y-4">
              {/* 상품 선택 */}
              <div>
                <label className="mb-2 flex cursor-pointer items-center gap-2 border-b border-line pb-2 text-sm font-medium text-text">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 accent-[var(--accent,#2563eb)]" />
                  전체 선택 ({checked.size}/{lines.length})
                </label>
                <ul className="space-y-2">
                  {lines.map((l) => {
                    const on = checked.has(l.prno);
                    const m = mode[l.prno] ?? "same";
                    const q = Math.max(1, Math.min(qty[l.prno] || l.quantity, l.quantity));
                    const canChange = l.options.length > 0;
                    return (
                      <li key={l.prno} className="rounded-lg border border-line p-2.5">
                        <div className="flex items-start gap-3">
                          <input type="checkbox" checked={on} onChange={() => toggle(l.prno)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent,#2563eb)]" />
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

                        {on && (
                          <div className="mt-2.5 space-y-2 border-t border-line pt-2.5">
                            {/* 교환방식 — 동일 재교환 / 옵션 변경 */}
                            <div className="flex flex-wrap items-center gap-3 text-[13px]">
                              <span className="text-sub">교환방식</span>
                              <label className="flex cursor-pointer items-center gap-1.5 text-text">
                                <input type="radio" name={`mode-${l.prno}`} checked={m === "same"} onChange={() => setLineMode(l, "same")} className="h-4 w-4 accent-[var(--accent,#2563eb)]" />
                                동일 재교환
                              </label>
                              <label className={`flex items-center gap-1.5 ${canChange ? "cursor-pointer text-text" : "cursor-not-allowed text-sub/60"}`}>
                                <input type="radio" name={`mode-${l.prno}`} disabled={!canChange} checked={m === "change"} onChange={() => setLineMode(l, "change")} className="h-4 w-4 accent-[var(--accent,#2563eb)]" />
                                옵션 변경
                              </label>
                            </div>

                            {/* 옵션 변경 → 새 옵션 선택(전량 교환) */}
                            {m === "change" && canChange && (
                              <div>
                                <select
                                  value={String(newOpt[l.prno] ?? "")}
                                  onChange={(e) => setNewOpt((p) => ({ ...p, [l.prno]: Number(e.target.value) || 0 }))}
                                  className="w-full rounded-md border border-line bg-card px-2.5 py-1.5 text-[13px] text-text focus:border-accent focus:outline-none"
                                >
                                  <option value="">교환할 옵션 선택</option>
                                  {l.options.map((o) => (
                                    <option key={o.id} value={String(o.id)} disabled={o.soldout === 1 || o.id === l.product_id}>
                                      {o.label}{o.id === l.product_id ? " (현재 옵션)" : o.soldout === 1 ? " (품절)" : ""}
                                    </option>
                                  ))}
                                </select>
                                <p className="mt-1 text-[11px] text-sub">옵션 변경은 해당 상품 전량({l.quantity}개) 교환만 가능합니다.</p>
                              </div>
                            )}

                            {/* 동일 재교환 + 수량 2개 이상 → 교환수량 선택 */}
                            {m === "same" && l.quantity > 1 && (
                              <div className="flex items-center justify-end gap-2 text-[13px]">
                                <span className="text-sub">교환수량</span>
                                <input
                                  type="number" min={1} max={l.quantity} value={q}
                                  onChange={(e) => setQty((p) => ({ ...p, [l.prno]: Math.max(1, Math.min(Number(e.target.value) || 1, l.quantity)) }))}
                                  className="w-16 rounded-md border border-line bg-card px-2 py-1 text-right text-text"
                                />
                                <span className="text-sub">/ {l.quantity}개</span>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* 교환사유 */}
              <div>
                <p className="mb-2 text-sm font-medium text-text">교환사유 <span className="text-sale">*</span></p>
                <div className="space-y-1.5">
                  {init.categories.length === 0 && <p className="text-[13px] text-sub">등록된 교환사유가 없습니다.</p>}
                  {init.categories.map((c) => (
                    <label key={c} className="flex cursor-pointer items-center gap-2 text-[13px] text-text">
                      <input type="radio" name="exchange-reason" checked={reason === c} onChange={() => setReason(c)} className="h-4 w-4 accent-[var(--accent,#2563eb)]" />
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
                  placeholder="자세한 교환 사유를 입력해 주세요. (선택)"
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
                    <p className="mt-1 text-[11px]">교환 상품을 회수할 주소입니다. 기본값은 주문 배송지입니다.</p>
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
            preview && <ConfirmStep lines={lines} checked={checked} qty={qty} mode={mode} newOpt={newOpt} preview={preview} agree={agree} setAgree={setAgree} showTerms={showTerms} setShowTerms={setShowTerms} terms={init.terms} />
          )}

          {err && <p className="mt-3 text-[13px] text-sale">{err}</p>}
        </div>

        <div className="flex gap-2 border-t border-line px-5 py-4">
          {step === "select" ? (
            <>
              <button type="button" onClick={onClose} className="flex-1 rounded-md border border-line py-2.5 text-sm font-medium text-text hover:bg-surface">닫기</button>
              <button type="button" onClick={goConfirm} disabled={busy || checked.size === 0} className="flex-1 rounded-md bg-accent py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50">
                {busy ? "확인 중…" : "다음"}
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { setStep("select"); setErr(""); }} className="flex-1 rounded-md border border-line py-2.5 text-sm font-medium text-text hover:bg-surface">이전</button>
              <button type="button" onClick={submit} disabled={busy} className="flex-1 rounded-md bg-accent py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50">
                {busy ? "접수 중…" : "교환 접수"}
              </button>
            </>
          )}
        </div>
      </div>
      {zipOpen && <Zipcode onClose={onZip} />}
    </>
  );
}

function ConfirmStep({ lines, checked, qty, mode, newOpt, preview, agree, setAgree, showTerms, setShowTerms, terms }: {
  lines: ExchangeLine[]; checked: Set<number>; qty: Record<number, number>; mode: Record<number, Mode>; newOpt: Record<number, number>;
  preview: ExchangePreview;
  agree: boolean; setAgree: (v: boolean) => void; showTerms: boolean; setShowTerms: (v: boolean) => void; terms: string;
}) {
  const selected = lines.filter((l) => checked.has(l.prno));
  const d = preview.details;
  const excPrice = preview.amount.exc_price ?? 0;
  const isNego = (d.ret_cost ?? 0) === 0; // 협의(판매자부담) → 회원 부담 배송비 없음
  return (
    <div className="space-y-4">
      {/* 선택 상품 요약 + 교환 대상 옵션 */}
      <ul className="space-y-2">
        {selected.map((l) => {
          const changing = mode[l.prno] === "change" && !!newOpt[l.prno];
          const q = changing ? l.quantity : Math.max(1, Math.min(qty[l.prno] || l.quantity, l.quantity));
          const target = changing ? l.options.find((o) => o.id === newOpt[l.prno]) : null;
          return (
            <li key={l.prno} className="flex items-center gap-3 rounded-lg border border-line p-2.5">
              {l.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.thumb} alt="" className="h-11 w-11 shrink-0 rounded-md border border-line object-cover" />
              ) : <div className="h-11 w-11 shrink-0 rounded-md border border-line bg-surface" />}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-[13px] font-medium text-text">{l.title}</p>
                {l.option && <p className="text-[12px] text-sub">{l.option}</p>}
                <p className="mt-0.5 text-[12px] text-accent">
                  {target ? `→ ${target.label}` : "→ 동일 옵션 재교환"}
                </p>
              </div>
              <span className="shrink-0 text-[12px] text-sub">교환 {q}개</span>
            </li>
          );
        })}
      </ul>

      {/* 교환 배송비 */}
      <div className="rounded-lg border border-accent/40 bg-accent/5 p-4">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-sub">회수 배송비</dt>
            <dd className="text-right text-text">{isNego ? "협의" : won(d.ret_price ?? 0)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-sub">재배송비</dt>
            <dd className="text-right text-text">{isNego ? "협의" : won(d.del_price ?? 0)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-accent/20 pt-2">
            <span className="text-sub">교환 배송비(왕복)</span>
            <span className="text-lg font-extrabold text-text">{isNego ? "협의" : won(excPrice)}</span>
          </div>
        </dl>
        <p className="mt-2 text-[12px] text-sub">
          {isNego
            ? "판매자 부담 또는 협의 대상 사유입니다. 배송비는 접수 후 안내됩니다."
            : "교환 왕복배송비는 접수 후 고객센터 안내(계좌 등)로 결제됩니다. 상품 차액은 별도 발생하지 않습니다."}
        </p>
      </div>

      {/* 약관 동의 */}
      <div className="border-t border-line pt-3">
        <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-text">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="h-4 w-4 accent-[var(--accent,#2563eb)]" />
          교환 안내사항을 확인하였으며 이에 동의합니다.
          {terms && <button type="button" onClick={() => setShowTerms(!showTerms)} className="ml-auto text-[12px] text-accent underline">{showTerms ? "접기" : "내용보기"}</button>}
        </label>
        {showTerms && terms && (
          <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-surface p-3 text-[12px] leading-relaxed text-sub">{terms}</div>
        )}
      </div>
    </div>
  );
}
