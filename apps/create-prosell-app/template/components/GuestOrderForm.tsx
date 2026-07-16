"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fieldCls, labelCls, bigBtnCls, inlineBtnCls, joinOuterCls, joinContentCls } from "./joinShared";
import { formatPhone } from "@/lib/format";

type Tab = 0 | 1; // 0: 주문번호+성명 / 1: 성명+휴대폰

// 비회원 주문조회 — 성명+주문번호 또는 성명+휴대폰으로 게스트 주문을 찾는다.
// hpVerify=true(쇼핑몰 guest_login) 이면 휴대폰 조회 시 SMS 인증 필수.
// 제출 성공 시 서버가 guest 토큰을 쿠키에 저장하고, 페이지를 새로고침하면 주문목록이 표시된다.
export default function GuestOrderForm({ hpVerify = false }: { hpVerify?: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(0);
  const [name, setName] = useState("");
  const [dno, setDno] = useState("");
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // 휴대폰 인증(guest_login) 상태
  const [sendId, setSendId] = useState(0);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);

  const needCode = tab === 1 && hpVerify;

  async function sendHpCode() {
    setMsg("");
    if (!name.trim()) return setMsg("주문자 성명을 입력해 주세요.");
    if (!hp) return setMsg("휴대폰번호를 입력해 주세요.");
    setSending(true);
    const r = await fetch("/order/guest/submit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "hp_send", name: name.trim(), hp }),
    });
    const d = await r.json().catch(() => ({}));
    setSending(false);
    if (!d.ok) return setMsg(String(d.error || "인증번호 발송에 실패했습니다."));
    setSendId(Number(d.send_id || 0));
    setMsg("인증번호를 발송했습니다.");
  }

  async function submit() {
    setMsg("");
    if (!name.trim()) return setMsg("주문자 성명을 입력해 주세요.");
    if (tab === 0 && !dno.trim()) return setMsg("주문번호를 입력해 주세요.");
    if (tab === 1 && !hp) return setMsg("휴대폰번호를 입력해 주세요.");
    if (needCode && !sendId) return setMsg("휴대폰 인증을 진행해 주세요.");
    if (needCode && !code.trim()) return setMsg("인증번호를 입력해 주세요.");
    setBusy(true);
    const r = await fetch("/order/guest/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tab, name: name.trim(), dno: dno.trim(), hp, send_id: sendId, code: code.trim() }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!d.ok) return setMsg(String(d.error || "일치하는 주문 정보가 없습니다."));
    router.refresh(); // 서버가 guest 쿠키 저장 → 페이지가 주문목록으로 전환
  }

  const resetVerify = () => { setSendId(0); setCode(""); };
  const tabBtn = (t: Tab, label: string) => (
    <button type="button" onClick={() => { setTab(t); setMsg(""); resetVerify(); }}
      className={`flex-1 border-b-2 pb-3 text-[15px] font-bold transition-colors ${tab === t ? "border-accent text-text" : "border-transparent text-sub hover:text-text"}`}>
      {label}
    </button>
  );

  return (
    <div className={joinOuterCls}>
      <div className={joinContentCls}>
        <div className="rounded-md border border-line bg-card p-6">
          <h1 className="text-xl">비회원 주문조회</h1>
          <p className="mt-2 text-[13px] text-sub">주문 시 입력한 정보로 주문내역을 조회할 수 있습니다.</p>

          <div className="mt-5 flex gap-2">{tabBtn(0, "주문번호로 조회")}{tabBtn(1, "휴대폰으로 조회")}</div>

          <label className={labelCls}>주문자 성명</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="주문자 성명" className={fieldCls} />

          {tab === 0 ? (
            <>
              <label className={labelCls}>주문번호</label>
              <input value={dno} onChange={(e) => setDno(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()}
                inputMode="numeric" maxLength={20} placeholder="주문번호" className={fieldCls} />
            </>
          ) : (
            <>
              <label className={labelCls}>주문자 휴대폰번호</label>
              {needCode ? (
                <div className="mt-2 flex items-center gap-2">
                  <input value={formatPhone(hp)} onChange={(e) => { setHp(e.target.value.replace(/\D/g, "")); resetVerify(); }}
                    inputMode="numeric" maxLength={13} placeholder="휴대폰번호 (- 없이)" className={`${fieldCls} !mt-0`} />
                  <button type="button" onClick={sendHpCode} disabled={sending} className={inlineBtnCls}>
                    {sendId ? "재발송" : sending ? "발송 중…" : "인증번호"}
                  </button>
                </div>
              ) : (
                <input value={formatPhone(hp)} onChange={(e) => setHp(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()}
                  inputMode="numeric" maxLength={13} placeholder="휴대폰번호 (- 없이)" className={fieldCls} />
              )}

              {needCode && sendId > 0 && (
                <>
                  <label className={labelCls}>인증번호</label>
                  <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()}
                    inputMode="numeric" maxLength={6} placeholder="인증번호 6자리" className={fieldCls} />
                </>
              )}
            </>
          )}

          {msg && <div className="mt-3 text-[13px] text-sale">{msg}</div>}
          <button type="button" onClick={submit} disabled={busy} className={bigBtnCls(!busy)}>{busy ? "조회 중…" : "주문조회"}</button>

          <p className="mt-6 text-center text-[13px] text-sub">
            회원이신가요? <a href="/auth/login" className="text-accent">로그인</a>
          </p>
        </div>
      </div>
    </div>
  );
}
