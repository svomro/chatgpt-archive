# Porting changes from ChatGPT Exporter

This repository starts from the `chatgpt-exporter` Git history instead of an unrelated initial commit.

```bash
git fetch exporter-upstream
git fetch source-upstream
git show <upstream-commit>
```

Do not cherry-pick UI/export-format changes blindly. Port only the relevant pieces:

| Upstream area | This repository |
|---|---|
| `src/api.ts` authentication and endpoint fixes | `src/chatgpt/api.ts` |
| conversation/project response types | `src/chatgpt/types.ts` |
| rate-limit behavior | `src/chatgpt/api.ts`, `src/archive/download.ts` |
| export dialog compatibility | `src/ui.ts` |

Attachment discovery belongs only to `src/archive/discover.ts`. Directory and filename behavior belongs only to `src/archive/naming.ts` and `src/archive/writer.ts`. This separation keeps ordinary upstream fixes from becoming mixed with archive-specific behavior.

After porting a change:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```
