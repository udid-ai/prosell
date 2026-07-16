"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { passwordRule, validatePassword } from "@/lib/password";
import { encryptPassword } from "@/lib/pwcryptoClient";
import { fieldCls, labelCls, bigBtnCls } from "./joinShared";

// 비밀번호 변경 폼. 제출은 회원정보 수정과 동일 엔드포인트(/account/edit/submit)로
// current_upw/new_upw 만 보내 부분 갱신한다. reqUpw = 쇼핑몰 비밀번호 규칙(config.fields.upw).
const cardCls = "rounded-md border border-line bg-card p-6";

export default function PasswordForm({ reqUpw }: { reqUpw?: number }) {
  const router = useRouter();
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setMsg("");
    if (!curPw) { setMsg("현재 비밀번호를 입력해 주세요."); return; }
    { const e = validatePassword(newPw, reqUpw); if (e) { setMsg(e.replace("비밀번호는", "새 비밀번호는")); return; } }
    if (newPw !== newPw2) { setMsg("새 비밀번호가 일치하지 않습니다."); return; }
    if (newPw === curPw) { setMsg("현재 비밀번호와 다른 비밀번호를 입력해 주세요."); return; }

    setBusy(true);
    setMsg("변경 중…");
    try {
      // 비밀번호는 RSA 암호화 전송(평문 파라미터 노출 방지). 암호화 실패 시에만 평문 폴백.
      const [encCur, encNew] = await Promise.all([encryptPassword(curPw), encryptPassword(newPw)]);
      const body = encCur && encNew
        ? { enc_upw: encCur, enc_new_upw: encNew }
        : { current_upw: curPw, new_upw: newPw };
      const r = await fetch("/account/edit/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!data.ok) { setMsg(data.error || "비밀번호 변경에 실패했습니다."); return; }
      setMsg("");
      alert("비밀번호가 변경되었습니다.");
      router.replace("/account");
      router.refresh();
    } catch {
      setMsg("통신 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cardCls}>
      <h1 className="text-xl">비밀번호 변경</h1>
      <p className="mt-2 text-[13px] text-sub">현재 비밀번호 확인 후 새 비밀번호로 변경합니다.</p>

      <div className="mt-4">
        <label className={labelCls}>현재 비밀번호</label>
        <input value={curPw} onChange={(e) => setCurPw(e.target.value)} type="password" maxLength={20} autoComplete="current-password" className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>새 비밀번호</label>
        <input value={newPw} onChange={(e) => setNewPw(e.target.value)} type="password" maxLength={20} placeholder={passwordRule(reqUpw).hint} autoComplete="new-password" className={fieldCls} />
      </div>
      <div>
        <label className={labelCls}>새 비밀번호 확인</label>
        <input value={newPw2} onChange={(e) => setNewPw2(e.target.value)} type="password" maxLength={20} autoComplete="new-password" className={fieldCls} />
      </div>

      {msg && <div className="mt-3 text-[13px] text-sub">{msg}</div>}

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={() => router.push("/account")} className={`${bigBtnCls(true)} mt-0 flex-[0_0_35%] !bg-line !text-text`}>취소</button>
        <button type="button" onClick={submit} disabled={busy} className={`${bigBtnCls(!busy)} mt-0 flex-1`}>{busy ? "변경 중…" : "변경"}</button>
      </div>
    </div>
  );
}
