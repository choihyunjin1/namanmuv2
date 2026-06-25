import React, { lazy, Suspense } from "react";

const StudioEditorPage = lazy(() => import("./features/studioEditor/StudioEditorPage.jsx").then((module) => ({
  default: module.StudioEditorPage
})));

function StageLoading() {
  return (
    <main className="stage-loading" aria-live="polite">
      <div>
        <strong>3D 에디터를 준비하는 중입니다</strong>
        <span>건축 에디터 런타임과 자산 카탈로그를 불러옵니다.</span>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <Suspense fallback={<StageLoading />}>
      <StudioEditorPage />
    </Suspense>
  );
}
