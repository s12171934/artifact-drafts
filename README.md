# Artifact drafts

아티팩트로 퍼블리시하기 전에 HTML 초안을 로컬에서 확인하는 환경.

```bash
npm run serve             # http://localhost:5178  (PORT=xxxx npm run serve 로 변경)
```

- `drafts/` 아래 `.html` 을 만들면 목록에 뜨고, 저장하면 자동 새로고침된다.
- 초안은 아티팩트 규칙대로 **본문만** 쓴다 (`<!doctype>`/`<html>`/`<head>`/`<body>` 없이 `<title>` + `<style>` 부터). 서버가 퍼블리시 스켈레톤(charset·viewport·리셋)을 씌운다.
- 퍼블리시 환경과 같은 CSP 허용목록을 헤더로 건다 — cdnjs / jsdelivr npm / tailwind play CDN / code.jquery 스크립트, Google Fonts 만 허용. 막힌 리소스는 DevTools 콘솔에 CSP 위반으로 보인다.
- 상단 바에서 테마(system/light/dark → `data-theme` 스탬프)와 폭(full/tablet/phone 400px)을 바꿔 본다.
- 스크립트는 공식 CDN 링크가 있으면 그 링크를 쓰고, 없으면 `drafts/` 안의 `.js` 로 분리해 상대 경로로 링크한다.
- 여러 페이지가 쓰는 틀 코드는 `packages/` 아래 npm 패키지로 두고 `cdn.jsdelivr.net/npm/<패키지>@<버전>/…` 으로 링크한다 (예: `packages/deck` → `@s-dante/artifact-deck`). 고치면 버전을 올려 `npm publish --access public` 후 HTML 링크 버전도 올린다.
- 발표 덱은 배포용 스킬 `skills/artifact-deck/` 의 템플릿(`assets/template.html`)을 `drafts/<이름>.html` 로 복사해 시작한다. 완성된 예는 `drafts/deck-example.html` (스킬 예제로의 심볼릭 링크).
- `npm run build` (또는 `npm run build -- drafts/x.html`) 가 로컬 스크립트를 인라인한 퍼블리시용 HTML 을 `dist/` 에 만든다. 퍼블리시는 `dist/` 파일로 한다.
- 같이 올릴 CSS/이미지/데이터는 `drafts/` 안에 두고 상대 경로로 참조 → 퍼블리시 때 `files` 로 함께 올린다.
- 초안 작성 규칙은 프로젝트 스킬 `.claude/skills/artifact-draft/SKILL.md`, 스크립트 분리 규칙은 `.claude/skills/html-authoring/SKILL.md` — Claude Code 가 HTML 을 만들 때 자동으로 따른다.

## 발표 덱 스킬 설치

`skills/artifact-deck/` 는 [skills CLI](https://github.com/vercel-labs/skills) 로 다른 프로젝트에 설치할 수 있는 스킬이다. 템플릿을 복사해 `<slide>` 태그로 덱을 쓰고, 틀 스크립트는 jsDelivr 의 `@s-dante/artifact-deck` 에서 받는다.

```bash
npx skills add s12171934/artifact-drafts --skill artifact-deck            # 현재 프로젝트
npx skills add s12171934/artifact-drafts --skill artifact-deck -g -a claude-code   # 전역, Claude Code 만
```

`.claude/skills/` 의 `artifact-draft`, `html-authoring` 은 이 저장소 전용이라 `metadata.internal: true` 로 설치 목록에서 숨겼다.
