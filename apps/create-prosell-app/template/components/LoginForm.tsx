"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { shellCls, fieldCls, labelCls, bigBtnCls } from "./joinShared";
import type { SocialProvider } from "@/lib/prosell";

type Props = { joined?: boolean; error?: string; providers?: SocialProvider[] };

// provider 브랜드 색상(브랜드 고정색이라 다크모드와 무관하게 유지)
const SNS_STYLE: Record<string, { bg: string; fg: string }> = {
  naver: { bg: "#03C75A", fg: "#fff" },
  kakao: { bg: "#FEE500", fg: "#191600" },
  facebook: { bg: "#1877F2", fg: "#fff" },
  google: { bg: "#fff", fg: "#3c4043" },
};

// 앱키 기반 비밀번호 로그인 — uid/upw 를 서버 라우트로 보내 토큰을 발급받는다.
export default function LoginForm({ joined, error, providers = [] }: Props) {
  const router = useRouter();
  const [uid, setUid] = useState("");
  const [upw, setUpw] = useState("");
  const [msg, setMsg] = useState(error || "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setMsg("");
    if (!uid.trim() || !upw) { setMsg("아이디와 비밀번호를 입력해 주세요."); return; }
    setBusy(true);
    const r = await fetch("/auth/login/submit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: uid.trim(), upw }),
    });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!data.ok) { setMsg(data.error || "로그인에 실패했습니다."); return; }
    router.push("/");
    router.refresh();
  }

  return (
    <main className={shellCls}>
      <h1 className="text-xl">로그인</h1>
      {joined && <p className="mt-2 text-[13px] text-success">가입이 완료되었습니다. 로그인해 주세요.</p>}

      <label className={labelCls}>아이디</label>
      <input value={uid} onChange={(e) => setUid(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} maxLength={50} placeholder="아이디" className={fieldCls} />

      <label className={labelCls}>비밀번호</label>
      <input value={upw} onChange={(e) => setUpw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} type="password" maxLength={20} placeholder="비밀번호" className={fieldCls} />

      {msg && <div className="mt-3 text-[13px] text-sale">{msg}</div>}

      <button type="button" onClick={submit} disabled={busy} className={bigBtnCls(!busy)}>{busy ? "로그인 중…" : "로그인"}</button>

      {providers.length > 0 && (
        <div className="mt-5">
          <div className="mb-3 flex items-center gap-2 text-xs text-sub">
            <span className="h-px flex-1 bg-line" /> SNS 로그인 <span className="h-px flex-1 bg-line" />
          </div>
          <div className="flex flex-col gap-2">
            {providers.map((p) => {
              const s = SNS_STYLE[p.provider] ?? { bg: "var(--c-accent)", fg: "var(--c-accent-fg)" };
              return (
                <a key={p.provider} href={`/auth/social/${p.provider}/start`}
                  className="block rounded-sm py-3 text-center text-sm font-bold"
                  style={{ background: s.bg, color: s.fg, border: p.provider === "google" ? "1px solid #dadce0" : "none" }}>
                  {p.name}로 계속하기
                </a>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-4 text-[13px] text-sub">
        계정이 없나요? <a href="/auth/join" className="text-accent">회원가입</a>
      </p>
    </main>
  );
}
