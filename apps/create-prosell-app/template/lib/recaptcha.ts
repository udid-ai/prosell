// reCAPTCHA v3 클라이언트 헬퍼 — 사이트키가 있을 때만 스크립트를 로드하고 토큰을 발급.
//  · 백엔드는 recaptcha_secret 으로 토큰을 검증(Models\Service::getRecaptcha).
//  · 사이트키 없으면 빈 토큰 반환(호출측이 검증 스킵).

declare global {
  interface Window { grecaptcha?: { ready: (cb: () => void) => void; execute: (sitekey: string, opts: { action: string }) => Promise<string> }; }
}

let scriptPromise: Promise<void> | null = null;
let loadedKey = "";

function loadScript(sitekey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.grecaptcha && loadedKey === sitekey) return Promise.resolve();
  if (scriptPromise && loadedKey === sitekey) return scriptPromise;
  loadedKey = sitekey;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(sitekey)}`;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("recaptcha load fail"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// 사이트키로 v3 토큰 발급. 실패/미설정이면 빈 문자열.
export async function getRecaptchaToken(sitekey: string, action = "inquiry"): Promise<string> {
  if (!sitekey) return "";
  try {
    await loadScript(sitekey);
    const g = window.grecaptcha;
    if (!g) return "";
    return await new Promise<string>((resolve) => {
      g.ready(() => { g.execute(sitekey, { action }).then((t) => resolve(t || "")).catch(() => resolve("")); });
    });
  } catch { return ""; }
}
