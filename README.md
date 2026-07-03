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

Install `dist/chatgpt-archive.user.js` in Tampermonkey. On ChatGPT, use the floating **Archive** button and choose the parent directory where the script should create `ChatGPT/`.

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

## Current limitation

ChatGPT exposes a separate **Sources** collection on Project pages. The current account's inspected Project had no Sources, so its populated API response shape is still unknown. `project.json` is preserved and recursively scanned, but every `project-attachments-manifest.json` carries a coverage warning and is not marked complete until that separate collection is implemented and tested. Conversation attachments are unaffected by this warning.

Arbitrary external images from web-search results are intentionally not mirrored. They are web citations, not first-party ChatGPT attachments.
