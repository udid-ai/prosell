"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// 주문내역 «기간 직접설정» — 버튼 클릭 시 모달에서 시작일/종료일 입력 후 검색.
// 검색 시 /account/orders?start=YYYY-MM-DD&end=YYYY-MM-DD 로 이동(서버가 그 기간으로 조회).
export default function OrderPeriodPicker({ start, end, active, basePath = "/account/orders" }: { start?: string; end?: string; active: boolean; basePath?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const today = () => new Date().toISOString().slice(0, 10);
  const [s, setS] = useState(start || "");
  const [e, setE] = useState(end || today());
  const [err, setErr] = useState("");

  function submit() {
    if (!s || !e) { setErr("시작일과 종료일을 모두 입력해 주세요."); return; }
    if (s > e) { setErr("시작일이 종료일보다 늦을 수 없습니다."); return; }
    setOpen(false);
    router.push(`${basePath}?start=${s}&end=${e}`);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`rounded px-3 py-1 text-[13px] font-medium ${active ? "bg-accent text-accent-foreground" : "text-sub hover:text-text"}`}>
        기간설정
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-5" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-text">조회 기간 설정</h2>
              <button type="button" onClick={() => setOpen(false)} className="cursor-pointer text-sub hover:text-text" aria-label="닫기">✕</button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-sub">시작일</span>
                <input type="date" value={s} max={e || today()} onChange={(ev) => setS(ev.target.value)}
                  className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-text outline-none focus:border-accent" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-sub">종료일</span>
                <input type="date" value={e} min={s} max={today()} onChange={(ev) => setE(ev.target.value)}
                  className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm text-text outline-none focus:border-accent" />
              </label>
              {err && <p className="text-[12px] text-sale">{err}</p>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setOpen(false)}
                className="h-10 rounded-md border border-line text-sm font-medium text-text hover:bg-surface">취소</button>
              <button type="button" onClick={submit}
                className="h-10 rounded-md bg-accent text-sm font-bold text-accent-foreground hover:opacity-90">검색</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
