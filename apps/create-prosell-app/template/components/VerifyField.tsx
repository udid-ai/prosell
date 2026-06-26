"use client";

import { useEffect, useRef, useState } from "react";
import { fieldCls, inlineBtnCls } from "./joinShared";

// 인증번호 발송/확인 공용 필드 (SMS·이메일 공용).
// 품질 포인트: 진행 중 잠금(중복 클릭·경쟁 방지), 발송 후 대상 입력 잠금(번호/이메일 바꿔치기 방지),
// 재발송 쿨다운, 인증번호 숫자 6자리 강제. 영속 상태(sendId/code/done)는 부모가 소유한다.

const RESEND_SEC = 30; // 재발송 쿨다운(초)
const CODE_LEN = 6;    // 인증번호 자릿수

type Props = {
  channel: "sms" | "email";
  value: string;
  onValue: (v: string) => void;
  placeholder: string;
  inputType?: string;
  maxLength?: number;
  sendId: number | null;
  setSendId: (n: number | null) => void;
  code: string;
  setCode: (c: string) => void;
  done: boolean;
  setDone: (b: boolean) => void;
  /** 대상값 정규화(전화: 숫자만 / 이메일: trim) */
  normalize: (v: string) => string;
  /** 유효성 검사 — 오류 메시지 반환(없으면 "") */
  validate: (target: string) => string;
};

type Status = { tone: "info" | "ok" | "err"; text: string } | null;

export default function VerifyField(p: Props) {
  const [busy, setBusy] = useState<"send" | "confirm" | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [status, setStatus] = useState<Status>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const sent = p.sendId != null && !p.done; // 인증번호 발송됨(코드 입력 대기)
  const locked = p.done || sent || busy !== null; // 대상 입력 잠금 조건
  const targetWord = p.channel === "sms" ? "번호" : "이메일";

  // 재발송 쿨다운 카운트다운
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function call(body: Record<string, unknown>) {
    const r = await fetch("/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.json();
  }

  async function send() {
    if (busy || cooldown > 0 || p.done) return;
    const target = p.normalize(p.value);
    const err = p.validate(target);
    if (err) { setStatus({ tone: "err", text: err }); return; }
    setBusy("send");
    setStatus({ tone: "info", text: p.channel === "sms" ? "문자 발송 중…" : "메일 발송 중…" });
    try {
      const r = await call({ kind: "send", channel: p.channel, target });
      if (r.error) { setStatus({ tone: "err", text: r.error }); return; }
      if (r.state === 1) { p.setDone(true); setStatus({ tone: "ok", text: "인증이 필요 없습니다." }); return; }
      p.setSendId(r.send_id ?? null);
      p.setCode("");
      setCooldown(RESEND_SEC);
      setStatus({ tone: "ok", text: p.channel === "sms" ? "인증번호를 문자로 발송했습니다." : "인증번호를 메일로 발송했습니다." });
      setTimeout(() => codeRef.current?.focus(), 0);
    } catch {
      setStatus({ tone: "err", text: "발송에 실패했습니다. 잠시 후 다시 시도해 주세요." });
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (busy || p.done) return;
    if (p.code.length < CODE_LEN) { setStatus({ tone: "err", text: `인증번호 ${CODE_LEN}자리를 입력해 주세요.` }); return; }
    setBusy("confirm");
    setStatus({ tone: "info", text: "인증번호 확인 중…" });
    try {
      const r = await call({ kind: "confirm", channel: p.channel, send_id: p.sendId, code: p.code, target: p.normalize(p.value) });
      if (r.error) { setStatus({ tone: "err", text: r.error }); return; }
      if (r.verified) { p.setDone(true); setStatus({ tone: "ok", text: "인증이 완료되었습니다." }); }
      else setStatus({ tone: "err", text: "인증번호가 올바르지 않습니다." });
    } catch {
      setStatus({ tone: "err", text: "확인에 실패했습니다. 잠시 후 다시 시도해 주세요." });
    } finally {
      setBusy(null);
    }
  }

  // 대상 변경 — 발송 상태 초기화 후 재입력 허용
  function change() {
    p.setSendId(null);
    p.setCode("");
    setCooldown(0);
    setStatus(null);
  }

  const sendLabel = busy === "send" ? "발송 중…" : cooldown > 0 ? `재발송 (${cooldown})` : p.sendId != null ? "재발송" : "인증발송";
  const toneCls = status?.tone === "err" ? "text-sale" : status?.tone === "ok" ? "text-success" : "text-sub";

  return (
    <>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={p.value}
          onChange={(e) => p.onValue(e.target.value)}
          type={p.inputType ?? "text"}
          maxLength={p.maxLength}
          placeholder={p.placeholder}
          readOnly={locked}
          className={`${fieldCls} !mt-0`}
        />
        {!p.done && (
          <button type="button" onClick={send} disabled={busy !== null || cooldown > 0} className={inlineBtnCls}>
            {sendLabel}
          </button>
        )}
      </div>

      {sent && (<>
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={codeRef}
            value={p.code}
            onChange={(e) => p.setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, CODE_LEN))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LEN}
            placeholder={`인증번호 ${CODE_LEN}자리`}
            disabled={busy === "confirm"}
            className={`${fieldCls} !mt-0 tracking-[0.3em]`}
          />
          <button type="button" onClick={confirm} disabled={busy !== null || p.code.length < CODE_LEN} className={inlineBtnCls}>
            {busy === "confirm" ? "확인 중…" : "확인"}
          </button>
        </div>
        <div className="mt-1">
          <button type="button" onClick={change} disabled={busy !== null} className="cursor-pointer text-[12px] text-sub underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
            {targetWord} 변경
          </button>
        </div>
      </>)}

      {p.done ? (
        <p className="mt-1 text-[13px] text-success">✓ {p.channel === "sms" ? "휴대폰" : "이메일"} 인증 완료</p>
      ) : status ? (
        <p className={`mt-1 text-[13px] ${toneCls}`}>{status.text}</p>
      ) : null}
    </>
  );
}
