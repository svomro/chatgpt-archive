# ChatGPT Archive — Handoff

## 现在要做什么

这个仓库取代“官方导出后再补附件”的流程，直接从已登录的 ChatGPT 网页 API 保存：

- 原始 conversation JSON，不注入本地路径或 data URI；
- 个人对话与 Projects 内对话；
- 用户上传、ChatGPT 生图、分支图片、Code Interpreter 产物、音视频和 Project/library 文件；
- 每个对话的 `attachments-manifest.json`，记录引用、落盘文件、hash、失败原因与未解析项。

安装入口是 `dist/chatgpt-archive.user.js`。在 Tampermonkey 中替换脚本后，打开 ChatGPT，点击浮动的 **Archive**，选择父目录；脚本会在里面创建 `ChatGPT/`。

## 已验证的真实样本

- 对话：`https://chatgpt.com/g/g-p-694ee0bfad9081919f1398653ee7cb4c/c/6a190de9-8278-83e8-b483-eea9f9c6045a`
- 落盘目录：`/Users/umo/Record/ChatGPT/structure`
- 最近一次完整结果：Project 1、对话 1、完整 1、失败附件 0、失败对话 0；64 个附件引用均已存在或下载。
- Viewer 已能关联该样本里的文档、CoT 中间图片、SVG、HTML、Markdown 和视频；原始附件文件名必须继续保留 file ID / message UUID，不能只用展示名。

## 当前这次修复

Code Interpreter 的 `/interpreter/download?...` 有时不直接返回文件，而是先返回：

```json
{
  "status": "success",
  "download_url": "https://chatgpt.com/backend-api/estuary/content?..."
}
```

旧代码会把这段 JSON 当成 `.html` 保存，所以 Viewer 打开时看起来像乱码。当前改动会：

1. 识别 JSON download descriptor；
2. 带当前登录态继续请求 `download_url`；
3. 允许这个受信任的二跳响应是 HTML（HTML 本身是合法 Interpreter 产物）；
4. 检测并替换磁盘上已存在的“JSON descriptor 假 HTML”，避免因为文件已存在而永久跳过修复。

相关代码：

- `src/archive/download.ts`
- `src/chatgpt/api.ts`
- 对应测试：`src/archive/download.test.ts`、`src/chatgpt/api.test.ts`

## 还没结束的部分

- Project 页单独的 **Sources** collection 还没有拿到“有内容”的真实 API 样本。当前会保存 `project.json` 并递归扫描，但 `project-attachments-manifest.json` 会保留 coverage warning，不应误标完整。
- 新 ChatGPT 前端若改附件字段或下载端点，优先对照 `source-upstream` / `exporter-upstream` 的最新 commit，按小 patch 搬 API 兼容修复，不要把不需要的导出 UI 和格式重新引入。
- 任意附件修复都要同时检查：发现引用、文件命名、实际字节下载、已有坏文件替换、manifest 完整性，以及 `dist/chatgpt-archive.user.js` 是否重新构建。

## 下个窗口建议顺序

```bash
cd /Users/umo/work/private/chatgpt-archive
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

然后把新生成的 `dist/chatgpt-archive.user.js` 放进 Tampermonkey，用上面的真实样本再跑一遍。重点打开之前异常的 HTML / Markdown / MOV，并确认：

- HTML 内容是真实文档，不是带 `download_url` 的 JSON；
- 重跑会把旧的假 HTML 替换掉；
- `attachments-manifest.json` 中该项为 `downloaded` 或后续正常的 `existing`；
- Project / 对话完整数没有回退。

## Git 关系

- `origin`: `svomro/chatgpt-archive`
- `exporter-upstream`: `svomro/chatgpt-exporter`
- `source-upstream`: `pionxzh/chatgpt-exporter`
- 当前工作分支：`codex/project-sources`

仓库刻意保留 `chatgpt-exporter` 的共同历史，方便以后查看上游 commit 并摘取兼容性修复。
