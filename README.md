# PLOT:ON Studio Editor

PLOT:ON Studio Editor 전용 앱입니다.

이 레포는 3D 건축 에디터를 바로 실행하고 개발하기 위한 에디터 전용 레포입니다. 지도, 홈, 커뮤니티, 견적 페이지는 이 레포에 포함하지 않습니다.

## 실행

```bash
npm install
npm run dev
```

개발 서버 기본 진입 경로:

- `http://127.0.0.1:5173/studio-editor`
- 같은 서버에서 `/studio-editor`
- 루트(`/`)도 에디터 앱으로 진입합니다.

`src/App.jsx`는 별도 랜딩이나 홈 라우트 없이 `StudioEditorPage`를 렌더링합니다.

## 포함 범위

- 3D 건축 에디터
- Pascal-style UI
- GLB + metadata 기반 자산
- Text-to-CAD / CADAM-compatible adapter
- GLB 자산 수집, 변환, 최적화, 카탈로그, 썸네일 생성 파이프라인 스크립트

## 제외 범위

이 레포에는 다음 페이지나 제품 영역이 없습니다.

- 지도 페이지
- 홈 페이지
- 커뮤니티 페이지
- 견적 페이지

해당 기능은 이 레포가 아니라 별도 앱/레포의 책임으로 다룹니다.

## 팀 분업 메모

- 3번: 3D 에디터 중심
- 4번: AI/RAG/자산 파이프라인 중심

README는 에디터 레포의 실행과 경계 이해를 돕기 위한 문서입니다. 다른 팀원의 코드 변경이나 담당 파일은 건드리지 않습니다.

## 파일 구조

```text
namanmuv2/
  index.html
  package.json
  vite.config.js
  src/
    App.jsx
    main.jsx
    features/
      studioEditor/
        StudioEditorPage.jsx
        EditorViewport.jsx
        StudioAssetCatalog.jsx
        StudioEditorHeader.jsx
        StudioSceneOutliner.jsx
        *Rules.js
        studioCatalog.js
        studioAssetLibrary.js
    styles/
      base.css
      index.css
      studio-editor.css
  server/
    studioApi.js
    projectStore.js
    textToCadGenerator.js
  public/
    assets/
      models/
        *.glb
        *.json
        optimized/
        thumbnails/
      pascal-icons/
  scripts/
    build_asset_catalog.py
    intake_local_glb_asset.py
    ifc_to_glb.py
    export_component_glb_assets.mjs
    export_ifc_component_assets.py
    optimize_glb_assets.mjs
    generate_glb_thumbnails.mjs
    audit_glb_asset.py
```

주요 위치:

- `src/features/studioEditor/`: 에디터 화면, 3D 뷰포트, 배치/편집 규칙, 카탈로그 UI
- `src/styles/studio-editor.css`: Pascal-style 에디터 UI 스타일
- `public/assets/models/`: GLB, metadata JSON, 최적화 모델, 썸네일
- `public/assets/pascal-icons/`: 에디터 도구/카탈로그 아이콘
- `server/textToCadGenerator.js`: Text-to-CAD 작업 생성 및 CADAM-compatible adapter 응답 형식
- `server/studioApi.js`: Vite 개발 서버에 연결되는 Studio API
- `scripts/`: GLB/IFC 자산 수집, 변환, 최적화, 카탈로그 생성, 검증 스크립트

## CADAM 연결 원칙

CADAM은 GPL 코드를 프론트엔드나 서버 코드에 직접 섞는 방식으로 통합하지 않습니다. 이 레포는 `adapter` / `worker` 경계를 통해 CADAM-compatible Text-to-CAD 결과를 주고받는 구조를 사용합니다.

- 앱 내부 코드는 PLOT:ON Studio Editor의 에디터 상태, 자산 카탈로그, 배치 규칙을 담당합니다.
- CADAM 또는 CADAM 호환 생성기는 외부 worker/서비스 경계에 둡니다.
- `server/textToCadGenerator.js`는 현재 mock CADAM-compatible adapter 형태의 작업 결과를 만들며, 실제 CADAM worker 연결 시에도 같은 경계를 유지합니다.
- GPL 구현 코드를 이 레포 코드베이스에 직접 복사하거나 링크해 혼합하지 않습니다.

## 자산 파이프라인

자산 관련 npm script:

```bash
npm run assets:catalog
npm run assets:intake
npm run assets:optimize
npm run assets:thumbnails
npm run assets:export-components
npm run assets:export-ifc-components
```

카탈로그 정책 검증:

```bash
npm run test:catalog-policy-rules
```
