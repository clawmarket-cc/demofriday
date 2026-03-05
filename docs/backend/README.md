# OpenClaw UI Proxy Patch Package

This folder packages the backend changes that were deployed and verified on `demoserver` on March 5, 2026.

## Files

- `openclaw-ui-proxy-server.patch`
  - Unified diff against `/root/openclaw-ui-proxy/server.mjs.bak.20260305-212652`
  - Applies the async chat queueing/status/artifact flow used by the frontend

## What the patch changes

- Makes `POST /chat` queue runs asynchronously and return `202` immediately.
- Adds `runStatus` tracking for `queued`, `dispatching`, `running`, `completed`, and `error`.
- Adds `files.newArtifacts` to `GET /chat` so the UI can surface generated files before the run fully completes.
- Uses client-supplied conversation context (`clientMessageCount`, `clientLastAssistantText`) so `POST /chat` does not need a blocking history preflight.
- Caches configured agents in memory and warms them on startup so the first request after restart is fast.
- Strips the injected `[UI_FILE_CONTEXT]...[/UI_FILE_CONTEXT]` block back out of user history before returning messages to the frontend.
- Adds `DELETE /chat` cleanup for uploaded/generated file records and exchange directories.

## Live verification

Verified against `http://127.0.0.1:8787` on `demoserver`.

### Health

- `GET /agents` returned configured agents for:
  - `Excel Analyst`
  - `PDF Agent`
  - `PowerPoint Maker`
- `GET /health` returned `ok: true`

### Excel upload and analysis

Test workbook: `/tmp/ui-debug.xlsx`

Flow verified:

1. `POST /files` uploaded the workbook and returned a valid file id.
2. `POST /chat` for `Excel Analyst` returned `202` in about `0.0126s`.
3. `GET /chat` transitioned through:
   - `queued`
   - `dispatching`
   - `running`
4. The Excel agent generated `summary.txt`, and `GET /chat` exposed it in `files.newArtifacts` while the run was still active.
5. `GET /files/:fileId` downloaded the generated artifact successfully.

Downloaded artifact contents:

```text
Revenue Analysis Summary
========================

Total Revenue: 380
Highest Month: February (150)
```

## Important behavior note

Uploading a file does not guarantee a returned artifact.

- If the prompt only asks the agent to analyze the file, the backend may return assistant text only.
- If the prompt asks the agent to create an output file in the provided output directory, the backend returns that generated file through `files.newArtifacts` / `files.artifacts`.

## Deploy procedure used

```bash
scp /path/to/server.mjs demoserver:/root/openclaw-ui-proxy/server.mjs
ssh demoserver 'node --check /root/openclaw-ui-proxy/server.mjs'
ssh demoserver 'systemctl restart openclaw-ui-proxy'
ssh demoserver 'systemctl is-active openclaw-ui-proxy'
```
