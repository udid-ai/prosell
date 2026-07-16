"use client";

import { useEffect, useState } from "react";
import type { SavedAddress } from "@/lib/prosell";

// 저장된 배송지(기본/추가) 목록에서 하나를 고르는 모달. 읽기전용(선택만).
// 선택 시 onClose(주소), 닫기 시 onClose(null).
// 모바일=전체화면 / 데스크톱=중앙 카드 (Zipcode 와 동일 톤).
export default function AddressBook({
  addresses,
  currentId,
  onClose,
}: {
  addresses: SavedAddress[];
  currentId?: number | null;
  onClose: (v: SavedAddress | null) => void;
}) {
  const [pick, setPick] = useState<number | null>(currentId ?? addresses[0]?.id ?? null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selected = addresses.find((a) => a.id === pick) ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={() => onClose(null)}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden bg-card sm:h-auto sm:max-h-[85vh] sm:w-full sm:max-w-[512px] sm:rounded-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center justify-center border-b border-line py-3">
          <span className="text-[15px] font-bold text-text">배송지 관리</span>
          <button
            type="button"
            aria-label="닫기"
            onClick={() => onClose(null)}
            className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 cursor-pointer place-items-center bg-transparent text-xl text-sub hover:text-text"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {addresses.length === 0 ? (
            <p className="py-10 text-center text-sm text-sub">저장된 배송지가 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {addresses.map((a) => (
                <li key={a.id}>
                  <label
                    className={`flex cursor-pointer gap-3 rounded-md border p-3 ${
                      pick === a.id ? "border-accent bg-accent/5" : "border-line hover:bg-surface"
                    }`}
                  >
                    <input
                      type="radio"
                      name="addrbook"
                      checked={pick === a.id}
                      onChange={() => setPick(a.id)}
                      className="mt-1 shrink-0 accent-accent"
                    />
                    <div className="min-w-0 text-[13px] leading-relaxed">
                      <div className="flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${a.is_default ? "bg-accent/10 text-text" : "bg-surface text-sub"}`}>
                          {a.is_default ? "기본 배송지" : "추가 배송지"}
                        </span>
                        {a.place && <span className="font-medium text-text">{a.place}</span>}
                        <span className="text-sub">{a.name || "이름없음"}</span>
                        {(a.hp || a.tel) && <span className="text-sub">{a.hp || a.tel}</span>}
                      </div>
                      <div className="mt-1 text-sub">
                        {a.zipcode && <span className="mr-1">[{a.zipcode}]</span>}
                        {a.addr1}{a.addr2 ? ` ${a.addr2}` : ""}
                      </div>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-line p-3">
          <button
            type="button"
            disabled={!selected}
            onClick={() => onClose(selected)}
            className="h-11 w-full rounded-md bg-accent text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            이 배송지로 선택
          </button>
        </div>
      </div>
    </div>
  );
}
