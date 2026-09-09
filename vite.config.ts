import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages 프로젝트 사이트는 /<저장소명>/ 아래에서 서빙된다.
  // 빌드 산출물이 /assets/... 절대 경로를 쓰므로 이 값이 없으면 404가 난다.
  base: '/rhythmical-app/',
});
