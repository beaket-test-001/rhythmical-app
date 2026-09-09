# 리드미컬 (rhythmical-app)

메트로놈에 맞춰 탭하면 타이밍 정확도를 바로 판정해 주는 리듬 연습 웹앱.

## 로컬 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173)
npm test         # style.css 구조 검사 + 단위 테스트 (Vitest)
npm run build    # 타입 체크 + 프로덕션 빌드 → dist/
```

## 스모크 테스트

설치된 Chrome을 CDP로 몰아 목록 → 연습 → 결과 플로우를 실제로 돌린다.
추가 의존성 없이 동작한다.

```bash
npm run build
npx vite preview --port 4319 &
npm run smoke
```

QA 문서의 체크리스트 중 **데스크톱 Chrome에서 자동화 가능한 항목**을 덮는다.
실제 오디오 재생 여부와 iOS Safari · Android Chrome 동작, 터치 입력 지연은
실기기 확인이 필요하다.

## 기술 스택

Vite + TypeScript (프레임워크 없음) · Web Audio API · localStorage · Vercel 정적 호스팅

## 배포

`main` 브랜치 푸시 시 Vercel이 자동 배포한다. 빌드 명령 `npm run build`, 출력 디렉터리 `dist`.

## 릴리즈

버전 이력은 [CHANGELOG.md](CHANGELOG.md) 참조.

릴리즈 절차:

```bash
npm test && npm run build     # 단위 테스트 + 타입 체크 + 빌드
npm run smoke                 # 데스크톱 Chrome 스모크 (preview 서버 실행 후)
git tag -a v0.1.0 -m "MVP v0.1.0"
git push origin v0.1.0
```

실기기 확인(iOS Safari · Android Chrome)은 스모크 자동화 범위 밖이므로
릴리즈 전 수동으로 거친다.

## 문서

사양·설계 문서는 Notion 팀스페이스(🥁 리드미컬 앱)에서 관리한다. 코드와 사양이 충돌하면 사양서가 우선이다.
