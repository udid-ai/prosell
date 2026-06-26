"use client";

import { useEffect, useRef } from "react";

export type CertifyResult = { ok: boolean; certify_id: string; state: string; message?: string };

const STATE_KEY = "prosell-certify-state";

/** 모바일/인앱 웹뷰 추정 — 팝업·opener 가 불안정한 환경. */
export function isMobileLike(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/** 현재 URL 쿼리에 본인확인 리다이렉트 복귀 파라미터가 있는지(모바일 폴백 복귀 판별용). */
export function hasCertifyReturn(): boolean {
  if (typeof window === "undefined") return false;
  const sp = new URLSearchParams(window.location.search);
  return sp.has("certify_id") || sp.has("certify_ok");
}

/**
 * 본인확인(PASS) 공용 훅 — 회원가입·성인인증 등 어디서나 재사용.
 *  - 데스크톱: 팝업 + postMessage 로 결과 수신
 *  - 모바일/웹뷰: 같은 창 전체 리다이렉트 → 복귀 시 URL 쿼리(certify_id/certify_ok/state)로 결과 수신
 *  - state 로 CSRF 검증(요청 시 저장 → 결과와 대조)
 *
 * 사용: const { launch } = useCertify(({ ok, certify_id }) => { ... });
 *       launch();                 // 현재 경로로 복귀
 *       launch("/products/123");  // 지정 경로로 복귀(성인인증 후 상품페이지 등)
 */
export function useCertify(onResult: (r: CertifyResult) => void) {
  const cb = useRef(onResult);
  cb.current = onResult;

  useEffect(() => {
    // 1) 모바일 리다이렉트 복귀: URL 쿼리에서 결과 수신 후 쿼리 정리
    try {
      const url = new URL(window.location.href);
      const cid = url.searchParams.get("certify_id");
      const cok = url.searchParams.get("certify_ok");
      const st = url.searchParams.get("state");
      if (cid !== null || cok !== null) {
        const saved = sessionStorage.getItem(STATE_KEY);
        const valid = !!st && !!saved && st === saved;
        ["certify_id", "certify_ok", "state"].forEach((k) => url.searchParams.delete(k));
        window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
        sessionStorage.removeItem(STATE_KEY);
        if (valid) cb.current({ ok: cok === "1", certify_id: cid || "", state: st || "" });
      }
    } catch {}

    // 2) 데스크톱 팝업: postMessage 수신
    function onMsg(ev: MessageEvent) {
      const d = ev.data as Partial<CertifyResult> & { type?: string };
      if (!d || d.type !== "prosell-certify") return;
      const saved = sessionStorage.getItem(STATE_KEY);
      if (saved && d.state && String(d.state) !== saved) return; // state 불일치 무시
      sessionStorage.removeItem(STATE_KEY);
      cb.current({ ok: !!d.ok, certify_id: String(d.certify_id || ""), state: String(d.state || ""), message: d.message ? String(d.message) : undefined });
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  async function launch(returnPath?: string) {
    const state = Math.random().toString(36).slice(2);
    try { sessionStorage.setItem(STATE_KEY, state); } catch {}
    const rp = returnPath || window.location.pathname + window.location.search;
    let data: { launch_url?: string; error?: string } = {};
    try {
      const r = await fetch("/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "certify-launch", state, origin: window.location.origin, return_path: rp }),
      });
      data = await r.json();
    } catch {
      data = { error: "본인확인을 시작할 수 없습니다." };
    }
    if (data.error || !data.launch_url) {
      cb.current({ ok: false, certify_id: "", state, message: data.error || "본인확인을 시작할 수 없습니다." });
      return;
    }
    if (isMobileLike()) {
      window.location.href = data.launch_url; // 같은 창 전체 이동(복귀 시 쿼리로 결과 수신)
    } else {
      window.open(data.launch_url, "prosell_certify", "width=500,height=700,scrollbars=1");
    }
  }

  return { launch };
}
