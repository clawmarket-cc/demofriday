# AGENTS.md (demo-app)

App-local navigation guide for AI coding agents.

## First Files To Read

1. `src/App.jsx`
2. `src/i18n.js`
3. Relevant component in `src/components/`

## Core Responsibilities

- `App.jsx`
  - source of truth for selected language, selected agent, and per-agent conversation arrays
  - orchestrates send flow, backend transcript hydration, and status updates

- `api/openclawProxy.js`
  - HTTP client for `/agents` and `/chat`
  - assistant reply extraction and pending-run polling

- `i18n.js`
  - compatibility barrel that re-exports from `src/i18n/*`

- `i18n/languages.js`
  - language metadata (`languageOrder`, `languageCodes`, `localeByLanguage`)

- `i18n/agents.js`
  - agent definitions (id, color, icon/logo, status)

- `i18n/translations/*.js`
  - all UI copy and canned response strings per language

- `components/Sidebar.jsx`
  - agent selection UI
  - language switcher
  - conversation preview snippets

- `components/ChatPanel.jsx`
  - message composer
  - drag/drop and click upload
  - file validation by extension + MIME + max size

- `components/MessageBubble.jsx`
  - assistant/user bubble rendering
  - simplified markdown-like renderer (bold/code/table/list)
  - attachment card rendering

## Safe Change Checklist

- Keep language keys in sync across `en`, `de`, and `ru`.
- For new agent IDs, ensure every language contains matching `translations.<lang>.agents.<id>`.
- Preserve class names unless you are also updating `index.css`.
- After behavior changes, run `npm run build` (and `npm run lint` when relevant).
- Commit completed changes before handoff unless the user explicitly requests no commit.
