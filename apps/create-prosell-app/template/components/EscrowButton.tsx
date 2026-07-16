"use client";

// 페이앱 구매안전(에스크로) 서비스 가입확인 팝업 — 레거시 [data-btn='lf-escrow'] 동작 재현.
// 사업자등록번호(biznum)로 payapp.kr 에스크로 조회 창을 590×600 중앙 팝업으로 연다.
export default function EscrowButton({ biznum }: { biznum?: string | null }) {
  const digits = (biznum || "").replace(/[^0-9]/g, "");

  function openEscrow() {
    if (!digits || digits === "0000000000") {
      alert("사업자 등록정보가 설정되지 않아 에스크로 확인을 열 수 없습니다.");
      return;
    }
    const w = 590;
    const h = 600;
    const x = window.screen.width / 2 - w / 2;
    const y = window.screen.height / 2 - h / 2;
    window.open(
      `http://payapp.kr/escro_check/escro_p.html?findType=1&findText=${digits}`,
      "escrowOpen",
      `width=${w},height=${h},left=${x},top=${y},scrollbars=yes`,
    );
  }

  return (
    <button
      type="button"
      onClick={openEscrow}
      className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[12px] font-medium text-sub hover:border-accent hover:text-accent"
    >
      {/* 방패 아이콘 */}
      <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4">
        <path fill="currentColor" d="M10 1.5 3.5 4v5c0 4 2.8 7.4 6.5 9 3.7-1.6 6.5-5 6.5-9V4L10 1.5Zm-1 11.6-3-3 1.4-1.4L9 10.3l4.1-4.1 1.4 1.4-5.5 5.5Z" />
      </svg>
      구매안전(에스크로) 가입확인
    </button>
  );
}
