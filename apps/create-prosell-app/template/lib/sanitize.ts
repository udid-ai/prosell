import sanitizeHtml from "sanitize-html";

// 게시판 본문(HTML) 허용목록 — Tiptap 이 실제로 내보내는 태그만 통과시킨다.
// 레거시(cs_article_board.content)는 SmartEditor2 HTML 을 «필터 없이» 저장하고 view.php 가 raw 로 출력하므로,
// 저장 전에 여기서 거르지 않으면 관리자 화면까지 그대로 실행된다(저장형 XSS).

// 동영상 임베드를 허용할 호스트 — 이 목록 밖의 iframe 은 통째로 제거된다.
const VIDEO_HOSTS = ["www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com", "player.vimeo.com"];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "s", "code", "pre", "blockquote", "ul", "ol", "li", "a", "h3", "h4",
    "img",
    // 유튜브 임베드 — Tiptap Youtube 확장이 div[data-youtube-video] > iframe 구조로 내보낸다.
    // 래퍼 div 를 남겨야 «수정»에서 다시 열었을 때 에디터가 노드로 인식한다.
    "div", "iframe",
    // 글자 크기·색상 — Tiptap TextStyle 이 span[style] 로 내보낸다.
    "span",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    // data-file-id — 본문에 삽입된 이미지의 cs_file id. 저장 시 파일 귀속에 쓰이므로 유지한다.
    img: ["src", "alt", "width", "height", "data-file-id"],
    div: ["data-youtube-video"],
    iframe: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "title"],
    span: ["style"],
  },
  // span[style] 은 색상·글자크기만 허용(임의 CSS 로 레이아웃 깨기·트래킹 방지).
  allowedStyles: {
    span: {
      color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
      "font-size": [/^\d{1,3}(?:\.\d+)?(?:px|em|rem|%)$/],
    },
  },
  // http/https/mailto 만 — javascript:, data: 등은 차단
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  // 이 목록 밖 호스트의 iframe 은 제거된다(임의 사이트 임베드 차단).
  allowedIframeHostnames: VIDEO_HOSTS,
  transformTags: {
    // 외부 링크는 새 탭 + rel 고정(탭내빙 방지)
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
  },
  // 빈 문단은 줄바꿈 의미가 있어 유지
  nonTextTags: ["style", "script", "textarea", "option", "noscript"],
};

/** 본문 HTML 새니타이즈 — 저장 전(쓰기)·출력 전(읽기) 모두 통과시킨다. */
export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}

/** HTML 에서 순수 텍스트만 추출 — 글자수 제한은 태그를 뺀 «본문 길이» 기준으로 센다. */
export function htmlToText(html: string): string {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
  return text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

/** 내용이 실제로 비었는지 — <p></p> 만 있는 경우를 «빈 값»으로 본다. */
export function isEmptyContent(html: string): boolean {
  return htmlToText(html) === "" && !/<(img|iframe)\b/i.test(html);
}

/** 본문에 삽입된 이미지의 cs_file id 목록 — 저장 시 파일 귀속(state=1)에 쓴다. */
export function contentFileIds(html: string): number[] {
  const ids: number[] = [];
  const re = /data-file-id=["']?(\d+)["']?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = Number(m[1]);
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * 조회 화면용 본문 변환.
 * 위지윅 도입 «이전»에 저장된 글과 관리자가 평문으로 쓴 글은 태그가 없어서, 그대로 HTML 로 렌더하면
 * 줄바꿈이 사라진다(예전엔 whitespace-pre-line 로 살렸음). 태그가 없으면 평문으로 보고 줄바꿈을 <br> 로 살린다.
 */
export function renderContent(raw: string): string {
  const looksHtml = /<(p|br|div|ul|ol|li|strong|em|b|i|s|a|blockquote|h[1-6]|pre|code|img|iframe|span)\b/i.test(raw);
  if (looksHtml) return sanitizeContent(raw);

  // 평문 — 태그를 이스케이프한 뒤 줄바꿈만 <br> 로 복원.
  const escaped = sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} });
  return escaped.replace(/\r\n|\r|\n/g, "<br />");
}
