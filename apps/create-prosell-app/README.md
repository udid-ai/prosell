# create-prosell-app

프로셀 스토어프론트(고객 쇼핑 화면)를 한 줄로 만드는 스캐폴더. git clone 없이 npm 으로 받습니다.

```bash
npx create-prosell-app my-shop
cd my-shop
npm install
npm run setup     # 연결 정보 자동 채우기 (먼저 AI 에서 connect 완료)
npm run dev       # http://localhost:3000
```

## 동작

`template/` 을 대상 폴더로 복사할 뿐입니다. `template/` 은 [`apps/starter`](../starter) 에서
`npm run sync-template` 으로 동기화되는 산출물이라 **소스 중복이 없습니다**(발행 직전
`prepublishOnly` 가 자동 동기화).

## 유지보수

starter 를 고친 뒤:

```bash
npm run sync-template   # apps/starter → template 재동기화
```

발행:

```bash
npm publish             # prepublishOnly 가 sync-template + check 자동 실행 (비스코프라 public 기본)
```
