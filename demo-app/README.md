# demo-app

React + Vite frontend that simulates a multi-agent workspace (Excel, PDF, PowerPoint agents).

## Run

```bash
npm install
npm run dev
```

## Build and Quality

```bash
npm run build
npm run lint
npm run preview
```

## Structure

```text
src/
  main.jsx                # React bootstrap
  App.jsx                 # app-level state and orchestration
  i18n.js                 # stable export barrel
  i18n/                   # split i18n modules
    languages.js          # language metadata
    agents.js             # agent definitions and logos
    helpers.js            # i18n helper functions
    translations/         # per-language copy files
  index.css               # global styles and layout system
  components/
    Sidebar.jsx           # agent list, status, language switch
    ChatPanel.jsx         # chat stream, composer, file upload UX
    MessageBubble.jsx     # user/assistant message rendering
  assets/agent-icons/     # SVG logos used by agents
```

## Change Routing

- Update language metadata: `src/i18n/languages.js`
- Update agent metadata/icons: `src/i18n/agents.js`
- Update copy or canned responses: `src/i18n/translations/*.js`
- Update response simulation logic: `src/App.jsx`
- Update upload limits or file support: `src/components/ChatPanel.jsx`
- Update message markdown-like rendering: `src/components/MessageBubble.jsx`
- Update visual style/theme: `src/index.css`

## Notes

- Responses are currently simulated on the client (no backend/API integration in this app yet).
- Keep translation key shapes aligned across all language files to avoid undefined text at runtime.
