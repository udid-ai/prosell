"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account, MemberConfig } from "@/lib/prosell";
import { formatPhone } from "@/lib/format";
import { fieldCls, labelCls, bigBtnCls, inlineBtnCls } from "./joinShared";
import Zipcode from "./Zipcode";
import ContactVerifyModal from "./ContactVerifyModal";
import { useCertify } from "./useCertify";

type Props = { account: Account; config: MemberConfig | null };

// 폭·중앙정렬은 account/layout 콘텐츠 열이 담당 → 카드는 열 너비 100% 채운다.
const cardCls = "rounded-md border border-line bg-card p-6";
const subjectCls = "mb-1 mt-6 text-[13px] font-bold text-sub";
const s = (x: unknown) => (x == null ? "" : String(x));

export default function EditForm({ account, config }: Props) {
  const router = useRouter();
  const o = account.origin;
  const i = account.info;
  const f = config?.fields ?? {};
  const opt = config?.options ?? { gender: [], bank: [], interest: [] };
  const show = (k: string) => (f[k] ?? 0) >= 1;
  // 정보수정 조건은 회원 플래그(certify_mode)가 아니라 쇼핑몰 설정(verify.*)으로 판단한다.
  // → 쇼핑몰이 본인확인을 끄면(join_certify off) 기존 인증 회원도 이름/휴대폰을 자유 수정 가능.
  const verify = config?.verify ?? { hp: false, email: false, certify: false };
  const shopCertify = verify.certify;              // 쇼핑몰이 본인확인(PASS) 사용 → 이름/생일/성별/휴대폰은 본인확인으로만 변경
  const needHpVerify = verify.hp && !shopCertify;  // 본인확인을 쓰면 휴대폰은 본인확인이 담당(SMS 인증 아님)
  const needEmailVerify = verify.email;

  // 프리필
  const [nick, setNick] = useState(s(i.nick));
  const [name, setName] = useState(s(o.name));
  const [birth, setBirth] = useState(s(o.birth).slice(0, 10));
  const [gender, setGender] = useState(s(o.gender));
  const [hp, setHp] = useState(s(o.hp));
  const [email, setEmail] = useState(s(o.email));
  const [tel, setTel] = useState(s(o.tel));
  // 인증 사용 시 휴대폰/이메일은 랜딩폼에서 읽기전용 → "변경" 버튼으로 모달에서 변경완료 처리.
  const [modal, setModal] = useState<"hp" | "email" | null>(null);
  // 인증 미사용 시에만 랜딩폼에서 직접 수정 가능.
  const hpInline = !shopCertify && !needHpVerify;
  const emailInline = !needEmailVerify;
  // 본인확인(PASS) — 완료 즉시 certify_id 로 서버에 반영(hp/email 모달과 동일 패턴)하고,
  // 저장 응답의 갱신된 회원정보로 폼을 채운다. (프로필 프리필은 로그인 상태에서 certify.mid 가
  // 채워지면 막히므로, 실제 저장 결과를 사용해 mid 세팅 여부와 무관하게 반영)
  const [certifyApplied, setCertifyApplied] = useState(false);
  const [certifyMsg, setCertifyMsg] = useState("");
  const { launch: launchCertify } = useCertify(async ({ ok, certify_id, message }) => {
    if (!ok || !certify_id) { setCertifyMsg(message || "본인확인에 실패했습니다."); return; }
    setCertifyMsg("본인확인 완료 — 반영 중…");
    try {
      const r = await fetch("/account/edit/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certify_id }),
      });
      const d = await r.json();
      if (!d.ok) { setCertifyMsg(d.error || "본인확인 반영에 실패했습니다."); return; }
      const a = (d.account?.origin ?? {}) as Record<string, unknown>;
      if (a.hp) setHp(String(a.hp));
      if (a.name) setName(String(a.name));
      if (a.birth) setBirth(String(a.birth).slice(0, 10));
      if (a.gender != null && a.gender !== "") setGender(String(a.gender));
      setCertifyApplied(true);
      setCertifyMsg("본인확인이 완료되어 정보가 갱신되었습니다.");
    } catch { setCertifyMsg("통신 오류가 발생했습니다."); }
  });
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

  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [zipOpen, setZipOpen] = useState(false);

  async function submit() {
    setMsg("");
    // 휴대폰/이메일은 인증 사용 시 모달에서 즉시 저장되므로 여기선 인라인(인증 미사용) 값만 보낸다.
    const body: Record<string, unknown> = {
      nick: nick.trim(),
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
    if (emailInline) body.email = email.trim();
    // 본인확인 사용 쇼핑몰은 이름/생일/성별/휴대폰을 보내지 않음(서버에서도 잠금)
    if (!shopCertify) {
      body.name = name.trim();
      body.birth = birth.trim();
      body.gender = gender ? Number(gender) : 0;
      if (hpInline) body.hp = hp.replace(/[^0-9]/g, "");
    }
    // 본인확인(certify)은 완료 즉시 별도 저장되므로 여기(메인 저장)선 전송하지 않는다.

    setBusy(true);
    setMsg("저장 중…");
    try {
      const r = await fetch("/account/edit/submit", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!data.ok) { setMsg(data.error || "수정에 실패했습니다."); return; }
      router.replace("/account/info");
      router.refresh();
    } catch {
      setMsg("통신 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const lockNote = <span className="ml-1 text-[12px] text-sub">(본인확인 정보)</span>;

  return (
    <div className={cardCls}>
      <h1 className="text-xl">회원정보 수정</h1>
      {shopCertify && <p className="mt-2 text-[13px] text-sub">본인확인 사용 쇼핑몰 — 이름·생년월일·성별·휴대폰은 본인확인으로만 변경됩니다.</p>}

      <div className={subjectCls}>회원정보</div>

      {show("nick") && (<>
        <label className={labelCls}>닉네임</label>
        <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} className={fieldCls} />
      </>)}

      {show("name") && (<>
        <label className={labelCls}>이름{shopCertify && lockNote}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} readOnly={shopCertify} className={fieldCls} />
      </>)}

      {show("birth") && (<>
        <label className={labelCls}>생년월일{shopCertify && lockNote}</label>
        <input value={birth} onChange={(e) => setBirth(e.target.value)} type="date" readOnly={shopCertify} className={fieldCls} />
      </>)}

      {show("gender") && (<>
        <label className={labelCls}>성별{shopCertify && lockNote}</label>
        {shopCertify ? (
          <input value={opt.gender.find((g) => String(g.value) === gender)?.label || ""} readOnly className={fieldCls} />
        ) : (
          <select value={gender} onChange={(e) => setGender(e.target.value)} className={`${fieldCls} cursor-pointer pr-9`}>
            <option value="">선택</option>
            {opt.gender.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        )}
      </>)}

      {show("hp") && (<>
        <label className={labelCls}>휴대폰{shopCertify && <span className="ml-1 text-[12px] text-sub">(본인확인 정보)</span>}</label>
        {shopCertify ? (
          // 본인확인 회원: 휴대폰은 본인확인으로만 변경 가능 → 재인증 버튼 제공.
          <>
            <div className="mt-2 flex items-center gap-2">
              <input value={hp ? formatPhone(hp) : "미등록"} readOnly className={`${fieldCls} !mt-0 ${certifyApplied ? "border-accent text-accent" : ""}`} />
              <button type="button" onClick={() => { setCertifyMsg(""); launchCertify(); }} className={inlineBtnCls}>
                {certifyApplied ? "다시 인증" : "본인확인"}
              </button>
            </div>
            {certifyMsg && <p className={`mt-1 text-[12px] ${certifyApplied ? "text-success" : "text-sale"}`}>{certifyMsg}</p>}
            {!certifyApplied && <p className="mt-1 text-[12px] text-sub">번호가 바뀌었다면 본인확인을 다시 진행해 주세요.</p>}
          </>
        ) : needHpVerify ? (
          // 인증 사용: 읽기전용 + "변경" 버튼 → 모달에서 변경완료 처리
          <div className="mt-2 flex items-center gap-2">
            <input value={hp ? formatPhone(hp) : "미등록"} readOnly className={`${fieldCls} !mt-0`} />
            <button type="button" onClick={() => setModal("hp")} className={inlineBtnCls}>변경</button>
          </div>
        ) : (
          <input value={formatPhone(hp)} onChange={(e) => setHp(e.target.value.replace(/\D/g, ""))} placeholder="010-0000-0000" className={fieldCls} />
        )}
      </>)}

      {show("email") && (<>
        <label className={labelCls}>이메일</label>
        {needEmailVerify ? (
          // 인증 사용: 읽기전용 + "변경" 버튼 → 모달에서 변경완료 처리
          <div className="mt-2 flex items-center gap-2">
            <input value={email || "미등록"} readOnly className={`${fieldCls} !mt-0`} />
            <button type="button" onClick={() => setModal("email")} className={inlineBtnCls}>변경</button>
          </div>
        ) : (
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" maxLength={50} className={fieldCls} />
        )}
      </>)}

      {show("tel") && (<>
        <label className={labelCls}>일반전화</label>
        <input value={formatPhone(tel)} onChange={(e) => setTel(e.target.value.replace(/\D/g, ""))} placeholder="02-000-0000" className={fieldCls} />
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
        <select value={bank} onChange={(e) => setBank(e.target.value)} className={`${fieldCls} cursor-pointer pr-9`}>
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

      {msg && <div className="mt-3 text-[13px] text-sub">{msg}</div>}

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={() => router.push("/account/info")} className={`${bigBtnCls(true)} mt-0 flex-[0_0_35%] !bg-line !text-text`}>취소</button>
        <button type="button" onClick={submit} disabled={busy} className={`${bigBtnCls(!busy)} mt-0 flex-1`}>{busy ? "저장 중…" : "저장"}</button>
      </div>

      {zipOpen && (
        <Zipcode onClose={(val) => {
          setZipOpen(false);
          if (val) { setZipcode(val.zipcode); setAddr1(val.address); setAdmcode(val.admcode); setPlace(val.place); }
        }} />
      )}

      {/* 휴대폰/이메일 변경 + 인증 모달 — 변경완료 시 해당 필드만 즉시 저장 후 랜딩폼 값 갱신 */}
      {modal && (
        <ContactVerifyModal
          channel={modal === "hp" ? "sms" : "email"}
          current={modal === "hp" ? hp : email}
          onClose={(newValue) => {
            if (newValue != null) {
              if (modal === "hp") setHp(newValue);
              else setEmail(newValue);
              setMsg(`${modal === "hp" ? "휴대폰" : "이메일"}이 변경되었습니다.`);
            }
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
