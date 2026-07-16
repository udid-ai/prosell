"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontSize } from "@tiptap/extension-text-style/font-size";
import { Color } from "@tiptap/extension-color";
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

// 글자 크기 프리셋(px) — 본문 기준 14px. «기본»은 크기 지정 해제.
const FONT_SIZES = [
  { label: "작게", value: "12px" },
  { label: "기본", value: "" },
  { label: "크게", value: "18px" },
  { label: "더 크게", value: "24px" },
];

// 글자 색상 프리셋 — «기본»(검정 복귀) + 자주 쓰는 색.
const FONT_COLORS = [
  { label: "기본", value: "" },
  { label: "빨강", value: "#e02424" },
  { label: "주황", value: "#f97316" },
  { label: "초록", value: "#16a34a" },
  { label: "파랑", value: "#2563eb" },
  { label: "보라", value: "#7c3aed" },
  { label: "회색", value: "#6b7280" },
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
  const setLink = useCallback(() => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("링크 주소를 입력해 주세요.", prev ?? "https://");
    if (url === null) return;                       // 취소
    if (url === "") { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }, [editor]);

  // 동영상 — Tiptap Youtube 확장(임베드 가능한 링크만 노드로 삽입된다).
  const setVideo = useCallback(() => {
    const url = window.prompt("YouTube 링크를 입력해 주세요.", "https://www.youtube.com/watch?v=");
    if (!url) return;
    const ok = editor.commands.setYoutubeVideo({ src: url.trim() });
    if (!ok) window.alert("YouTube 동영상 링크만 삽입할 수 있습니다.");
  }, [editor]);

  const div = <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />;

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface px-2 py-1.5">
      {/* 글자 크기·색상 — 맨 앞. 커스텀 드롭다운. */}
      <FontSizePicker editor={editor} />
      <ColorPicker editor={editor} />
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
      <ToolbarButton label="링크" active={editor.isActive("link")} onClick={setLink}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
      </ToolbarButton>
      {div}
      <ToolbarButton label={uploading ? "이미지 업로드 중" : "이미지 삽입"} onClick={onPickImage}>
        {uploading ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
        )}
      </ToolbarButton>
      <ToolbarButton label="동영상 삽입" onClick={setVideo}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="14" height="14" rx="2" /><path d="m22 8-6 4 6 4V8z" /></svg>
      </ToolbarButton>
    </div>
  );
}

function FontSizePicker({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const current = (editor.getAttributes("textStyle").fontSize as string) || "";
  const label = FONT_SIZES.find((f) => f.value === current)?.label ?? "기본";

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        aria-label="글자 크기"
        title="글자 크기"
        onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
        className="flex h-8 items-center gap-1 rounded px-1.5 text-[12px] text-sub hover:bg-line hover:text-text"
      >
        <span className="min-w-[2.5rem] text-left">{label}</span>
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <span className="absolute left-0 top-9 z-10 flex w-max min-w-[6rem] flex-col rounded-lg border border-line bg-card p-1 shadow-lg">
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
              className={`rounded px-2 py-1.5 text-left transition-colors hover:bg-surface ${current === f.value ? "font-semibold text-accent" : "text-text"}`}
              style={f.value ? { fontSize: f.value } : undefined}
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
        <span className="absolute left-0 top-9 z-10 flex w-max gap-1 rounded-lg border border-line bg-card p-1.5 shadow-lg">
          {FONT_COLORS.map((c) => (
            <button
              key={c.label}
              type="button"
              title={c.label}
              onMouseDown={(e) => {
                e.preventDefault();
                if (c.value) editor.chain().focus().setColor(c.value).run();
                else editor.chain().focus().unsetColor().run();
                setOpen(false);
              }}
              className={`h-6 w-6 rounded-full border ${current === c.value && c.value ? "border-accent ring-2 ring-accent/40" : "border-line"} ${c.value ? "" : "grid place-items-center"}`}
              style={c.value ? { background: c.value } : undefined}
            >
              {!c.value && <span className="text-[11px] text-sub">✕</span>}
            </button>
          ))}
        </span>
      )}
    </span>
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
      // 글자 크기·색상 — TextStyle(span[style]) 위에 FontSize·Color 를 얹는다.
      TextStyle,
      FontSize,
      Color,
    ],
    content: value || "",
    // SSR 하이드레이션 불일치 방지 — 에디터는 클라이언트에서만 렌더한다.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap-content min-h-[140px] px-3 py-2.5 text-sm leading-relaxed text-text outline-none",
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
    return <div className="min-h-[180px] rounded-lg border border-line bg-surface" aria-busy="true" />;
  }

  const len = editor.getText().trim().length;
  const over = maxLength !== undefined && len > maxLength;

  return (
    <div className={`overflow-hidden rounded-lg border bg-surface focus-within:border-accent ${over ? "border-sale" : "border-line"}`}>
      <Toolbar editor={editor} uploading={uploading} onPickImage={() => fileRef.current?.click()} />
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { const list = Array.from(e.target.files ?? []); e.target.value = ""; void uploadImages(list); }} />
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
  );
}
