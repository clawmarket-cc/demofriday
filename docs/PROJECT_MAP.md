# Project Map

This map is optimized for quick codebase navigation by AI agents and new contributors.

## High-Level Tree

```text
DemoFriday/
  AGENTS.md
  README.md
  docs/
    PROJECT_MAP.md
    backend/
      README.md
      openclaw-ui-proxy-server.patch
  demo-app/
    AGENTS.md
    README.md
    package.json
    src/
      App.jsx
      api/
        openclawProxy.js
      i18n.js
      i18n/
        agents.js
        helpers.js
        languages.js
        translations/
          en.js
          de.js
          ru.js
          index.js
      index.css
      main.jsx
      components/
        Sidebar.jsx
        ChatPanel.jsx
        MessageBubble.jsx
      assets/agent-icons/
```

## Runtime Entry Points

- `demo-app/src/main.jsx`
  - Bootstraps React and mounts `App`.
- `demo-app/src/App.jsx`
  - Owns selected language, selected agent, and conversation state.
  - Composes `Sidebar` and `ChatPanel`.

## Core Functional Areas

- Agent and language data:
  - `demo-app/src/i18n.js`: compatibility export surface used by app imports.
  - `demo-app/src/i18n/languages.js`: language order/codes and locale mapping.
  - `demo-app/src/i18n/agents.js`: agent definitions and icon wiring.
  - `demo-app/src/i18n/translations/*.js`: per-language copy payloads.
  - `demo-app/src/i18n/helpers.js`: `buildAgents` and `getAssistantMessageText`.

- Conversation layout and interactions:
  - `demo-app/src/components/Sidebar.jsx`: switch active agent, language selector, list preview.
  - `demo-app/src/components/ChatPanel.jsx`: input, file attach/drag-drop, validation, stream shell.
  - `demo-app/src/components/MessageBubble.jsx`: render markdown-like text and attachment cards.

- Backend integration:
  - `demo-app/src/api/openclawProxy.js`: calls `/agents`, `/chat`, polling logic, payload normalization.
  - `demo-app/src/App.jsx`: orchestrates send flow, polling, lane availability, transcript hydration.

- Backend patch package:
  - `docs/backend/README.md`: deployment notes and live verification for the OpenClaw UI proxy changes.
  - `docs/backend/openclaw-ui-proxy-server.patch`: backend `server.mjs` patch for async queueing, run status, and artifact return flow.

- Visual system:
  - `demo-app/src/index.css`
  - Global styles, layout, theme variables, component classes.

## Fast Edit Guide

- Add/rename an agent:
  - `i18n/agents.js`: update `agentDefinitions`
  - `i18n/translations/*.js`: add `agents.<id>` in each language file

- Add a new language:
  - `i18n/languages.js`: `languageOrder`, `languageCodes`, `localeByLanguage`
  - `i18n/translations/<lang>.js`: full translation payload
  - `i18n/translations/index.js`: register new language export

- Change upload rules:
  - `ChatPanel.jsx`: `MAX_FILE_SIZE_BYTES`, accepted extensions/MIME, validation messages

- Change rich text rendering:
  - `MessageBubble.jsx`: `renderText` and `renderInline`

- Change layout/look:
  - `index.css` plus class names used in `Sidebar` and `ChatPanel`

## Known Structural Notes

- `i18n.js` is a stable barrel so existing imports stay simple while internals stay modular.
- Chat responses are backend-driven via the OpenClaw proxy contract.
