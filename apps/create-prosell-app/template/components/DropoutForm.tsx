"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DropoutInfo } from "@/lib/prosell";
import { encryptPassword } from "@/lib/pwcryptoClient";
import { fieldCls, labelCls, bigBtnCls } from "./joinShared";

const cardCls = "rounded-md border border-line bg-card p-6";
const subjectCls = "mb-2 mt-6 text-[13px] font-bold text-sub";

// 회원 탈퇴 폼 — 사유 선택 + (비번계정) 비밀번호 + 안내 동의. 레거시 dropout 재현.
export default function DropoutForm({ info }: { info: DropoutInfo }) {
  const router = useRouter();
  const g1 = info.reasons.filter((r) => r.group === 1); // 개인 사유
  const g2 = info.reasons.filter((r) => r.group === 2); // 서비스 불만

  const [reason, setReason] = useState("");
  const [pw, setPw] = useState("");
  const [assent, setAssent] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setMsg("");
    if (!reason) { setMsg("탈퇴 사유를 선택해 주세요."); return; }
    if (info.needs_password && !pw) { setMsg("비밀번호를 입력해 주세요."); return; }
    if (!assent) { setMsg("탈퇴 안내에 동의해 주세요."); return; }
    if (!confirm("정말 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;

    setBusy(true); setMsg("처리 중…");
    try {
      // 비밀번호는 RSA 암호화 전송(평문 노출 방지). 암호화 실패 시에만 평문 폴백.
      const enc = info.needs_password ? await encryptPassword(pw) : "";
      const pwPart = !info.needs_password ? {} : enc ? { enc_upw: enc } : { current_upw: pw };
      const r = await fetch("/account/dropout/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dropout_ct: reason, assent, ...pwPart }),
      });
      const d = await r.json();
      if (!d.ok) { setMsg(d.error || "탈퇴 처리에 실패했습니다."); setBusy(false); return; }
      alert("회원 탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.");
      // 쿠키는 서버가 제거함 → 홈으로 이동 후 새로고침으로 비로그인 상태 반영
      router.replace("/");
      router.refresh();
    } catch {
      setMsg("통신 오류가 발생했습니다."); setBusy(false);
    }
  }

  const RadioGroup = ({ title, items }: { title: string; items: typeof g1 }) =>
    items.length === 0 ? null : (
      <>
        <div className={subjectCls}>{title}</div>
        <div className="flex flex-col gap-1.5">
          {items.map((r) => (
            <label key={r.code} className="flex cursor-pointer items-center gap-2 text-sm text-text">
              <input type="radio" name="dropout_ct" value={r.code} checked={reason === r.code} onChange={() => setReason(r.code)} />
              {r.label}
            </label>
          ))}
        </div>
      </>
    );

  return (
    <div className={cardCls}>
      <h1 className="text-xl">회원 탈퇴</h1>
      <p className="mt-2 text-[13px] text-sub">
        탈퇴 신청 후 {info.dropout_day > 0 ? <b className="text-text">{info.dropout_day}일</b> : "즉시"} 뒤 회원정보가 영구 삭제됩니다.
        보유 적립금·쿠폰·주문내역 등은 복구할 수 없습니다.
      </p>

      <RadioGroup title="탈퇴 사유" items={g1} />
      <RadioGroup title="서비스 개선을 위한 의견" items={g2} />

      {info.needs_password && (<>
        <div className={subjectCls}>비밀번호 확인</div>
        <label className={labelCls}>현재 비밀번호</label>
        <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" maxLength={20} autoComplete="current-password" className={fieldCls} />
      </>)}

      <label className="mt-5 flex cursor-pointer items-start gap-2 rounded-md border border-line p-3 text-[13px] text-text">
        <input type="checkbox" checked={assent} onChange={(e) => setAssent(e.target.checked)} className="mt-0.5" />
        위 안내 사항을 모두 확인했으며, 회원 탈퇴에 동의합니다.
      </label>

      {msg && <p className="mt-3 text-[13px] text-sale">{msg}</p>}

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={() => router.push("/account/info")} className={`${bigBtnCls(true)} mt-0 flex-[0_0_35%] !bg-line !text-text`}>취소</button>
        <button type="button" onClick={submit} disabled={busy} className={`${bigBtnCls(!busy)} mt-0 flex-1 !bg-sale`}>{busy ? "처리 중…" : "회원 탈퇴"}</button>
      </div>
    </div>
  );
}
