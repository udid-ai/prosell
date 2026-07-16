"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fieldCls, labelCls, bigBtnCls, inlineBtnCls, joinOuterCls, joinContentCls } from "./joinShared";
import { formatPhone } from "@/lib/format";
import { encryptPassword } from "@/lib/pwcryptoClient";
import { passwordRule, validatePassword } from "@/lib/password";

type Channel = "hp" | "email";
type FoundId = { mid: number; uid: string; dt: string };

async function post(body: Record<string, unknown>) {
  const r = await fetch("/auth/find/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await r.json().catch(() => ({}))) as Record<string, unknown>;
}

// 연락처 입력 — 휴대폰이면 하이픈 자동 표기, 이메일이면 그대로. 저장값은 hp=숫자만.
function ContactInput({ channel, value, onValue }: { channel: Channel; value: string; onValue: (v: string) => void }) {
  if (channel === "hp") {
    return (
      <input
        value={formatPhone(value)}
        onChange={(e) => onValue(e.target.value.replace(/\D/g, ""))}
        inputMode="numeric" maxLength={13} placeholder="휴대폰번호 (- 없이)" className={fieldCls}
      />
    );
  }
  return (
    <input value={value} onChange={(e) => onValue(e.target.value.trim())} type="email" maxLength={100} placeholder="이메일" className={fieldCls} />
  );
}

// 찾기 수단 선택(휴대폰/이메일) 세그먼트
function ChannelTabs({ channel, onChange }: { channel: Channel; onChange: (c: Channel) => void }) {
  const opt = (c: Channel, label: string) => (
    <button type="button" onClick={() => onChange(c)}
      className={`flex-1 rounded-sm py-2 text-[13px] transition-colors ${channel === c ? "bg-accent text-accent-foreground" : "bg-surface text-sub hover:text-text"}`}>
      {label}
    </button>
  );
  return <div className="mt-2 flex gap-2">{opt("hp", "휴대폰")}{opt("email", "이메일")}</div>;
}

// ─────────────────────────────────────────────
// 아이디 찾기
// ─────────────────────────────────────────────
function FindIdPanel({ onToPw }: { onToPw: () => void }) {
  const [channel, setChannel] = useState<Channel>("hp");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [items, setItems] = useState<FoundId[] | null>(null);
  const [sent, setSent] = useState<Record<number, boolean>>({});

  async function submit() {
    setMsg("");
    if (!name.trim()) return setMsg("성명을 입력해 주세요.");
    if (!contact) return setMsg(channel === "hp" ? "휴대폰번호를 입력해 주세요." : "이메일을 입력해 주세요.");
    setBusy(true);
    const d = await post({ action: "find_id", name: name.trim(), channel, contact });
    setBusy(false);
    if (!d.ok) { setMsg(String(d.error || "일치하는 회원 정보가 없습니다.")); setItems(null); return; }
    setItems(Array.isArray(d.items) ? (d.items as FoundId[]) : []);
  }

  async function sendFull(mid: number) {
    const d = await post({ action: "id_send", mid, channel, name: name.trim(), contact });
    if (d.ok) setSent((s) => ({ ...s, [mid]: true }));
    else setMsg(String(d.error || "발송에 실패했습니다."));
  }

  if (items) {
    return (
      <div>
        <p className="mt-2 text-[13px] text-sub">입력하신 정보와 일치하는 아이디입니다.</p>
        <ul className="mt-3 divide-y divide-line rounded-sm border border-line">
          {items.map((it) => (
            <li key={it.mid} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <div className="text-[15px] font-bold text-text">{it.uid}</div>
                <div className="mt-0.5 text-[12px] text-sub">가입일 {it.dt}</div>
              </div>
              {sent[it.mid] ? (
                <span className="shrink-0 text-[12px] text-success">발송완료</span>
              ) : (
                <button type="button" onClick={() => sendFull(it.mid)} className={inlineBtnCls} style={{ padding: "0.4rem 0.75rem", fontSize: 13 }}>
                  전체 아이디 받기
                </button>
              )}
            </li>
          ))}
        </ul>
        {msg && <div className="mt-3 text-[13px] text-sale">{msg}</div>}
        <div className="mt-5 flex gap-2">
          <a href="/auth/login" className="flex-1 rounded-sm bg-accent py-3 text-center text-[15px] text-accent-foreground">로그인</a>
          <button type="button" onClick={onToPw} className="flex-1 rounded-sm border border-line py-3 text-center text-[15px] text-text">비밀번호 찾기</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className={labelCls}>찾기 수단</label>
      <ChannelTabs channel={channel} onChange={(c) => { setChannel(c); setContact(""); }} />

      <label className={labelCls}>성명</label>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} placeholder="성명" className={fieldCls} />

      <label className={labelCls}>{channel === "hp" ? "휴대폰번호" : "이메일"}</label>
      <ContactInput channel={channel} value={contact} onValue={setContact} />

      {msg && <div className="mt-3 text-[13px] text-sale">{msg}</div>}
      <button type="button" onClick={submit} disabled={busy} className={bigBtnCls(!busy)}>{busy ? "조회 중…" : "아이디 찾기"}</button>
    </div>
  );
}

// ─────────────────────────────────────────────
// 비밀번호 찾기 (발송 → 인증 → 재설정)
// ─────────────────────────────────────────────
function FindPwPanel({ reqUpwConfig = 0 }: { reqUpwConfig?: number }) {
  const router = useRouter();
  const [step, setStep] = useState<"input" | "verify" | "reset" | "done">("input");
  const [channel, setChannel] = useState<Channel>("hp");
  const [uid, setUid] = useState("");
  const [contact, setContact] = useState("");
  const [sendId, setSendId] = useState(0);
  const [target, setTarget] = useState("");
  const [code, setCode] = useState("");
  const [reqUpw, setReqUpw] = useState(reqUpwConfig); // 비밀번호 생성 규칙(회원가입과 동일 소스, 서버 프롭)
  const [upw, setUpw] = useState("");
  const [upwRe, setUpwRe] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [resendSec, setResendSec] = useState(0); // 재발송 쿨다운(초)

  // 쿨다운 카운트다운
  useEffect(() => {
    if (resendSec <= 0) return;
    const id = setInterval(() => setResendSec((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendSec]);

  async function send() {
    setMsg("");
    if (resendSec > 0) return; // 쿨다운 중 재요청 차단
    if (!uid.trim()) return setMsg("아이디를 입력해 주세요.");
    if (!contact) return setMsg(channel === "hp" ? "휴대폰번호를 입력해 주세요." : "이메일을 입력해 주세요.");
    setBusy(true);
    const d = await post({ action: "pw_send", uid: uid.trim(), channel, contact });
    setBusy(false);
    if (!d.ok) return setMsg(String(d.error || "요청에 실패했습니다."));
    setSendId(Number(d.send_id || 0));
    setTarget(String(d.target || ""));
    setCode("");
    setResendSec(30); // 발송 후 30초간 재발송 잠금
    setStep("verify");
  }

  async function confirm() {
    setMsg("");
    if (!code.trim()) return setMsg("인증번호를 입력해 주세요.");
    setBusy(true);
    const d = await post({ action: "pw_confirm", uid: uid.trim(), channel, contact, send_id: sendId, code: code.trim() });
    setBusy(false);
    if (!d.ok) return setMsg(String(d.error || "인증번호가 일치하지 않습니다."));
    // 서버가 규칙을 내려주면 반영(설정 프롭 폴백). 0/누락이면 프롭 값을 유지.
    if (Number(d.req_upw)) setReqUpw(Number(d.req_upw));
    setStep("reset");
  }

  async function reset() {
    setMsg("");
    if (!upw) return setMsg("새 비밀번호를 입력해 주세요.");
    const ruleErr = validatePassword(upw, reqUpw);
    if (ruleErr) return setMsg(ruleErr.replace("비밀번호는", "새 비밀번호는"));
    if (upw !== upwRe) return setMsg("비밀번호가 일치하지 않습니다.");
    setBusy(true);
    const enc = await encryptPassword(upw);
    const d = await post({ action: "pw_reset", uid: uid.trim(), channel, contact, send_id: sendId, code: code.trim(), ...(enc ? { enc_upw: enc } : { upw }) });
    setBusy(false);
    if (!d.ok) return setMsg(String(d.error || "비밀번호 변경에 실패했습니다."));
    setStep("done");
  }

  if (step === "done") {
    return (
      <div className="py-4 text-center">
        <div className="text-[36px]">✅</div>
        <h2 className="mt-2 text-lg font-bold text-text">비밀번호가 변경되었습니다</h2>
        <p className="mt-2 text-[13px] text-sub">새 비밀번호로 로그인해 주세요.</p>
        <button type="button" onClick={() => { router.push("/auth/login"); router.refresh(); }} className={bigBtnCls(true)}>로그인</button>
      </div>
    );
  }

  if (step === "reset") {
    return (
      <div>
        <p className="mt-2 text-[13px] text-sub">새로운 비밀번호를 입력해 주세요.</p>
        <label className={labelCls}>새 비밀번호</label>
        <p className="mt-1 text-[12px] text-sub">비밀번호 규칙: {passwordRule(reqUpw).hint}</p>
        <input value={upw} onChange={(e) => setUpw(e.target.value)} type="password" maxLength={50} placeholder={passwordRule(reqUpw).hint} className={fieldCls} />
        {upw && validatePassword(upw, reqUpw) && (
          <p className="mt-1 text-[12px] text-sale">{validatePassword(upw, reqUpw).replace("비밀번호는", "새 비밀번호는")}</p>
        )}
        <label className={labelCls}>새 비밀번호 확인</label>
        <input value={upwRe} onChange={(e) => setUpwRe(e.target.value)} onKeyDown={(e) => e.key === "Enter" && reset()} type="password" maxLength={50} placeholder="새 비밀번호 확인" className={fieldCls} />
        {msg && <div className="mt-3 text-[13px] text-sale">{msg}</div>}
        <button type="button" onClick={reset} disabled={busy} className={bigBtnCls(!busy)}>{busy ? "변경 중…" : "비밀번호 변경"}</button>
      </div>
    );
  }

  if (step === "verify") {
    return (
      <div>
        <p className="mt-2 text-[13px] text-sub">
          {channel === "hp" ? "문자" : "이메일"}로 인증번호를 보냈습니다{target ? ` (${target})` : ""}.
        </p>
        <label className={labelCls}>인증번호</label>
        <div className="mt-2 flex items-center gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && confirm()}
            inputMode="numeric" maxLength={6} placeholder="인증번호 6자리" className={`${fieldCls} !mt-0`} />
          <button type="button" onClick={send} disabled={busy || resendSec > 0} className={inlineBtnCls}>
            {resendSec > 0 ? `재발송 ${resendSec}` : "재발송"}
          </button>
        </div>
        {msg && <div className="mt-3 text-[13px] text-sale">{msg}</div>}
        <button type="button" onClick={confirm} disabled={busy} className={bigBtnCls(!busy)}>{busy ? "확인 중…" : "인증 확인"}</button>
        <button type="button" onClick={() => { setStep("input"); setMsg(""); }} className="mt-3 w-full text-center text-[13px] text-sub hover:text-accent">이전으로</button>
      </div>
    );
  }

  return (
    <div>
      <label className={labelCls}>아이디</label>
      <input value={uid} onChange={(e) => setUid(e.target.value)} maxLength={50} placeholder="아이디" className={fieldCls} />

      <label className={labelCls}>인증 수단</label>
      <ChannelTabs channel={channel} onChange={(c) => { setChannel(c); setContact(""); }} />

      <label className={labelCls}>{channel === "hp" ? "휴대폰번호" : "이메일"}</label>
      <ContactInput channel={channel} value={contact} onValue={setContact} />

      {msg && <div className="mt-3 text-[13px] text-sale">{msg}</div>}
      <button type="button" onClick={send} disabled={busy} className={bigBtnCls(!busy)}>{busy ? "발송 중…" : "인증번호 발송"}</button>
    </div>
  );
}

// ─────────────────────────────────────────────
export default function FindForm({ initialTab = "id", reqUpw = 0 }: { initialTab?: "id" | "pw"; reqUpw?: number }) {
  const [tab, setTab] = useState<"id" | "pw">(initialTab);

  const tabBtn = (t: "id" | "pw", label: string) => (
    <button type="button" onClick={() => setTab(t)}
      className={`flex-1 border-b-2 pb-3 text-[15px] font-bold transition-colors ${tab === t ? "border-accent text-text" : "border-transparent text-sub hover:text-text"}`}>
      {label}
    </button>
  );

  return (
    <div className={joinOuterCls}>
      <div className={joinContentCls}>
        <div className="rounded-md border border-line bg-card p-6">
          <div className="mb-2 flex gap-2">{tabBtn("id", "아이디 찾기")}{tabBtn("pw", "비밀번호 찾기")}</div>
          {tab === "id" ? <FindIdPanel onToPw={() => setTab("pw")} /> : <FindPwPanel reqUpwConfig={reqUpw} />}
          <p className="mt-6 text-center text-[13px] text-sub">
            <a href="/auth/login" className="text-accent">로그인</a>
            <span className="mx-2 text-line">|</span>
            <a href="/auth/join" className="text-accent">회원가입</a>
          </p>
        </div>
      </div>
    </div>
  );
}
