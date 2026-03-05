# DemoFriday

Frontend demo workspace for a multi-agent chat UI.

## Quick Start

```bash
cd demo-app
npm install
npm run dev
```

## Repository Layout

- `demo-app/`: Vite + React app (main product code)
- `docs/`: project navigation docs for humans and AI agents
- `AGENTS.md`: root instructions for AI agents working in this repo

## Where To Start (Agents)

1. Read `AGENTS.md` at the repo root.
2. Read `docs/PROJECT_MAP.md` for file-level routing.
3. If editing app code, read `demo-app/AGENTS.md`.

## Primary App Files

- `demo-app/src/App.jsx`: top-level state, active agent, message flow
- `demo-app/src/i18n.js`: stable i18n export barrel
- `demo-app/src/i18n/`: split i18n modules (`languages`, `agents`, `translations`, `helpers`)
- `demo-app/src/components/Sidebar.jsx`: agent picker + language switch
- `demo-app/src/components/ChatPanel.jsx`: composer, file upload, stream
- `demo-app/src/components/MessageBubble.jsx`: rich text and attachment rendering
