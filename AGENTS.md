# AGENTS.md

Purpose: make this repository fast to navigate for coding agents.

## Scope

- Main code lives in `demo-app/`.
- This repo currently contains one frontend app and no backend service.

## Recommended Read Order

1. `README.md` (repo overview)
2. `docs/PROJECT_MAP.md` (file-level map)
3. `demo-app/AGENTS.md` (app-specific guidance)
4. Then only open files relevant to the task

## Command Map

```bash
cd demo-app
npm run dev      # local dev server
npm run build    # production build
npm run lint     # eslint
npm run preview  # preview production build
```

## Task -> File Routing

- Change app-level state flow: `demo-app/src/App.jsx`
- Change agent list and top-left panel UI: `demo-app/src/components/Sidebar.jsx`
- Change message composer or file upload behavior: `demo-app/src/components/ChatPanel.jsx`
- Change message rendering (lists/code/tables/attachments): `demo-app/src/components/MessageBubble.jsx`
- Change language metadata: `demo-app/src/i18n/languages.js`
- Change agent definitions/icons: `demo-app/src/i18n/agents.js`
- Change copy or canned responses: `demo-app/src/i18n/translations/`
- Change visual theme/layout: `demo-app/src/index.css`

## Working Rules For Agents

- Keep edits scoped; avoid unrelated formatting churn.
- Do not rename core files unless task explicitly requests restructuring.
- Preserve copy key shapes in `src/i18n/translations/*.js` across all languages.
- When adding a new agent, update both `agentDefinitions` and each language in `translations`.
- Run at least `npm run build` after behavior changes.
- Always commit completed changes before handoff unless the user explicitly says not to commit.
