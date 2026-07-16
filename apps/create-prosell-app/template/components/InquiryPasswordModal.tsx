"use client";

import { useState } from "react";

// 비회원 문의 «비밀번호 확인» 모달 — 수정/삭제 전에 뜬다.
//  · onSubmit(upw) 가 성공하면(=Promise resolve true) 닫힘, 실패하면 에러 메시지 표시 후 유지.
export default function InquiryPasswordModal({
  action,
  onSubmit,
  onClose,
}: {
  action: "view" | "edit" | "delete";
  onSubmit: (upw: string) => Promise<string | null>; // null=성공, string=에러메시지
  onClose: () => void;
}) {
  const actionLabel = action === "view" ? "열람" : action === "edit" ? "수정" : "삭제";
  const [upw, setUpw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!upw) { setErr("비밀번호를 입력해 주세요."); return; }
    setBusy(true); setErr("");
    const e = await onSubmit(upw);
    if (e) { setErr(e); setBusy(false); return; }
    // 성공 시 부모가 onClose 처리
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="비밀번호 확인">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xs rounded-xl bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-text">비밀번호 확인</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="grid h-7 w-7 place-items-center rounded-full text-text hover:bg-line">✕</button>
        </div>
        <p className="mt-2 text-[13px] text-sub">비회원 비밀글 {actionLabel}을 위해 작성 시 입력한 비밀번호를 확인합니다.</p>
        <input
          type="password"
          value={upw}
          autoFocus
          onChange={(e) => setUpw(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          maxLength={100}
          placeholder="비밀번호"
          className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
        />
        {err && <p className="mt-2 text-[12px] text-sale">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-text hover:bg-surface">취소</button>
          <button type="button" onClick={submit} disabled={busy}
            className="rounded-lg border border-accent bg-accent px-5 py-2 text-[13px] font-semibold text-accent-foreground hover:opacity-90 disabled:opacity-60">
            {busy ? "확인 중…" : "확인"}
          </button>
        </div>
      </div>
    </div>
  );
}
