// Swiper 슬라이드 폭/높이를 «초기화 전»부터 고정하기 위한 CSS.
// globals.css 대신 컴포넌트가 <style> 로 직접 렌더 → JS 번들과 함께 항상 최신 반영되고 SSR HTML 에 포함되어,
// swiper JS 초기화 이전 첫 페인트부터 올바른 가로 배치가 적용된다(세로 1개씩 쌓였다가 가로로 펼쳐지는 깜빡임 방지).
// 초기화 후엔 swiper 가 슬라이드에 인라인 width 를, wrapper 에 transform 을 넣어 아래 값을 덮어쓴다.
// 슬라이드 간격은 swiper 의 spaceBetween(초기화 후 margin 주입) 대신 «슬라이드 자체의 좌우 패딩»으로 준다.
// 이렇게 하면 초기화 전/후 간격이 동일해 «붙었다가 떨어지는» 점프가 없다. (Swiper 는 spaceBetween=0 로 둘 것)
// wrapper 음수 마진으로 양끝 카드를 컨테이너 가장자리에 맞춘다.
export const SWIPER_COLS_CSS = `
.hswiper .swiper-wrapper{display:flex;align-items:stretch;margin-left:-8px;margin-right:-8px}
.hswiper .swiper-slide{flex-shrink:0;height:auto;box-sizing:border-box;padding-left:8px;padding-right:8px}
.pcols .swiper-slide{width:50%}
@media(min-width:640px){.pcols .swiper-slide{width:33.3333%}}
@media(min-width:1024px){.pcols .swiper-slide{width:25%}}
.rcols-v .swiper-slide{width:50%}
@media(min-width:640px){.rcols-v .swiper-slide{width:33.3333%}}
@media(min-width:1024px){.rcols-v .swiper-slide{width:25%}}
@media(min-width:1280px){.rcols-v .swiper-slide{width:20%}}
.rcols-h .swiper-slide{width:85%}
@media(min-width:640px){.rcols-h .swiper-slide{width:50%}}
@media(min-width:1024px){.rcols-h .swiper-slide{width:33.3333%}}
`;
