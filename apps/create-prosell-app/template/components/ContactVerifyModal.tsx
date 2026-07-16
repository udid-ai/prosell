"use client";

import { useEffect, useState } from "react";
import VerifyField from "./VerifyField";
import { bigBtnCls } from "./joinShared";

// 휴대폰/이메일 변경 + 인증 모달. 인증 완료 후 "변경완료" 시 해당 필드만 서버에 저장하고
// onClose(newValue) 로 부모에 반영. (랜딩폼은 읽기전용, 실제 변경은 이 모달에서만)
const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const normPhone = (v: string) => v.replace(/[^0-9]/g, "");
const normEmail = (v: string) => v.trim();

export default function ContactVerifyModal({
  channel,
  current,
  onClose,
}: {
  channel: "sms" | "email";
  current: string;
  onClose: (newValue?: string) => void; // 저장 성공 시 새 값 전달, 취소 시 인자 없음
}) {
  const isSms = channel === "sms";
  const label = isSms ? "휴대폰" : "이메일";

  const [value, setValue] = useState(current);
  const [sendId, setSendId] = useState<number | null>(null);
  const [code, setCode] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const normalize = isSms ? normPhone : normEmail;
  const validate = isSms
    ? (t: string) => (t.length < 10 ? "휴대폰 번호를 확인해 주세요." : "")
    : (t: string) => (emailRe.test(t) ? "" : "이메일 주소를 확인해 주세요.");

  // ESC 닫기 + body 스크롤 잠금
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  async function complete() {
    if (busy) return;
    if (!done) { setMsg(`${label} 인증을 완료해 주세요.`); return; }
    setBusy(true); setMsg("변경 중…");
    const body: Record<string, unknown> = isSms
      ? { hp: normalize(value), send_hp_id: sendId ?? undefined, hp_code: code }
      : { email: normalize(value), send_email_id: sendId ?? undefined, email_code: code };
    try {
      const r = await fetch("/account/edit/submit", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!d.ok) { setMsg(d.error || "변경에 실패했습니다."); setBusy(false); return; }
      onClose(normalize(value));
    } catch { setMsg("통신 오류가 발생했습니다."); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-4" onClick={() => onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-text">{label} 변경</h2>
          <button type="button" onClick={() => onClose()} aria-label="닫기" className="cursor-pointer text-sub hover:text-text">✕</button>
        </div>
        <p className="mt-1 text-[13px] text-sub">새 {label}을(를) 입력하고 인증을 완료해 주세요.</p>

        <div className="mt-4">
          <VerifyField
            channel={channel}
            value={value}
            onValue={setValue}
            placeholder={isSms ? "010-0000-0000" : "you@example.com"}
            inputType={isSms ? "tel" : "email"}
            maxLength={isSms ? undefined : 50}
            sendId={sendId} setSendId={setSendId}
            code={code} setCode={setCode}
            done={done} setDone={setDone}
            normalize={normalize} validate={validate}
          />
        </div>

        {msg && <p className="mt-3 text-[13px] text-sub">{msg}</p>}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={() => onClose()} className={`${bigBtnCls(true)} mt-0 flex-[0_0_35%] !bg-line !text-text`}>취소</button>
          <button type="button" onClick={complete} disabled={!done || busy} className={`${bigBtnCls(done && !busy)} mt-0 flex-1`}>
            {busy ? "변경 중…" : "변경완료"}
          </button>
        </div>
      </div>
    </div>
  );
}
