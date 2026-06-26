// 운영자가 브라우저에서 보는 콜백 결과 페이지(연결/로그인 완료·실패).
// 외부 의존 없는 단일 HTML — connect.js / login.js 가 공용으로 쓴다.

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** 결과 페이지 HTML. ok=true 성공(초록), false 실패(빨강). */
export function callbackPage({ ok, title, message }) {
  const accent = ok ? "#10b981" : "#ef4444";
  const ring = ok ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)";
  const icon = ok ? "✓" : "✕";
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — 프로셀 AI 쇼핑몰</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple SD Gothic Neo",
      "Malgun Gothic", Roboto, Helvetica, Arial, sans-serif;
    background: #f6f7f9; color: #1f2330; padding: 24px;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1115; color: #e8eaed; }
    .card { background: #181b21; box-shadow: 0 1px 0 rgba(255,255,255,.04), 0 20px 50px rgba(0,0,0,.5); }
    .msg { color: #aab0bd; }
  }
  .card {
    width: 100%; max-width: 420px; background: #fff; border-radius: 16px;
    padding: 40px 32px; text-align: center;
    box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 20px 50px rgba(20,24,40,.10);
  }
  .icon {
    width: 64px; height: 64px; margin: 0 auto 20px; border-radius: 50%;
    display: grid; place-items: center; font-size: 32px; font-weight: 700;
    color: ${accent}; background: ${ring}; box-shadow: 0 0 0 8px ${ring};
  }
  h1 { margin: 0 0 8px; font-size: 20px; font-weight: 700; letter-spacing: -.01em; }
  .msg { margin: 0; font-size: 14.5px; line-height: 1.6; color: #5b616e; word-break: break-word; }
  .brand { margin-top: 28px; font-size: 12px; color: #9aa0ad; letter-spacing: .02em; }
</style>
</head>
<body>
  <main class="card">
    <div class="icon" aria-hidden="true">${icon}</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="msg">${escapeHtml(message)}</p>
    <p class="brand">프로셀 AI 쇼핑몰</p>
  </main>
</body>
</html>`;
}
