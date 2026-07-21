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
    // 형광펜(글자 배경색) — Tiptap Highlight 가 mark[style] 로 내보낸다.
    "mark",
    // 표 — Tiptap Table 확장(table > colgroup/col + tbody > tr > th/td).
    "table", "colgroup", "col", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    // data-file-id — 본문에 삽입된 이미지의 cs_file id. 저장 시 파일 귀속에 쓰이므로 유지한다.
    img: ["src", "alt", "width", "height", "data-file-id"],
    div: ["data-youtube-video"],
    iframe: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "title"],
    span: ["style"],
    // 형광펜 — mark[style=background-color] (+ data-color).
    mark: ["style", "data-color"],
    // 텍스트 정렬 — Tiptap TextAlign 이 블록노드에 style="text-align:…" 로 내보낸다.
    p: ["style"], h3: ["style"], h4: ["style"],
    // 표 — 크기/병합 속성.
    table: ["style"],
    col: ["style", "span"],
    th: ["colspan", "rowspan", "colwidth"],
    td: ["colspan", "rowspan", "colwidth"],
  },
  // 인라인 style 화이트리스트 — span 은 색상·글자크기, 블록노드는 정렬만(임의 CSS 차단).
  allowedStyles: {
    span: {
      color: [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
      "font-size": [/^\d{1,3}(?:\.\d+)?(?:px|em|rem|%)$/],
      // 글꼴 — 이름/따옴표/콤마/공백만(괄호·세미콜론 등 차단으로 url()·expression 방지).
      "font-family": [/^[\w\s\-,'"가-힣]+$/],
    },
    p: { "text-align": [/^(left|right|center|justify)$/] },
    h3: { "text-align": [/^(left|right|center|justify)$/] },
    h4: { "text-align": [/^(left|right|center|justify)$/] },
    mark: {
      "background-color": [/^#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
    },
    // 표 크기 — Tiptap resizable 이 min-width/width(px) 로 내보낸다.
    table: { "min-width": [/^\d+px$/], width: [/^\d+px$/] },
    col: { width: [/^\d+px$/], "min-width": [/^\d+px$/] },
  },
  // http/https/mailto 만 — javascript:, data: 등은 차단
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  // 이 목록 밖 호스트의 iframe 은 제거된다(임의 사이트 임베드 차단).
  allowedIframeHostnames: VIDEO_HOSTS,
  transformTags: {
    // 링크 «새 창» 옵션 존중 — target=_blank 면 탭내빙 방지 rel 부여, 아니면 같은 창(target 제거).
    a: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs };
      if (out.target === "_blank") {
        out.rel = "noopener noreferrer nofollow";
      } else {
        delete out.target;
        out.rel = "nofollow";
      }
      return { tagName, attribs: out };
    },
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
