"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account, MemberConfig } from "@/lib/prosell";
import EditForm from "./EditForm";
import { encryptPassword } from "@/lib/pwcryptoClient";
import { fieldCls, labelCls, bigBtnCls } from "./joinShared";

const cardCls = "rounded-md border border-line bg-card p-6";

// 정보수정 진입 재인증 게이트 — 현재 비밀번호 확인 후 EditForm 노출.
// 소셜 로그인(isSocial)은 비밀번호가 없으므로 확인 없이 바로 접근.
export default function EditGate({ isSocial, account, config }: { isSocial: boolean; account: Account; config: MemberConfig | null }) {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(isSocial);
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (unlocked) return <EditForm account={account} config={config} />;

  async function verify() {
    if (busy) return;
    if (!pw) { setMsg("비밀번호를 입력해 주세요."); return; }
    setBusy(true); setMsg("");
    try {
      // 비밀번호는 RSA 암호화해 전송(평문 파라미터 노출 방지). 암호화 실패 시에만 평문 폴백.
      const enc = await encryptPassword(pw);
      const r = await fetch("/account/reauth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(enc ? { enc_upw: enc } : { current_upw: pw }),
      });
      const d = await r.json();
      if (!d.ok) { setMsg(d.error || "비밀번호가 일치하지 않습니다."); setBusy(false); return; }
      setUnlocked(true);
    } catch { setMsg("통신 오류가 발생했습니다."); setBusy(false); }
  }

  return (
    <div className={cardCls}>
      <h1 className="text-xl">회원정보 수정</h1>
      <p className="mt-2 text-[13px] text-sub">회원정보 보호를 위해 현재 비밀번호를 다시 확인합니다.</p>

      <div className="mt-4">
        <label className={labelCls}>현재 비밀번호</label>
        <input
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          type="password"
          maxLength={20}
          autoComplete="current-password"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") verify(); }}
          className={fieldCls}
        />
      </div>

      {msg && <p className="mt-3 text-[13px] text-sale">{msg}</p>}

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={() => router.push("/account/info")} className={`${bigBtnCls(true)} mt-0 flex-[0_0_35%] !bg-line !text-text`}>취소</button>
        <button type="button" onClick={verify} disabled={busy} className={`${bigBtnCls(!busy)} mt-0 flex-1`}>{busy ? "확인 중…" : "확인"}</button>
      </div>
    </div>
  );
}
