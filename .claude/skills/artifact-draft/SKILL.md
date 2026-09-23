---
name: artifact-draft
description: 이 저장소에서 HTML을 새로 만들거나 고칠 때 항상 로드한다. drafts/ 아래 초안이든 다른 경로의 HTML이든, 생성한 파일이 수정 없이 그대로 Artifact로 퍼블리시될 수 있도록 Artifact 페이지 규칙(artifact-design 스킬)을 따르게 한다. "초안 만들어줘", "html 페이지 만들어", "drafts에 추가", "아티팩트용 페이지" 같은 요청에서 쓴다.
metadata:
  internal: true
---

# Artifact 초안 작성

이 저장소의 HTML은 **빌드(로컬 스크립트 인라인)만 거쳐 그대로 Artifact로 퍼블리시될 수 있어야 한다.** 퍼블리시할 때 손대야 하는 초안은 실패한 초안이다.

## 1. 쓰기 전에

1. **`artifact-design` 스킬을 먼저 로드한다.** 페이지 규칙과 디자인 기준의 정본은 그 스킬이다. 아래 체크리스트와 다르면 스킬을 따른다. **`html-authoring` 스킬도 함께 로드한다.** 스크립트를 어떻게 둘지는 그 스킬이 정한다.
2. 초안은 `drafts/<짧은-이름>.html`에 둔다. 함께 올릴 CSS·이미지·데이터는 `drafts/` 안에 두고 상대 경로로 참조한다 (퍼블리시 때 `files`로 함께 올린다).
3. 페이지 스크립트는 `drafts/<짧은-이름>.js`로 분리하고 `<script src="<짧은-이름>.js"></script>`로 링크한다. 사용자가 명시한 경우에만 HTML 안에 쓴다 (`html-authoring` 스킬).

## 2. 퍼블리시 규칙 체크리스트

- **본문만 쓴다**: `<!doctype>`, `<html>`, `<head>`, `<body>` 태그를 쓰지 않는다. 파일은 `<title>` → `<style>` → 마크업 → `<script>` 순서로 시작한다. 스켈레톤(charset·viewport `viewport-fit=cover`·리셋)은 퍼블리시 환경과 `serve.mjs`가 씌운다.
- **`<title>`**: 파일 앞 8KB 안에 둔다. 2~4단어로 된 고유한 이름으로 짓고, 대시·콜론 뒤에 설명을 붙이지 않는다. 설명은 퍼블리시 `description`에 쓴다.
- **테마 3상태**:
  - 맨 `:root`에 라이트 팔레트 토큰을 전부 정의한다.
  - `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`에서 토큰만 재정의하고 `color-scheme: dark`를 넣는다.
  - `:root[data-theme="dark"] { … }`에서 같은 재정의를 반복한다.
  - 색은 모두 토큰으로 쓴다. 미디어 쿼리나 `[data-theme]` 블록 안에만 존재하는 색을 만들지 않는다.
  - `body`에 토큰으로 배경을 명시한다.
- **외부 리소스 (CSP)**:
  - 스크립트는 두 가지로만 둔다.
    - **공식 링크가 제공되는 스크립트** (라이브러리 등): 그 공식 링크를 그대로 쓴다. 링크는 `cdnjs.cloudflare.com`(우선), `cdn.jsdelivr.net/npm/`, `cdn.tailwindcss.com`, `code.jquery.com` 중 하나에 있어야 한다. UMD 빌드를 쓰고, 버전을 정확히 고정하고, 그 스크립트를 쓰는 로컬 스크립트보다 먼저 둔다. 허용목록 밖의 링크밖에 없으면 사용자에게 알리고 멈춘다.
    - **공식 링크가 없는 스크립트** (페이지 자체 코드, 직접 받은 파일 등): `drafts/` 안의 로컬 `.js` 파일로 두고 상대 경로로 링크한다. 퍼블리시 빌드가 HTML에 인라인한다 (4절).
  - 스타일시트는 Google Fonts만 허용된다. 폰트에는 대체 폰트 스택을 지정한다.
  - 그 외 CSS·이미지는 인라인하거나 `data:` URI 또는 `drafts/` 안의 파일로 둔다.
- **반응형**:
  - 400px 폭에서도 동작해야 한다.
  - 좌우 여백은 최소 16px로, `body`나 바깥 래퍼 하나에 한 번만 준다. 세로 여백은 `padding-block`으로 준다.
  - 이미지와 `aspect-ratio` 박스에는 `max-width: 100%`를 준다.
  - 넓은 표·코드·다이어그램만 자체 `overflow-x: auto` 컨테이너 안에서 넘칠 수 있다.
- **프레임 제약**:
  - `alert`/`confirm`/`prompt`, `window.print()`, `<a download>`, iframe/embed, 외부 form `action`은 동작하지 않는다.
  - `mailto:`·`tel:` 링크는 신뢰할 수 없다.
  - 표시 여부는 `el.hidden`으로 토글한다.
  - `localStorage`는 try/catch로 감싸고 편의 기능에만 쓴다.
- **차트**: 라이브러리 차트의 텍스트·격자·마크 색도 테마 토큰에서 읽는다 (예: Chart.js는 `Chart.defaults.color`를 설정한다). 테마가 바뀌면 다시 그린다.
- **크기**: 렌더된 페이지는 16MB 이하여야 한다 (`data:` URI 포함).

## 3. 확인

- `npm run serve`(기본 http://localhost:5178)로 연다. 상단 바에서 테마는 system/light/dark, 폭은 full/tablet/phone을 전환해 확인한다.
- DevTools 콘솔에 CSP 위반이 없어야 한다. 서버는 퍼블리시 환경과 같은 CSP를 건다.
- 이 서버는 퍼블리시 환경을 흉내 낼 뿐이다. 판단 기준은 항상 `artifact-design` 스킬의 규칙이다.

## 4. 퍼블리시

**초안은 손대지 않고, 빌드 결과를 등록한다.** 퍼블리시되는 파일은 `npm run build`가 만든 `dist/<짧은-이름>.html`이다.

- 빌드(`build.mjs`)가 하는 일은 하나뿐이다. 초안의 로컬 `<script src="…">`를 해당 파일 내용으로 바꿔 `<script>…</script>`로 인라인한다. 공식 CDN 링크는 그대로 둔다. 허용목록 밖의 외부 스크립트 링크가 있으면 빌드가 실패한다.
- 사용자가 등록을 요청하면:
  1. `npm run build -- drafts/<짧은-이름>.html`을 실행한다.
  2. `dist/<짧은-이름>.html` 경로를 그대로 Artifact 도구의 `file_path`에 넘긴다. 빌드 결과를 손으로 고치거나 다른 후처리를 하지 않는다. 스켈레톤 태그도 추가하지 않는다.
- 등록 직전에 규칙 위반을 발견해도 조용히 고쳐서 올리지 않는다. 문제를 사용자에게 알리고 등록을 멈춘다. 사용자가 승인하면 `drafts/`의 초안(또는 `.js`)을 고치고, 다시 빌드해서 올린다.
- 인라인된 스크립트는 `files`로 따로 올리지 않는다. 이미지·데이터 등 나머지 에셋은 `files`로 넘기고, 이때 `drafts/` 안의 원본 파일을 그대로 쓴다.
- 첫 퍼블리시에는 `icon`(일반 명사 한 단어)과 한 문장 `description`을 넣는다. 이 둘은 도구 파라미터라서 HTML을 건드리지 않는다.
- 다시 퍼블리시할 때도 다시 빌드한 뒤 같은 `dist/` 경로를 넘긴다. 그래야 같은 URL로 갱신된다. 다른 대화에서 갱신할 때는 기존 아티팩트의 `url`도 함께 넘긴다.

## 5. 발표 덱

슬라이드 덱은 배포용 스킬 `skills/artifact-deck/SKILL.md`를 읽고 그 절차를 따른다. 템플릿은 `skills/artifact-deck/assets/template.html`, 예제는 `skills/artifact-deck/examples/deck-example.html`이다 (`drafts/deck-example.html`은 미리보기용 심볼릭 링크).

- 이 저장소에서는 덱 초안을 `drafts/<짧은-이름>.html`에 두고 `npm run serve`로 확인한다. 덱에는 로컬 스크립트가 없어 빌드 결과가 초안과 같다.
- 템플릿·예제·스킬 문서를 고치면 그것이 곧 배포되는 스킬이다. 이 저장소 전용 규칙(`drafts/`, `npm run build`, `serve.mjs`)을 그 스킬에 쓰지 않는다. 스킬을 설치한 다른 프로젝트에는 이 파일들이 없다.
- 틀 자체(넘기기, 동기화, 노트, 슬라이드 목록)를 고쳐야 하면 `packages/deck/deck.js`를 고치고 버전을 올린다. 절차는 `html-authoring` 스킬을 따른다. 템플릿과 예제의 `<script src>` 버전도 함께 올린다.
