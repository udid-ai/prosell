"use client";

import { useEffect, useRef } from "react";

// Google reCAPTCHA v2(체크박스) — 비회원 글쓰기 자동등록방지.
// api.js 를 1회 로드하고 explicit 렌더로 위젯을 그린다. 토큰은 onToken 으로 전달.
// (window.grecaptcha 전역 타입이 v3 형태로 이미 선언돼 있어 v2 render/reset 은 캐스팅으로 접근.)
type GrecaptchaV2 = { render: (el: HTMLElement, opts: Record<string, unknown>) => number; reset: (id?: number) => void };
const grV2 = (): GrecaptchaV2 | undefined => (window as unknown as { grecaptcha?: GrecaptchaV2 }).grecaptcha;

const SCRIPT_ID = "recaptcha-api-js";

export default function Recaptcha({ sitekey, onToken }: { sitekey: string; onToken: (token: string) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const render = () => {
      const gr = grV2();
      if (!boxRef.current || widgetId.current !== null || !gr?.render) return false;
      widgetId.current = gr.render(boxRef.current, {
        sitekey,
        callback: (t: string) => onToken(t),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
      return true;
    };

    if (!render()) {
      if (!document.getElementById(SCRIPT_ID)) {
        const s = document.createElement("script");
        s.id = SCRIPT_ID;
        s.src = "https://www.google.com/recaptcha/api.js?render=explicit";
        s.async = true;
        s.defer = true;
        document.head.appendChild(s);
      }
      timer = setInterval(() => { if (render() && timer) clearInterval(timer); }, 200);
    }

    return () => { if (timer) clearInterval(timer); };
  }, [sitekey, onToken]);

  return <div ref={boxRef} className="g-recaptcha" />;
}
