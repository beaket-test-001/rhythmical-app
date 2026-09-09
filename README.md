# 리드미컬 (rhythmical-app)

메트로놈에 맞춰 탭하면 타이밍 정확도를 바로 판정해 주는 리듬 연습 웹앱.

## 로컬 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:5173/rhythmical-app/)
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

`vite preview`도 `base`를 따르므로 실제 주소는 `http://localhost:4319/rhythmical-app/`이다.

QA 문서의 체크리스트 중 **데스크톱 Chrome에서 자동화 가능한 항목**을 덮는다.
실제 오디오 재생 여부와 iOS Safari · Android Chrome 동작, 터치 입력 지연은
실기기 확인이 필요하다.

## 기술 스택

Vite + TypeScript (프레임워크 없음) · Web Audio API · localStorage · GitHub Pages 정적 호스팅

## 배포

`main` 브랜치 푸시 시 GitHub Actions가 GitHub Pages로 자동 배포한다
(`.github/workflows/deploy.yml`). 테스트와 타입 체크를 통과해야 배포된다.

- 공개 주소: <https://beaket-test-001.github.io/rhythmical-app/>
- 프로젝트 페이지라 `/rhythmical-app/` 아래에서 서빙된다. `vite.config.ts`의
  `base`가 이 경로를 맞춘다 — 저장소 이름이 바뀌면 함께 고쳐야 한다.
- 롤백은 되돌릴 커밋을 revert하고 다시 푸시한다(재빌드 몇 분). 즉시 롤백이
  필요할 만큼 커지면 호스팅을 재검토한다.

## 릴리즈

버전 이력은 [CHANGELOG.md](CHANGELOG.md) 참조.

릴리즈 절차:

```bash
npm test && npm run build     # 단위 테스트 + 타입 체크 + 빌드
npm run smoke                 # 데스크톱 Chrome 스모크 (preview 서버 실행 후)
```

**태그는 아래 게이트를 모두 통과한 뒤에 붙인다.** 검증되지 않은 커밋에
버전이 박히면 롤백 기준점이 흐려진다.

1. 사양서의 완료 조건(AC) 전 항목 통과
2. 스모크 체크리스트 전 항목 통과 — 자동화 범위 밖인 **iOS Safari ·
   Android Chrome 실기기 확인 포함**
3. 기기 매트릭스 3종에서 콘솔 에러 0건

```bash
git tag -a v1.0.0 -m "리드미컬 v1.0.0"
git push origin v1.0.0
```

## 문서

사양·설계 문서는 Notion 팀스페이스(🥁 리드미컬 앱)에서 관리한다. 코드와 사양이 충돌하면 사양서가 우선이다.
