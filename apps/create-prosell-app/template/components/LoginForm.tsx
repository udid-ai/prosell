"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinOuterCls, joinContentCls, fieldCls, labelCls, bigBtnCls } from "./joinShared";
import { encryptPassword } from "@/lib/pwcryptoClient";
import type { SocialProvider } from "@/lib/prosell";

type Props = {
  joined?: boolean; error?: string; providers?: SocialProvider[]; redirect?: string;
  // 비회원 주문 정책 — 2=로그인 경유. 주문서에서 튕겨온 경우에만 «비회원으로 구매» 를 노출한다.
  orderGuest?: number;
};

// provider 브랜드 원형 아이콘 — 브랜드 고정색이라 다크모드와 무관하게 유지.
// bg=원의 배경색, border=테두리(구글처럼 흰 배경일 때만), icon=원 안 로고.
const SNS_ICON: Record<string, { bg: string; border?: string; icon: React.ReactNode }> = {
  naver: {
    bg: "#03C75A",
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path d="M13.5608 10.7042L6.14668 0H0V20H6.43832V9.29667L13.8533 20H20V0H13.5608V10.7042Z" fill="#fff" />
      </svg>
    ),
  },
  kakao: {
    bg: "#FEE500",
    icon: (
      <svg width="19" height="18" viewBox="0 0 26 24" fill="none" aria-hidden>
        <path d="M9.49269 8.89327L8.60817 11.6387H10.3597L9.51018 8.89327H9.49269Z" fill="#3C1E1E" />
        <path fillRule="evenodd" clipRule="evenodd" d="M12.9957 0C5.82327 0 0.00390625 4.59331 0.00390625 10.2638C0.00390625 13.9113 2.41659 17.1035 6.03345 18.9294L4.80742 23.5007C4.75923 23.641 4.79866 23.7897 4.89935 23.8906C4.96943 23.9605 5.06139 24 5.16645 24C5.24528 24 5.32409 23.9649 5.39417 23.9124L10.6618 20.3569C11.4237 20.4663 12.2075 20.5277 13.0001 20.5277C20.1768 20.5277 25.9962 15.9343 25.9962 10.2638C25.9962 4.59331 20.1724 0 12.9957 0ZM6.05536 13.5085C6.05536 13.7406 5.98528 13.9332 5.84955 14.0733C5.71819 14.2178 5.5299 14.2879 5.30221 14.2879C5.11392 14.2879 4.95627 14.2353 4.82491 14.1346C4.69357 14.0295 4.61037 13.8894 4.57094 13.7099C4.55781 13.6442 4.55344 13.5785 4.55781 13.5129V8.6393H3.14786C2.9552 8.6393 2.78441 8.59114 2.64431 8.50354C2.50418 8.41597 2.41659 8.289 2.38595 8.1226C2.37719 8.0788 2.36843 8.03064 2.36406 7.97811C2.36406 7.7723 2.4385 7.61029 2.58736 7.49644C2.73188 7.3826 2.92017 7.32128 3.14347 7.32128H7.46968C7.66673 7.32128 7.83313 7.36508 7.96886 7.45704C8.10899 7.54461 8.19658 7.67158 8.23159 7.83798C8.23926 7.90351 8.24373 7.94081 8.24035 7.97811C8.24035 8.19267 8.16591 8.35029 8.02578 8.46853C7.88129 8.58238 7.69737 8.6393 7.47407 8.6393H6.05973V13.5129L6.05536 13.5085ZM12.2381 14.0865C12.1024 14.2222 11.936 14.2835 11.739 14.2835C11.3931 14.2835 11.1697 14.139 11.069 13.8588L10.6837 12.7203H8.27539L7.88569 13.8588C7.79372 14.1434 7.5704 14.2835 7.21573 14.2835C7.04057 14.2835 6.89169 14.2397 6.77347 14.1478C6.65524 14.0558 6.57643 13.9244 6.54578 13.7624C6.53702 13.7143 6.53263 13.6617 6.53263 13.6048C6.53263 13.5304 6.54139 13.4384 6.57203 13.3289C6.59831 13.2238 6.63335 13.1144 6.67275 13.0093L8.60817 7.68034C8.66946 7.50957 8.76142 7.38696 8.87966 7.31691C8.99787 7.24247 9.15112 7.20743 9.33944 7.20743H9.69847C9.89115 7.20743 10.0576 7.24684 10.1889 7.32567C10.3203 7.40448 10.4253 7.55337 10.4998 7.77667L12.3038 13.0137C12.3608 13.1757 12.4002 13.3158 12.4264 13.4297C12.4396 13.5085 12.4483 13.5654 12.4527 13.6092C12.4527 13.8018 12.3783 13.9595 12.2425 14.0908L12.2381 14.0865ZM17.2343 13.9945C17.0898 14.1084 16.9015 14.1653 16.6782 14.1653H13.5562C13.3241 14.1653 13.1358 14.1215 12.9913 14.0208C12.8468 13.9288 12.7549 13.7756 12.7067 13.561C12.6892 13.4691 12.6804 13.3683 12.676 13.2545V7.97811C12.676 7.74602 12.7461 7.55773 12.8819 7.41324C13.0176 7.27312 13.2015 7.19867 13.4292 7.19867C13.6175 7.19867 13.7795 7.25123 13.9065 7.35632C14.0334 7.46141 14.121 7.60153 14.1561 7.78106C14.1692 7.84674 14.1736 7.91242 14.1692 7.97811V12.8517H16.6695C16.8709 12.8517 17.0373 12.8954 17.173 12.983C17.3088 13.075 17.3963 13.202 17.427 13.364C17.4358 13.4078 17.4445 13.4559 17.4489 13.5085C17.4489 13.7143 17.3744 13.8763 17.2299 13.9901L17.2343 13.9945ZM22.8566 14.1127C22.7077 14.2266 22.5239 14.2879 22.3136 14.2879C22.1605 14.2879 22.0378 14.2616 21.9414 14.2091C21.8452 14.1478 21.7444 14.0427 21.6482 13.885L19.9229 11.1089L19.0997 11.9671L19.1085 13.5172C19.1085 13.7493 19.0383 13.942 18.9027 14.0821C18.767 14.2266 18.583 14.2967 18.3553 14.2967C18.167 14.2967 18.005 14.2441 17.8736 14.1434C17.7423 14.0383 17.6591 13.8982 17.624 13.7187C17.6109 13.653 17.6109 13.5873 17.6109 13.5216V7.99123C17.6109 7.75917 17.6766 7.57086 17.8123 7.42637C17.9481 7.28624 18.132 7.21183 18.3597 7.21183C18.5479 7.21183 18.7101 7.26436 18.8369 7.36944C18.9684 7.47456 19.0516 7.61466 19.0864 7.79419C19.0997 7.85987 19.1041 7.92555 19.0997 7.99123V10.2594L21.4554 7.55773C21.5606 7.44389 21.6524 7.35632 21.74 7.2994C21.8276 7.24247 21.9284 7.21619 22.0508 7.21619C22.2175 7.21619 22.3661 7.26436 22.4977 7.35632C22.6333 7.44389 22.7121 7.56649 22.7472 7.71974C22.7472 7.71974 22.7516 7.74602 22.756 7.77667V7.83798C22.756 7.94744 22.7339 8.0394 22.6858 8.1226C22.6378 8.2058 22.5808 8.289 22.5062 8.37218L20.9693 10.0493L22.7867 12.9305L22.8436 13.018C22.966 13.2151 23.0406 13.3552 23.058 13.4515C23.058 13.4515 23.0625 13.4735 23.0713 13.4997V13.5479C23.0713 13.815 22.9967 14.0076 22.8478 14.1215L22.8566 14.1127Z" fill="#3C1E1E" />
      </svg>
    ),
  },
  facebook: {
    bg: "#1877F2",
    icon: (
      <svg width="19" height="18" viewBox="0 0 26 24" fill="none" aria-hidden>
        <path fillRule="evenodd" clipRule="evenodd" d="M13.0001 0C19.6681 0 25.0735 5.40546 25.0735 12.0733C25.0735 18.0996 20.6584 23.0943 14.8866 24V15.5633H17.6998L18.2351 12.0733H14.8866V9.80864C14.8866 9.74897 14.8884 9.68938 14.8922 9.63012C14.8986 9.53017 14.9106 9.43112 14.9288 9.33402C15.0511 8.68267 15.4547 8.11949 16.339 7.96499C16.4954 7.93768 16.6667 7.92313 16.8542 7.92313H18.3765V4.95196C18.3765 4.95196 16.9949 4.71615 15.674 4.71615C15.5877 4.71615 15.5025 4.71779 15.4183 4.72104C15.2804 4.72636 15.1451 4.73603 15.0124 4.74999C13.6045 4.89823 12.4983 5.53093 11.8294 6.59745C11.3671 7.3345 11.1136 8.27873 11.1136 9.41344V12.0733H8.04815V15.5633H11.1136V24C5.34183 23.0943 0.926758 18.0995 0.926758 12.0733C0.926758 5.40546 6.33222 0 13.0001 0Z" fill="#fff" />
      </svg>
    ),
  },
  google: {
    bg: "#fff",
    border: "#dadce0",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path fillRule="evenodd" clipRule="evenodd" d="M23.7593 12.2724C23.7593 11.4212 23.6824 10.6039 23.5411 9.81818H12.2397V14.4599H18.6982C18.4201 15.9601 17.5745 17.2307 16.3038 18.082L20.1825 21.0924C22.4513 19.0033 23.7604 15.9273 23.7604 12.2724H23.7593Z" fill="#3E82F1" />
        <path fillRule="evenodd" clipRule="evenodd" d="M12.2397 24C15.4797 24 18.1962 22.9249 20.1813 21.0924L16.3027 18.082C15.2276 18.8021 13.8541 19.2271 12.2386 19.2271C9.11285 19.2271 6.46754 17.1165 5.52359 14.2802H5.52472L1.51605 17.389C3.49099 21.3106 7.54827 24 12.2397 24Z" fill="#32A753" />
        <path fillRule="evenodd" clipRule="evenodd" d="M5.52472 14.2802C5.28506 13.5601 5.14827 12.7913 5.14827 12C5.14827 11.2087 5.28506 10.4399 5.52472 9.71983L1.51605 6.61102C0.703241 8.23099 0.239746 10.0635 0.239746 12C0.239746 13.9365 0.703241 15.769 1.51605 17.389L5.52472 14.2802Z" fill="#F9BB00" />
        <path fillRule="evenodd" clipRule="evenodd" d="M12.2397 4.77287C14.001 4.77287 15.5837 5.3788 16.8272 6.56693L20.2695 3.12463C18.1906 1.18926 15.474 0 12.2397 0C7.54827 0 3.49099 2.6894 1.51605 6.61102L5.52472 9.71983C6.46867 6.88347 9.11398 4.77287 12.2397 4.77287Z" fill="#E74133" />
      </svg>
    ),
  },
};

// 앱키 기반 비밀번호 로그인 — uid/upw 를 서버 라우트로 보내 토큰을 발급받는다.
export default function LoginForm({ joined, error, providers = [], redirect, orderGuest = 0 }: Props) {
  // 주문서에서 튕겨온 경우만 «비회원으로 구매» 대상. (임의 경로로 우회하지 못하도록 /order/{oid} 형태만 허용)
  const guestOrderUrl = redirect && /^\/order\/[\w-]+$/.test(redirect) ? `${redirect}?guest=1` : "";

  const router = useRouter();
  const [uid, setUid] = useState("");
  const [upw, setUpw] = useState("");
  const [msg, setMsg] = useState(error || "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setMsg("");
    if (!uid.trim() || !upw) { setMsg("아이디와 비밀번호를 입력해 주세요."); return; }
    setBusy(true);
    // 비밀번호는 RSA 암호화 전송(평문 파라미터 노출 방지). 암호화 실패 시에만 평문 폴백.
    const enc = await encryptPassword(upw);
    const r = await fetch("/auth/login/submit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: uid.trim(), ...(enc ? { enc_upw: enc } : { upw }) }),
    });
    const data = await r.json().catch(() => ({}));
    setBusy(false);
    if (!data.ok) { setMsg(data.error || "로그인에 실패했습니다."); return; }
    router.push(redirect && redirect.startsWith("/") ? redirect : "/");
    router.refresh();
  }

  return (
    <div className={joinOuterCls}>
      <div className={joinContentCls}>
      <div className="rounded-md border border-line bg-card p-6">
      <h1 className="text-xl">로그인</h1>
      {joined && <p className="mt-2 text-[13px] text-success">가입이 완료되었습니다. 로그인해 주세요.</p>}

      <label className={labelCls}>아이디</label>
      <input value={uid} onChange={(e) => setUid(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} maxLength={50} placeholder="아이디" className={fieldCls} />

      <label className={labelCls}>비밀번호</label>
      <input value={upw} onChange={(e) => setUpw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} type="password" maxLength={20} placeholder="비밀번호" className={fieldCls} />

      {msg && <div className="mt-3 text-[13px] text-sale">{msg}</div>}

      <button type="button" onClick={submit} disabled={busy} className={bigBtnCls(!busy)}>{busy ? "로그인 중…" : "로그인"}</button>

      {/* 비회원으로 구매 — 레거시 login/index.php 와 동일 조건.
          order_guest=2(로그인 경유) 이고, 주문서(/order/{oid})에서 튕겨온 경우에만 노출한다.
          누르면 guest=1 을 달아 주문서로 돌아가고, 주문서 게이트가 그 플래그로 통과시킨다. */}
      {orderGuest === 2 && guestOrderUrl && (
        <a href={guestOrderUrl}
          className="mt-3 block rounded-sm border border-accent py-3 text-center text-[14px] font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground">
          비회원으로 구매하기
        </a>
      )}

      <p className="mt-4 flex items-center justify-center gap-2 text-[13px] text-sub">
        <a href="/auth/find" className="text-sub hover:text-accent">아이디 찾기</a>
        <span className="text-line">|</span>
        <a href="/auth/find?tab=pw" className="text-sub hover:text-accent">비밀번호 찾기</a>
        <span className="text-line">|</span>
        <a href="/auth/join" className="text-accent">회원가입</a>
      </p>

      {providers.length > 0 && (
        <div className="mt-8">
          <div className="mb-3 flex items-center gap-2 text-xs text-sub">
            <span className="h-px flex-1 bg-line" /> SNS 로그인 <span className="h-px flex-1 bg-line" />
          </div>
          <div className="flex justify-center gap-4">
            {providers.map((p) => {
              const s = SNS_ICON[p.provider];
              if (!s) return null;
              return (
                <a key={p.provider} href={`/auth/social/${p.provider}/start`} aria-label={`${p.name}로 계속하기`} title={`${p.name}로 계속하기`}
                  className="flex h-11 w-11 items-center justify-center rounded-full transition-transform hover:scale-105"
                  style={{ background: s.bg, border: s.border ? `1px solid ${s.border}` : "none" }}>
                  {s.icon}
                </a>
              );
            })}
          </div>
        </div>
      )}

      <a href="/order/guest" className="mt-6 block rounded-sm border border-line py-3 text-center text-[14px] font-medium text-text transition-colors hover:border-accent hover:text-accent">
        비회원 주문조회
      </a>
      </div>
      </div>
    </div>
  );
}
