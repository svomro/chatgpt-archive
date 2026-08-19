# ChatGPT Archive

A focused userscript that reads ChatGPT's website API and saves:

- untouched raw conversation JSON;
- conversations from the personal list and every Project;
- first-party uploads, generated images, branch images, Code Interpreter output, audio/video assets, and Project/library files;
- a per-conversation attachment manifest with hashes and unresolved references.

The repository keeps the history of `pionxzh/chatgpt-exporter`. Its remotes are:

- `exporter-upstream`: the personal `svomro/chatgpt-exporter` fork;
- `source-upstream`: the original project.

That shared history makes later API compatibility fixes easy to inspect and port without bringing back unrelated export formats.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

`pnpm build` produces two independent Tampermonkey scripts:

- `dist/chatgpt-archive.user.js` — the normal conversation/attachment archiver;
- `dist/chatgpt-live-stream.user.js` — the live SSE/WebSocket recorder, loaded at `document-start` with `@grant none`.

Install either one or both. They stay separate because the live recorder must patch the page's native `fetch`, `WebSocket`, and `EventSource` before ChatGPT starts them.

## Mobile stream recorder

For the iOS app, `tools/mobile_mitm_recorder.py` records ChatGPT SSE/conversation responses at the HTTP proxy layer. Each response chunk is appended to disk before the unchanged chunk is forwarded to the app.

Install mitmproxy once:

```bash
brew install --cask mitmproxy
```

Start the recorder:

```bash
./scripts/start-mobile-recorder.sh
```

By default it binds to the Mac's `en0` address on port `8080` and writes captures under `~/ChatGPT-Stream-Captures/`. Point the iPhone at that HTTP proxy, open `http://mitm.it` in Safari, install the iOS CA profile, then enable full trust for the mitmproxy root certificate under **Settings → General → About → Certificate Trust Settings**.

Captured flows contain:

```text
~/ChatGPT-Stream-Captures/YYYY-MM-DD/<flow>/
├── meta.json
├── raw.sse
└── result.json
```

`Authorization`, `Cookie`, proxy authorization, and `Set-Cookie` header values are redacted from `meta.json`. The raw streamed response body is preserved untouched in `raw.sse`.

## Output

```text
ChatGPT/
└── [account@example.com]/
    ├── account.json
    ├── [Original]_[Conversation title]_[conversation-id]/
    │   ├── history-2026-07-04T00-42-35.json
    │   ├── attachments-manifest.json
    │   └── original-name_[file-id].png
    └── [Project]_[Project name]_[g-p-id]/
        ├── project.json
        └── [Original]_[Conversation title]_[conversation-id]/
            └── ...
```

Raw JSON is never rewritten with data URIs or local paths. `attachments-manifest.json` maps original references to local files.

Structural Reference：`f14XuanLv/Claude-Powerest-Manager_Enhancer`

## Current limitation

ChatGPT exposes a separate **Sources** collection on Project pages. The current account's inspected Project had no Sources, so its populated API response shape is still unknown. `project.json` is preserved and recursively scanned, but every `project-attachments-manifest.json` carries a coverage warning and is not marked complete until that separate collection is implemented and tested. Conversation attachments are unaffected by this warning.

Arbitrary external images from web-search results are intentionally not mirrored. They are web citations, not first-party ChatGPT attachments.
