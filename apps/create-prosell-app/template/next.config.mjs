// 개발 서버(`npm run dev`)를 localhost 가 아닌 도메인으로 접속하면(리버스 프록시 뒤 데모 서버 등)
// Next 가 교차 출처 개발 요청을 막아 `/_next/*` 리소스(이미지·정적 파일)가 일부 안 뜬다.
// 접속할 도메인을 허용 목록에 넣는다. 운영 빌드(`next build`/`start`)에는 영향 없음.
//   .env.local 예: PROSELL_DEV_ORIGINS=demo-ai.prosell.kr
const devOrigins = (process.env.PROSELL_DEV_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 상품 이미지는 외부/CDN 호스트라 next/image 최적화 대신 <img> 사용.
  // 필요 시 여기에 images.remotePatterns 를 추가하세요.

  // swiper 는 ESM-only 패키지 → Next(webpack)가 swiper/react 등을 해석하려면 transpilePackages 필요.
  transpilePackages: ["swiper"],

  ...(devOrigins.length ? { allowedDevOrigins: devOrigins } : {}),
};

export default nextConfig;
