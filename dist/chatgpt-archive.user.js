// ==UserScript==
// @name         ChatGPT Archive
// @namespace    svomro
// @version      0.1.0
// @author       svomro
// @description  Archive raw ChatGPT JSON and all first-party attachments.
// @license      MIT
// @icon         https://chatgpt.com/favicon.ico
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-end
// ==/UserScript==

(o=>{if(typeof GM_addStyle=="function"){GM_addStyle(o);return}const a=document.createElement("style");a.textContent=o,document.head.append(a)})(" #chatgpt-archive-root{position:fixed;right:20px;bottom:20px;z-index:2147483647;color:#1f2937;font:13px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}#chatgpt-archive-root button{border:0;border-radius:9px;cursor:pointer;font:inherit}#chatgpt-archive-root button:disabled{cursor:not-allowed;opacity:.45}.cga-launch{float:right;padding:9px 14px;background:#111827;color:#fff;box-shadow:0 5px 18px #0003}.cga-panel{width:min(420px,calc(100vw - 32px));margin-bottom:10px;padding:16px;border:1px solid #d1d5db;border-radius:14px;background:#fff;box-shadow:0 15px 45px #0003}.cga-head,.cga-actions{display:flex;align-items:center;gap:8px}.cga-head{justify-content:space-between}.cga-head strong{font-size:15px}.cga-close{width:28px;height:28px;background:transparent;color:inherit;font-size:20px!important}.cga-actions{flex-wrap:wrap;margin:14px 0}.cga-actions button{padding:7px 10px;background:#e5e7eb;color:#111827}.cga-actions .cga-cancel{background:#fee2e2;color:#991b1b}.cga-status{max-height:90px;overflow:auto;word-break:break-word}.cga-progress{width:100%;margin-top:9px}.cga-has-errors .cga-status{color:#b91c1c}@media(prefers-color-scheme:dark){#chatgpt-archive-root{color:#e5e7eb}.cga-panel{border-color:#4b5563;background:#202123}.cga-actions button{background:#374151;color:#f9fafb}} ");

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
      if (!response.ok) return null;
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
      for (const item of page.items ?? []) {
        const project = projectFromItem(item);
        if (project) projects.push(project);
      }
      cursor = page.cursor ?? null;
      if (cursor != null) {
        const key = String(cursor);
        if (seenCursors.has(key)) break;
        seenCursors.add(key);
      }
    } while (cursor != null);
    return projects;
  }
  async function fetchConversationList(projectId, signal, archived = false) {
    const items = [];
    let offset = 0;
    let cursor = 0;
    const limit = projectId ? 50 : 100;
    const seenCursors = /* @__PURE__ */ new Set();
    while (true) {
      let page;
      if (projectId) {
        const params = new URLSearchParams({ limit: String(limit), cursor: String(cursor ?? 0) });
        page = await fetchJson(`/gizmos/${encodeURIComponent(projectId)}/conversations?${params}`, signal);
      } else {
        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
          ...archived ? { is_archived: "true" } : {}
        });
        page = await fetchJson(`/conversations?${params}`, signal);
      }
      const batch = page.items ?? [];
      items.push(...batch);
      if (batch.length === 0) break;
      if (projectId) {
        cursor = page.cursor ?? null;
        if (cursor == null) break;
        const key = String(cursor);
        if (seenCursors.has(key)) break;
        seenCursors.add(key);
      } else {
        offset += limit;
        if (page.total != null && offset >= page.total) break;
        if (batch.length < limit) break;
      }
    }
    return items;
  }
  async function fetchAllConversationRecords(projects, signal) {
    const byId = /* @__PURE__ */ new Map();
    for (const item of await fetchConversationList(null, signal)) {
      byId.set(item.id, { item, project: null });
    }
    try {
      for (const item of await fetchConversationList(null, signal, true)) {
        byId.set(item.id, { item, project: null });
      }
    } catch (error) {
      console.warn("[ChatGPT Archive] archived conversation listing failed", error);
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
    return fetchJson(`/files/download/${encodeURIComponent(fileId)}?${params}`, signal);
  }
  async function fetchFileResponse(url, signal) {
    const response = await fetch(url, { credentials: "include", signal });
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
    if (contentType.includes("text/html") && !isInterpreterDownload && !/\battachment\b/i.test(disposition)) {
      throw new Error("File endpoint returned HTML instead of an attachment");
    }
    return response;
  }
  const FILE_ID_RE = new RegExp("(?<![A-Za-z0-9])(?:file_[A-Za-z0-9]{16,}|file-(?!service\\b)[A-Za-z0-9]{16,})", "gi");
  const LIBRARY_ID_RE = /libfile_[A-Za-z0-9]{16,}/gi;
  const POINTER_RE = /(?:sediment|file-service):\/\/[^\s\])}"']+/gi;
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
    const mimeType = strings(value.mime_type)[0] ?? strings(value.mimetype)[0] ?? strings(value.media_type)[0] ?? inherited.mimeType;
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
    return [...assets.values()].map((asset) => ({
      key: asset.key,
      fileId: asset.fileId,
      aliases: [...asset.aliasSet],
      directUrls: [...asset.directUrlSet],
      inlineDataUrl: asset.inlineDataUrl,
      sandboxPaths: [...asset.sandboxPathSet],
      names: [...asset.nameSet],
      mimeTypes: [...asset.mimeTypeSet],
      expectedSizes: [...asset.expectedSizeSet],
      references: asset.references
    }));
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
    if (typeof value === "number") date = new Date(value * 1e3);
    else if (typeof value === "string") date = new Date(value);
    else date = /* @__PURE__ */ new Date();
    if (Number.isNaN(date.getTime())) date = /* @__PURE__ */ new Date();
    return date.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "");
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
        return await writeResponse(folder, name, await fetchFileResponse(url, signal));
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error("No usable download URL");
  }
  async function manifestHash(file) {
    return file.size <= MAX_HASH_BYTES ? sha256(file) : null;
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
      references: asset.references
    };
  }
  async function downloadAsset(asset, folder, signal) {
    const manifest = baseManifest(asset);
    if (!asset.fileId && !asset.inlineDataUrl && asset.directUrls.length === 0) {
      manifest.error = asset.sandboxPaths.length ? `Unresolved sandbox path: ${asset.sandboxPaths.join(", ")}` : "No resolver supported this reference";
      return manifest;
    }
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      signal.throwIfAborted();
      manifest.attempts = attempt;
      try {
        const resolved = await resolveAsset(asset, signal);
        const name = assetFileName(asset, resolved.name, resolved.mimeType);
        const existing = await existingFile(folder, name);
        if (existing && existing.size > 0 && (resolved.expectedSize == null || existing.size === resolved.expectedSize)) {
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
        const retryable = !(error instanceof ApiError) || error.status === 408 || error.status === 429 || error.status >= 500;
        if (!retryable || error instanceof PermanentAssetError) break;
        if (attempt < MAX_ATTEMPTS) {
          const wait2 = error instanceof ApiError && error.retryAfterMs > 0 ? error.retryAfterMs : Math.min(1e3 * 2 ** (attempt - 1), 15e3);
          await sleep(wait2, signal);
        }
      }
    }
    manifest.status = "failed";
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
  const MANIFEST_VERSION = 1;
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
    const unresolved = entries.filter((entry) => entry.status === "unresolved").length;
    return {
      version: MANIFEST_VERSION,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      conversationId: ownerId,
      expected: entries.length,
      downloaded,
      existing,
      failed,
      unresolved,
      complete: failed === 0 && unresolved === 0 && coverageWarnings.length === 0,
      coverageWarnings,
      assets: entries
    };
  }
  function currentConversationId() {
    var _a;
    return ((_a = location.pathname.match(/^\/(?:c|g\/[^/]+\/c)\/([A-Za-z0-9-]+)/)) == null ? void 0 : _a[1]) ?? null;
  }
  function getCurrentConversationId() {
    return currentConversationId();
  }
  async function runArchive(options) {
    const { signal, onProgress } = options;
    signal.throwIfAborted();
    onProgress == null ? void 0 : onProgress({ phase: "listing", current: 0, total: 0, title: "读取账号", detail: "" });
    const [account, projects] = await Promise.all([
      getAccountProfile(),
      fetchProjects(signal)
    ]);
    const providerFolder = await directory(options.root, ["ChatGPT"]);
    const accountFolder = await directory(providerFolder, [`[${safeName(account.email, "unknown-account")}]`]);
    await writeJson(accountFolder, "account.json", {
      ...account,
      archivedAt: (/* @__PURE__ */ new Date()).toISOString(),
      projects: projects.map((project) => ({ id: project.id, name: project.name, description: project.description }))
    });
    let records;
    if (options.mode === "current") {
      const id = options.currentConversationId ?? currentConversationId();
      if (!id) throw new Error("当前页面没有对话 ID");
      records = [{
        item: { id, title: id, create_time: 0 },
        project: null
      }];
    } else {
      records = await fetchAllConversationRecords(projects, signal);
    }
    const summary = {
      projects: 0,
      failedProjects: 0,
      conversations: records.length,
      completeConversations: 0,
      failedConversations: 0,
      downloaded: 0,
      existing: 0,
      failedAssets: 0,
      unresolvedAssets: 0,
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
          onProgress == null ? void 0 : onProgress({
            phase: "attachments",
            current: projectIndex + 1,
            total,
            title: `Project: ${project.name}`,
            detail: `来源文件 ${assetIndex + 1}/${projectAssets.length}`
          });
          return downloadAsset(asset, projectFolder, signal);
        });
        const manifest = createManifest(`project:${project.id}`, entries, [
          "Project Sources has not been independently enumerated; this manifest covers only file references present in the Project sidebar response."
        ]);
        await writeJson(projectFolder, "project-attachments-manifest.json", manifest);
        summary.downloaded += manifest.downloaded;
        summary.existing += manifest.existing;
        summary.failedAssets += manifest.failed;
        summary.unresolvedAssets += manifest.unresolved;
        if (!manifest.complete) summary.failedProjects += 1;
      } catch (error) {
        if (signal.aborted) throw error;
        summary.failedProjects += 1;
        summary.errors.push({
          conversationId: `project:${project.id}`,
          title: project.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    };
    if (options.mode === "all") {
      for (let projectIndex = 0; projectIndex < projects.length; projectIndex += 1) {
        await archiveProject(projects[projectIndex], projectIndex, projects.length);
      }
    }
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
        const historyName = `history-${timestampLabel(conversation.update_time ?? conversation.create_time)}.json`;
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
            detail: `附件 ${completedAssets}/${assets.length}: ${entry.localFile ?? asset.fileId ?? asset.key}`
          });
          return entry;
        });
        const manifest = createManifest(conversationId(conversation), entries);
        await writeJson(folder, "attachments-manifest.json", manifest);
        summary.downloaded += manifest.downloaded;
        summary.existing += manifest.existing;
        summary.failedAssets += manifest.failed;
        summary.unresolvedAssets += manifest.unresolved;
        if (manifest.complete) summary.completeConversations += 1;
        else summary.failedConversations += 1;
      } catch (error) {
        if (signal.aborted) throw error;
        summary.failedConversations += 1;
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
      detail: summary.failedConversations === 0 && summary.failedProjects === 0 && summary.failedAssets === 0 && summary.unresolvedAssets === 0 ? "所有附件均已保存" : "存在失败或无法解析的附件"
    });
    return summary;
  }
  const ROOT_ID = "chatgpt-archive-root";
  function summaryText(summary) {
    return [
      `Project ${summary.projects}`,
      `Project失败 ${summary.failedProjects}`,
      `对话 ${summary.conversations}`,
      `完整 ${summary.completeConversations}`,
      `下载 ${summary.downloaded}`,
      `已存在 ${summary.existing}`,
      `失败附件 ${summary.failedAssets}`,
      `无法解析 ${summary.unresolvedAssets}`,
      `失败对话 ${summary.failedConversations}`
    ].join(" · ");
  }
  function mountUi() {
    if (document.getElementById(ROOT_ID)) return;
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
        <button class="cga-launch" type="button">Archive</button>
        <div class="cga-panel" hidden>
            <div class="cga-head">
                <strong>ChatGPT Archive</strong>
                <button class="cga-close" type="button" aria-label="关闭">×</button>
            </div>
            <p>选择父目录后，脚本会创建 ChatGPT/[账号]/…</p>
            <div class="cga-actions">
                <button class="cga-current" type="button">保存当前对话</button>
                <button class="cga-all" type="button">保存全部对话和 Projects</button>
                <button class="cga-cancel" type="button" hidden>取消</button>
            </div>
            <div class="cga-status">尚未开始</div>
            <progress class="cga-progress" max="1" value="0"></progress>
        </div>
    `;
    document.body.append(root);
    const launch = root.querySelector(".cga-launch");
    const panel = root.querySelector(".cga-panel");
    const close = root.querySelector(".cga-close");
    const current = root.querySelector(".cga-current");
    const all = root.querySelector(".cga-all");
    const cancel = root.querySelector(".cga-cancel");
    const status = root.querySelector(".cga-status");
    const progress = root.querySelector(".cga-progress");
    let controller = null;
    const setRunning = (running) => {
      current.disabled = running || !getCurrentConversationId();
      all.disabled = running;
      close.disabled = running;
      cancel.hidden = !running;
    };
    const update = (value) => {
      const total = Math.max(value.total, 1);
      progress.max = total;
      progress.value = value.current;
      status.textContent = `${value.title}${value.detail ? ` — ${value.detail}` : ""}${value.total ? ` (${value.current}/${value.total})` : ""}`;
    };
    const start = async (mode) => {
      try {
        const folder = await window.showDirectoryPicker({ id: "chatgpt-archive", mode: "readwrite" });
        controller = new AbortController();
        setRunning(true);
        progress.value = 0;
        status.textContent = "开始读取…";
        const summary = await runArchive({
          root: folder,
          mode,
          currentConversationId: getCurrentConversationId() ?? void 0,
          signal: controller.signal,
          onProgress: update
        });
        status.textContent = summaryText(summary);
        root.classList.toggle(
          "cga-has-errors",
          summary.failedConversations > 0 || summary.failedProjects > 0 || summary.failedAssets > 0 || summary.unresolvedAssets > 0
        );
      } catch (error) {
        if ((error == null ? void 0 : error.name) === "AbortError") status.textContent = "已取消，已写入的文件保留";
        else status.textContent = `失败：${error instanceof Error ? error.message : String(error)}`;
        root.classList.add("cga-has-errors");
      } finally {
        controller = null;
        setRunning(false);
      }
    };
    launch.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      current.disabled = !getCurrentConversationId();
    });
    close.addEventListener("click", () => {
      panel.hidden = true;
    });
    current.addEventListener("click", () => {
      void start("current");
    });
    all.addEventListener("click", () => {
      void start("all");
    });
    cancel.addEventListener("click", () => controller == null ? void 0 : controller.abort());
    setRunning(false);
  }
  mountUi();
  window.setInterval(mountUi, 1500);

})();