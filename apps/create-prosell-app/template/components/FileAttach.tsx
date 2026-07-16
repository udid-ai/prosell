"use client";

import { useRef, useState } from "react";
import { toast } from "@/lib/toast";
import type { InquiryFile } from "@/lib/prosell";

export type AttachedFile = {
  id: number;
  name: string;
  size: number;
  filesize?: string;   // "1.2 MB" — 서버 포맷
  thumb?: string | null; // 이미지면 미리보기
};

/** 바이트 → 사람이 읽는 단위. 서버가 filesize 를 주면 그걸 우선 쓴다. */
function humanSize(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}

/** 확장자 → 아이콘 색/라벨. 파일 종류를 한눈에 구분하려는 용도. */
function fileKind(name: string): { label: string; cls: string } {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic"].includes(ext)) return { label: "IMG", cls: "bg-[#34c759]/15 text-[#2a9d4a]" };
  if (ext === "pdf") return { label: "PDF", cls: "bg-[#ff3b30]/15 text-[#d32f2f]" };
  if (["doc", "docx", "hwp", "hwpx", "txt", "rtf"].includes(ext)) return { label: "DOC", cls: "bg-[#0a84ff]/15 text-[#0a6ed1]" };
  if (["xls", "xlsx", "csv"].includes(ext)) return { label: "XLS", cls: "bg-[#34c759]/15 text-[#1e7e34]" };
  if (["ppt", "pptx"].includes(ext)) return { label: "PPT", cls: "bg-[#ff9500]/15 text-[#d97800]" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { label: "ZIP", cls: "bg-[#8e8e93]/15 text-[#5c5c60]" };
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return { label: "VID", cls: "bg-[#af52de]/15 text-[#8e3cb8]" };
  return { label: ext ? ext.slice(0, 3).toUpperCase() : "FILE", cls: "bg-line text-sub" };
}

function FileIcon({ name, thumb }: { name: string; thumb?: string | null }) {
  const kind = fileKind(name);
  if (thumb) {
    return (
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
      </span>
    );
  }
  return (
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md text-[10px] font-bold tracking-tight ${kind.cls}`}>
      {kind.label}
    </span>
  );
}

/**
 * 파일 첨부 — 브라우저 기본 «파일 선택» 버튼 대신 커스텀 버튼 + 첨부 카드 목록.
 * 이미지 전용이 아니라 «일반 파일»을 받는다(이미지면 썸네일, 아니면 종류 배지).
 */
export default function FileAttach({ files, onChange, uploadUrl, max = 3, maxSizeMB = 10 }: {
  files: AttachedFile[];
  onChange: (files: AttachedFile[]) => void;
  uploadUrl: string;
  max?: number;
  maxSizeMB?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const upload = async (picked: File[]) => {
    if (!picked.length) return;
    const room = max - files.length;
    if (room <= 0) { toast(`파일은 최대 ${max}개까지 첨부할 수 있습니다.`, "error"); return; }

    const list = picked.slice(0, room);
    const tooBig = list.find((f) => f.size > maxSizeMB * 1024 * 1024);
    if (tooBig) { toast(`파일 하나당 ${maxSizeMB}MB 까지 첨부할 수 있습니다.`, "error"); return; }

    setUploading(true);
    try {
      const fd = new FormData();
      list.forEach((f) => fd.append("files", f, f.name));
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { toast(j?.error || "파일 업로드에 실패했습니다.", "error"); return; }
      const added: AttachedFile[] = ((j.items ?? []) as InquiryFile[]).map((it, i) => ({
        id: it.id,
        name: it.name ?? list[i]?.name ?? "파일",
        size: it.size ?? list[i]?.size ?? 0,
        filesize: it.filesize,
        thumb: it.thumb ?? null,
      }));
      onChange([...files, ...added].slice(0, max));
    } catch { toast("파일 업로드 중 오류가 발생했습니다.", "error"); }
    finally { setUploading(false); }
  };

  const full = files.length >= max;

  return (
    <div>
      {/* 커스텀 첨부 버튼 — 기본 input[type=file] 은 숨긴다(브라우저별 «파일 선택» 표기 제거) */}
      <input ref={inputRef} type="file" multiple className="hidden"
        onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ""; void upload(l); }} />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void upload(Array.from(e.dataTransfer.files ?? [])); }}
        className={`flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2.5 transition-colors ${
          dragOver ? "border-accent bg-accent/5" : full ? "border-line bg-surface/50" : "border-input bg-surface"
        }`}
      >
        <span className="min-w-0 text-[12px] text-sub">
          {full ? `첨부 가능한 개수를 모두 채웠습니다 (${max}개)` : "파일을 끌어다 놓거나 버튼으로 선택해 주세요."}
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || full}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-[12px] font-semibold text-text transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
              업로드 중
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              파일 첨부
            </>
          )}
        </button>
      </div>

      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2.5 rounded-lg border border-line bg-card px-2.5 py-2">
              <FileIcon name={f.name} thumb={f.thumb} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-text">{f.name}</span>
                <span className="block text-[11px] text-sub">{f.filesize || humanSize(f.size)}</span>
              </span>
              <button type="button" onClick={() => onChange(files.filter((x) => x.id !== f.id))}
                aria-label={`${f.name} 첨부 삭제`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-sub transition-colors hover:bg-surface hover:text-sale">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-[11px] text-sub">최대 {max}개 · 개당 {maxSizeMB}MB 까지</p>
    </div>
  );
}
