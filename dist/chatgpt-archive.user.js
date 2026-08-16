// ==UserScript==
// @name         ChatGPT Archive
// @namespace    svomro
// @version      0.1.1
// @author       svomro
// @description  Archive raw ChatGPT JSON and all first-party attachments.
// @license      MIT
// @icon         https://chatgpt.com/favicon.ico
// @downloadURL  https://raw.githubusercontent.com/svomro/chatgpt-archive/main/dist/chatgpt-archive.user.js
// @updateURL    https://raw.githubusercontent.com/svomro/chatgpt-archive/main/dist/chatgpt-archive.user.js
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(e=>{if(typeof GM_addStyle=="function"){GM_addStyle(e);return}const a=document.createElement("style");a.textContent=e,document.head.append(a)})(" #chatgpt-archive-root{position:relative;z-index:2147483647;display:flex;flex:0 0 auto;align-items:center;color:inherit;font:13px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}#chatgpt-archive-root[data-docked=false]{display:none}#chatgpt-archive-root button{border:0;border-radius:9px;cursor:pointer;font:inherit}#chatgpt-archive-root button:disabled{cursor:not-allowed;opacity:.45}.cga-launch{position:relative;display:inline-flex;width:36px;height:36px;align-items:center;justify-content:center;padding:0;background:transparent;color:inherit}.cga-launch:hover,.cga-launch:focus-visible{background:var(--token-interactive-bg-secondary-hover, rgb(0 0 0 / .08));color:var(--text-primary, #0d0d0d)}.cga-launch svg{display:block}.cga-launch:after{position:absolute;bottom:calc(100% + 8px);left:50%;z-index:2147483647;padding:5px 8px;border-radius:6px;background:#171717;color:#fff;content:attr(data-tooltip);font-size:12px;line-height:1;opacity:0;pointer-events:none;transform:translate(-50%) translateY(3px);transition:opacity .12s ease,transform .12s ease;white-space:nowrap}.cga-launch:hover:after,.cga-launch:focus-visible:after{opacity:1;transform:translate(-50%) translateY(0)}.cga-panel{position:fixed;bottom:72px;left:8px;z-index:2147483647;box-sizing:border-box;width:min(520px,calc(100vw - 16px));max-height:calc(100vh - 88px);padding:16px;overflow-y:auto;overscroll-behavior:contain;border:1px solid #d1d5db;border-radius:14px;background:#fff;color:#1f2937;box-shadow:0 15px 45px #0003}.cga-head,.cga-toolbar,.cga-selection-toolbar,.cga-actions{display:flex;align-items:center;gap:8px}.cga-head{justify-content:space-between}.cga-head strong{font-size:15px}.cga-toolbar{flex-wrap:wrap;margin-top:12px;padding:8px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb}.cga-source,.cga-search{min-width:0;padding:6px 8px;border:1px solid #d1d5db;border-radius:7px;background:#fff;color:inherit;font:inherit}.cga-source{max-width:210px}.cga-source-loading{display:inline-flex;align-items:center;gap:5px;color:#6b7280;font-size:12px;white-space:nowrap}.cga-source-loading[hidden]{display:none}.cga-spinner{width:13px;height:13px;border:2px solid #d1d5db;border-top-color:#10a37f;border-radius:50%;animation:cga-spin .7s linear infinite}@keyframes cga-spin{to{transform:rotate(360deg)}}.cga-search{flex:1 1 160px}.cga-search-help{display:flex;flex:1 0 100%;align-items:center;gap:5px;color:#6b7280;font-size:11px}.cga-copy-separator{padding:2px 7px;background:#e5e7eb;color:#111827;font-weight:600;-webkit-user-select:all;user-select:all}.cga-selection-toolbar{padding:8px 2px}.cga-selection-toolbar label{display:inline-flex;align-items:center;gap:6px;cursor:pointer}.cga-selected-count{margin-left:auto;color:#6b7280}.cga-refresh{margin-left:auto;padding:5px 9px;background:#e5e7eb;color:#111827}.cga-list-header,.cga-conversation{display:grid;min-width:0;grid-template-columns:15px minmax(0,1fr) 76px 76px;align-items:center;gap:9px}.cga-list-header{padding:5px 8px;color:#6b7280;font-size:11px}.cga-list-header button{overflow:hidden;padding:2px 0;background:transparent;color:inherit;font-size:inherit;text-align:left;text-overflow:ellipsis;white-space:nowrap}.cga-list-header .cga-sort-active{color:#047857;font-weight:600}.cga-selection-list{max-height:min(52vh,520px);overflow:auto;overscroll-behavior:contain;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb}.cga-list-message{margin:18px 0;color:#6b7280;text-align:center}.cga-list-error{color:#b91c1c}.cga-conversation{padding:7px 8px;border-radius:8px;cursor:pointer}.cga-conversation:hover{background:#f3f4f6}.cga-conversation-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cga-conversation-date{overflow:hidden;color:#6b7280;font-size:10.5px;text-overflow:ellipsis;white-space:nowrap}.cga-conversation-date.cga-date-active{color:#047857}.cga-selection-toolbar input,.cga-conversation input{width:15px;height:15px;flex:0 0 auto;accent-color:#10a37f}.cga-page-actions{display:flex;justify-content:center;gap:8px;margin-top:10px}.cga-page-actions button{padding:6px 12px;background:#e5e7eb;color:#111827}.cga-page-actions button[hidden]{display:none}.cga-close{width:28px;height:28px;background:transparent;color:inherit;font-size:20px!important}.cga-actions{flex-wrap:wrap;margin:12px 0}.cga-actions button{padding:7px 10px;background:#e5e7eb;color:#111827}.cga-actions .cga-export{background:#10a37f;color:#fff}.cga-actions .cga-cancel{background:#fee2e2;color:#991b1b}.cga-log-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.cga-log-head strong{font-size:12px}.cga-log-actions{display:flex;gap:6px}.cga-log-actions button{padding:5px 9px;background:#e5e7eb;color:#111827}.cga-status{min-height:110px;max-height:240px;margin:6px 0 0;padding:10px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;color:inherit;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;white-space:pre-wrap;word-break:break-word;-webkit-user-select:text;user-select:text}.cga-progress{width:100%;margin-top:9px}.cga-tone-success .cga-status{color:#15803d}.cga-tone-warning .cga-status{color:#b45309}.cga-tone-error .cga-status{color:#b91c1c}@media(prefers-color-scheme:dark){.cga-panel{border-color:#4b5563;background:#202123;color:#e5e7eb}.cga-toolbar,.cga-selection-list{border-color:#374151}.cga-source,.cga-search{border-color:#4b5563;background:#202123;color:#e5e7eb}.cga-selected-count,.cga-source-loading,.cga-search-help,.cga-list-message,.cga-conversation-date,.cga-list-header{color:#9ca3af}.cga-list-header .cga-sort-active,.cga-conversation-date.cga-date-active{color:#34d399}.cga-list-error{color:#f87171}.cga-conversation:hover{background:#2f3033}.cga-refresh,.cga-copy-separator,.cga-log-actions button,.cga-page-actions button{background:#374151;color:#f9fafb}.cga-status{border-color:#374151;background:#171717}.cga-actions button{background:#374151;color:#f9fafb}.cga-actions .cga-export{background:#10a37f;color:#fff}.cga-tone-success .cga-status{color:#4ade80}.cga-tone-warning .cga-status{color:#fbbf24}.cga-tone-error .cga-status{color:#f87171}} ");

(function () {
  'use strict';

  var _unsafeWindow = /* @__PURE__ */ (() => typeof unsafeWindow != "undefined" ? unsafeWindow : void 0)();
  const origin = location.origin;
  const apiBase = `${origin}/backend-api`;
  class ApiError extends Error {
    constructor(message, status, retryAfterMs = 0) {
      super(message);
      this.status = status;
      this.retryAfterMs = retryAfterMs;
      this.name = "ApiError";
    }
  }
  let sessionPromise = null;
  let accountIdPromise = null;
  function cookie(name) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : "";
  }
  async function session() {
    var _a, _b, _c, _d, _e, _f, _g;
    const pageSession = ((_e = (_d = (_c = (_b = (_a = _unsafeWindow == null ? void 0 : _unsafeWindow.__remixContext) == null ? void 0 : _a.state) == null ? void 0 : _b.loaderData) == null ? void 0 : _c.root) == null ? void 0 : _d.clientBootstrap) == null ? void 0 : _e.session) ?? ((_g = (_f = _unsafeWindow == null ? void 0 : _unsafeWindow.__NEXT_DATA__) == null ? void 0 : _f.props) == null ? void 0 : _g.pageProps);
    if ((pageSession == null ? void 0 : pageSession.accessToken) && (pageSession == null ? void 0 : pageSession.user)) return pageSession;
    sessionPromise ?? (sessionPromise = fetch(`${origin}/api/auth/session`, { credentials: "include" }).then(async (response) => {
      if (!response.ok) throw new ApiError(`Session request failed: ${response.status}`, response.status);
      return response.json();
    }));
    return sessionPromise;
  }
  async function activeAccountId(accessToken) {
    accountIdPromise ?? (accountIdPromise = (async () => {
      var _a, _b, _c;
      const workspace = cookie("_account");
      if (!workspace) return null;
      const response = await fetch(`${apiBase}/accounts/check/v4-2023-04-27`, {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Authorization": `Bearer ${accessToken}`
        }
      });
      if (!response.ok) throw new ApiError(`Account scope request failed: ${response.status}`, response.status);
      const payload = await response.json();
      return ((_c = (_b = (_a = payload == null ? void 0 : payload.accounts) == null ? void 0 : _a[workspace]) == null ? void 0 : _b.account) == null ? void 0 : _c.account_id) ?? null;
    })());
    return accountIdPromise;
  }
  async function headers() {
    const currentSession = await session();
    const accessToken = currentSession.accessToken;
    const accountId = await activeAccountId(accessToken);
    return {
      Authorization: `Bearer ${accessToken}`,
      "X-Authorization": `Bearer ${accessToken}`,
      ...accountId ? { "Chatgpt-Account-Id": accountId } : {}
    };
  }
  function retryAfter(response) {
    const value = response.headers.get("retry-after");
    if (!value) return 0;
    const seconds = Number.parseInt(value, 10);
    return Number.isFinite(seconds) ? seconds * 1e3 : 0;
  }
  function wait(milliseconds, signal) {
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(resolve, milliseconds);
      signal == null ? void 0 : signal.addEventListener("abort", () => {
        globalThis.clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }
  async function fetchJson(path, signal) {
    let lastError;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      signal == null ? void 0 : signal.throwIfAborted();
      try {
        const response = await fetch(path.startsWith("http") ? path : `${apiBase}${path}`, {
          credentials: "include",
          headers: await headers(),
          signal
        });
        if (response.ok) return response.json();
        const error = new ApiError(
          `${response.status} ${response.statusText}: ${path}`,
          response.status,
          retryAfter(response)
        );
        lastError = error;
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        if (!retryable || attempt === 5) throw error;
        await wait(error.retryAfterMs || Math.min(1e3 * 2 ** (attempt - 1), 15e3), signal);
      } catch (error) {
        lastError = error;
        if ((signal == null ? void 0 : signal.aborted) || error instanceof ApiError || attempt === 5) throw error;
        await wait(Math.min(1e3 * 2 ** (attempt - 1), 15e3), signal);
      }
    }
    throw lastError;
  }
  async function getAccountProfile() {
    const currentSession = await session();
    const user = currentSession.user ?? {};
    return {
      id: String(user.id ?? ""),
      email: String(user.email ?? user.name ?? "unknown-account"),
      name: String(user.name ?? ""),
      accountId: await activeAccountId(currentSession.accessToken)
    };
  }
  function projectFromItem(item) {
    var _a, _b, _c;
    const project = ((_a = item == null ? void 0 : item.gizmo) == null ? void 0 : _a.gizmo) ?? (item == null ? void 0 : item.gizmo) ?? item;
    const id = project == null ? void 0 : project.id;
    if (typeof id !== "string" || !id) return null;
    return {
      id,
      name: String(((_b = project == null ? void 0 : project.display) == null ? void 0 : _b.name) ?? (project == null ? void 0 : project.name) ?? id),
      description: String(((_c = project == null ? void 0 : project.display) == null ? void 0 : _c.description) ?? (project == null ? void 0 : project.description) ?? ""),
      raw: item
    };
  }
  async function fetchProjects(signal) {
    const projects = [];
    let cursor = null;
    const seenCursors = /* @__PURE__ */ new Set();
    do {
      const params = new URLSearchParams({ conversations_per_gizmo: "0" });
      if (cursor != null) params.set("cursor", String(cursor));
      const page = await fetchJson(
        `/gizmos/snorlax/sidebar?${params}`,
        signal
      );
      for (const [index, item] of (page.items ?? []).entries()) {
        const project = projectFromItem(item);
        if (!project) throw new Error(`Project sidebar item missing ID at index ${index}`);
        projects.push(project);
      }
      cursor = page.cursor ?? null;
      if (cursor != null) {
        const key = String(cursor);
        if (seenCursors.has(key)) throw new Error(`Project pagination repeated cursor: ${key}`);
        seenCursors.add(key);
      }
    } while (cursor != null);
    return projects;
  }
  async function fetchConversationList(projectId, signal, archived = false) {
    const items = [];
    let offset = 0;
    let cursor = 0;
    const seenCursors = /* @__PURE__ */ new Set();
    while (true) {
      const page = await fetchConversationPage(projectId, signal, { archived, offset, cursor });
      items.push(...page.items);
      if (!page.hasMore) break;
      offset = page.nextOffset;
      cursor = page.nextCursor;
      if (projectId && cursor != null) {
        const key = String(cursor);
        if (seenCursors.has(key)) throw new Error(`Conversation pagination repeated cursor: ${key}`);
        seenCursors.add(key);
      }
    }
    return items;
  }
  async function fetchConversationPage(projectId, signal, options = {}) {
    const limit = options.limit ?? (projectId ? 50 : 100);
    const offset = options.offset ?? 0;
    const cursor = options.cursor ?? 0;
    if (projectId) {
      const params2 = new URLSearchParams({ limit: String(limit), cursor: String(cursor) });
      const page2 = await fetchJson(`/gizmos/${encodeURIComponent(projectId)}/conversations?${params2}`, signal);
      const items2 = page2.items ?? [];
      const nextCursor = page2.cursor ?? null;
      return {
        items: items2,
        total: null,
        nextOffset: offset + items2.length,
        nextCursor,
        hasMore: items2.length > 0 && nextCursor != null
      };
    }
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      order: "updated",
      hide_snorlax: "true",
      ...options.archived ? { is_archived: "true" } : {}
    });
    const page = await fetchJson(`/conversations?${params}`, signal);
    const items = page.items ?? [];
    const total = page.total ?? null;
    const nextOffset = offset + items.length;
    return {
      items,
      total,
      nextOffset,
      nextCursor: null,
      hasMore: items.length > 0 && (total == null ? items.length >= limit : nextOffset < total)
    };
  }
  async function fetchAllConversationRecords(projects, signal) {
    const byId = /* @__PURE__ */ new Map();
    for (const item of await fetchConversationList(null, signal)) {
      byId.set(item.id, { item, project: null });
    }
    for (const item of await fetchConversationList(null, signal, true)) {
      byId.set(item.id, { item, project: null });
    }
    for (const project of projects) {
      for (const item of await fetchConversationList(project.id, signal)) {
        byId.set(item.id, { item, project });
      }
    }
    return [...byId.values()].sort((left, right) => {
      return toTimestamp(right.item.update_time ?? right.item.create_time) - toTimestamp(left.item.update_time ?? left.item.create_time);
    });
  }
  async function fetchArchiveCatalog(signal) {
    const projects = await fetchProjects(signal);
    return {
      projects,
      records: await fetchAllConversationRecords(projects, signal)
    };
  }
  function toTimestamp(value) {
    if (typeof value === "number") return value * 1e3;
    if (typeof value === "string") return Date.parse(value) || 0;
    return 0;
  }
  async function fetchConversation(id, signal) {
    const raw = await fetchJson(`/conversation/${encodeURIComponent(id)}`, signal);
    if (!raw.id) raw.id = id;
    return raw;
  }
  async function resolveFileDownload(fileId, signal) {
    const params = new URLSearchParams({ post_id: "", inline: "false" });
    try {
      return await fetchJson(`/files/download/${encodeURIComponent(fileId)}?${params}`, signal);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      return fetchJson(
        `/files/download/${encodeURIComponent(fileId)}?download_intent=true`,
        signal
      );
    }
  }
  async function fetchFileResponse(url, signal, allowHtml = false) {
    const parsedUrl = new URL(url, origin);
    const isBackendApi = parsedUrl.origin === origin && parsedUrl.pathname.startsWith("/backend-api/");
    const response = await fetch(url, {
      credentials: "include",
      headers: isBackendApi ? await headers() : void 0,
      signal
    });
    if (!response.ok) {
      throw new ApiError(
        `${response.status} ${response.statusText}: file download`,
        response.status,
        retryAfter(response)
      );
    }
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const disposition = response.headers.get("content-disposition") ?? "";
    const isInterpreterDownload = url.includes("/interpreter/download?");
    if (contentType.includes("text/html") && !allowHtml && !isInterpreterDownload && !/\battachment\b/i.test(disposition)) {
      throw new Error("File endpoint returned HTML instead of an attachment");
    }
    return response;
  }
  const SEARCH_SEPARATOR = "";
  function timeValue(value) {
    if (typeof value === "number") return value * 1e3;
    if (typeof value === "string") return Date.parse(value) || 0;
    return 0;
  }
  function sortConversationRecords(records, field, direction) {
    const multiplier = direction === "asc" ? 1 : -1;
    return [...records].sort((left, right) => {
      if (field === "title") {
        return multiplier * left.item.title.localeCompare(right.item.title);
      }
      return multiplier * (timeValue(field === "update_time" ? left.item.update_time : left.item.create_time) - timeValue(field === "update_time" ? right.item.update_time : right.item.create_time));
    });
  }
  function matchesConversationSearch(item, query) {
    const terms = query.split(SEARCH_SEPARATOR).map((term) => term.trim().toLocaleLowerCase()).filter(Boolean);
    if (!terms.length) return true;
    const title = item.title.toLocaleLowerCase();
    const id = item.id.toLocaleLowerCase();
    return terms.some((term) => title.includes(term) || id.includes(term));
  }
  function selectConversationRecords(records, selectedIds) {
    const selected = new Set(selectedIds);
    return records.filter((record) => selected.has(record.item.id));
  }
  const FILE_ID_RE = new RegExp("(?<![A-Za-z0-9])(?:file_[A-Za-z0-9]{16,}|file-(?!service\\b)[A-Za-z0-9]{16,})", "gi");
  const LIBRARY_ID_RE = /libfile_[A-Za-z0-9]{16,}/gi;
  const POINTER_RE = /(?:sediment|file-service):\/\/(?=file[_-]|libfile_)[^\s\])}"'$]+/gi;
  const MY_FILES_RE = /file:\/\/my_files\/[^\s\])}"']+/gi;
  const SANDBOX_RE = /sandbox:\/[^\s\])}"']+/gi;
  const DATA_IMAGE_RE = /data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi;
  const FIRST_PARTY_URL_RE = /https:\/\/[^\s\])}"']+/gi;
  function strings(value) {
    return typeof value === "string" && value.trim() ? [value.trim()] : [];
  }
  function number(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
  }
  function hintsFromObject(value, inherited) {
    const name = strings(value.name)[0] ?? strings(value.file_name)[0] ?? strings(value.filename)[0] ?? inherited.name;
    const mimeType = strings(value.mime_type)[0] ?? strings(value.mimeType)[0] ?? strings(value.mimetype)[0] ?? strings(value.media_type)[0] ?? inherited.mimeType;
    const expectedSize = number(value.size_bytes) ?? number(value.file_size_bytes) ?? number(value.file_size) ?? number(value.size) ?? inherited.expectedSize;
    return { name, mimeType, expectedSize };
  }
  function classify(path, context) {
    const lower = path.toLowerCase();
    if (lower.includes("audio_asset_pointer")) return "audio";
    if (lower.includes("video_container_asset_pointer") || lower.includes("frames_asset_pointers")) return "video";
    if (lower.includes("aggregate_result") || lower.includes("jupyter_messages")) return "cot-output";
    if (lower.includes("image_gen") || lower.includes(".dalle")) return "image-input";
    if (lower.includes("library_file_id") || lower.includes("file_search") || lower.includes("citation")) return "library-file";
    if (lower.includes(".metadata.attachments[") && context.role === "user") return "user-upload";
    if (lower.includes("asset_pointer") && context.generatedMessage) return "generated-image";
    if (lower.includes("sandbox:")) return "sandbox-file";
    return "attachment";
  }
  function hashText(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  function basename$1(value) {
    const clean = value.split(/[?#]/, 1)[0];
    return clean.slice(clean.lastIndexOf("/") + 1);
  }
  function isFirstPartyFileUrl(value) {
    try {
      const host = new URL(value).hostname.toLowerCase();
      return host.endsWith(".oaiusercontent.com") || host === "files.oaiusercontent.com" || host.endsWith(".openai.com") && value.includes("/files/");
    } catch {
      return false;
    }
  }
  function generatedMessage(message) {
    var _a, _b, _c;
    const metadata = message.metadata ?? {};
    const parts = Array.isArray((_a = message.content) == null ? void 0 : _a.parts) ? message.content.parts : [];
    return metadata.async_task_type === "image_gen" || metadata.image_gen != null || metadata.dalle != null || ((_b = message.author) == null ? void 0 : _b.name) === "dalle" || ((_c = message.author) == null ? void 0 : _c.name) === "image_gen" || parts.some((part) => {
      if (!part || typeof part !== "object") return false;
      const partMetadata = part.metadata;
      return !!partMetadata && typeof partMetadata === "object" && ("generation" in partMetadata || "dalle" in partMetadata);
    });
  }
  function discoverAssets(conversation) {
    var _a, _b;
    const assets = /* @__PURE__ */ new Map();
    const aliasToKey = /* @__PURE__ */ new Map();
    const conversationId2 = String(conversation.id ?? conversation.conversation_id ?? "");
    const getAsset = (key, fileId) => {
      const canonicalKey = aliasToKey.get(key) ?? key;
      let asset = assets.get(canonicalKey);
      if (!asset) {
        asset = {
          key: canonicalKey,
          fileId,
          aliases: [],
          directUrls: [],
          inlineDataUrl: null,
          sandboxPaths: [],
          names: [],
          mimeTypes: [],
          expectedSizes: [],
          references: [],
          referenceOnly: false,
          referenceOnlyReason: null,
          aliasSet: /* @__PURE__ */ new Set(),
          directUrlSet: /* @__PURE__ */ new Set(),
          sandboxPathSet: /* @__PURE__ */ new Set(),
          nameSet: /* @__PURE__ */ new Set(),
          mimeTypeSet: /* @__PURE__ */ new Set(),
          expectedSizeSet: /* @__PURE__ */ new Set(),
          referenceSet: /* @__PURE__ */ new Set()
        };
        assets.set(canonicalKey, asset);
      }
      return asset;
    };
    const mergeAsset = (target, source) => {
      source.aliasSet.forEach((value) => target.aliasSet.add(value));
      source.directUrlSet.forEach((value) => target.directUrlSet.add(value));
      source.sandboxPathSet.forEach((value) => target.sandboxPathSet.add(value));
      source.nameSet.forEach((value) => target.nameSet.add(value));
      source.mimeTypeSet.forEach((value) => target.mimeTypeSet.add(value));
      source.expectedSizeSet.forEach((value) => target.expectedSizeSet.add(value));
      if (!target.inlineDataUrl) target.inlineDataUrl = source.inlineDataUrl;
      source.references.forEach((reference) => {
        const refKey = `${reference.jsonPath}
${reference.rawValue}
${reference.kind}`;
        if (!target.referenceSet.has(refKey)) {
          target.referenceSet.add(refKey);
          target.references.push(reference);
        }
      });
      for (const alias of source.aliasSet) {
        aliasToKey.set(alias, target.key);
        aliasToKey.set(`file:${alias}`, target.key);
      }
      assets.delete(source.key);
    };
    const add = (identifier, rawValue, path, context, hints, forcedKind) => {
      const normalized = identifier.replace(/^(?:sediment|file-service):\/\//i, "").replace(/^file:\/\/my_files\//i, "");
      const fileIdMatch = normalized.match(new RegExp(FILE_ID_RE.source, "i"));
      const libraryMatch = normalized.match(new RegExp(LIBRARY_ID_RE.source, "i"));
      const fileId = (fileIdMatch == null ? void 0 : fileIdMatch[0]) ?? (libraryMatch == null ? void 0 : libraryMatch[0]) ?? null;
      const key = fileId ? `file:${fileId}` : identifier;
      const asset = getAsset(key, fileId);
      if (fileId) {
        aliasToKey.set(fileId, asset.key);
        aliasToKey.set(`file:${fileId}`, asset.key);
        asset.aliasSet.add(fileId);
      }
      if (hints.name) asset.nameSet.add(basename$1(hints.name));
      if (hints.mimeType) asset.mimeTypeSet.add(hints.mimeType);
      if (hints.expectedSize != null) asset.expectedSizeSet.add(hints.expectedSize);
      const reference = {
        nodeId: context.nodeId,
        messageId: context.messageId,
        messageRole: context.role,
        jsonPath: path,
        kind: forcedKind ?? classify(path, context),
        rawValue: rawValue.slice(0, 1e3)
      };
      const refKey = `${reference.jsonPath}
${reference.rawValue}
${reference.kind}`;
      if (!asset.referenceSet.has(refKey)) {
        asset.referenceSet.add(refKey);
        asset.references.push(reference);
      }
      return asset;
    };
    const registerAttachmentAliases = (attachment, path, context, hints) => {
      const ids = [attachment.id, attachment.file_id, attachment.file_uuid, attachment.library_file_id].filter((value) => typeof value === "string" && value.length > 0);
      const primary = ids.find((value) => FILE_ID_RE.test(value)) ?? ids[0];
      FILE_ID_RE.lastIndex = 0;
      if (!primary) return;
      const asset = add(primary, primary, path, context, hints);
      for (const id of ids) {
        const existingKey = aliasToKey.get(id) ?? aliasToKey.get(`file:${id}`);
        const existing = existingKey ? assets.get(existingKey) : assets.get(`file:${id}`);
        if (existing && existing !== asset) mergeAsset(asset, existing);
        asset.aliasSet.add(id);
        aliasToKey.set(id, asset.key);
        aliasToKey.set(`file:${id}`, asset.key);
      }
      const rawName = typeof attachment.name === "string" ? attachment.name : "";
      const sandboxMatch = rawName.match(/\/mnt\/data\/[^?#]+/);
      if (sandboxMatch && conversationId2 && context.messageId) {
        const sandboxPath = sandboxMatch[0];
        const params = new URLSearchParams({
          message_id: context.messageId,
          sandbox_path: sandboxPath
        });
        asset.directUrlSet.add(
          `/backend-api/conversation/${encodeURIComponent(conversationId2)}/interpreter/download?${params}`
        );
        asset.sandboxPathSet.add(`sandbox:${sandboxPath}`);
      }
    };
    const scanString = (value, path, context, hints) => {
      var _a2;
      const matches = /* @__PURE__ */ new Set();
      for (const regex of [POINTER_RE, MY_FILES_RE, FILE_ID_RE, LIBRARY_ID_RE]) {
        regex.lastIndex = 0;
        for (const match of value.matchAll(regex)) matches.add(match[0]);
      }
      for (const match of matches) add(match, value, path, context, hints);
      SANDBOX_RE.lastIndex = 0;
      for (const match of value.matchAll(SANDBOX_RE)) {
        const sandboxPath = match[0];
        const asset = add(
          `sandbox:${context.messageId}:${sandboxPath}`,
          value,
          path,
          context,
          { ...hints, name: basename$1(sandboxPath) },
          "sandbox-file"
        );
        asset.sandboxPathSet.add(sandboxPath);
        if (conversationId2 && context.messageId) {
          const params = new URLSearchParams({
            message_id: context.messageId,
            sandbox_path: sandboxPath.replace(/^sandbox:/i, "")
          });
          asset.directUrlSet.add(
            `/backend-api/conversation/${encodeURIComponent(conversationId2)}/interpreter/download?${params}`
          );
        }
      }
      DATA_IMAGE_RE.lastIndex = 0;
      for (const match of value.matchAll(DATA_IMAGE_RE)) {
        const dataUrl = match[0].replace(/\s/g, "");
        const asset = add(`inline:${hashText(dataUrl)}`, dataUrl, path, context, hints, "inline-image");
        asset.inlineDataUrl = dataUrl;
      }
      FIRST_PARTY_URL_RE.lastIndex = 0;
      for (const match of value.matchAll(FIRST_PARTY_URL_RE)) {
        const url = match[0];
        if (!isFirstPartyFileUrl(url)) continue;
        const id = (_a2 = url.match(new RegExp(FILE_ID_RE.source, "i"))) == null ? void 0 : _a2[0];
        const asset = add(id ?? `url:${hashText(url)}`, url, path, context, hints);
        asset.directUrlSet.add(url);
      }
    };
    const walk = (value, path, context, inheritedHints) => {
      if (typeof value === "string") {
        scanString(value, path, context, inheritedHints);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${index}]`, context, inheritedHints));
        return;
      }
      if (!value || typeof value !== "object") return;
      const record = value;
      const hints = hintsFromObject(record, inheritedHints);
      if (path.endsWith(".metadata.attachments") || path.includes(".metadata.attachments[")) {
        registerAttachmentAliases(record, path, context, hints);
      }
      for (const [key, child] of Object.entries(record)) {
        walk(child, `${path}.${key}`, context, hints);
      }
    };
    for (const [nodeId, node] of Object.entries(conversation.mapping ?? {})) {
      const message = node.message;
      if (!message) continue;
      const context = {
        nodeId,
        messageId: message.id ?? nodeId,
        role: ((_a = message.author) == null ? void 0 : _a.role) ?? "",
        generatedMessage: generatedMessage(message)
      };
      walk(message, `$.mapping.${nodeId}.message`, context, {});
    }
    const named = /* @__PURE__ */ new Map();
    for (const asset of assets.values()) {
      if (!asset.fileId) continue;
      for (const name of asset.nameSet) {
        const key = name.toLowerCase();
        const list = named.get(key) ?? [];
        list.push(asset);
        named.set(key, list);
      }
    }
    for (const [key, sandboxAsset] of [...assets.entries()]) {
      if (!key.startsWith("sandbox:")) continue;
      const name = (_b = [...sandboxAsset.nameSet][0]) == null ? void 0 : _b.toLowerCase();
      const candidates = name ? named.get(name) : void 0;
      if ((candidates == null ? void 0 : candidates.length) !== 1) continue;
      const target = candidates[0];
      sandboxAsset.references.forEach((reference) => {
        const refKey = `${reference.jsonPath}
${reference.rawValue}
${reference.kind}`;
        if (!target.referenceSet.has(refKey)) {
          target.referenceSet.add(refKey);
          target.references.push(reference);
        }
      });
      sandboxAsset.directUrlSet.forEach((url) => target.directUrlSet.add(url));
      sandboxAsset.sandboxPathSet.forEach((path) => target.sandboxPathSet.add(path));
      assets.delete(key);
    }
    return [...assets.values()].map((asset) => {
      const hasIndependentBytes = asset.fileId != null || asset.directUrlSet.size > 0 || asset.sandboxPathSet.size > 0 || asset.inlineDataUrl != null;
      const referenceOnly = !hasIndependentBytes;
      const referenceOnlyReason = referenceOnly ? "No fileId, direct URL, sandbox file, or inline data attached to this reference" : null;
      return {
        key: asset.key,
        fileId: asset.fileId,
        aliases: [...asset.aliasSet],
        directUrls: [...asset.directUrlSet],
        inlineDataUrl: asset.inlineDataUrl,
        sandboxPaths: [...asset.sandboxPathSet],
        names: [...asset.nameSet],
        mimeTypes: [...asset.mimeTypeSet],
        expectedSizes: [...asset.expectedSizeSet],
        references: asset.references,
        referenceOnly,
        referenceOnlyReason
      };
    });
  }
  function discoverProjectAssets(project) {
    return discoverAssets({
      id: `project:${project.id}`,
      title: project.name,
      mapping: {
        project: {
          id: "project",
          children: [],
          message: {
            id: `project:${project.id}`,
            author: { role: "system", name: "project" },
            content: {
              content_type: "project_context",
              raw: project.raw
            },
            metadata: {}
          }
        }
      }
    });
  }
  function getDefaultExportFromCjs(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
  }
  var truncate;
  var hasRequiredTruncate;
  function requireTruncate() {
    if (hasRequiredTruncate) return truncate;
    hasRequiredTruncate = 1;
    function isHighSurrogate(codePoint) {
      return codePoint >= 55296 && codePoint <= 56319;
    }
    function isLowSurrogate(codePoint) {
      return codePoint >= 56320 && codePoint <= 57343;
    }
    truncate = function truncate2(getLength, string, byteLength) {
      if (typeof string !== "string") {
        throw new Error("Input must be string");
      }
      var charLength = string.length;
      var curByteLength = 0;
      var codePoint;
      var segment;
      for (var i = 0; i < charLength; i += 1) {
        codePoint = string.charCodeAt(i);
        segment = string[i];
        if (isHighSurrogate(codePoint) && isLowSurrogate(string.charCodeAt(i + 1))) {
          i += 1;
          segment += string[i];
        }
        curByteLength += getLength(segment);
        if (curByteLength === byteLength) {
          return string.slice(0, i + 1);
        } else if (curByteLength > byteLength) {
          return string.slice(0, i - segment.length + 1);
        }
      }
      return string;
    };
    return truncate;
  }
  var browser$1;
  var hasRequiredBrowser$1;
  function requireBrowser$1() {
    if (hasRequiredBrowser$1) return browser$1;
    hasRequiredBrowser$1 = 1;
    function isHighSurrogate(codePoint) {
      return codePoint >= 55296 && codePoint <= 56319;
    }
    function isLowSurrogate(codePoint) {
      return codePoint >= 56320 && codePoint <= 57343;
    }
    browser$1 = function getByteLength(string) {
      if (typeof string !== "string") {
        throw new Error("Input must be string");
      }
      var charLength = string.length;
      var byteLength = 0;
      var codePoint = null;
      var prevCodePoint = null;
      for (var i = 0; i < charLength; i++) {
        codePoint = string.charCodeAt(i);
        if (isLowSurrogate(codePoint)) {
          if (prevCodePoint != null && isHighSurrogate(prevCodePoint)) {
            byteLength += 1;
          } else {
            byteLength += 3;
          }
        } else if (codePoint <= 127) {
          byteLength += 1;
        } else if (codePoint >= 128 && codePoint <= 2047) {
          byteLength += 2;
        } else if (codePoint >= 2048 && codePoint <= 65535) {
          byteLength += 3;
        }
        prevCodePoint = codePoint;
      }
      return byteLength;
    };
    return browser$1;
  }
  var browser;
  var hasRequiredBrowser;
  function requireBrowser() {
    if (hasRequiredBrowser) return browser;
    hasRequiredBrowser = 1;
    var truncate2 = requireTruncate();
    var getLength = requireBrowser$1();
    browser = truncate2.bind(null, getLength);
    return browser;
  }
  var sanitizeFilename;
  var hasRequiredSanitizeFilename;
  function requireSanitizeFilename() {
    if (hasRequiredSanitizeFilename) return sanitizeFilename;
    hasRequiredSanitizeFilename = 1;
    var truncate2 = requireBrowser();
    var illegalRe = /[\/\?<>\\:\*\|"]/g;
    var controlRe = /[\x00-\x1f\x80-\x9f]/g;
    var reservedRe = /^\.+$/;
    var windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
    var windowsTrailingRe = /[\. ]+$/;
    function sanitize2(input, replacement) {
      if (typeof input !== "string") {
        throw new Error("Input must be string");
      }
      var sanitized = input.replace(illegalRe, replacement).replace(controlRe, replacement).replace(reservedRe, replacement).replace(windowsReservedRe, replacement).replace(windowsTrailingRe, replacement);
      return truncate2(sanitized, 255);
    }
    sanitizeFilename = function(input, options) {
      var replacement = options && options.replacement || "";
      var output = sanitize2(input, replacement);
      if (replacement === "") {
        return output;
      }
      return sanitize2(output, "");
    };
    return sanitizeFilename;
  }
  var sanitizeFilenameExports = requireSanitizeFilename();
  const sanitize = /* @__PURE__ */ getDefaultExportFromCjs(sanitizeFilenameExports);
  const MIME_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/wav": ".wav",
    "video/mp4": ".mp4",
    "application/pdf": ".pdf",
    "application/json": ".json",
    "text/plain": ".txt",
    "text/csv": ".csv"
  };
  function safeName(value, fallback, maxLength = 160) {
    const cleaned = sanitize(value, { replacement: "_" }).replace(/[. ]+$/g, "").trim();
    return (cleaned || fallback).slice(0, maxLength);
  }
  function basename(value) {
    const clean = value.split(/[?#]/, 1)[0];
    return clean.slice(clean.lastIndexOf("/") + 1);
  }
  function splitExtension(value) {
    const dot = value.lastIndexOf(".");
    if (dot <= 0 || dot === value.length - 1) return { base: value, extension: "" };
    return { base: value.slice(0, dot), extension: value.slice(dot) };
  }
  function fallbackLabel(asset) {
    var _a, _b;
    const kind = ((_a = asset.references[0]) == null ? void 0 : _a.kind) ?? "attachment";
    const messageId = (_b = asset.references[0]) == null ? void 0 : _b.messageId;
    return messageId ? `${kind}_${messageId}` : kind;
  }
  function assetFileName(asset, resolvedName, resolvedMime) {
    const candidate = resolvedName ?? asset.names.find(Boolean) ?? fallbackLabel(asset);
    const safeCandidate = safeName(basename(candidate), fallbackLabel(asset), 180);
    const { base, extension: originalExtension } = splitExtension(safeCandidate);
    const mime = resolvedMime ?? asset.mimeTypes[0] ?? "";
    const extension = originalExtension || MIME_EXTENSIONS[mime.toLowerCase()] || "";
    const id = safeName(asset.fileId ?? asset.key.replace(/^[^:]+:/, ""), "no-id", 96);
    return `${safeName(base, fallbackLabel(asset), 140)}_[${id}]${extension}`;
  }
  function timestampLabel(value) {
    let date;
    date = /* @__PURE__ */ new Date();
    if (Number.isNaN(date.getTime())) date = /* @__PURE__ */ new Date();
    const pad = (input) => String(input).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  }
  function conversationId(conversation) {
    return String(conversation.id ?? conversation.conversation_id ?? "unknown-conversation");
  }
  function conversationFolderName(conversation) {
    const id = conversationId(conversation);
    return `[Original]_[${safeName(String(conversation.title ?? "Untitled"), "Untitled")}]_[${safeName(id, "unknown-id", 80)}]`;
  }
  function projectFolderName(project) {
    const prefix = project.id.startsWith("g-p-") ? "Project" : "GPT";
    return `[${prefix}]_[${safeName(project.name, project.id)}]_[${safeName(project.id, "unknown-project", 96)}]`;
  }
  async function directory(root, parts) {
    let current = root;
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: true });
    }
    return current;
  }
  async function writeBlob(folder, name, blob) {
    const handle = await folder.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(blob);
    } finally {
      await writable.close();
    }
  }
  async function writeResponse(folder, name, response) {
    const handle = await folder.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    if (response.body && typeof writable.getWriter === "function") {
      await response.body.pipeTo(writable);
    } else {
      try {
        await writable.write(await response.blob());
      } finally {
        await writable.close();
      }
    }
    return handle.getFile();
  }
  async function writeText(folder, name, content, type = "text/plain;charset=utf-8") {
    await writeBlob(folder, name, new Blob([content], { type }));
  }
  async function writeJson(folder, name, value) {
    await writeText(folder, name, JSON.stringify(value, null, 2), "application/json;charset=utf-8");
  }
  async function existingFile(folder, name) {
    try {
      const handle = await folder.getFileHandle(name, { create: false });
      return handle.getFile();
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return null;
      if ((error == null ? void 0 : error.name) === "NotFoundError") return null;
      throw error;
    }
  }
  async function existingFileByMarkers(folder, markers) {
    var _a;
    const entries = (_a = folder.entries) == null ? void 0 : _a.call(folder);
    if (!entries) return null;
    const tokens = [...new Set(markers.filter(Boolean))].map((marker) => `[${marker}]`);
    if (!tokens.length) return null;
    const matches = [];
    for await (const [name, handle] of entries) {
      if (handle.kind !== "file" || !tokens.some((token) => name.includes(token))) continue;
      matches.push(await handle.getFile());
    }
    if (matches.length > 1) {
      throw new Error(`Multiple local files match attachment markers: ${markers.join(", ")}`);
    }
    return matches[0] ?? null;
  }
  async function sha256(blob) {
    const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  }
  const MAX_ATTEMPTS = 5;
  const MAX_HASH_BYTES = 64 * 1024 * 1024;
  class PermanentAssetError extends Error {
  }
  function sleep(milliseconds, signal) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(resolve, milliseconds);
      signal.addEventListener("abort", () => {
        window.clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }
  function dataUrlBlob(dataUrl) {
    const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/i);
    if (!match) throw new Error("Unsupported inline data URL");
    const binary = atob(match[2].replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1] });
  }
  async function resolveAsset(asset, signal) {
    if (asset.inlineDataUrl) {
      const blob = dataUrlBlob(asset.inlineDataUrl);
      return { blob, urls: [], name: asset.names[0] ?? null, mimeType: blob.type || null, expectedSize: blob.size };
    }
    if (asset.fileId) {
      const response = await resolveFileDownload(asset.fileId, signal);
      if (response.status === "success") {
        return {
          blob: null,
          urls: [response.download_url, ...asset.directUrls],
          name: response.file_name,
          mimeType: response.mime_type,
          expectedSize: response.file_size_bytes
        };
      }
      if (asset.directUrls.length === 0) {
        throw new PermanentAssetError(`${response.error_code}: ${response.error_message ?? "file resolver rejected the ID"}`);
      }
    }
    if (asset.directUrls.length > 0) {
      return {
        blob: null,
        urls: asset.directUrls,
        name: asset.names[0] ?? null,
        mimeType: asset.mimeTypes[0] ?? null,
        expectedSize: asset.expectedSizes[0] ?? null
      };
    }
    throw new Error(asset.sandboxPaths.length ? `No downloadable file ID for ${asset.sandboxPaths.join(", ")}` : "No downloadable first-party file reference");
  }
  async function writeResolvedAsset(resolved, folder, name, signal) {
    if (resolved.blob) {
      await writeBlob(folder, name, resolved.blob);
      const file = await existingFile(folder, name);
      if (!file) throw new Error("Attachment disappeared after writing");
      return file;
    }
    let lastError;
    for (const url of resolved.urls) {
      try {
        let response = await fetchFileResponse(url, signal);
        const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
        const isInterpreterDescriptor = url.includes("/interpreter/download?");
        if (isInterpreterDescriptor) {
          const descriptor = await response.clone().json().catch(() => null);
          if ((descriptor == null ? void 0 : descriptor.status) === "success" && descriptor.download_url) {
            response = await fetchFileResponse(descriptor.download_url, signal, true);
          } else if (contentType.includes("json")) {
            throw new Error(
              (descriptor == null ? void 0 : descriptor.error_message) || (descriptor == null ? void 0 : descriptor.error_code) || "Interpreter download endpoint returned JSON without a download URL"
            );
          }
        }
        return await writeResponse(folder, name, response);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error("No usable download URL");
  }
  async function manifestHash(file) {
    return file.size <= MAX_HASH_BYTES ? sha256(file) : null;
  }
  async function isUsableExistingFile(file, expectedSize) {
    if (file.size <= 0) return false;
    if (expectedSize != null && file.size !== expectedSize) return false;
    if (!file.name.toLowerCase().endsWith(".html") || file.size > 16 * 1024) return true;
    const text = (await file.text()).trimStart();
    if (!text.startsWith("{")) return true;
    try {
      const payload = JSON.parse(text);
      return !(payload.status === "success" && typeof payload.download_url === "string");
    } catch {
      return true;
    }
  }
  function baseManifest(asset) {
    return {
      key: asset.key,
      fileId: asset.fileId,
      aliases: asset.aliases,
      localFile: null,
      status: "unresolved",
      mimeType: null,
      expectedSize: asset.expectedSizes[0] ?? null,
      actualSize: null,
      sha256: null,
      attempts: 0,
      error: null,
      reason: asset.referenceOnlyReason,
      references: asset.references
    };
  }
  async function downloadAsset(asset, folder, signal) {
    const manifest = baseManifest(asset);
    const hintedName = assetFileName(
      asset,
      asset.names[0] ?? null,
      asset.mimeTypes[0] ?? null
    );
    const hintedExisting = await existingFile(folder, hintedName) ?? await existingFileByMarkers(folder, asset.aliases);
    const hintedSize = asset.expectedSizes[0] ?? null;
    if (hintedExisting && await isUsableExistingFile(hintedExisting, hintedSize)) {
      manifest.localFile = hintedExisting.name;
      manifest.status = "existing";
      manifest.mimeType = hintedExisting.type || asset.mimeTypes[0] || null;
      manifest.expectedSize = hintedSize;
      manifest.actualSize = hintedExisting.size;
      manifest.sha256 = await manifestHash(hintedExisting);
      return manifest;
    }
    if (asset.referenceOnly) {
      manifest.status = "reference-only";
      return manifest;
    }
    if (!asset.fileId && !asset.inlineDataUrl && asset.directUrls.length === 0) {
      manifest.error = asset.sandboxPaths.length ? `Unresolved sandbox path: ${asset.sandboxPaths.join(", ")}` : "No resolver supported this reference";
      return manifest;
    }
    let lastError;
    let lastErrorPermanent = false;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      signal.throwIfAborted();
      manifest.attempts = attempt;
      try {
        const resolved = await resolveAsset(asset, signal);
        const name = assetFileName(asset, resolved.name, resolved.mimeType);
        const existing = await existingFile(folder, name);
        if (existing && await isUsableExistingFile(existing, resolved.expectedSize)) {
          manifest.localFile = name;
          manifest.status = "existing";
          manifest.mimeType = existing.type || resolved.mimeType;
          manifest.expectedSize = resolved.expectedSize;
          manifest.actualSize = existing.size;
          manifest.sha256 = await manifestHash(existing);
          return manifest;
        }
        const file = await writeResolvedAsset(resolved, folder, name, signal);
        if (resolved.expectedSize != null && file.size !== resolved.expectedSize) {
          throw new Error(`Size mismatch: expected ${resolved.expectedSize}, received ${file.size}`);
        }
        manifest.localFile = name;
        manifest.status = "downloaded";
        manifest.mimeType = resolved.mimeType || file.type || null;
        manifest.expectedSize = resolved.expectedSize;
        manifest.actualSize = file.size;
        manifest.sha256 = await manifestHash(file);
        return manifest;
      } catch (error) {
        lastError = error;
        if (signal.aborted) throw error;
        const permanent = error instanceof PermanentAssetError || error instanceof ApiError && (error.status === 403 || error.status === 404 || error.status === 410);
        lastErrorPermanent = permanent;
        const retryable = !permanent && (!(error instanceof ApiError) || error.status === 408 || error.status === 429 || error.status >= 500);
        if (!retryable) break;
        if (attempt < MAX_ATTEMPTS) {
          const wait2 = error instanceof ApiError && error.retryAfterMs > 0 ? error.retryAfterMs : Math.min(1e3 * 2 ** (attempt - 1), 15e3);
          await sleep(wait2, signal);
        }
      }
    }
    manifest.status = lastErrorPermanent ? "unavailable" : "failed";
    manifest.error = lastError instanceof Error ? lastError.message : String(lastError);
    return manifest;
  }
  async function mapConcurrent(values, limit, worker) {
    const results = new Array(values.length);
    let nextIndex = 0;
    const runners = Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(values[index], index);
      }
    });
    await Promise.all(runners);
    return results;
  }
  const MANIFEST_VERSION = 2;
  const ATTACHMENT_CONCURRENCY = 2;
  function projectIdOf(conversation) {
    const value = conversation.gizmo_id ?? conversation.conversation_template_id;
    return typeof value === "string" && value ? value : null;
  }
  function projectForConversation(conversation, listedProject, projects) {
    if (listedProject) return listedProject;
    const projectId = projectIdOf(conversation);
    if (!projectId) return null;
    return projects.find((project) => project.id === projectId) ?? {
      id: projectId,
      name: projectId,
      description: "",
      raw: { id: projectId, source: "conversation.gizmo_id" }
    };
  }
  async function conversationDirectory(accountFolder, conversation, project) {
    if (!project) return directory(accountFolder, [conversationFolderName(conversation)]);
    const projectFolder = await directory(accountFolder, [projectFolderName(project)]);
    await writeJson(projectFolder, "project.json", project.raw);
    return directory(projectFolder, [conversationFolderName(conversation)]);
  }
  function createManifest(ownerId, entries, coverageWarnings = []) {
    const downloaded = entries.filter((entry) => entry.status === "downloaded").length;
    const existing = entries.filter((entry) => entry.status === "existing").length;
    const failed = entries.filter((entry) => entry.status === "failed").length;
    const unavailable = entries.filter((entry) => entry.status === "unavailable").length;
    const unresolved = entries.filter((entry) => entry.status === "unresolved").length;
    const referenceOnly = entries.filter((entry) => entry.status === "reference-only").length;
    return {
      version: MANIFEST_VERSION,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      conversationId: ownerId,
      expected: entries.length,
      downloaded,
      existing,
      failed,
      unavailable,
      unresolved,
      referenceOnly,
      // `unavailable` is a server-side refusal (403/404/410) that the script
      // cannot recover from, so it does not stop a run from being complete.
      complete: failed === 0 && unresolved === 0 && coverageWarnings.length === 0,
      coverageWarnings,
      assets: entries
    };
  }
  function assetProgressDetail(index, total, asset, entry) {
    const name = entry.localFile ?? asset.names[0] ?? asset.fileId ?? asset.key;
    const detail = entry.error ?? entry.reason;
    return `附件 ${index}/${total} · ${entry.status}: ${name}${detail ? ` · ${detail}` : ""}`;
  }
  async function runArchive(options) {
    const { signal, onProgress } = options;
    signal.throwIfAborted();
    onProgress == null ? void 0 : onProgress({ phase: "listing", current: 0, total: 0, title: "读取账号", detail: "" });
    const catalogPromise = options.catalog ? Promise.resolve(options.catalog) : fetchArchiveCatalog(signal);
    const [account, catalog] = await Promise.all([
      getAccountProfile(),
      catalogPromise
    ]);
    const { projects } = catalog;
    const providerFolder = await directory(options.root, ["ChatGPT"]);
    const accountFolder = await directory(providerFolder, [`[${safeName(account.email, "unknown-account")}]`]);
    await writeJson(accountFolder, "account.json", {
      ...account,
      archivedAt: (/* @__PURE__ */ new Date()).toISOString(),
      projects: projects.map((project) => ({ id: project.id, name: project.name, description: project.description }))
    });
    let records;
    {
      records = selectConversationRecords(catalog.records, options.selectedConversationIds ?? []);
      if (records.length === 0) throw new Error("请至少选择一个对话");
    }
    const summary = {
      projects: 0,
      failedProjects: 0,
      incompleteProjects: 0,
      conversations: records.length,
      completeConversations: 0,
      failedConversations: 0,
      downloaded: 0,
      existing: 0,
      failedAssets: 0,
      unavailableAssets: 0,
      unresolvedAssets: 0,
      referenceOnlyAssets: 0,
      failedConversationIds: [],
      failedProjectIds: [],
      incompleteProjectIds: [],
      errors: []
    };
    const archivedProjectIds = /* @__PURE__ */ new Set();
    const archiveProject = async (project, projectIndex, total) => {
      if (archivedProjectIds.has(project.id)) return;
      archivedProjectIds.add(project.id);
      summary.projects += 1;
      signal.throwIfAborted();
      try {
        const projectFolder = await directory(accountFolder, [projectFolderName(project)]);
        await writeJson(projectFolder, "project.json", project.raw);
        const projectAssets = discoverProjectAssets(project);
        const entries = await mapConcurrent(projectAssets, ATTACHMENT_CONCURRENCY, async (asset, assetIndex) => {
          const entry = await downloadAsset(asset, projectFolder, signal);
          onProgress == null ? void 0 : onProgress({
            phase: "attachments",
            current: projectIndex + 1,
            total,
            title: `Project: ${project.name}`,
            detail: assetProgressDetail(assetIndex + 1, projectAssets.length, asset, entry)
          });
          return entry;
        });
        const manifest = createManifest(`project:${project.id}`, entries, [
          "Project Sources has not been independently enumerated; this manifest covers only file references present in the Project sidebar response."
        ]);
        await writeJson(projectFolder, "project-attachments-manifest.json", manifest);
        summary.downloaded += manifest.downloaded;
        summary.existing += manifest.existing;
        summary.failedAssets += manifest.failed;
        summary.unavailableAssets += manifest.unavailable;
        summary.unresolvedAssets += manifest.unresolved;
        summary.referenceOnlyAssets += manifest.referenceOnly;
        if (manifest.failed > 0 || manifest.unresolved > 0) {
          summary.failedProjects += 1;
          summary.failedProjectIds.push({ id: project.id, name: project.name });
        } else if (manifest.coverageWarnings.length > 0) {
          summary.incompleteProjects += 1;
          summary.incompleteProjectIds.push({ id: project.id, name: project.name });
        }
      } catch (error) {
        if (signal.aborted) throw error;
        summary.failedProjects += 1;
        summary.failedProjectIds.push({ id: project.id, name: project.name });
        summary.errors.push({
          conversationId: `project:${project.id}`,
          title: project.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    };
    for (let index = 0; index < records.length; index += 1) {
      signal.throwIfAborted();
      const record = records[index];
      onProgress == null ? void 0 : onProgress({
        phase: "conversation",
        current: index + 1,
        total: records.length,
        title: record.item.title || record.item.id,
        detail: "下载原始 JSON"
      });
      try {
        const conversation = await fetchConversation(record.item.id, signal);
        const project = projectForConversation(conversation, record.project, projects);
        if (project) await archiveProject(project, 0, 1);
        const folder = await conversationDirectory(accountFolder, conversation, project);
        const historyName = `history-${timestampLabel(void 0)}.json`;
        await writeJson(folder, historyName, conversation);
        const assets = discoverAssets(conversation);
        let completedAssets = 0;
        const entries = await mapConcurrent(assets, ATTACHMENT_CONCURRENCY, async (asset) => {
          const entry = await downloadAsset(asset, folder, signal);
          completedAssets += 1;
          onProgress == null ? void 0 : onProgress({
            phase: "attachments",
            current: index + 1,
            total: records.length,
            title: String(conversation.title ?? record.item.title ?? record.item.id),
            detail: assetProgressDetail(completedAssets, assets.length, asset, entry)
          });
          return entry;
        });
        const manifest = createManifest(conversationId(conversation), entries);
        await writeJson(folder, "attachments-manifest.json", manifest);
        summary.downloaded += manifest.downloaded;
        summary.existing += manifest.existing;
        summary.failedAssets += manifest.failed;
        summary.unavailableAssets += manifest.unavailable;
        summary.unresolvedAssets += manifest.unresolved;
        summary.referenceOnlyAssets += manifest.referenceOnly;
        if (manifest.complete) summary.completeConversations += 1;
        else {
          summary.failedConversations += 1;
          summary.failedConversationIds.push({
            id: record.item.id,
            title: String(conversation.title ?? record.item.title ?? record.item.id)
          });
        }
      } catch (error) {
        if (signal.aborted) throw error;
        summary.failedConversations += 1;
        summary.failedConversationIds.push({
          id: record.item.id,
          title: record.item.title
        });
        summary.errors.push({
          conversationId: record.item.id,
          title: record.item.title,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      await writeJson(accountFolder, "_archive-state.json", {
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        processed: index + 1,
        total: records.length,
        summary
      });
    }
    onProgress == null ? void 0 : onProgress({
      phase: "done",
      current: records.length,
      total: records.length,
      title: "完成",
      detail: summary.failedConversations > 0 || summary.failedProjects > 0 || summary.failedAssets > 0 || summary.unresolvedAssets > 0 ? "存在失败或无法解析的附件" : summary.incompleteProjects > 0 ? "可下载附件均已保存，Project 来源覆盖仍待补充" : summary.referenceOnlyAssets > 0 ? `可下载附件均已保存，保留 ${summary.referenceOnlyAssets} 个仅引用文件` : "所有附件均已保存"
    });
    return summary;
  }
  function fieldLines(value) {
    if (value === null) return ["null"];
    return String(value).replace(/\r\n?/g, "\n").split("\n");
  }
  function formatAuditLogEntry(entry) {
    const lines = [`[${entry.timestamp}] ${entry.level} ${entry.event}`];
    for (const [key, value] of Object.entries(entry.fields ?? {})) {
      if (value === void 0) continue;
      const values = fieldLines(value);
      if (values.length === 1) {
        lines.push(`  ${key}: ${values[0]}`);
        continue;
      }
      lines.push(`  ${key}: |`);
      lines.push(...values.map((line) => `    ${line}`));
    }
    return lines.join("\n");
  }
  const ROOT_ID = "chatgpt-archive-root";
  const ARCHIVED_SOURCE = "archived";
  function dockPoint() {
    const profiles = document.querySelectorAll(
      '[data-testid="accounts-profile-button"], [role="button"][aria-label*="个人资料"], [role="button"][aria-label*="profile" i]'
    );
    for (const profile of profiles) {
      const rightAction = profile.querySelector("[data-trailing-button]") ?? profile.querySelector(
        'button[aria-label="下载应用"], button[aria-label="Download app"]'
      );
      if (rightAction == null ? void 0 : rightAction.parentElement) {
        return { container: rightAction.parentElement, rightAction };
      }
    }
    return null;
  }
  function dockUi(root) {
    const point = dockPoint();
    if (!point) {
      root.dataset.docked = "false";
      return;
    }
    if (root.parentElement !== point.container || root.nextElementSibling !== point.rightAction) {
      point.container.insertBefore(root, point.rightAction);
    }
    root.dataset.docked = "true";
  }
  function listIds(items) {
    return items.map((item) => {
      const label = item.title ?? item.name ?? "";
      return label ? `${item.id}  ${label}` : item.id;
    }).join("\n");
  }
  function summaryText(summary) {
    const lines = [
      `对话  完整 ${summary.completeConversations} · 未完成 ${summary.failedConversations} · 共 ${summary.conversations}`,
      `附件  下载 ${summary.downloaded} · 已存在 ${summary.existing} · 下载失败 ${summary.failedAssets} · 服务端受限 ${summary.unavailableAssets} · 无法解析 ${summary.unresolvedAssets} · 仅引用 ${summary.referenceOnlyAssets}`,
      `Project  处理 ${summary.projects} · 未完成 ${summary.failedProjects} · Sources 未抓取 ${summary.incompleteProjects}`
    ];
    if (summary.failedConversationIds.length) {
      lines.push("", `未完成对话 (${summary.failedConversationIds.length})：`, listIds(summary.failedConversationIds));
    }
    if (summary.failedProjectIds.length) {
      lines.push("", `未完成 Project (${summary.failedProjectIds.length})：`, listIds(summary.failedProjectIds));
    }
    if (summary.incompleteProjectIds.length) {
      lines.push("", `Sources 未抓取的 Project (${summary.incompleteProjectIds.length})：`, listIds(summary.incompleteProjectIds));
    }
    return lines.join("\n");
  }
  function conversationDate(value, full = false) {
    if (value == null) return "—";
    const date = new Date(typeof value === "number" ? value * 1e3 : value);
    if (Number.isNaN(date.getTime())) return "—";
    if (full) return date.toLocaleString();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function mountUi() {
    const existing = document.getElementById(ROOT_ID);
    if (existing) {
      dockUi(existing);
      return;
    }
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.dataset.docked = "false";
    root.innerHTML = `
        <button class="cga-launch" type="button" aria-label="导出" data-tooltip="导出">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path d="M9.952 4.604H7.776q-1.92 0-2.88 1.024-.96.96-.96 2.88v.896h3.776v7.68H.032V8.188q0-2.304.896-3.968.895-1.728 2.56-2.624Q5.216.7 7.52.7h2.432zm13.12 0h-2.176q-1.92 0-2.88 1.024-.96.96-.96 2.88v.896h3.776v7.68h-7.68V8.188q0-2.304.896-3.968.895-1.728 2.56-2.624Q18.336.7 20.64.7h2.432z"/>
            </svg>
        </button>
        <div class="cga-panel" hidden>
            <div class="cga-head">
                <strong>ChatGPT Archive</strong>
                <button class="cga-close" type="button" aria-label="关闭">×</button>
            </div>
            <div class="cga-toolbar">
                <select class="cga-source" aria-label="对话来源">
                    <option value="all">全部对话</option>
                    <option value="archived">归档对话</option>
                </select>
                <span class="cga-source-loading" role="status" hidden><span class="cga-spinner" aria-hidden="true"></span>加载中</span>
                <input class="cga-search" type="search" placeholder="搜索标题或对话 ID" aria-label="搜索标题或对话 ID">
                <button class="cga-refresh" type="button">刷新</button>
                <div class="cga-search-help">
                    多项搜索用
                    <button class="cga-copy-separator" type="button" title="复制搜索分隔符" aria-label="复制搜索分隔符"></button>
                    分隔（匹配任一项）
                </div>
            </div>
            <div class="cga-selection-toolbar">
                <label><input class="cga-select-all" type="checkbox"> 全选当前列表</label>
                <span class="cga-selected-count">已选 0</span>
            </div>
            <div class="cga-list-header" aria-label="对话排序">
                <span aria-hidden="true"></span>
                <button class="cga-sort" type="button" data-sort="title">标题 ↕</button>
                <button class="cga-sort" type="button" data-sort="create_time">创建 ↕</button>
                <button class="cga-sort cga-sort-active" type="button" data-sort="update_time">更新 ↓</button>
            </div>
            <div class="cga-selection-list"><p class="cga-list-message">打开后加载第一页对话</p></div>
            <div class="cga-page-actions">
                <button class="cga-load-more" type="button" hidden>加载更多</button>
                <button class="cga-load-all" type="button" hidden>加载全部</button>
            </div>
            <div class="cga-actions">
                <button class="cga-export" type="button">导出所选</button>
                <button class="cga-cancel" type="button" hidden>取消</button>
            </div>
            <div class="cga-log-head">
                <strong>运行日志</strong>
                <div class="cga-log-actions">
                    <button class="cga-clear-log" type="button" disabled>清空日志</button>
                    <button class="cga-copy-log" type="button" disabled>复制日志</button>
                </div>
            </div>
            <pre class="cga-status" role="log" aria-live="polite" aria-label="运行日志">尚未开始</pre>
            <progress class="cga-progress" max="1" value="0"></progress>
        </div>
    `;
    document.body.append(root);
    dockUi(root);
    for (const eventName of ["click", "pointerdown", "keydown"]) {
      root.addEventListener(eventName, (event) => {
        event.stopPropagation();
      });
    }
    const launch = root.querySelector(".cga-launch");
    const panel = root.querySelector(".cga-panel");
    const close = root.querySelector(".cga-close");
    const source = root.querySelector(".cga-source");
    const sourceLoading = root.querySelector(".cga-source-loading");
    const search = root.querySelector(".cga-search");
    const copySeparator = root.querySelector(".cga-copy-separator");
    const selectAll = root.querySelector(".cga-select-all");
    const selectedCount = root.querySelector(".cga-selected-count");
    const sortButtons = [...root.querySelectorAll(".cga-sort")];
    const refresh = root.querySelector(".cga-refresh");
    const selectionList = root.querySelector(".cga-selection-list");
    const loadMore = root.querySelector(".cga-load-more");
    const loadAll = root.querySelector(".cga-load-all");
    const exportSelected = root.querySelector(".cga-export");
    const cancel = root.querySelector(".cga-cancel");
    const status = root.querySelector(".cga-status");
    const clearLog = root.querySelector(".cga-clear-log");
    const copyLog = root.querySelector(".cga-copy-log");
    const progress = root.querySelector(".cga-progress");
    let controller = null;
    let listController = null;
    let projects = [];
    let sourcesLoaded = false;
    let running = false;
    let loading = false;
    let loadingAll = false;
    let sortField = "update_time";
    let sortDirection = "desc";
    const selectedIds = /* @__PURE__ */ new Set();
    const sourceStates = /* @__PURE__ */ new Map();
    const recordsById = /* @__PURE__ */ new Map();
    const auditEntries = [];
    let activeRunId = null;
    const renderAuditLog = () => {
      status.textContent = auditEntries.length ? auditEntries.join("\n\n") : "尚未开始";
      const empty = auditEntries.length === 0;
      clearLog.disabled = empty;
      copyLog.disabled = empty;
      status.scrollTop = status.scrollHeight;
    };
    const appendAudit = (event, fields = {}, level = "INFO") => {
      auditEntries.push(formatAuditLogEntry({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        level,
        event,
        fields
      }));
      renderAuditLog();
    };
    const resetAudit = () => {
      auditEntries.length = 0;
      renderAuditLog();
    };
    const setStatusTone = (tone) => {
      root.classList.toggle("cga-tone-success", tone === "success");
      root.classList.toggle("cga-tone-warning", tone === "warning");
      root.classList.toggle("cga-tone-error", tone === "error");
    };
    const projectForSource = (key) => {
      if (!key.startsWith("project:")) return null;
      const id = key.slice("project:".length);
      return projects.find((project) => project.id === id) ?? null;
    };
    const emptySourceState = () => ({
      records: [],
      nextOffset: 0,
      nextCursor: 0,
      total: null,
      hasMore: false,
      loaded: false
    });
    const currentSourceState = () => sourceStates.get(source.value) ?? null;
    const updateSortButtons = () => {
      const labels = {
        title: "标题",
        create_time: "创建",
        update_time: "更新"
      };
      for (const button of sortButtons) {
        const field = button.dataset.sort;
        const active = field === sortField;
        button.classList.toggle("cga-sort-active", active);
        button.textContent = `${labels[field]} ${active ? sortDirection === "asc" ? "↑" : "↓" : "↕"}`;
        button.setAttribute("aria-pressed", String(active));
        button.disabled = running || loading;
      }
    };
    const updateSelectionState = () => {
      const conversationChecks = [...selectionList.querySelectorAll(".cga-conversation-check")];
      const currentSelected = conversationChecks.filter((input) => selectedIds.has(input.value)).length;
      selectedCount.textContent = `已选 ${selectedIds.size} · 当前 ${currentSelected} / ${conversationChecks.length}`;
      selectAll.checked = conversationChecks.length > 0 && currentSelected === conversationChecks.length;
      selectAll.indeterminate = currentSelected > 0 && currentSelected < conversationChecks.length;
      selectAll.disabled = running || loading || conversationChecks.length === 0;
      source.disabled = running || loading;
      sourceLoading.hidden = !loading;
      search.disabled = running;
      refresh.disabled = running || loading;
      loadMore.disabled = running || loading;
      loadAll.disabled = running || loading;
      for (const input of conversationChecks) input.disabled = running || loading;
      exportSelected.disabled = running || selectedIds.size === 0;
      updateSortButtons();
    };
    const setRunning = (value) => {
      running = value;
      close.disabled = value;
      cancel.hidden = !value;
      updateSelectionState();
    };
    const setListMessage = (message, error = false) => {
      const paragraph = document.createElement("p");
      paragraph.className = `cga-list-message${error ? " cga-list-error" : ""}`;
      paragraph.textContent = message;
      selectionList.replaceChildren(paragraph);
    };
    const renderSource = (preserveScroll = false) => {
      const previousScrollTop = preserveScroll ? selectionList.scrollTop : 0;
      const restoreScroll = () => {
        if (preserveScroll) selectionList.scrollTop = previousScrollTop;
      };
      const state = currentSourceState();
      const records = sortConversationRecords(
        ((state == null ? void 0 : state.records) ?? []).filter((record) => matchesConversationSearch(record.item, search.value)),
        sortField,
        sortDirection
      );
      const remaining = (state == null ? void 0 : state.total) == null ? null : Math.max(state.total - state.nextOffset, 0);
      loadMore.hidden = !(state == null ? void 0 : state.hasMore);
      loadAll.hidden = !(state == null ? void 0 : state.hasMore);
      loadMore.textContent = loading && !loadingAll ? "正在加载…" : remaining == null ? "加载更多" : `加载更多 · 剩余 ${remaining}`;
      loadAll.textContent = loadingAll ? "正在加载全部…" : "加载全部";
      selectionList.replaceChildren();
      if (loading && !(state == null ? void 0 : state.records.length)) {
        setListMessage("正在加载第一页对话…");
        updateSelectionState();
        restoreScroll();
        return;
      }
      if (!records.length) {
        setListMessage(search.value.trim() ? "已加载的对话中没有匹配项" : "这个来源没有对话");
        updateSelectionState();
        restoreScroll();
        return;
      }
      for (const record of records) {
        const row = document.createElement("label");
        row.className = "cga-conversation";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "cga-conversation-check";
        checkbox.value = record.item.id;
        checkbox.checked = selectedIds.has(record.item.id);
        const title = document.createElement("span");
        title.className = "cga-conversation-title";
        title.textContent = record.item.title || "未命名对话";
        title.title = title.textContent;
        const created = document.createElement("time");
        created.className = `cga-conversation-date${sortField === "create_time" ? " cga-date-active" : ""}`;
        created.textContent = conversationDate(record.item.create_time);
        created.title = `创建：${conversationDate(record.item.create_time, true)}`;
        const updated = document.createElement("time");
        updated.className = `cga-conversation-date${sortField === "update_time" ? " cga-date-active" : ""}`;
        updated.textContent = conversationDate(record.item.update_time);
        updated.title = `更新：${conversationDate(record.item.update_time, true)}`;
        row.append(checkbox, title, created, updated);
        selectionList.append(row);
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selectedIds.add(checkbox.value);
          else selectedIds.delete(checkbox.value);
          updateSelectionState();
        });
      }
      updateSelectionState();
      restoreScroll();
    };
    const loadPage = async (reset, all = false) => {
      listController == null ? void 0 : listController.abort();
      const request = new AbortController();
      listController = request;
      const sourceKey = source.value;
      const project = projectForSource(sourceKey);
      const state = reset ? emptySourceState() : sourceStates.get(sourceKey) ?? emptySourceState();
      if (reset) sourceStates.set(sourceKey, state);
      loading = true;
      loadingAll = all;
      setStatusTone("neutral");
      const mode = reset ? "first-page" : all ? "all-remaining" : "next-page";
      if (reset) renderSource();
      else {
        if (all) loadAll.textContent = "正在加载全部…";
        else loadMore.textContent = "正在加载…";
        updateSelectionState();
      }
      try {
        const byId = new Map(state.records.map((record) => [record.item.id, record]));
        const seenCursors = /* @__PURE__ */ new Set();
        if (project && state.nextCursor != null) seenCursors.add(String(state.nextCursor));
        let pages = 0;
        do {
          const page = await fetchConversationPage((project == null ? void 0 : project.id) ?? null, request.signal, {
            archived: sourceKey === ARCHIVED_SOURCE,
            offset: state.nextOffset,
            cursor: state.nextCursor
          });
          if (request.signal.aborted) return;
          for (const item of page.items) {
            const record = { item, project };
            byId.set(item.id, record);
            recordsById.set(item.id, record);
          }
          state.records = [...byId.values()];
          state.nextOffset = page.nextOffset;
          state.nextCursor = page.nextCursor;
          state.total = page.total;
          state.hasMore = page.hasMore;
          state.loaded = true;
          pages += 1;
          if (project && state.hasMore && state.nextCursor != null) {
            const cursorKey = String(state.nextCursor);
            if (seenCursors.has(cursorKey)) {
              throw new Error(`Conversation pagination repeated cursor: ${cursorKey}`);
            }
            seenCursors.add(cursorKey);
          }
        } while (all && state.hasMore);
        appendAudit("catalog.load.complete", {
          source: sourceKey,
          mode,
          pages,
          loaded: state.records.length,
          scanned: state.nextOffset,
          total: state.total,
          hasMore: state.hasMore
        });
      } catch (error) {
        if (request.signal.aborted) return;
        appendAudit("catalog.load.error", {
          source: sourceKey,
          mode: all ? "all-remaining" : reset ? "first-page" : "next-page",
          message: error instanceof Error ? error.message : String(error)
        }, "ERROR");
        setStatusTone("error");
        if (!state.records.length) {
          setListMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`, true);
        }
      } finally {
        if (listController === request) {
          listController = null;
          loading = false;
          loadingAll = false;
          renderSource(!reset);
        }
      }
    };
    const renderProjectOptions = () => {
      for (const option of [...source.querySelectorAll("option[data-project]")]) option.remove();
      for (const project of projects) {
        const option = document.createElement("option");
        option.value = `project:${project.id}`;
        option.dataset.project = "true";
        option.textContent = `Project · ${project.name}`;
        source.append(option);
      }
    };
    const initializeSources = async () => {
      if (sourcesLoaded) {
        const state = currentSourceState();
        if (state == null ? void 0 : state.loaded) renderSource();
        else await loadPage(true);
        return;
      }
      listController == null ? void 0 : listController.abort();
      const request = new AbortController();
      listController = request;
      loading = true;
      setStatusTone("neutral");
      setListMessage("正在加载 Project 列表…");
      appendAudit("catalog.projects.load.start");
      updateSelectionState();
      try {
        projects = await fetchProjects(request.signal);
        if (request.signal.aborted) return;
        sourcesLoaded = true;
        renderProjectOptions();
        appendAudit("catalog.projects.load.complete", { projects: projects.length });
      } catch (error) {
        if (request.signal.aborted) return;
        setListMessage(`加载失败：${error instanceof Error ? error.message : String(error)}`, true);
        appendAudit("catalog.projects.load.error", {
          message: error instanceof Error ? error.message : String(error)
        }, "ERROR");
        setStatusTone("error");
        return;
      } finally {
        if (listController === request) {
          listController = null;
          loading = false;
          updateSelectionState();
        }
      }
      await loadPage(true);
    };
    let lastConversationIndex = -1;
    const update = (value) => {
      const total = Math.max(value.total, 1);
      progress.max = total;
      progress.value = value.current;
      if (value.phase === "listing") return;
      if (value.phase === "attachments") return;
      if (value.phase === "conversation") {
        if (value.current === lastConversationIndex) return;
        lastConversationIndex = value.current;
        appendAudit("archive.conversation.start", {
          runId: activeRunId,
          current: value.current,
          total: value.total,
          title: value.title
        });
      }
    };
    const start = async () => {
      if (selectedIds.size === 0) return;
      const records = [...selectedIds].map((id) => recordsById.get(id)).filter((record) => record != null);
      if (records.length !== selectedIds.size) {
        appendAudit("archive.selection.invalid", {
          selected: selectedIds.size,
          resolved: records.length
        }, "ERROR");
        setStatusTone("error");
        return;
      }
      const catalog = { projects, records };
      try {
        const folder = await window.showDirectoryPicker({ id: "chatgpt-archive", mode: "readwrite" });
        controller = new AbortController();
        activeRunId = crypto.randomUUID();
        lastConversationIndex = -1;
        resetAudit();
        appendAudit("archive.start", {
          runId: activeRunId,
          mode: "selected",
          destination: folder.name,
          selectedCount: selectedIds.size
        });
        setRunning(true);
        setStatusTone("neutral");
        progress.value = 0;
        const summary = await runArchive({
          root: folder,
          mode: "selected",
          selectedConversationIds: [...selectedIds],
          catalog,
          signal: controller.signal,
          onProgress: update
        });
        const hasErrors = summary.failedConversations > 0 || summary.failedProjects > 0 || summary.failedAssets > 0 || summary.unresolvedAssets > 0;
        for (const itemError of summary.errors) {
          appendAudit("archive.item.error", {
            runId: activeRunId,
            conversationId: itemError.conversationId,
            title: itemError.title,
            message: itemError.error
          }, "ERROR");
        }
        appendAudit("archive.complete", {
          runId: activeRunId,
          summary: summaryText(summary)
        }, hasErrors ? "ERROR" : summary.incompleteProjects > 0 ? "WARN" : "INFO");
        setStatusTone(hasErrors ? "error" : summary.incompleteProjects > 0 ? "warning" : "success");
      } catch (error) {
        if ((error == null ? void 0 : error.name) === "AbortError") {
          appendAudit("archive.cancelled", {
            runId: activeRunId,
            message: "已写入的文件保留"
          }, "WARN");
          setStatusTone("warning");
        } else {
          appendAudit("archive.error", {
            runId: activeRunId,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : void 0
          }, "ERROR");
          setStatusTone("error");
        }
      } finally {
        controller = null;
        activeRunId = null;
        setRunning(false);
      }
    };
    launch.addEventListener("click", () => {
      const opening = panel.hidden;
      panel.hidden = !opening;
      if (opening) void initializeSources();
    });
    close.addEventListener("click", () => {
      panel.hidden = true;
    });
    for (const button of sortButtons) {
      button.addEventListener("click", () => {
        const field = button.dataset.sort;
        if (field === sortField) {
          sortDirection = sortDirection === "asc" ? "desc" : "asc";
        } else {
          sortField = field;
          sortDirection = field === "title" ? "asc" : "desc";
        }
        renderSource();
      });
    }
    source.addEventListener("change", () => {
      search.value = "";
      const state = currentSourceState();
      if (state == null ? void 0 : state.loaded) renderSource();
      else void loadPage(true);
    });
    search.addEventListener("input", () => {
      renderSource();
    });
    copySeparator.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(SEARCH_SEPARATOR);
        copySeparator.textContent = `已复制 ${SEARCH_SEPARATOR}`;
        window.setTimeout(() => {
          copySeparator.textContent = SEARCH_SEPARATOR;
        }, 1200);
      } catch {
        appendAudit("search.separator.copy.warning", {}, "WARN");
        setStatusTone("warning");
      }
    });
    clearLog.addEventListener("click", () => {
      resetAudit();
      setStatusTone("neutral");
    });
    copyLog.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(auditEntries.join("\n\n"));
        copyLog.textContent = "已复制";
        window.setTimeout(() => {
          copyLog.textContent = "复制日志";
        }, 1200);
      } catch {
        appendAudit("log.copy.warning", {}, "WARN");
        setStatusTone("warning");
      }
    });
    refresh.addEventListener("click", () => {
      if (sourcesLoaded) void loadPage(true);
      else void initializeSources();
    });
    loadMore.addEventListener("click", () => {
      void loadPage(false);
    });
    loadAll.addEventListener("click", () => {
      void loadPage(false, true);
    });
    selectAll.addEventListener("change", () => {
      for (const input of selectionList.querySelectorAll(".cga-conversation-check")) {
        input.checked = selectAll.checked;
        if (selectAll.checked) selectedIds.add(input.value);
        else selectedIds.delete(input.value);
      }
      updateSelectionState();
    });
    exportSelected.addEventListener("click", () => {
      void start();
    });
    cancel.addEventListener("click", () => controller == null ? void 0 : controller.abort());
    setRunning(false);
  }
  mountUi();
  window.setInterval(mountUi, 1500);

})();