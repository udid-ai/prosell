"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account, MemberConfig } from "@/lib/prosell";
import { fieldCls, labelCls, bigBtnCls, inlineBtnCls } from "./joinShared";
import Zipcode from "./Zipcode";

type Props = { account: Account; config: MemberConfig | null };

const cardCls = "mx-auto my-6 max-w-[560px] rounded-md border border-line bg-card p-6";
const subjectCls = "mb-1 mt-6 text-[13px] font-bold text-sub";
const s = (x: unknown) => (x == null ? "" : String(x));

export default function EditForm({ account, config }: Props) {
  const router = useRouter();
  const o = account.origin;
  const i = account.info;
  const f = config?.fields ?? {};
  const opt = config?.options ?? { gender: [], bank: [], interest: [] };
  const show = (k: string) => (f[k] ?? 0) >= 1;
  const certified = Number(i.certify_mode ?? 0) > 0; // 본인확인 회원: 이름/생일/성별/휴대폰 잠금

  // 프리필
  const [nick, setNick] = useState(s(i.nick));
  const [name, setName] = useState(s(o.name));
  const [birth, setBirth] = useState(s(o.birth).slice(0, 10));
  const [gender, setGender] = useState(s(o.gender));
  const [hp, setHp] = useState(s(o.hp));
  const [email, setEmail] = useState(s(o.email));
  const [tel, setTel] = useState(s(o.tel));
  const [emailReceive, setEmailReceive] = useState(o.email_receive === 1 || o.email_receive === "1");
  const [hpReceive, setHpReceive] = useState(o.hp_receive === 1 || o.hp_receive === "1");
  const [zipcode, setZipcode] = useState(s(o.zipcode));
  const [addr1, setAddr1] = useState(s(o.addr1));
  const [addr2, setAddr2] = useState(s(o.addr2));
  const [admcode, setAdmcode] = useState(s(o.admcode));
  const [place, setPlace] = useState(s(o.place));
  const [bank, setBank] = useState(s(i.bank && Number(i.bank) > 0 ? i.bank : ""));
  const [banknum, setBanknum] = useState(s(i.banknum));
  const [bankholder, setBankholder] = useState(s(i.bankholder));
  const [profile, setProfile] = useState(s(i.profile));
  // 비밀번호 변경(선택)
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [zipOpen, setZipOpen] = useState(false);

  async function submit() {
    setMsg("");
    if (newPw) {
      if (!curPw) { setMsg("현재 비밀번호를 입력해 주세요."); return; }
      if (newPw.length < 4) { setMsg("새 비밀번호는 4자 이상이어야 합니다."); return; }
      if (newPw !== newPw2) { setMsg("새 비밀번호가 일치하지 않습니다."); return; }
    }

    const body: Record<string, unknown> = {
      nick: nick.trim(),
      email: email.trim(),
      tel: tel.replace(/[^0-9]/g, ""),
      email_receive: emailReceive,
      hp_receive: hpReceive,
      zipcode: zipcode.trim(),
      addr1: addr1.trim(),
      addr2: addr2.trim(),
      admcode,
      place,
      bank: bank ? Number(bank) : 0,
      banknum: banknum.trim(),
      bankholder: bankholder.trim(),
      profile: profile.trim(),
    };
    // 본인확인 회원은 이름/생일/성별/휴대폰을 보내지 않음(서버에서도 잠금)
    if (!certified) {
      body.name = name.trim();
      body.birth = birth.trim();
      body.gender = gender ? Number(gender) : 0;
      body.hp = hp.replace(/[^0-9]/g, "");
    }
    if (newPw) { body.current_upw = curPw; body.new_upw = newPw; }

    setBusy(true);
    setMsg("저장 중…");
    try {
      const r = await fetch("/mypage/edit/submit", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!data.ok) { setMsg(data.error || "수정에 실패했습니다."); return; }
      router.replace("/mypage");
      router.refresh();
    } catch {
      setMsg("통신 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const lockNote = <span className="ml-1 text-[12px] text-sub">(본인확인 정보)</span>;

  return (
    <main className={cardCls}>
      <h1 className="text-xl">회원정보 수정</h1>
      {certified && <p className="mt-2 text-[13px] text-success">✓ 본인확인 회원 — 이름·생년월일·성별·휴대폰은 수정할 수 없습니다.</p>}

      <div className={subjectCls}>회원정보</div>

      {show("nick") && (<>
        <label className={labelCls}>닉네임</label>
        <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} className={fieldCls} />
      </>)}

      {show("name") && (<>
        <label className={labelCls}>이름{certified && lockNote}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} readOnly={certified} className={fieldCls} />
      </>)}

      {show("birth") && (<>
        <label className={labelCls}>생년월일{certified && lockNote}</label>
        <input value={birth} onChange={(e) => setBirth(e.target.value)} type="date" readOnly={certified} className={fieldCls} />
      </>)}

      {show("gender") && (<>
        <label className={labelCls}>성별{certified && lockNote}</label>
        {certified ? (
          <input value={opt.gender.find((g) => String(g.value) === gender)?.label || ""} readOnly className={fieldCls} />
        ) : (
          <select value={gender} onChange={(e) => setGender(e.target.value)} className={fieldCls}>
            <option value="">선택</option>
            {opt.gender.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        )}
      </>)}

      {show("hp") && (<>
        <label className={labelCls}>휴대폰{certified && lockNote}</label>
        <input value={hp} onChange={(e) => setHp(e.target.value)} placeholder="010-0000-0000" readOnly={certified} className={fieldCls} />
      </>)}

      {show("email") && (<>
        <label className={labelCls}>이메일</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" maxLength={50} className={fieldCls} />
      </>)}

      {show("tel") && (<>
        <label className={labelCls}>일반전화</label>
        <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="02-000-0000" className={fieldCls} />
      </>)}

      <div className="mt-3 flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={emailReceive} onChange={(e) => setEmailReceive(e.target.checked)} />
          정보 메일 수신 동의
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hpReceive} onChange={(e) => setHpReceive(e.target.checked)} />
          정보 메시지 수신 동의
        </label>
      </div>

      {show("addr") && (<>
        <div className={subjectCls}>주소</div>
        <label className={labelCls}>우편번호</label>
        <div className="mt-2 flex items-center gap-2">
          <input value={zipcode} readOnly placeholder="주소 검색을 눌러주세요" className={`${fieldCls} !mt-0`} />
          <button type="button" onClick={() => setZipOpen(true)} className={inlineBtnCls}>주소 검색</button>
        </div>
        <label className={labelCls}>기본주소</label>
        <input value={addr1} readOnly placeholder="주소 검색으로 자동 입력" className={fieldCls} />
        <label className={labelCls}>상세주소</label>
        <input value={addr2} onChange={(e) => setAddr2(e.target.value)} maxLength={100} placeholder="동/호수 등" className={fieldCls} />
      </>)}

      {show("bank") && (<>
        <div className={subjectCls}>환불계좌</div>
        <label className={labelCls}>거래은행</label>
        <select value={bank} onChange={(e) => setBank(e.target.value)} className={fieldCls}>
          <option value="">선택</option>
          {opt.bank.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
        <label className={labelCls}>계좌번호</label>
        <input value={banknum} onChange={(e) => setBanknum(e.target.value)} maxLength={100} className={fieldCls} />
        <label className={labelCls}>예금주</label>
        <input value={bankholder} onChange={(e) => setBankholder(e.target.value)} maxLength={100} className={fieldCls} />
      </>)}

      {show("profile") && (<>
        <label className={labelCls}>자기소개</label>
        <textarea value={profile} onChange={(e) => setProfile(e.target.value)} maxLength={200} rows={3} className={`${fieldCls} resize-y`} />
      </>)}

      {/* 비밀번호 변경 (선택) */}
      <div className={subjectCls}>비밀번호 변경 (선택)</div>
      <label className={labelCls}>현재 비밀번호</label>
      <input value={curPw} onChange={(e) => setCurPw(e.target.value)} type="password" maxLength={20} autoComplete="current-password" className={fieldCls} />
      <label className={labelCls}>새 비밀번호</label>
      <input value={newPw} onChange={(e) => setNewPw(e.target.value)} type="password" maxLength={20} placeholder="변경 시에만 입력 (4자 이상)" autoComplete="new-password" className={fieldCls} />
      <label className={labelCls}>새 비밀번호 확인</label>
      <input value={newPw2} onChange={(e) => setNewPw2(e.target.value)} type="password" maxLength={20} autoComplete="new-password" className={fieldCls} />

      {msg && <div className="mt-3 text-[13px] text-sub">{msg}</div>}

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={() => router.push("/mypage")} className={`${bigBtnCls(true)} mt-0 flex-[0_0_35%] !bg-line !text-text`}>취소</button>
        <button type="button" onClick={submit} disabled={busy} className={`${bigBtnCls(!busy)} mt-0 flex-1`}>{busy ? "저장 중…" : "저장"}</button>
      </div>

      {zipOpen && (
        <Zipcode onClose={(val) => {
          setZipOpen(false);
          if (val) { setZipcode(val.zipcode); setAddr1(val.address); setAdmcode(val.admcode); setPlace(val.place); }
        }} />
      )}
    </main>
  );
}
