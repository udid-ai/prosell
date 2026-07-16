/** @type {import('next').NextConfig} */
const nextConfig = {
  // 상품 이미지는 외부/CDN 호스트라 next/image 최적화 대신 <img> 사용.
  // 필요 시 여기에 images.remotePatterns 를 추가하세요.

  // swiper 는 ESM-only 패키지 → Next(webpack)가 swiper/react 등을 해석하려면 transpilePackages 필요.
  transpilePackages: ["swiper"],
};

export default nextConfig;
