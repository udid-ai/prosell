/** @type {import('next').NextConfig} */
const nextConfig = {
  // 상품 이미지는 외부/CDN 호스트라 next/image 최적화 대신 <img> 사용.
  // 필요 시 여기에 images.remotePatterns 를 추가하세요.
};

export default nextConfig;
