"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// 액세스 토큰 «클라이언트» 선제 갱신기.
//  · pa_exp(비-httpOnly, 실제 AT 만료 epoch ms)를 읽어, AT 쿠키가 죽기 직전에 /api/auth/refresh 로 회전.
//  · Link(RSC 소프트 내비)는 미들웨어의 document-only 갱신을 안 타므로, 라우트 변경/포커스/타이머로 직접 점검.
//  · 회전 레이스 방지: AT 가 아직 살아있는 시점(만료−5.5분)에 갱신 → 미들웨어(!at 조건)와 시간대가 겹치지 않음.
//  · single-flight: 모듈 스코프 inflight 로 동시 다발 갱신 방지.

// AT 쿠키 조기만료(SKEW 5분)보다 30초 더 이르게 → AT 가 살아있는 동안 새 토큰으로 교체(무중단).
const REFRESH_LEAD_MS = 330_000; // 5분 30초
const MAX_TIMEOUT_MS = 2_000_000_000; // setTimeout 상한(약 24일) 방어
const RETRY_MS = 15_000;
const MAX_RETRIES = 3; // 연속 실패 상한 → 무한 재시도 방지(다음 라우트변경/포커스 때 재개)

let inflight: Promise<boolean> | null = null;

function readExp(): number {
  if (typeof document === "undefined") return 0;
  const m = document.cookie.match(/(?:^|;\s*)pa_exp=(\d+)/);
  return m ? Number(m[1]) : 0;
}

async function refreshOnce(): Promise<boolean> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/auth/refresh", { method: "POST", cache: "no-store" });
      const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      return !!j?.ok;
    } catch {
      return false;
    }
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export default function SessionKeeper() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let fails = 0;

    const clear = () => { if (timer) { clearTimeout(timer); timer = undefined; } };

    const schedule = () => {
      clear();
      const exp = readExp();
      if (!exp) return; // 비로그인
      const fireIn = exp - REFRESH_LEAD_MS - Date.now();
      timer = setTimeout(tick, Math.max(0, Math.min(fireIn, MAX_TIMEOUT_MS)));
    };

    const tick = async () => {
      if (cancelled) return;
      const exp = readExp();
      if (!exp) return;
      // 아직 여유 있으면 재스케줄만.
      if (exp - Date.now() > REFRESH_LEAD_MS) { schedule(); return; }
      const wasExpired = exp - Date.now() <= 0; // 이미 만료 → 서버 UI 가 로그아웃 상태일 수 있음
      const ok = await refreshOnce();
      if (cancelled) return;
      if (ok) {
        fails = 0;
        if (wasExpired) router.refresh(); // 로그아웃 표시였다면 서버 컴포넌트 재렌더로 로그인 반영
        schedule();
      } else if (++fails < MAX_RETRIES) {
        timer = setTimeout(tick, RETRY_MS); // 일시 실패 → 제한적 재시도
      }
      // 상한 도달 시 중단 → 다음 라우트 변경/포커스(check) 때 재개
    };

    // 즉시 점검: 만료 임박/경과면 갱신, 아니면 스케줄.
    const check = () => {
      fails = 0;
      const exp = readExp();
      if (exp && exp - Date.now() <= REFRESH_LEAD_MS) void tick();
      else schedule();
    };

    const onVisible = () => { if (document.visibilityState === "visible") check(); };

    check(); // 마운트 + pathname 변경(=Link 소프트 내비)마다 실행
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);

    return () => {
      cancelled = true;
      clear();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [pathname, router]);

  return null;
}
