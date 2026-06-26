# 디자인 / 재디자인 가이드 (AI용)

이 스토어프론트는 **레이어가 분리**되어 있다. AI 재디자인 시 이 경계를 지켜라.

```
lib/prosell.ts   ← 데이터/로직 (SDK). 절대 디자인 목적으로 수정하지 말 것.
lib/demo.ts      ← never-empty 폴백 샘플 데이터.
components/      ← 디자인 레이어. 여기를 자유롭게 갈아엎어 재디자인한다.
  theme.ts         색·간격·모양 토큰 (가장 먼저 바꾸는 곳)
  Header.tsx       전역 헤더/내비
  ProductCard.tsx  상품 카드
app/             ← 페이지. 위 components 를 조합. 데이터는 lib 에서 가져온다.
```

## 재디자인 원칙

1. **로직 불변**: 상품/가격/인증/이미지 처리는 `lib/prosell.ts` 에 있다. 모양만 바꾼다.
2. **토큰 우선**: 전반적 톤은 `components/theme.ts` 한 곳에서. 그다음 개별 컴포넌트.
3. **never-empty 유지**: 목록은 `withDemoList`, 상세는 `DEMO_DETAIL` 폴백을 거친다.
   재디자인해도 "상품 0개일 때 빈 화면"이 되지 않게 폴백 경로를 보존하라.
4. **새 기능은 명세 기반**: 장바구니/주문/리뷰 등은 MCP resources(OpenAPI)의
   엔드포인트로 `lib/prosell.ts` 에 호출을 추가한 뒤 페이지를 만든다.

## 예: "미니멀 흑백으로 바꿔줘"
→ `theme.ts` 의 color 만 교체하면 전체 톤이 바뀐다. 구조 변경이 필요하면
   `components/*` 와 `app/*` 의 레이아웃을 수정. `lib/*` 는 건드리지 않는다.
