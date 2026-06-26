"use client";

import { useEffect, useState } from "react";

// 다크/라이트 토글. 선택값을 localStorage('theme')에 저장한다.
// 첫 페인트 전 적용은 layout 의 인라인 스크립트가 담당(깜빡임 방지).
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="다크/라이트 모드 전환"
      title={dark ? "라이트 모드" : "다크 모드"}
      className="grid h-8 w-8 cursor-pointer place-items-center rounded-sm text-base text-text hover:bg-line"
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
