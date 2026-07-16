"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberConfig, SocialProfile } from "@/lib/prosell";
import { fieldCls, labelCls, bigBtnCls, joinOuterCls, joinContentCls } from "./joinShared";
import { formatPhone } from "@/lib/format";
import VerifyField from "./VerifyField";
import { useCertify } from "./useCertify";

const PROVIDER_LABEL: Record<string, string> = { naver: "네이버", kakao: "카카오", google: "구글", facebook: "페이스북", apple: "애플" };

// 소셜 신규 가입 랜딩 폼 — member_wait 프로필 프리필 + 약관 + (설정 시) 본인확인 → 가입완료.
// 일반 회원가입(JoinStep2)과 동일한 본인확인(VerifyField) 흐름을 재사용한다. uid/비밀번호는 소셜 계정이라 불필요.
export default function SocialJoinForm({ provider, profile, config }: { provider: string; profile: SocialProfile; config: MemberConfig | null }) {
  const router = useRouter();
  const providerName = PROVIDER_LABEL[provider] || "소셜";

  const [name, setName] = useState(profile.name);
  const [nick, setNick] = useState(profile.nick);
  const [email, setEmail] = useState(profile.email);
  const [hp, setHp] = useState(profile.hp);
  const [birth, setBirth] = useState(profile.birth && profile.birth !== "0000-00-00" ? profile.birth : "");
  const [gender, setGender] = useState<number>(profile.gender || 0);

  // 약관
  const [agreeAll, setAgreeAll] = useState(false);
  const [agService, setAgService] = useState(false);
  const [agPrivacy, setAgPrivacy] = useState(false);
  const [agAge, setAgAge] = useState(false);
  const [emailRecv, setEmailRecv] = useState(false);
  const [hpRecv, setHpRecv] = useState(false);
  const toggleAll = (v: boolean) => { setAgreeAll(v); setAgService(v); setAgPrivacy(v); setAgAge(v); setEmailRecv(v); setHpRecv(v); };

  // 인증 설정. PASS(본인확인) 사용 시 휴대폰은 PASS가 담당(SMS 인증 아님).
  const needCertify = !!config?.verify.certify;
  const needHpVerify = !!config?.verify.hp && !needCertify;
  const needEmailVerify = !!config?.verify.email;
  // 소셜이 값을 내려줬으면 인증 생략 + 입력 잠금(값 그대로 신뢰). 없을 때만 인증한다.
  const hpFromSocial = !!profile.hp;
  const emailFromSocial = !!profile.email;
  const hpVerifyNeeded = needHpVerify && !hpFromSocial;      // 실제 SMS 인증 필요
  const emailVerifyNeeded = needEmailVerify && !emailFromSocial; // 실제 이메일 인증 필요
  const hpLocked = (needHpVerify && hpFromSocial) || needCertify; // 소셜 제공/ PASS → 직접수정 불가
  const emailLocked = needEmailVerify && emailFromSocial;

  const [hpSendId, setHpSendId] = useState<number | null>(null);
  const [hpCode, setHpCode] = useState("");
  const [hpDone, setHpDone] = useState(false);
  const [emSendId, setEmSendId] = useState<number | null>(null);
  const [emCode, setEmCode] = useState("");
  const [emDone, setEmDone] = useState(false);

  // PASS 본인확인(useCertify 팝업/리다이렉트). 완료 시 certify_id 확보 → 완료 요청에 전달(백엔드가 이름/휴대폰 권위값 사용).
  const [certifyDone, setCertifyDone] = useState(false);
  const [certifyId, setCertifyId] = useState("");
  const { launch } = useCertify(({ ok, certify_id, message }) => {
    if (ok && certify_id) { setCertifyId(certify_id); setCertifyDone(true); setMsg("본인확인이 완료되었습니다."); }
    else setMsg(message || "본인확인에 실패했습니다.");
  });

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // 필드 간격을 넓게(공용 labelCls 는 mt-3 로 촘촘함) — !mt-6 로 상단 여백 확대.
  const labelW = `${labelCls} !mt-6`;

  const genderOpts = config?.options?.gender ?? [{ value: 1, label: "남성" }, { value: 2, label: "여성" }];
  // 일반 회원가입(JoinStep2)과 동일: config.fields[k] = 0 숨김 / 1 선택 / 2+ 필수.
  const f = config?.fields ?? {};
  const lvl = (k: string) => f[k] ?? 0;
  const show = (k: string) => lvl(k) >= 1;
  const need = (k: string) => lvl(k) >= 2;
  const star = (k: string) => (need(k) ? <span className="text-sale"> *</span> : null);
  // 인증/PASS 필요한 필드는 설정과 무관하게 노출.
  const showEmail = show("email") || needEmailVerify;
  const showHp = show("hp") || needHpVerify || needCertify;

  async function submit() {
    setMsg("");
    if (need("name") && !name.trim()) return setMsg("이름을 입력해 주세요.");
    if (need("nick") && !nick.trim()) return setMsg("닉네임을 입력해 주세요.");
    if (need("email") && !email.trim()) return setMsg("이메일을 입력해 주세요.");
    if (need("hp") && !hp.trim()) return setMsg("휴대폰 번호를 입력해 주세요.");
    if (need("birth") && !birth.trim()) return setMsg("생년월일을 입력해 주세요.");
    if (need("gender") && !gender) return setMsg("성별을 선택해 주세요.");
    if (!agService || !agPrivacy || !agAge) return setMsg("필수 약관에 동의해 주세요.");
    // PASS는 항상 본인확인 필요. SMS/이메일은 소셜이 값을 안 준 경우에만 인증 필요.
    if (needCertify && !certifyDone) return setMsg("휴대폰 본인확인을 완료해 주세요.");
    if (hpVerifyNeeded && !hpDone) return setMsg("휴대폰 인증을 완료해 주세요.");
    if (emailVerifyNeeded && !emDone) return setMsg("이메일 인증을 완료해 주세요.");
    setBusy(true);
    try {
      const res = await fetch("/auth/join/social/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), nick: nick.trim(), email: email.trim(), hp: hp.replace(/[^0-9]/g, ""),
          birth: birth || undefined, gender: gender || undefined,
          agree_service: true, agree_privacy: true, agree_age: true,
          email_receive: emailRecv, hp_receive: hpRecv,
          send_hp_id: hpSendId ?? undefined, hp_code: hpCode || undefined,
          send_email_id: emSendId ?? undefined, email_code: emCode || undefined,
          certify_id: certifyId || undefined,
        }),
      });
      const d = await res.json().catch(() => null);
      if (!d?.ok) { setMsg(d?.error || "가입에 실패했습니다."); setBusy(false); return; }
      // 가입완료 → 로그인 상태로 홈 이동.
      router.push("/");
      router.refresh();
    } catch { setMsg("통신 오류가 발생했습니다."); setBusy(false); }
  }

  const chk = "h-4 w-4 accent-[var(--accent,#2563eb)]";
  return (
    <div className={joinOuterCls}>
      <div className={joinContentCls}>
      <h1 className="text-xl font-bold text-text">{providerName} 회원가입</h1>
      <p className="mt-1 text-[13px] text-sub">{providerName} 계정으로 처음 오셨어요. 아래 정보를 확인하고 가입을 완료해 주세요.</p>

      {show("name") && (<>
        <label className={labelW}>이름{star("name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} className={fieldCls} />
      </>)}

      {show("nick") && (<>
        <label className={labelW}>닉네임{star("nick")}</label>
        <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} className={fieldCls} />
      </>)}

      {/* 이메일 — 인증 필요 시: 소셜이 값 주면 잠금(인증 생략), 없으면 VerifyField */}
      {showEmail && (<>
        <label className={labelW}>이메일{needEmailVerify ? <span className="text-sale"> *</span> : star("email")}</label>
        {emailVerifyNeeded ? (
          <VerifyField channel="email" value={email} onValue={setEmail} placeholder="이메일" inputType="email"
            sendId={emSendId} setSendId={setEmSendId} code={emCode} setCode={setEmCode} done={emDone} setDone={setEmDone}
            normalize={(v) => v.trim()} validate={(t) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? "" : "이메일 형식을 확인해 주세요.")} />
        ) : (
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" maxLength={100} readOnly={emailLocked} className={fieldCls} />
        )}
        {emailLocked && <p className="mt-1 text-[12px] text-sub">{providerName} 계정에서 확인된 이메일입니다.</p>}
      </>)}

      {/* 휴대폰 — PASS면 본인확인 버튼 / 소셜이 값 주면 잠금(인증 생략) / 없으면 VerifyField */}
      {showHp && (<>
        <label className={labelW}>휴대폰{(needCertify || needHpVerify) ? <span className="text-sale"> *</span> : star("hp")}</label>
        {needCertify ? (
          <>
            <input value={formatPhone(hp)} readOnly placeholder="본인확인 후 자동 입력" className={fieldCls} />
            <button type="button" onClick={() => { if (!certifyDone) launch(); }} disabled={certifyDone}
              className={`mt-2 w-full rounded-sm border-0 py-3 text-[15px] text-accent-foreground ${certifyDone ? "bg-success" : "cursor-pointer bg-accent hover:opacity-90"}`}>
              {certifyDone ? "✓ 본인확인 완료" : "휴대폰 본인확인"}
            </button>
          </>
        ) : hpVerifyNeeded ? (
          <VerifyField channel="sms" value={hp} onValue={setHp} placeholder="010-0000-0000"
            sendId={hpSendId} setSendId={setHpSendId} code={hpCode} setCode={setHpCode} done={hpDone} setDone={setHpDone}
            normalize={(v) => v.replace(/[^0-9]/g, "")} validate={(t) => (t.length >= 10 ? "" : "휴대폰 번호를 확인해 주세요.")} />
        ) : (
          <input value={formatPhone(hp)} onChange={(e) => setHp(e.target.value.replace(/\D/g, ""))} placeholder="010-0000-0000" inputMode="numeric" readOnly={hpLocked} className={fieldCls} />
        )}
        {hpLocked && !needCertify && <p className="mt-1 text-[12px] text-sub">{providerName} 계정에서 확인된 번호입니다.</p>}
      </>)}

      {show("birth") && (
        <>
          <label className={labelW}>생년월일{star("birth")}</label>
          <input value={birth} onChange={(e) => setBirth(e.target.value)} type="date" className={fieldCls} />
        </>
      )}
      {show("gender") && (
        <>
          <label className={labelW}>성별{star("gender")}</label>
          <div className="mt-2 flex gap-2">
            {genderOpts.map((o) => (
              <button key={o.value} type="button" onClick={() => setGender(o.value)}
                className={`h-11 flex-1 rounded-sm border text-sm ${gender === o.value ? "border-accent bg-accent/5 font-medium text-accent" : "border-line text-text hover:border-accent"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 약관 */}
      <div className="mt-6 rounded-md border border-line p-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-text">
          <input type="checkbox" checked={agreeAll} onChange={(e) => toggleAll(e.target.checked)} className={chk} />
          전체 동의
        </label>
        <div className="mt-3 space-y-2 border-t border-line pt-3 text-[13px] text-text">
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={agService} onChange={(e) => setAgService(e.target.checked)} className={chk} />(필수) 이용약관 동의<a href="/terms/service" target="_blank" rel="noopener" className="ml-auto text-[13px] text-accent hover:underline">보기</a></label>
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={agPrivacy} onChange={(e) => setAgPrivacy(e.target.checked)} className={chk} />(필수) 개인정보 수집·이용 동의<a href="/terms/privacy" target="_blank" rel="noopener" className="ml-auto text-[13px] text-accent hover:underline">보기</a></label>
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={agAge} onChange={(e) => setAgAge(e.target.checked)} className={chk} />(필수) 만 14세 이상입니다</label>
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={emailRecv} onChange={(e) => setEmailRecv(e.target.checked)} className={chk} />(선택) 정보성 이메일 수신</label>
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={hpRecv} onChange={(e) => setHpRecv(e.target.checked)} className={chk} />(선택) 정보성 SMS 수신</label>
        </div>
      </div>

      {msg && <p className="mt-3 text-[13px] text-sale">{msg}</p>}

      <button type="button" onClick={submit} disabled={busy} className={`${bigBtnCls(!busy)} mt-5 w-full`}>
        {busy ? "가입 중…" : "가입 완료"}
      </button>
      </div>
    </div>
  );
}
