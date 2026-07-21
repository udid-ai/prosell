/* 첫 페인트 전 테마 적용(다크모드 깜빡임 방지). React 트리 밖(정적 파일)에서 로드해
   React 19 의 «인라인 script» 클라이언트 렌더 경고를 피한다. */
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "dark" || (!t && matchMedia("(prefers-color-scheme:dark)").matches)) {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {}
})();

/* React 19.2 는 서버 컴포넌트 렌더 시간을 performance.measure 로 기록하는데,
   서버(개발 환경)와 브라우저 시계가 어긋나면 시작 타임스탬프가 음수가 되어
   «cannot have a negative time stamp» 예외를 던진다. 성능 계측은 비필수이므로
   음수 타임스탬프로 던질 때만 조용히 무시한다(정상 측정은 그대로 동작). */
(function () {
  try {
    if (typeof performance === "undefined" || !performance.measure) return;
    var orig = performance.measure.bind(performance);
    performance.measure = function () {
      try {
        return orig.apply(performance, arguments);
      } catch (e) {
        return undefined;
      }
    };
  } catch (e) {}
})();
