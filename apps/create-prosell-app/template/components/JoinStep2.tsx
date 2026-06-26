"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberConfig } from "@/lib/prosell";
import { Steps, shellCls, fieldCls, labelCls, inlineBtnCls, bigBtnCls, loadJoin, saveJoin, clearJoin } from "./joinShared";
import Zipcode from "./Zipcode";
import VerifyField from "./VerifyField";

type Props = { config: MemberConfig | null };

const subjectCls = "mb-1 mt-6 text-[13px] font-bold text-sub";
const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// 2단계: 가입 정보 입력 — 원본 join/form.php 항목 구성을 설정 기반으로 재현.
// 필드 레벨: 0 숨김 / 1 선택 / 2이상 필수.
export default function JoinStep2({ config }: Props) {
  const router = useRouter();
  const f = config?.fields ?? {};
  const opt = config?.options ?? { gender: [], bank: [], interest: [] };
  const verify = config?.verify ?? { hp: false, email: false, certify: false };
  const needCertify = verify.certify;
  const needHpVerify = verify.hp && !needCertify;   // 정보 입력폼에서 처리하는 SMS 인증
  const needEmailVerify = verify.email;             // 정보 입력폼에서 처리하는 이메일 인증
  const hasVerifyStep = needCertify;                // 1단계에서 게이트되는 인증(본인확인)
  const uidIsEmail = !!config?.uid_is_email;

  const lvl = (k: string) => f[k] ?? 0;
  const show = (k: string) => lvl(k) >= 1;
  const need = (k: string) => lvl(k) >= 2;
  // 필수 별표(레드 계열)
  const reqStar = <span className="text-sale"> *</span>;
  const star = (k: string) => (need(k) ? reqStar : null);

  // 계정
  const [uid, setUid] = useState("");
  const [uidTaken, setUidTaken] = useState<boolean | null>(null); // null=미확인, true=중복, false=사용가능
  const [uidChecking, setUidChecking] = useState(false);
  const [upw, setUpw] = useState("");
  const [upwRe, setUpwRe] = useState("");
  // 회원정보
  const [nick, setNick] = useState("");
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState("");
  const [hp, setHp] = useState("");
  const [hpSendId, setHpSendId] = useState<number | null>(null);
  const [hpCode, setHpCode] = useState("");
  const [hpDone, setHpDone] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSendId, setEmailSendId] = useState<number | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [emailDone, setEmailDone] = useState(false);
  const [tel, setTel] = useState("");
  const [zipcode, setZipcode] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [admcode, setAdmcode] = useState(""); // 법정동 코드(bcode)
  const [place, setPlace] = useState("");     // 건물명(buildingName)
  // 부가정보
  const [bank, setBank] = useState("");
  const [banknum, setBanknum] = useState("");
  const [bankholder, setBankholder] = useState("");
  const [interest, setInterest] = useState<string[]>([]);
  const [profile, setProfile] = useState("");
  const [recommend, setRecommend] = useState("");

  const [certifyDone, setCertifyDone] = useState(false);
  const [certifyLock, setCertifyLock] = useState(false); // 본인확인 값으로 채워져 readonly
  const [msg, setMsg] = useState("");
  const [ready, setReady] = useState(false);
  const [zipOpen, setZipOpen] = useState(false); // 우편번호 검색 모달
  const addr2Ref = useRef<HTMLInputElement>(null);

  // 진입 가드 + 1단계 진행상태 복원 + 본인확인 프로필 프리필
  useEffect(() => {
    const s = loadJoin();
    const agreementsOk = s.agreeService && s.agreePrivacy && s.agreeAge;
    const verifyDone = !needCertify || s.certifyDone;
    if (!agreementsOk || (hasVerifyStep && !verifyDone)) { router.replace("/auth/join"); return; }
    setUid(s.uid || ""); setName(s.name || ""); setEmail(s.email || "");
    setHp(s.hp || ""); setHpDone(!!s.hpDone); setHpSendId(s.hpSendId ?? null); setHpCode(s.hpCode || "");
    setEmailDone(!!s.emailDone); setEmailSendId(s.emailSendId ?? null); setEmailCode(s.emailCode || "");
    setCertifyDone(!!s.certifyDone);

    // 본인확인 완료 시: 인증된 이름/휴대폰/생일/성별을 받아와 readonly 로 채운다.
    if (needCertify && s.certifyDone && s.certifyId) {
      fetch("/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "certify-profile", certify_id: s.certifyId }) })
        .then((r) => r.json())
        .then((p) => {
          if (p && (p.name || p.hp || p.birth || p.gender)) {
            if (p.name) setName(String(p.name));
            if (p.hp) setHp(String(p.hp));
            if (p.birth) setBirth(String(p.birth));
            if (p.gender) setGender(String(p.gender));
            setCertifyLock(true);
          }
          setReady(true);
        })
        .catch(() => setReady(true));
      return;
    }
    setReady(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 입력값 저장(비밀번호 제외) — 새로고침 시 인증 진행상태도 유지
  useEffect(() => {
    if (ready) saveJoin({ uid, name, email, hp, hpDone, hpSendId, hpCode, emailDone, emailSendId, emailCode });
  }, [ready, uid, name, email, hp, hpDone, hpSendId, hpCode, emailDone, emailSendId, emailCode]);

  function toggleInterest(code: string) {
    setInterest((cur) => cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]);
  }

  // 아이디 중복확인 (포커스 이탈 시)
  async function checkUidAvail() {
    const v = uid.trim();
    if (uidIsEmail || v.length < 3) { setUidTaken(null); return; }
    setUidChecking(true);
    try {
      const r = await fetch(`/auth/check-uid?uid=${encodeURIComponent(v)}`);
      const d = await r.json();
      setUidTaken(d.available === false);
    } catch {
      setUidTaken(null);
    } finally {
      setUidChecking(false);
    }
  }

  // SMS/이메일 인증 UI 는 VerifyField 컴포넌트가 담당(발송·확인·잠금·쿨다운).
  const normPhone = (v: string) => v.replace(/[^0-9]/g, "");
  const normEmail = (v: string) => v.trim();
  const valPhone = (t: string) => (t.length < 10 ? "휴대폰 번호를 확인해 주세요." : "");
  const valEmail = (t: string) => (emailRe.test(t) ? "" : "이메일 주소를 확인해 주세요.");

  async function submit() {
    setMsg("");
    if (!uidIsEmail && uid.trim().length < 3) { setMsg("아이디를 3자 이상 입력해 주세요."); return; }
    if (!uidIsEmail && uidTaken === true) { setMsg("이미 사용 중인 아이디입니다."); return; }
    if (upw.length < 4) { setMsg("비밀번호를 4자 이상 입력해 주세요."); return; }
    if (upw !== upwRe) { setMsg("비밀번호가 일치하지 않습니다."); return; }
    if (need("nick") && !nick.trim()) { setMsg("닉네임을 입력해 주세요."); return; }
    if (need("name") && !needCertify && !name.trim()) { setMsg("이름을 입력해 주세요."); return; }
    if (need("birth") && !birth.trim()) { setMsg("생년월일을 입력해 주세요."); return; }
    if (need("gender") && !gender) { setMsg("성별을 선택해 주세요."); return; }
    if (need("email") && !email.trim()) { setMsg("이메일을 입력해 주세요."); return; }
    if (need("tel") && !tel.trim()) { setMsg("전화번호를 입력해 주세요."); return; }
    if (need("addr") && (!zipcode.trim() || !addr1.trim())) { setMsg("주소를 입력해 주세요."); return; }
    if (need("bank") && (!bank || !banknum.trim() || !bankholder.trim())) { setMsg("환불계좌 정보를 입력해 주세요."); return; }
    if (need("profile") && !profile.trim()) { setMsg("자기소개를 입력해 주세요."); return; }
    const imin = config?.interest_min ?? 0;
    if (need("interest") && interest.length < Math.max(1, imin)) { setMsg("관심분야를 선택해 주세요."); return; }
    if (needHpVerify && !hpDone) { setMsg("휴대폰 인증을 완료해 주세요."); return; }
    if (needEmailVerify && !emailDone) { setMsg("이메일 인증을 완료해 주세요."); return; }

    setMsg("가입 처리 중…");
    const s = loadJoin();
    const r = await fetch("/auth/join/submit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: uid.trim(), upw,
        name: name.trim() || undefined, nick: nick.trim() || undefined,
        email: email.trim() || undefined, hp: hp.replace(/[^0-9]/g, "") || undefined,
        birth: birth.trim() || undefined, gender: gender ? Number(gender) : undefined,
        tel: tel.replace(/[^0-9]/g, "") || undefined,
        zipcode: zipcode.trim() || undefined, addr1: addr1.trim() || undefined, addr2: addr2.trim() || undefined,
        admcode: admcode || undefined, place: place || undefined,
        bank: bank ? Number(bank) : undefined, banknum: banknum.trim() || undefined, bankholder: bankholder.trim() || undefined,
        interest: interest.length ? interest.join("|") : undefined,
        profile: profile.trim() || undefined, recommend: recommend.trim() || undefined,
        agree_service: true, agree_privacy: true, agree_age: true,
        email_receive: !!s.emailReceive, hp_receive: !!s.hpReceive,
        send_hp_id: hpDone ? hpSendId ?? undefined : undefined, hp_code: hpDone ? hpCode : undefined,
        send_email_id: emailDone ? emailSendId ?? undefined : undefined, email_code: emailDone ? emailCode : undefined,
        certify_id: s.certifyId || undefined,
      }),
    });
    const data = await r.json();
    if (!data.ok) { setMsg(data.error || "가입에 실패했습니다."); return; }
    clearJoin();
    // 자동 로그인 성공 시 곧장 마이페이지로, 아니면 완료 페이지(로그인 안내)로 이동.
    if (data.loggedIn) {
      router.replace("/mypage");
    } else {
      router.replace(`/auth/join/done?uid=${encodeURIComponent(data.uid || uid.trim())}`);
    }
    router.refresh();
  }

  if (!ready) return <main className={shellCls}><Steps step={2} /></main>;

  const hasExtra = show("bank") || show("interest") || show("profile") || show("recommend");
  const fileRequired = lvl("photo") >= 2 || lvl("file1") >= 2 || lvl("file2") >= 2;

  return (
    <main className={shellCls}>
      <Steps step={2} />
      <h1 className="text-xl">가입 정보 입력</h1>
      {certifyDone && (
        <p className="mt-2 text-[13px] text-success">
          ✓ 본인확인 완료 — 인증된 실명·휴대폰이 가입에 자동 반영됩니다.
        </p>
      )}

      {fileRequired && (
        <p className="mt-2 text-[13px] text-sale">
          이 쇼핑몰은 파일 첨부가 필수라 앱 가입으로 진행할 수 없습니다.
        </p>
      )}

      {/* ── 계정정보 ── */}
      <div className={subjectCls}>계정정보</div>
      <label className={labelCls}>{uidIsEmail ? "이메일(아이디)" : "아이디"}{reqStar}</label>
      {uidIsEmail && needEmailVerify ? (
        <VerifyField channel="email" value={uid} onValue={setUid} placeholder="you@example.com" inputType="email" maxLength={50}
          sendId={emailSendId} setSendId={setEmailSendId} code={emailCode} setCode={setEmailCode} done={emailDone} setDone={setEmailDone}
          normalize={normEmail} validate={valEmail} />
      ) : (
        <input value={uid} onChange={(e) => { setUid(e.target.value); setUidTaken(null); }} onBlur={checkUidAvail} maxLength={50} placeholder={uidIsEmail ? "you@example.com" : "3~20자 영문/숫자"} className={fieldCls} />
      )}
      {!uidIsEmail && uidChecking && <p className="mt-1 text-[13px] text-sub">아이디 확인 중…</p>}
      {!uidIsEmail && !uidChecking && uidTaken === true && <p className="mt-1 text-[13px] text-sale">이미 사용 중인 아이디입니다.</p>}
      {!uidIsEmail && !uidChecking && uidTaken === false && <p className="mt-1 text-[13px] text-success">사용 가능한 아이디입니다.</p>}

      <label className={labelCls}>비밀번호{reqStar}</label>
      <input value={upw} onChange={(e) => setUpw(e.target.value)} type="password" minLength={4} maxLength={20} placeholder="4자 이상" className={fieldCls} />
      <label className={labelCls}>비밀번호 확인{reqStar}</label>
      <input value={upwRe} onChange={(e) => setUpwRe(e.target.value)} type="password" maxLength={20} className={fieldCls} />

      {/* ── 회원정보 ── */}
      <div className={subjectCls}>회원정보</div>

      {show("nick") && (<>
        <label className={labelCls}>닉네임{star("nick")}</label>
        <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} className={fieldCls} />
      </>)}

      {show("name") && (<>
        <label className={labelCls}>이름{star("name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} readOnly={certifyLock && !!name} className={fieldCls} />
      </>)}

      {show("birth") && (<>
        <label className={labelCls}>생년월일{star("birth")}</label>
        <input value={birth} onChange={(e) => setBirth(e.target.value)} type="date" readOnly={certifyLock && !!birth} className={fieldCls} />
      </>)}

      {show("gender") && (<>
        <label className={labelCls}>성별{star("gender")}</label>
        {certifyLock && gender ? (
          <input value={opt.gender.find((g) => String(g.value) === gender)?.label || ""} readOnly className={fieldCls} />
        ) : (
          <select value={gender} onChange={(e) => setGender(e.target.value)} className={fieldCls}>
            <option value="">선택</option>
            {opt.gender.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        )}
      </>)}

      {show("hp") && (<>
        <label className={labelCls}>휴대폰{star("hp")}</label>
        {needHpVerify ? (
          <VerifyField channel="sms" value={hp} onValue={setHp} placeholder="010-0000-0000" inputType="tel"
            sendId={hpSendId} setSendId={setHpSendId} code={hpCode} setCode={setHpCode} done={hpDone} setDone={setHpDone}
            normalize={normPhone} validate={valPhone} />
        ) : (
          <input value={hp} onChange={(e) => setHp(e.target.value)} placeholder="010-0000-0000" readOnly={(certifyLock && !!hp) || hpDone} className={fieldCls} />
        )}
      </>)}

      {show("email") && !uidIsEmail && (<>
        <label className={labelCls}>이메일{star("email")}</label>
        {needEmailVerify ? (
          <VerifyField channel="email" value={email} onValue={setEmail} placeholder="you@example.com" inputType="email" maxLength={50}
            sendId={emailSendId} setSendId={setEmailSendId} code={emailCode} setCode={setEmailCode} done={emailDone} setDone={setEmailDone}
            normalize={normEmail} validate={valEmail} />
        ) : (
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" maxLength={50} className={fieldCls} />
        )}
      </>)}

      {show("tel") && (<>
        <label className={labelCls}>일반전화{star("tel")}</label>
        <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="02-000-0000" className={fieldCls} />
      </>)}

      {show("addr") && (<>
        <label className={labelCls}>우편번호{star("addr")}</label>
        <div className="mt-2 flex items-center gap-2">
          <input value={zipcode} readOnly placeholder="주소 검색을 눌러주세요" className={`${fieldCls} !mt-0`} />
          <button type="button" onClick={() => setZipOpen(true)} className={inlineBtnCls}>주소 검색</button>
        </div>
        <label className={labelCls}>기본주소{star("addr")}</label>
        <input value={addr1} readOnly placeholder="주소 검색으로 자동 입력" className={fieldCls} />
        <label className={labelCls}>상세주소</label>
        <input ref={addr2Ref} value={addr2} onChange={(e) => setAddr2(e.target.value)} maxLength={100} placeholder="동/호수 등" className={fieldCls} />
      </>)}

      {/* ── 부가정보 ── */}
      {hasExtra && <div className={subjectCls}>부가정보</div>}

      {show("bank") && (<>
        <label className={labelCls}>거래은행{star("bank")}</label>
        <select value={bank} onChange={(e) => setBank(e.target.value)} className={fieldCls}>
          <option value="">선택</option>
          {opt.bank.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        <label className={labelCls}>계좌번호{star("bank")}</label>
        <input value={banknum} onChange={(e) => setBanknum(e.target.value)} maxLength={100} className={fieldCls} />
        <label className={labelCls}>예금주{star("bank")}</label>
        <input value={bankholder} onChange={(e) => setBankholder(e.target.value)} maxLength={100} className={fieldCls} />
      </>)}

      {show("interest") && opt.interest.length > 0 && (<>
        <label className={labelCls}>관심분야{star("interest")}</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {opt.interest.map((it) => (
            <label key={it.code} className="flex items-center gap-1 rounded-sm border border-line px-2 py-1 text-sm">
              <input type="checkbox" checked={interest.includes(it.code)} onChange={() => toggleInterest(it.code)} />
              {it.name}
            </label>
          ))}
        </div>
      </>)}

      {show("profile") && (<>
        <label className={labelCls}>자기소개{star("profile")}</label>
        <textarea value={profile} onChange={(e) => setProfile(e.target.value)} maxLength={200} rows={3} className={`${fieldCls} resize-y`} />
      </>)}

      {show("recommend") && (<>
        <label className={labelCls}>추천인 아이디</label>
        <input value={recommend} onChange={(e) => setRecommend(e.target.value)} maxLength={50} className={fieldCls} />
      </>)}

      {msg && <div className="mt-3 text-[13px] text-sub">{msg}</div>}

      <button type="button" onClick={submit} disabled={fileRequired} className={bigBtnCls(!fileRequired)}>가입하기</button>

      {zipOpen && (
        <Zipcode onClose={(v) => {
          setZipOpen(false);
          if (v) {
            setZipcode(v.zipcode);
            setAddr1(v.address);
            setAdmcode(v.admcode);
            setPlace(v.place);
            setTimeout(() => addr2Ref.current?.focus(), 0);
          }
        }} />
      )}
    </main>
  );
}
