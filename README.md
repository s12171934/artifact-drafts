# Artifact drafts

아티팩트로 퍼블리시하기 전에 HTML 초안을 로컬에서 확인하는 환경.

```bash
npm run serve             # http://localhost:5178  (PORT=xxxx npm run serve 로 변경)
```

- `drafts/` 아래 `.html` 을 만들면 목록에 뜨고, 저장하면 자동 새로고침된다.
- 초안은 아티팩트 규칙대로 **본문만** 쓴다 (`<!doctype>`/`<html>`/`<head>`/`<body>` 없이 `<title>` + `<style>` 부터). 서버가 퍼블리시 스켈레톤(charset·viewport·리셋)을 씌운다.
- 퍼블리시 환경과 같은 CSP 허용목록을 헤더로 건다 — cdnjs / jsdelivr npm / tailwind play CDN / code.jquery 스크립트, Google Fonts 만 허용. 막힌 리소스는 DevTools 콘솔에 CSP 위반으로 보인다.
- 상단 바에서 테마(system/light/dark → `data-theme` 스탬프)와 폭(full/tablet/phone 400px)을 바꿔 본다.
- 같이 올릴 JS/CSS/이미지는 `drafts/` 안에 두고 상대 경로로 참조 → 퍼블리시 때 `files` 로 함께 올린다.
- 초안 작성 규칙은 프로젝트 스킬 `.claude/skills/artifact-draft/SKILL.md` — Claude Code 가 HTML 을 만들 때 자동으로 따른다.
