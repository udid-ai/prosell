"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberConfig } from "@/lib/prosell";
import { Steps, joinOuterCls, joinContentCls, bigBtnCls, loadJoin, saveJoin, clearJoin, clearStep2 } from "./joinShared";
import { useCertify, hasCertifyReturn } from "./useCertify";

type Props = { config: MemberConfig | null };

const rowCls = "flex items-center gap-2 text-sm";

// 문서 하드 로드 후 첫 마운트 여부. 하드 새로고침은 모듈이 재평가되어 false 로 리셋되지만,
// SPA 클라이언트 라우팅(링크로 재진입)은 모듈이 살아 있어 true 로 남는다 → 둘을 구분하는 신호.
let mountedSinceLoad = false;

// 1단계: 약관 동의 + 휴대폰 본인확인(PASS). 인증을 통과하면 자동으로 /auth/join/info 로 이동.
// 일반 SMS 인증·이메일 인증은 2단계(정보 입력폼)에서 처리한다.
export default function JoinStep1({ config }: Props) {
  const router = useRouter();
  const verify = config?.verify ?? { hp: false, email: false, certify: false };
  const needCertify = verify.certify;
  const hasVerifyStep = needCertify;

  const [agreeService, setAgreeService] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeAge, setAgreeAge] = useState(false);
  const [emailReceive, setEmailReceive] = useState(false);
  const [hpReceive, setHpReceive] = useState(false);

  const [certifyDone, setCertifyDone] = useState(false);
  const [certifyId, setCertifyId] = useState("");
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);
  // 본인확인 모바일 폴백 복귀 여부(쿼리 정리 전 render 단계에서 1회 포착) — 진입 정책에서 유지로 처리.
  const [certifyReturn] = useState(() => hasCertifyReturn());

  // 본인확인 공용 훅(데스크톱 팝업 / 모바일 리다이렉트 통합)
  const { launch } = useCertify(({ ok, certify_id, message }) => {
    if (ok && certify_id) { setCertifyId(certify_id); setCertifyDone(true); setMsg("본인확인이 완료되었습니다."); }
    else setMsg(message || "본인확인에 실패했습니다.");
  });

  // 진입 정책: 회원가입 재진입(새 진입)은 초기화, "이전"(?from=info)·step1 새로고침은 유지.
  const initRan = useRef(false);
  useEffect(() => {
    if (initRan.current) return; // StrictMode 이중 실행/재마운트 방지
    initRan.current = true;
    let keep = false;
    try {
      const from = new URL(window.location.href).searchParams.get("from");
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const firstMountSinceLoad = !mountedSinceLoad; // 하드 로드 직후 첫 마운트
      // "이전" 복귀 / step1 하드 새로고침 / 본인확인 모바일 리다이렉트 복귀 → 유지. 그 외(새 진입·SPA 재접근) → 초기화
      keep = from === "info" || certifyReturn || (firstMountSinceLoad && nav?.type === "reload");
    } catch {}
    mountedSinceLoad = true;
    if (keep) {
      const s = loadJoin();
      setAgreeService(!!s.agreeService); setAgreePrivacy(!!s.agreePrivacy); setAgreeAge(!!s.agreeAge);
      setEmailReceive(!!s.emailReceive); setHpReceive(!!s.hpReceive);
      // 본인확인 모바일 복귀일 땐 certify 결과를 useCertify(URL)가 설정하므로 세션값으로 덮어쓰지 않는다.
      if (!certifyReturn) { setCertifyDone(!!s.certifyDone); setCertifyId(s.certifyId || ""); }
    } else {
      // 새 진입: 직전에 본인확인만 하고 가입을 포기한 경우, 미소비 본인확인 데이터(PII)를 서버에서 폐기.
      const prev = loadJoin();
      if (prev.certifyId) {
        fetch("/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "certify-discard", certify_id: prev.certifyId }) }).catch(() => {});
      }
      clearJoin();
    }
    setLoaded(true);
  }, []);

  // 상태 저장
  useEffect(() => {
    if (!loaded) return;
    saveJoin({ agreeService, agreePrivacy, agreeAge, emailReceive, hpReceive, certifyDone, certifyId });
  }, [loaded, agreeService, agreePrivacy, agreeAge, emailReceive, hpReceive, certifyDone, certifyId]);

  const allAgreed = agreeService && agreePrivacy && agreeAge && emailReceive && hpReceive;
  function toggleAll(v: boolean) { setAgreeService(v); setAgreePrivacy(v); setAgreeAge(v); setEmailReceive(v); setHpReceive(v); }

  const agreementsOk = agreeService && agreePrivacy && agreeAge;
  const verifyDone = !needCertify || certifyDone;
  const step1Ok = agreementsOk && verifyDone;

  // 인증 완료 시 자동으로 정보 입력 단계로 이동
  useEffect(() => {
    if (loaded && hasVerifyStep && agreementsOk && verifyDone) {
      const id = setTimeout(() => { saveJoin({ agreeService, agreePrivacy, agreeAge, emailReceive, hpReceive, certifyDone, certifyId }); clearStep2(); router.push("/auth/join/info"); }, 400);
      return () => clearTimeout(id);
    }
  }, [loaded, hasVerifyStep, agreementsOk, verifyDone]); // eslint-disable-line react-hooks/exhaustive-deps

  function startCertify() {
    if (!agreementsOk) { setMsg("약관에 먼저 동의해 주세요."); return; }
    setMsg("본인확인을 진행해 주세요.");
    launch(); // 현재 경로(/auth/join)로 복귀
  }

  return (
    <div className={joinOuterCls}>
      <div className={joinContentCls}>
      <Steps step={1} />
      <h1 className="text-xl">회원가입</h1>
      <p className="mt-2 text-[13px] text-sub">약관에 동의하고 본인확인을 진행해 주세요.</p>

      {/* 약관 — 원본 쇼핑몰 항목 구성과 일치 (전체동의 + A·B·D·E·C) */}
      <div className="mt-5">
        <label className="flex items-center gap-2 border-b border-line py-2 text-[15px] font-bold">
          <input type="checkbox" checked={allAgreed} onChange={(e) => toggleAll(e.target.checked)} />
          <span>전체 동의</span>
        </label>
        <div className="mt-3 flex flex-col gap-2">
          <label className={rowCls}>
            <input type="checkbox" checked={agreeService} onChange={(e) => setAgreeService(e.target.checked)} />
            <span>(필수) 서비스 이용약관 동의</span>
            <a href="/terms/service" target="_blank" className="ml-auto text-[13px] text-accent">보기</a>
          </label>
          <label className={rowCls}>
            <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} />
            <span>(필수) 개인정보수집 및 이용 동의</span>
            <a href="/terms/privacy" target="_blank" className="ml-auto text-[13px] text-accent">보기</a>
          </label>
          <label className={rowCls}>
            <input type="checkbox" checked={agreeAge} onChange={(e) => setAgreeAge(e.target.checked)} />
            <span>(필수) 만 14세 이상입니다.</span>
          </label>
          <label className={rowCls}>
            <input type="checkbox" checked={emailReceive} onChange={(e) => setEmailReceive(e.target.checked)} />
            <span>(선택) 정보 메일 수신 동의</span>
          </label>
          <label className={rowCls}>
            <input type="checkbox" checked={hpReceive} onChange={(e) => setHpReceive(e.target.checked)} />
            <span>(선택) 정보 메시지 수신 동의</span>
          </label>
        </div>
      </div>

      {/* 본인확인 (약관 하단) */}
      {hasVerifyStep && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="mb-2 text-sm font-bold">휴대폰 본인확인 <span className="text-sale">*</span></div>

          <button type="button" onClick={startCertify} disabled={certifyDone || !agreementsOk}
            className={`mt-0 w-full rounded-sm border-0 py-3 text-[15px] text-accent-foreground ${certifyDone ? "bg-success" : agreementsOk ? "cursor-pointer bg-accent" : "cursor-not-allowed bg-muted"}`}>
            {certifyDone ? "✓ 본인확인 완료 — 다음 단계로 이동합니다…" : "본인확인(휴대폰)"}
          </button>
        </div>
      )}

      {msg && <div className="mt-3 text-[13px] text-sub">{msg}</div>}

      {/* 인증 단계가 없으면 약관 동의 후 다음 버튼으로 이동 */}
      {!hasVerifyStep && (
        <button type="button" onClick={() => { saveJoin({ agreeService, agreePrivacy, agreeAge, emailReceive, hpReceive }); clearStep2(); router.push("/auth/join/info"); }}
          disabled={!step1Ok} className={bigBtnCls(step1Ok)}>다음</button>
      )}

      <p className="mt-4 text-[13px] text-sub">
        이미 계정이 있나요? <a href="/auth/login" className="text-accent">로그인</a>
      </p>
      </div>
    </div>
  );
}
