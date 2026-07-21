"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontSize } from "@tiptap/extension-text-style/font-size";
import { FontFamily } from "@tiptap/extension-text-style/font-family";
import { Color } from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TableKit } from "@tiptap/extension-table";
import { useCallback, useEffect, useRef, useState } from "react";

// 바깥 클릭 / Esc 로 팝오버 닫기 — 툴바 드롭다운(크기·색상) 공용.
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    // mousedown 캡처 — 팝오버 내부 버튼은 자체 onMouseDown 에서 preventDefault 로 처리한다.
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

// 글꼴 프리셋 — «기본»(지정 해제) + 시스템/한글 글꼴. value 는 CSS font-family 스택.
const FONT_FAMILIES = [
  { label: "기본", value: "" },
  { label: "고딕", value: "sans-serif" },
  { label: "명조", value: "serif" },
  { label: "맑은 고딕", value: "'Malgun Gothic', sans-serif" },
  { label: "나눔고딕", value: "'Nanum Gothic', sans-serif" },
  { label: "굴림", value: "Gulim, sans-serif" },
  { label: "돋움", value: "Dotum, sans-serif" },
  { label: "바탕", value: "Batang, serif" },
  { label: "궁서", value: "Gungsuh, serif" },
  { label: "모노스페이스", value: "monospace" },
];

// 글자 크기 프리셋 — 기본값 + 8~72px 단위. «기본»(value "")은 크기 지정 해제(본문 기준).
const FONT_SIZES = [
  { label: "기본", value: "" },
  ...[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72].map((n) => ({ label: `${n}px`, value: `${n}px` })),
];

// 형광펜(글자 배경색) 팔레트 — 파스텔 위주 8열 2행.
const HIGHLIGHT_COLORS = [
  "#fef9c3", "#fef08a", "#fde047", "#fed7aa", "#fdba74", "#fecaca", "#fca5a5", "#f9a8d4",
  "#fbcfe8", "#e9d5ff", "#d8b4fe", "#bfdbfe", "#93c5fd", "#a7f3d0", "#6ee7b7", "#e5e7eb",
];

// 표준 색상 팔레트 — 8열 그리드(그레이스케일 1행 + 색상 5행).
const COLOR_PALETTE = [
  "#000000", "#333333", "#666666", "#999999", "#cccccc", "#e5e5e5", "#f5f5f5", "#ffffff",
  "#7f1d1d", "#dc2626", "#ef4444", "#f97316", "#f59e0b", "#eab308", "#facc15", "#fde047",
  "#365314", "#4d7c0f", "#65a30d", "#84cc16", "#22c55e", "#16a34a", "#15803d", "#166534",
  "#134e4a", "#0d9488", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#2563eb", "#1d4ed8",
  "#312e81", "#4f46e5", "#6366f1", "#8b5cf6", "#a855f7", "#c026d3", "#d946ef", "#ec4899",
  "#831843", "#be185d", "#e11d48", "#f43f5e", "#fb7185", "#fda4af", "#9f1239", "#500724",
];

// 게시판 본문용 위지윅 에디터(Tiptap/ProseMirror).
//  · 한글 IME(조합 입력)·iOS Safari 대응은 ProseMirror 코어가 처리한다.
//  · 툴바 — 굵게/기울임/취소선/목록/인용/링크 + 이미지 삽입/동영상(YouTube) 삽입.
//  · 삽입 이미지는 업로드(cs_file) 후 <img data-file-id> 로 심는다 → 서버가 이 id 로 파일을 글에 귀속시킨다.
//  · 출력은 HTML(cs_article_board.content 형식). 저장 전 서버에서 새니타이즈한다.

function ToolbarButton({ onClick, active, label, children }: {
  onClick: () => void; active?: boolean; label: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // onMouseDown 으로 기본동작을 막아야 에디터 포커스/선택이 유지된다(클릭 시 커서 튐 방지).
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      aria-label={label}
      aria-pressed={!!active}
      title={label}
      className={`grid h-8 min-w-8 place-items-center rounded px-1.5 text-[13px] font-semibold transition-colors ${
        active ? "bg-accent text-accent-foreground" : "text-sub hover:bg-line hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, onPickImage, uploading }: { editor: Editor; onPickImage: () => void; uploading: boolean }) {
  const div = <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />;

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border-b border-line bg-surface px-2 py-1.5">
      {/* 글꼴·글자 크기·색상 — 맨 앞. 커스텀 드롭다운. */}
      <FontFamilyPicker editor={editor} />
      <FontSizePicker editor={editor} />
      <ColorPicker editor={editor} />
      <HighlightPicker editor={editor} />
      {div}
      <ToolbarButton label="굵게" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <span className="font-bold">B</span>
      </ToolbarButton>
      <ToolbarButton label="기울임" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <span className="italic">I</span>
      </ToolbarButton>
      <ToolbarButton label="취소선" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <span className="line-through">S</span>
      </ToolbarButton>
      {div}
      {/* 텍스트 정렬 */}
      {([
        { align: "left", label: "왼쪽 정렬", mid: [4, 14] },
        { align: "center", label: "가운데 정렬", mid: [7, 17] },
        { align: "right", label: "오른쪽 정렬", mid: [10, 20] },
        { align: "justify", label: "양쪽 정렬", mid: [4, 20] },
      ] as const).map((a) => (
        <ToolbarButton key={a.align} label={a.label} active={editor.isActive({ textAlign: a.align })}
          onClick={() => editor.chain().focus().setTextAlign(a.align).run()}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1={a.mid[0]} y1="12" x2={a.mid[1]} y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </ToolbarButton>
      ))}
      {div}
      <LinkPopover editor={editor} />
      {div}
      <ToolbarButton label={uploading ? "이미지 업로드 중" : "이미지 삽입"} onClick={onPickImage}>
        {uploading ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
        )}
      </ToolbarButton>
      <VideoPopover editor={editor} />
      {div}
      <TableMenu editor={editor} />
    </div>
  );
}

function FontFamilyPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const current = (editor.getAttributes("textStyle").fontFamily as string) || "";
  // 미지정(기본)일 땐 필드명 «글꼴»을, 지정 시 해당 글꼴명을 표시.
  const matched = FONT_FAMILIES.find((f) => f.value === current);
  const label = matched && matched.value ? matched.label : "글꼴";

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        aria-label="글꼴"
        title="글꼴"
        onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        className="flex h-7 items-center gap-0.5 rounded px-1 text-[11px] text-sub hover:bg-line hover:text-text"
      >
        <span className="max-w-[3.5rem] truncate text-left">{label}</span>
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <span className="absolute left-0 top-8 z-30 flex max-h-64 w-max min-w-[7rem] flex-col overflow-y-auto rounded-lg border border-line bg-card p-1 text-[13px] shadow-lg">
          {FONT_FAMILIES.map((f) => (
            <button
              key={f.label}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                if (f.value) editor.chain().focus().setFontFamily(f.value).run();
                else editor.chain().focus().unsetFontFamily().run();
                setOpen(false);
              }}
              className={`rounded px-2 py-1.5 text-left transition-colors hover:bg-surface ${current === f.value ? "font-semibold text-accent" : "text-text"}`}
              style={f.value ? { fontFamily: f.value } : undefined}
            >
              {f.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function FontSizePicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const current = (editor.getAttributes("textStyle").fontSize as string) || "";
  // 미지정(기본)일 땐 필드명 «크기»를, 지정 시 해당 px 을 표시.
  const matched = FONT_SIZES.find((f) => f.value === current);
  const label = matched && matched.value ? matched.label : "크기";

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        aria-label="글자 크기"
        title="글자 크기"
        onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        className="flex h-7 items-center gap-0.5 rounded px-1 text-[11px] text-sub hover:bg-line hover:text-text"
      >
        <span className="min-w-[1.9rem] text-left tabular-nums">{label}</span>
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <span className="absolute left-0 top-8 z-30 flex max-h-64 w-16 flex-col overflow-y-auto overflow-x-hidden rounded-lg border border-line bg-card p-1 text-[13px] shadow-lg">
          {FONT_SIZES.map((f) => (
            <button
              key={f.label}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                if (f.value) editor.chain().focus().setFontSize(f.value).run();
                else editor.chain().focus().unsetFontSize().run();
                setOpen(false);
              }}
              // 실제 크기로 미리보기하지 않고 모든 항목을 동일 크기로 표시.
              className={`rounded px-2 py-1.5 text-left tabular-nums transition-colors hover:bg-surface ${current === f.value ? "font-semibold text-accent" : "text-text"}`}
            >
              {f.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function ColorPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const current = (editor.getAttributes("textStyle").color as string) || "";

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        aria-label="글자 색상"
        title="글자 색상"
        onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        className="flex h-8 min-w-8 flex-col items-center justify-center gap-px rounded px-1.5 text-sub hover:bg-line hover:text-text"
      >
        <span className="text-[13px] font-bold leading-none" style={{ color: current || "currentColor" }}>A</span>
        <span className="h-[3px] w-4 rounded-sm" style={{ background: current || "currentColor" }} />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-30 w-max rounded-lg border border-line bg-card p-2 shadow-lg">
          {/* 기본(색 지정 해제) + 사용자 지정(컬러픽커) */}
          <div className="mb-2 flex items-center gap-1.5">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetColor().run(); setOpen(false); }}
              className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] text-text hover:bg-surface"
            >
              <span className="grid h-4 w-4 place-items-center rounded-sm border border-line text-[10px] text-sub">✕</span>
              기본
            </button>
            <label className="flex cursor-pointer items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] text-text hover:bg-surface">
              <span className="h-4 w-4 rounded-sm border border-line" style={{ background: current || "#000000" }} />
              사용자 지정
              {/* 네이티브 컬러픽커 — 임의 색 직접 선택. */}
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(current) ? current : "#000000"}
                onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                className="h-0 w-0 opacity-0"
              />
            </label>
          </div>
          {/* 표준 색상 그리드 */}
          <div className="grid grid-cols-8 gap-1">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor(c).run(); setOpen(false); }}
                className={`h-5 w-5 rounded-sm border transition-transform hover:scale-110 ${current.toLowerCase() === c.toLowerCase() ? "border-accent ring-2 ring-accent/40" : "border-line/60"}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

// 형광펜(글자 배경색) 피커 — 팔레트 + 사용자 지정(컬러픽커) + 없음.
function HighlightPicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const current = (editor.getAttributes("highlight").color as string) || "";

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        aria-label="형광펜"
        title="형광펜(글자 배경색)"
        onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        className={`flex h-8 min-w-8 flex-col items-center justify-center gap-px rounded px-1.5 hover:bg-line hover:text-text ${editor.isActive("highlight") ? "text-text" : "text-sub"}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m9 11-6 6v3h3l6-6" /><path d="m14 6 3 3" /><path d="M20.5 8.5a2.12 2.12 0 0 0 0-3l-1-1a2.12 2.12 0 0 0-3 0L9 11l3 3z" /></svg>
        <span className="h-[3px] w-4 rounded-sm" style={{ background: current || "#fde047" }} />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-30 w-max rounded-lg border border-line bg-card p-2 shadow-lg">
          <div className="mb-2 flex items-center gap-1.5">
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetHighlight().run(); setOpen(false); }}
              className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] text-text hover:bg-surface"
            >
              <span className="grid h-4 w-4 place-items-center rounded-sm border border-line text-[10px] text-sub">✕</span>
              없음
            </button>
            <label className="flex cursor-pointer items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] text-text hover:bg-surface">
              <span className="h-4 w-4 rounded-sm border border-line" style={{ background: current || "#fde047" }} />
              사용자 지정
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(current) ? current : "#fde047"}
                onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()}
                className="h-0 w-0 opacity-0"
              />
            </label>
          </div>
          <div className="grid grid-cols-8 gap-1">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setHighlight({ color: c }).run(); setOpen(false); }}
                className={`h-5 w-5 rounded-sm border transition-transform hover:scale-110 ${current.toLowerCase() === c.toLowerCase() ? "border-accent ring-2 ring-accent/40" : "border-line/60"}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

// 링크 입력 팝오버 — 브라우저 prompt 대신 URL 입력 + «새 창» 옵션 + «삭제»(링크 해제).
function LinkPopover({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const active = editor.isActive("link");
  const [href, setHref] = useState("");
  const [blank, setBlank] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPopover = () => {
    const attrs = editor.getAttributes("link");
    setHref((attrs.href as string) ?? "");
    setBlank(((attrs.target as string) ?? "_blank") === "_blank");
    setOpen(true);
    // 팝오버 열리면 입력에 포커스.
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const apply = () => {
    const url = href.trim();
    if (!url) { remove(); return; }
    const h = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange("link")
      .setLink({ href: h, target: blank ? "_blank" : null, rel: blank ? "noopener noreferrer nofollow" : null })
      .run();
    setOpen(false);
  };
  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setOpen(false);
  };

  return (
    <span ref={ref} className="relative">
      <ToolbarButton label="링크" active={active} onClick={openPopover}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
      </ToolbarButton>
      {open && (
        <div className="absolute left-0 top-9 z-30 w-64 rounded-lg border border-line bg-card p-2.5 shadow-lg">
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="url"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } if (e.key === "Escape") setOpen(false); }}
              placeholder="https://"
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-text outline-none focus:border-accent"
            />
            {active && (
              <button type="button" title="링크 삭제" aria-label="링크 삭제"
                onMouseDown={(e) => { e.preventDefault(); remove(); }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-sub hover:bg-line hover:text-sale">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>
              </button>
            )}
          </div>
          <label className="mt-2 flex items-center gap-1.5 text-[12px] text-text">
            <input type="checkbox" checked={blank} onChange={(e) => setBlank(e.target.checked)} className="h-3.5 w-3.5 accent-accent" />
            새 창으로 열기
          </label>
          <div className="mt-2 flex justify-end">
            <button type="button" onMouseDown={(e) => { e.preventDefault(); apply(); }}
              className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-foreground">
              적용
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

// 동영상 삽입 팝오버 — prompt 대신 URL 입력(YouTube 링크만 임베드).
function VideoPopover({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const [url, setUrl] = useState("");
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const openPopover = () => { setUrl(""); setErr(""); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); };
  const apply = () => {
    const src = url.trim();
    if (!src) { setErr("링크를 입력해 주세요."); return; }
    const ok = editor.commands.setYoutubeVideo({ src });
    if (!ok) { setErr("YouTube 동영상 링크만 삽입할 수 있습니다."); return; }
    setOpen(false);
  };

  return (
    <span ref={ref} className="relative">
      <ToolbarButton label="동영상 삽입" onClick={openPopover}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="14" height="14" rx="2" /><path d="m22 8-6 4 6 4V8z" /></svg>
      </ToolbarButton>
      {open && (
        <div className="absolute left-0 top-9 z-30 w-64 rounded-lg border border-line bg-card p-2.5 shadow-lg">
          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } if (e.key === "Escape") setOpen(false); }}
            placeholder="YouTube 링크"
            className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-text outline-none focus:border-accent"
          />
          {err && <p className="mt-1 text-[12px] text-sale">{err}</p>}
          <div className="mt-2 flex justify-end">
            <button type="button" onMouseDown={(e) => { e.preventDefault(); apply(); }}
              className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-foreground">
              삽입
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

// 표 크기 선택 격자 — hover 로 행×열을 고른 뒤 클릭해 삽입(데모 에디터 방식).
const TABLE_GRID_ROWS = 8;
const TABLE_GRID_COLS = 8;

// 표 편집 메뉴 — 격자 삽입 + (표 안에서) 행/열 추가·삭제·머리글 토글·표 삭제.
function TableMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState({ r: -1, c: -1 });   // 격자 hover(0-base)
  const ref = useDismiss(open, () => setOpen(false));
  const inTable = editor.isActive("table");
  const item = "rounded px-2 py-1.5 text-left text-[13px] text-text hover:bg-surface";
  const run = (fn: () => void, close = true) => (e: React.MouseEvent) => {
    e.preventDefault(); fn(); if (close) setOpen(false);
  };
  const line = <span className="my-1 block h-px bg-line" />;

  return (
    <span ref={ref} className="relative">
      <ToolbarButton label="표" active={inTable} onClick={() => { setHover({ r: -1, c: -1 }); setOpen((v) => !v); }}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>
      </ToolbarButton>
      {open && (
        <div className="absolute left-0 top-9 z-30 flex w-max flex-col rounded-lg border border-line bg-card p-2 shadow-lg">
          {/* 크기 선택 격자 */}
          <div
            className="grid w-max gap-0.5"
            style={{ gridTemplateColumns: `repeat(${TABLE_GRID_COLS}, 1rem)` }}
            onMouseLeave={() => setHover({ r: -1, c: -1 })}
          >
            {Array.from({ length: TABLE_GRID_ROWS }).map((_, ri) =>
              Array.from({ length: TABLE_GRID_COLS }).map((_, ci) => {
                const on = ri <= hover.r && ci <= hover.c;
                return (
                  <button
                    key={`${ri}-${ci}`}
                    type="button"
                    onMouseEnter={() => setHover({ r: ri, c: ci })}
                    onMouseDown={run(() => editor.chain().focus().insertTable({ rows: ri + 1, cols: ci + 1, withHeaderRow: true }).run())}
                    className={`h-4 w-4 rounded-[2px] border ${on ? "border-accent bg-accent/40" : "border-line bg-surface"}`}
                  />
                );
              }),
            )}
          </div>
          <p className="mt-1.5 text-center text-[12px] text-sub">
            {hover.r >= 0 ? `${hover.r + 1} × ${hover.c + 1}` : "표 크기 선택"}
          </p>
          {inTable && (
            <>
              {line}
              <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().addRowBefore().run(), false)}>위에 행 추가</button>
              <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().addRowAfter().run(), false)}>아래에 행 추가</button>
              <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().addColumnBefore().run(), false)}>왼쪽 열 추가</button>
              <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().addColumnAfter().run(), false)}>오른쪽 열 추가</button>
              {line}
              <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().mergeCells().run(), false)}>셀 병합</button>
              <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().splitCell().run(), false)}>셀 분할</button>
              {line}
              <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().deleteRow().run(), false)}>행 삭제</button>
              <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().deleteColumn().run(), false)}>열 삭제</button>
              <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().toggleHeaderRow().run(), false)}>머리글 행 전환</button>
              {line}
              <button type="button" className={`${item} text-sale`} onMouseDown={run(() => editor.chain().focus().deleteTable().run())}>표 삭제</button>
            </>
          )}
        </div>
      )}
    </span>
  );
}

// 셀에 포커스가 가면 표 왼쪽에 손잡이 아이콘이 뜨고, 클릭하면 표 작업 메뉴가 열린다.
function TableBubbleMenu({ editor }: { editor: Editor }) {
  const [menu, setMenu] = useState(false);
  const item = "block w-full rounded px-2.5 py-1.5 text-left text-[13px] text-text hover:bg-surface whitespace-nowrap";
  // 액션 클릭 시 메뉴를 닫는다.
  const run = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault(); fn(); setMenu(false);
  };
  const line = <span className="my-1 block h-px bg-line" />;

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableHandle"
      shouldShow={({ editor }) => editor.isActive("table")}
      options={{ placement: "left-start", offset: 6 }}
    >
      <div className="relative">
        {/* 손잡이 아이콘 */}
        <button
          type="button"
          aria-label="표 메뉴"
          title="표 메뉴"
          onMouseDown={(e) => { e.preventDefault(); setMenu((v) => !v); }}
          className={`grid h-7 w-7 place-items-center rounded-md border border-line shadow-sm hover:bg-surface ${menu ? "bg-surface text-accent" : "bg-card text-sub"}`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>
        </button>
        {/* 작업 메뉴 — 아이콘 아래로 펼침 */}
        {menu && (
          <div className="absolute left-0 top-8 z-30 flex w-36 flex-col rounded-lg border border-line bg-card p-1 shadow-lg">
            <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().addRowBefore().run())}>위에 행 추가</button>
            <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().addRowAfter().run())}>아래에 행 추가</button>
            <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().addColumnBefore().run())}>왼쪽 열 추가</button>
            <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().addColumnAfter().run())}>오른쪽 열 추가</button>
            {line}
            <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().mergeCells().run())}>셀 병합</button>
            <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().splitCell().run())}>셀 분할</button>
            {line}
            <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().deleteRow().run())}>행 삭제</button>
            <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().deleteColumn().run())}>열 삭제</button>
            <button type="button" className={item} onMouseDown={run(() => editor.chain().focus().toggleHeaderRow().run())}>머리글 행 전환</button>
            {line}
            <button type="button" className={`${item} text-sale`} onMouseDown={run(() => editor.chain().focus().deleteTable().run())}>표 삭제</button>
          </div>
        )}
      </div>
    </BubbleMenu>
  );
}

export default function RichEditor({ value, onChange, placeholder, maxLength, uploadUrl }: {
  value: string;                       // HTML
  onChange: (html: string, textLength: number) => void;
  placeholder?: string;
  maxLength?: number;                  // 태그 제외 «본문 텍스트» 기준 상한
  uploadUrl?: string;                  // 이미지 업로드 프록시(미지정이면 이미지 버튼 동작 안 함)
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3, 4] },
        link: false,                   // 아래 Link 확장으로 대체(설정 충돌 방지)
      }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
      // data-file-id 를 유지해야 서버가 본문 이미지를 cs_file 에 귀속시킬 수 있다.
      Image.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            "data-file-id": { default: null, parseHTML: (el) => el.getAttribute("data-file-id"), renderHTML: (attrs) => (attrs["data-file-id"] ? { "data-file-id": attrs["data-file-id"] } : {}) },
          };
        },
      }).configure({ inline: false, allowBase64: false }),
      Youtube.configure({ controls: true, nocookie: true, width: 640, height: 360 }),
      // 글자 크기·색상·글꼴 — TextStyle(span[style]) 위에 FontSize·Color·FontFamily 를 얹는다.
      TextStyle,
      FontSize,
      FontFamily,
      Color,
      // 텍스트 정렬 — 문단/제목에 style="text-align:…" 로 적용.
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      // 형광펜(글자 배경색) — mark[style=background-color]. 다색 지원.
      Highlight.configure({ multicolor: true }),
      // 표 — 공식 번들(Table+Row+Header+Cell). 크기조절 + 셀 드래그 선택.
      TableKit.configure({
        table: { resizable: true, allowTableNodeSelection: true },
      }),
    ],
    content: value || "",
    // SSR 하이드레이션 불일치 방지 — 에디터는 클라이언트에서만 렌더한다.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap-content min-h-[300px] px-3 py-2.5 text-sm leading-relaxed text-text outline-none",
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
    },
    // 생성 시점에도 한 번 보고한다. 수정 모드에서 프리필된 본문이 있어도 타이핑 전까지
    // 부모가 길이를 0 으로 알고 있어 «내용을 입력해 주세요» 로 막히던 문제를 방지.
    onCreate: ({ editor }) => onChange(editor.getHTML(), editor.getText().trim().length),
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getText().trim().length),
  });

  // 이미지 업로드 → cs_file id/URL 확보 → <img data-file-id> 로 본문에 삽입.
  const uploadImages = useCallback(async (files: File[]) => {
    if (!editor || !uploadUrl || !files.length) return;
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      images.forEach((f) => fd.append("files", f, f.name));
      const res = await fetch(uploadUrl, { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!j?.ok) { window.alert(j?.error || "이미지 업로드에 실패했습니다."); return; }
      // 선택 «끝» 위치에 삽입한다. setImage(=insertContent)는 현재 선택을 «대체»하므로,
      // 본문의 이미지를 클릭해 둔 상태(NodeSelection)에서 첨부하면 그 이미지가 지워진다.
      // insertContentAt(pos) 는 대체 없이 그 자리에 끼워 넣는다.
      let pos = editor.state.selection.to;
      for (const it of (j.items ?? []) as { id: number; src?: string | null; thumb?: string | null }[]) {
        const src = it.src || it.thumb;
        if (!src) continue;
        editor.chain().focus().insertContentAt(pos, {
          type: "image",
          attrs: { src, "data-file-id": String(it.id) },
        }).run();
        // 여러 장이면 방금 삽입한 것 «뒤»로 이어 붙도록 위치를 갱신(순서 유지).
        pos = editor.state.selection.to;
      }
    } catch { window.alert("이미지 업로드 중 오류가 발생했습니다."); }
    finally { setUploading(false); }
  }, [editor, uploadUrl]);

  if (!editor) {
    // 에디터 준비 전 레이아웃 유지(높이 점프 방지)
    return <div className="min-h-[340px] rounded-lg border border-line bg-card" aria-busy="true" />;
  }

  const len = editor.getText().trim().length;
  const over = maxLength !== undefined && len > maxLength;

  // 래퍼에 overflow-hidden 을 두면 툴바 드롭다운(글자크기·색상)이 에디터 영역에 잘린다.
  // 래퍼는 자르지 않고, 라운드가 필요한 본문/카운터만 별도로 감싼다.
  return (
    <div className={`rounded-lg border bg-card focus-within:border-accent ${over ? "border-sale" : "border-line"}`}>
      <Toolbar editor={editor} uploading={uploading} onPickImage={() => fileRef.current?.click()} />
      {/* 표 안에 커서가 있을 때 뜨는 플로팅 편집 메뉴 */}
      <TableBubbleMenu editor={editor} />
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { const list = Array.from(e.target.files ?? []); e.target.value = ""; void uploadImages(list); }} />
      <div className="overflow-hidden rounded-b-lg">
        {/* 붙여넣기·드래그로 떨어뜨린 이미지도 업로드해서 삽입(base64 삽입 방지) */}
        <div
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.files ?? []);
            if (files.some((f) => f.type.startsWith("image/"))) { e.preventDefault(); void uploadImages(files); }
          }}
          onDrop={(e) => {
            const files = Array.from(e.dataTransfer?.files ?? []);
            if (files.some((f) => f.type.startsWith("image/"))) { e.preventDefault(); void uploadImages(files); }
          }}
        >
          <EditorContent editor={editor} />
        </div>
        {maxLength !== undefined && (
          <div className={`border-t border-line px-3 py-1 text-right text-[11px] ${over ? "text-sale" : "text-sub"}`}>
            {len} / {maxLength}
          </div>
        )}
      </div>
    </div>
  );
}
