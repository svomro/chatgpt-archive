// ==UserScript==
// @name         ChatGPT Live Stream Recorder
// @namespace    vesper.local
// @version      0.4.1
// @description  Capture ChatGPT's raw model stream (fetch SSE + WebSocket second leg + EventSource) chunk-by-chunk into IndexedDB, then reassemble logical turns -- thoughts, commentary, tools, reasoning recap, final -- as a derived view over the raw bytes.
// @author       vesper
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

// `@grant none` is load-bearing: it puts this script in the *page* realm so that
// patching window.fetch / WebSocket / EventSource actually patches the ones
// ChatGPT's bundle will call. Under any @grant, Tampermonkey hands you a
// sandboxed window proxy and the patches silently do nothing.
//
// WHY THREE HOOKS. POST /backend-api/f/conversation no longer carries the tokens.
// It answers with a ~1 KB SSE ending in a `stream_handoff` that offers two
// transports -- `resume_sse_endpoint` and `subscribe_ws_topic`. The real token and
// thinking stream arrives on whichever the client picks, and neither EventSource
// nor WebSocket goes through fetch.
//
// INVARIANT: raw bytes are the source of truth, append-only. Every readable view
// (turns, markdown) is recomputed from stored chunks and never written back over
// them. A parser change can therefore be re-run against everything ever captured.

(() => {
  'use strict';
  if (window.__cgptArchive) return; // SPA re-injection guard

  const DB_NAME = 'chatgpt-archive';
  const DB_VERSION = 1;
  // Last-resort guard against a runaway stream filling the origin's IndexedDB
  // quota. Note the unit: a ChatGPT WebSocket is long-lived and multiplexes every
  // turn in the conversation, so for that socket this is effectively a whole-
  // session budget, not a per-answer one -- hence a number well above what any
  // realistic session produces. Hitting it means bytes were LOST, which is a
  // failure of this tool's one promise, so it is reported as an error by audit()
  // and turns the badge red. Tune with __cgptArchive.setStreamCap(bytes).
  let maxBytesPerStream = 256 * 1024 * 1024;
  const FLUSH_MS = 3000;
  const LOG = (...a) => console.debug('%c[cgpt-archive]', 'color:#10a37f', ...a);

  // ---------------------------------------------------------------- storage

  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const rq = indexedDB.open(DB_NAME, DB_VERSION);
      rq.onupgradeneeded = () => {
        const d = rq.result;
        if (!d.objectStoreNames.contains('streams')) d.createObjectStore('streams', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('chunks')) {
          d.createObjectStore('chunks', { keyPath: ['streamId', 'seq'] }).createIndex('byStream', 'streamId');
        }
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    return dbp;
  }
  const store = (name, mode) => db().then((d) => d.transaction(name, mode).objectStore(name));
  const putStream = (rec) => store('streams', 'readwrite').then((s) => s.put(rec)).catch((e) => LOG('putStream failed', e));
  // The whole point: this lands per chunk, so a stream that is later truncated,
  // replaced, or never finishes still leaves its frames on disk.
  const putChunk = (streamId, seq, t, bytes, dir) =>
    store('chunks', 'readwrite').then((s) => s.put({ streamId, seq, t, bytes, dir })).catch((e) => LOG('putChunk failed', e));
  const getAll = (name, fn) => store(name, 'readonly').then((s) => new Promise((res, rej) => {
    const rq = fn(s); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  }));
  const allStreams = () => getAll('streams', (s) => s.getAll()).then((r) => r.sort((a, b) => b.startedAt - a.startedAt));
  const chunksOf = (id) => getAll('chunks', (s) => s.index('byStream').getAll(id)).then((r) => r.sort((a, b) => a.seq - b.seq));

/* ==PURE-START==
 * Pure protocol layer: no DOM, no IndexedDB, no timers. tools/test-fixture.js
 * extracts everything between these markers verbatim, so the tests exercise the
 * shipped code rather than a copy of it.
 *
 * LAYERING is a port of tianya518/gptclient-go sentinel/chat_ws.go --
 * parseWSFrames / processWSMessage / processWSEncodedItem / ingestWSMessageObject
 * keep their names and responsibilities so the two can be diffed.
 *
 * WIRE PROTOCOL (verified against a real 2026-08 capture; fixture beats docs):
 *   WS frame     -> a JSON array or object; an exported archive concatenates
 *                   frames, so `[{..}]{..}` must also split cleanly.
 *   envelope     -> {type:"message", topic_id:"conversation-turn-<turn_id>", offset,
 *                    payload:{type:"conversation-turn-stream", payload:<inner>}}
 *                   ({type:"reply"} is a subscribe ack -- no payload, ignored)
 *   inner        -> {type:"stream-item", conversation_id, turn_id, encoded_item,
 *                    stream_item_id, parent_stream_item_id, server_timestamp_ms}
 *                   | {type:"heartbeat"}
 *   encoded_item -> SSE text: "event: delta\ndata: {...}"
 *
 * WHERE THIS DIVERGES FROM THE REFERENCES, AND WHY:
 *
 * 1. Sticky `o`/`p`. Neither gptclient-go nor rosetta tracks them: both treat a
 *    bare `{v:"..."}` as "append to the current text buffer" and pick the buffer
 *    from a mode flag (isAnalysisStream / a single body buffer). In the reference
 *    capture 25 of 37 delta frames are bare, and commentary and the final answer
 *    BOTH append to /message/content/parts/0 -- of different messages. A mode flag
 *    cannot separate them. So `o` and `p` are inherited from the previous delta
 *    frame and resolved against `current`, the most recently added message.
 *
 * 2. Turn completion. gptclient-go ends on [DONE] or a socket read error. The WS
 *    leg in the capture sends neither: it ends on a message_marker with
 *    marker="last_token". And the socket is long-lived and multiplexes every turn
 *    in the conversation, so its close can never mean "this answer is done".
 */

// --- layer 1: frames ---------------------------------------------------------
// gptclient-go switches on raw[0]=='[' for a single frame. Same idea, but it also
// splits a concatenation, because that is what an exported archive looks like.
function splitTopLevelJson(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    const start = i;
    let depth = 0, inStr = false, esc = false;
    for (; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') { depth--; if (depth === 0) { i++; break; } }
    }
    if (i === start) { i++; continue; }
    out.push(s.slice(start, i));
  }
  return out;
}

function parseWSFrames(raw, onError) {
  const frames = [];
  for (const chunk of splitTopLevelJson(String(raw == null ? '' : raw))) {
    let v;
    try { v = JSON.parse(chunk); } catch (_) { if (onError) onError(); continue; }
    if (Array.isArray(v)) { for (const f of v) if (f && typeof f === 'object') frames.push(f); }
    else if (v && typeof v === 'object') frames.push(v);
  }
  return frames;
}

function parseSseFrames(text) {
  const out = [];
  for (const block of String(text).split('\n\n')) {
    if (!block.trim()) continue;
    let event = null;
    const data = [];
    for (const line of block.split('\n')) {
      if (/^event:/.test(line)) event = line.replace(/^event:\s?/, '').trim();
      else if (/^data:/.test(line)) data.push(line.replace(/^data:\s?/, ''));
    }
    if (event !== null || data.length) out.push({ event, data: data.join('\n').trim() });
  }
  return out;
}

function topicTurn(topicId) {
  const m = /^conversation-turn-(.+)$/.exec(String(topicId == null ? '' : topicId));
  return m ? m[1] : null;
}

// RFC6901-ish. Returns the container plus the final key so callers can mutate in
// place; null when the path does not exist.
function ptrResolve(root, ptr) {
  if (ptr === '' || ptr == null) return { parent: null, key: null, value: root };
  const segs = String(ptr).split('/').slice(1).map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
  let node = root;
  for (let i = 0; i < segs.length - 1; i++) {
    if (node == null || typeof node !== 'object') return null;
    node = Array.isArray(node) ? node[Number(segs[i])] : node[segs[i]];
  }
  if (node == null || typeof node !== 'object') return null;
  const last = segs[segs.length - 1];
  const key = Array.isArray(node) ? Number(last) : last;
  return { parent: node, key, value: node[key] };
}

// --- layer 2+3: envelopes, encoded items, turn reduction ---------------------

// Byte budget for one stream. Pure so the accounting is testable: "some bytes
// were dropped" is not actionable, "1432 chunks / 48 MB were dropped" is.
function makeCapGuard(maxBytes) {
  let used = 0, droppedChunks = 0, droppedBytes = 0, capped = false;
  return {
    get used() { return used; },
    get capped() { return capped; },
    get droppedChunks() { return droppedChunks; },
    get droppedBytes() { return droppedBytes; },
    // Decide BEFORE storing, so the budget is never overshot by a whole chunk.
    // And once capped, refuse everything from then on -- letting a later small
    // chunk squeeze into the leftover budget would punch a hole in the middle of
    // the stream. A stream truncated at a known point is honest; one with a gap
    // is worse than useless, because an append-based delta stream with a hole
    // silently reassembles into wrong text rather than obviously missing text.
    admit(n) {
      if (capped || used + n > maxBytes) { capped = true; droppedChunks++; droppedBytes += n; return false; }
      used += n;
      return true;
    },
  };
}

function makeTurnAssembler() {
  const turns = new Map();
  let lastTurn = null; // sticky turn for identity-less continuation frames
  // (topic_id, offset) of every envelope already reduced. Catch-up backlog is a
  // REPLAY of frames we may already hold, and while `add` is idempotent `append`
  // very much is not -- replaying one doubles the text. Offsets are the server's
  // own sequence numbers, so they are the right key.
  const seenOffsets = new Set();
  const stats = { frames: 0, envelopes: 0, streamItems: 0, heartbeats: 0, sseFrames: 0, parseErrors: 0, thrown: 0, unhandled: {}, unknownTypes: {}, turnlessSkipped: {}, asyncUpdates: {}, asyncStored: {}, catchups: {}, duplicateOffsets: {} };
  const note = (bag, k) => { bag[k] = (bag[k] || 0) + 1; };

  function turnFor(conversationId, turnId) {
    // Key on the turn id alone when we have one: it is a UUID and therefore
    // already unique, whereas the conversation id is not always present on the
    // frame that first mentions a turn (the resume leg omits it entirely). Keying
    // on the pair would split one turn into `null|id` and `conv|id`.
    const key = turnId ? 'T:' + turnId : 'C:' + (conversationId || '?');
    let t = turns.get(key);
    if (!t) {
      t = {
        key, conversationId: conversationId || null, turnId: turnId || null,
        startedAt: null, finishedAt: null, status: 'streaming',
        model: null, thinkingEffort: null, userText: null,
        messages: new Map(), order: [], markers: [], streamItemCount: 0,
        handoffOptions: null, timestamps: [], deltaEncoding: false,
        delta: { op: null, ptr: null, current: null },
        // Post-final bookkeeping. Content is frozen at last_token; anything that
        // tries to rewrite it afterwards is counted and sampled, never silently
        // dropped and never silently applied.
        postFinalRejected: 0, postFinalRejectedDetail: [], postFinalEvents: {},
        // Whole-message re-deliveries (async task updates, conversation-update).
        // Deliberately NOT merged into `messages`: for a turn that is streaming,
        // the delta path is mid-append on that very message, and folding a
        // complete copy in underneath it doubles the text. Kept aside and used
        // only for messages the delta path never produced.
        asyncMessages: new Map(),
      };
      turns.set(key, t);
    } else if (!t.conversationId && conversationId) t.conversationId = conversationId;
    return t;
  }

  // Exactly one stable object per message id: pointer ops mutate it in place, so
  // the reference must never be swapped out from under them.
  function noteMessage(t, msg) {
    if (!msg || !msg.id) return null;
    let stored = t.messages.get(msg.id);
    if (!stored) {
      stored = msg;
      t.messages.set(msg.id, stored);
      t.order.push(msg.id);
    } else if (stored !== msg) {
      for (const k of Object.keys(msg)) { if (k !== 'content' && msg[k] != null) stored[k] = msg[k]; }
      const a = stored.content || (stored.content = {});
      const b = msg.content || {};
      for (const k of Object.keys(b)) {
        if (k === 'parts' && Array.isArray(a.parts) && Array.isArray(b.parts)) {
          // A re-add carrying parts:[""] must not erase text already appended.
          b.parts.forEach((p, i) => {
            if (typeof p === 'string' && (typeof a.parts[i] !== 'string' || p.length > a.parts[i].length)) a.parts[i] = p;
          });
        } else if (b[k] != null) a[k] = b[k];
      }
    }
    const md = stored.metadata || {};
    if (md.model_slug || md.resolved_model_slug) t.model = md.model_slug || md.resolved_model_slug;
    if (md.thinking_effort) t.thinkingEffort = md.thinking_effort;
    if (stored.author && stored.author.role === 'user' && t.userText == null) {
      const c = stored.content || {};
      const txt = Array.isArray(c.parts) ? c.parts.filter((p) => typeof p === 'string').join('') : (c.text || c.content || '');
      if (txt) t.userText = txt;
    }
    return stored;
  }

  // THE FREEZE. Once a turn has seen its own last_token, its readable message
  // state is final. A later rewrite -- a safety replacement, a regeneration
  // racing in, a stray patch -- must not be able to reach back and edit an answer
  // we already watched arrive. raw capture is untouched: every frame is still
  // stored, so the rewrite is recoverable from the archive; it just does not get
  // to overwrite history in the derived view.
  //
  // In the reference multi-turn capture this rejects nothing: after last_token
  // the wire only carries server_ste_metadata / message_stream_complete /
  // conversation_detail_metadata / ads / [DONE], none of which carry .message,
  // .v or .p. It is a guard, not a fix.
  // Enough to tell a harmless re-delivery from a real rewrite without keeping the
  // body: compare `len` against the turn's existing final.
  function describeMsg(m) {
    const c = (m && m.content) || {};
    const len = Array.isArray(c.parts) ? c.parts.filter((x) => typeof x === 'string').join('').length
      : (typeof c.text === 'string' ? c.text.length : 0);
    return { message_id: (m && m.id) || null, channel: (m && m.channel) || null, content_type: c.content_type || null, len };
  }

  function rejectPostFinal(t, what, detail) {
    t.postFinalRejected++;
    if (t.postFinalRejectedDetail.length < 20) t.postFinalRejectedDetail.push(Object.assign({ what }, detail));
  }

  function exec(t, op, ptr, v) {
    if (t.status === 'complete') {
      rejectPostFinal(t, 'delta', { op: op == null ? null : String(op), ptr: ptr == null ? null : String(ptr), size: (() => { try { return JSON.stringify(v).length; } catch (_) { return null; } })() });
      return;
    }
    const d = t.delta;
    if (op === 'patch') {
      for (const sub of (Array.isArray(v) ? v : [v])) {
        if (sub && typeof sub === 'object') exec(t, sub.o == null ? 'add' : sub.o, typeof sub.p === 'string' ? sub.p : ptr, sub.v);
      }
      return;
    }
    const rootLevel = ptr === '' || ptr == null;
    if ((op === 'add' || op == null) && rootLevel) {
      if (v && typeof v === 'object') {
        const stored = v.message ? noteMessage(t, v.message) : null;
        d.current = stored ? Object.assign({}, v, { message: stored }) : v;
      }
      return;
    }
    if (!d.current) return;
    const loc = ptrResolve(d.current, ptr);
    if (!loc || loc.parent == null) return;
    const cur = loc.parent[loc.key];
    if (op === 'append' || op === 'a') {
      if (Array.isArray(cur)) loc.parent[loc.key] = cur.concat(v);
      else if (typeof v === 'string') loc.parent[loc.key] = (typeof cur === 'string' ? cur : '') + v;
      else if (cur == null) loc.parent[loc.key] = v;
    } else {
      loc.parent[loc.key] = v;
    }
  }

  function processDelta(t, evt) {
    const d = t.delta;
    const hasO = Object.prototype.hasOwnProperty.call(evt, 'o');
    const hasP = typeof evt.p === 'string';
    const op = hasO ? evt.o : d.op;
    const ptr = hasP ? evt.p : d.ptr;
    if (hasO) d.op = evt.o;
    if (hasP) d.ptr = evt.p;
    exec(t, op == null ? 'add' : op, ptr, evt.v);
  }

  // Whole-message frames (no delta encoding), plus gptclient-go's two direct
  // message paths.
  function ingestWSMessageObject(t, msg) { noteMessage(t, msg); }

  function processFull(t, evt, serverTs) {
    if (evt.type === 'input_message' && evt.input_message) {
      if (t.status === 'complete') { rejectPostFinal(t, 'input_message', { message_id: evt.input_message.id || null }); return; }
      noteMessage(t, evt.input_message);
      return;
    }
    if (evt.type === 'message_marker') {
      t.markers.push({ marker: evt.marker, event: evt.event, message_id: evt.message_id, at: serverTs || null });
      if (evt.marker === 'last_token') { t.status = 'complete'; t.finishedAt = serverTs || t.finishedAt || null; }
      return;
    }
    if (evt.type === 'stream_handoff') { t.handoffOptions = evt.options || null; return; }
    if (evt.type === 'resume_conversation_token') return;
    if (evt.message) {
      if (t.status === 'complete') { rejectPostFinal(t, 'message', describeMsg(evt.message)); return; }
      ingestWSMessageObject(t, evt.message);
      return;
    }
    // Metadata-only tail. These carry no .message/.v/.p, so they cannot touch
    // content and stay allowed after the freeze -- but they are recorded, so the
    // day one of them starts carrying a message you will see it here.
    // message_stream_complete is deliberately NOT treated as a completion signal:
    // it arrives with a conversation_id and no turn_id, so it cannot be scoped to
    // the right turn once the next one has started.
    if (evt.type) {
      if (t.status === 'complete') note(t.postFinalEvents, evt.type);
      note(stats.unknownTypes, evt.type);
    }
  }

  function dispatch(evt, currentEvent, ctx, serverTs) {
    let convId = evt.conversation_id || (ctx && ctx.conversationId) || null;
    let turnId = evt.turn_exchange_id || evt.turn_id || (ctx && ctx.turnId) || null;
    // The /f/conversation/resume leg replays a conversation's history as delta
    // frames that carry no conversation_id and no turn_id at all. The messages
    // inside them do, so route on that before falling back to anything guessy.
    if (!turnId) {
      const carried = (evt.v && evt.v.message) || evt.message || evt.input_message || null;
      const cmd = (carried && carried.metadata) || {};
      turnId = cmd.turn_exchange_id || cmd.working_turn_id || null;
      if (!convId && cmd.conversation_id) convId = cmd.conversation_id;
    }
    // Consecutive delta frames belong to one logical stream, so a bare
    // `{v: "..."}` append with no identity of its own follows the turn the last
    // identified frame resolved to. Without this the resume leg's appends would
    // scatter into a phantom bucket.
    if (!turnId && lastTurn && (!convId || lastTurn.conversationId === convId)) {
      const carriesContent = !!evt.message || evt.type === 'input_message'
        || (!evt.type && ('v' in evt || 'o' in evt || typeof evt.p === 'string'));
      if (carriesContent) turnId = lastTurn.turnId;
      if (turnId && !convId) convId = lastTurn.conversationId;
    }
    // Turn-agnostic bookkeeping. On the fetch leg this arrives before the
    // stream_handoff that names the turn, so honouring it literally would mint an
    // empty `conversation|?` bucket that then shows up as a blank turn.
    if (!turnId && convId) {
      const prior = [...turns.values()].filter((x) => x.conversationId === convId && x.turnId).pop();
      if (prior) turnId = prior.turnId;
    }
    // A frame with no turn id that cannot carry content must not mint a bucket.
    // resume_conversation_token, url_moderation and the metadata tail all arrive
    // this way, and honouring them literally produces a phantom `conversation|?`
    // turn that then collects real content routed to it by the fallback above.
    if (!turnId) {
      const carriesContent = !!evt.message || evt.type === 'input_message'
        || (!evt.type && ('v' in evt || 'o' in evt || typeof evt.p === 'string'));
      if (!carriesContent) { note(stats.turnlessSkipped, evt.type || 'delta'); return null; }
    }
    const t = turnFor(convId, turnId);
    if (t.turnId) lastTurn = t;
    if (t.startedAt == null && serverTs) t.startedAt = serverTs;
    if (!t.deltaEncoding && currentEvent === 'delta') t.deltaEncoding = true;
    const isDelta = t.deltaEncoding && currentEvent === 'delta';
    if (isDelta || (!evt.type && ('v' in evt || 'o' in evt || typeof evt.p === 'string'))) processDelta(t, evt);
    else processFull(t, evt, serverTs);
    return t;
  }

  // Line-oriented like gptclient-go's processWSEncodedItem, including the CR trim
  // and the `"v1"` skip. Returns true on [DONE].
  function processWSEncodedItem(encoded, ctx) {
    let currentEvent = '';
    // Only for the deltaEncoding flag. Without a turn id there is nothing to flag
    // yet -- dispatch() will resolve the turn from the event itself.
    const t = (ctx && ctx.turnId) ? turnFor(ctx.conversationId, ctx.turnId) : null;
    for (let line of String(encoded == null ? '' : encoded).split('\n')) {
      line = line.replace(/\r+$/, '');
      if (/^event:/.test(line)) {
        currentEvent = line.replace(/^event:\s?/, '').trim();
        if (currentEvent === 'delta_encoding' && t) t.deltaEncoding = true;
        continue;
      }
      if (!/^data:/.test(line)) continue;
      const payload = line.replace(/^data:\s?/, '').trim();
      stats.sseFrames++;
      if (!payload || payload === '"v1"') { currentEvent = ''; continue; }
      if (payload === '[DONE]') {
        // Belt and braces. last_token is what this leg actually sends today; if a
        // [DONE] ever shows up here, honour it too. NEITHER is required -- whichever
        // arrives first completes the turn, and the socket closing completes nothing.
        if (t.status !== 'complete') { t.status = 'complete'; t.finishedAt = t.finishedAt || (ctx && ctx.serverTs) || null; }
        return true;
      }
      let evt;
      try { evt = JSON.parse(payload); } catch (_) { stats.parseErrors++; currentEvent = ''; continue; }
      if (evt && typeof evt === 'object') dispatch(evt, currentEvent, ctx, ctx && ctx.serverTs);
      currentEvent = '';
    }
    return false;
  }

  // Whole-message delivery outside the delta stream. Refuses to guess: a message
  // with no resolvable turn is counted, not filed under an arbitrary turn.
  function ingestMessageForTurn(msg, conversationId, turnId, via) {
    if (!turnId || !msg || !msg.id) { note(stats.unhandled, 'message_without_turn:' + via); return; }
    const t = turnFor(conversationId, turnId);
    if (t.status === 'complete') { rejectPostFinal(t, via, describeMsg(msg)); return; }
    t.asyncMessages.set(msg.id, msg);
    note(stats.asyncStored, via);
  }

  function processWSMessage(frame) {
    stats.envelopes++;
    // A subscribe ack is not empty. When the client subscribes to a topic that
    // already has buffered items -- which is what happens whenever a turn was
    // under way before the socket attached -- the whole backlog rides along in
    // `reply.catchups`, as an array of the very same {type:"message"} envelopes
    // handled below. Dropping replies loses those turns entirely: their markers
    // still arrive live, so the turn looks complete while holding no messages.
    if (frame.type === 'reply') {
      const r = frame.reply;
      const catchups = r && Array.isArray(r.catchups) ? r.catchups : null;
      if (!catchups || !catchups.length) { note(stats.unhandled, 'reply:' + ((r && r.type) || '?')); return; }
      note(stats.catchups, (r.type || '?') + (r.recovered ? ':recovered' : ''));
      for (const item of catchups) if (item && typeof item === 'object') processWSMessage(item);
      return;
    }
    if (frame.topic_id && frame.offset != null) {
      const k = frame.topic_id + '|' + frame.offset;
      if (seenOffsets.has(k)) { note(stats.duplicateOffsets, frame.topic_id.slice(0, 24)); return; }
      seenOffsets.add(k);
    }
    const p1 = frame.payload;
    if (!p1 || typeof p1 !== 'object') { note(stats.unhandled, frame.type ? 'no_payload:' + frame.type : 'no_payload'); return; }
    const topicId = frame.topic_id;
    const p2 = p1.payload;
    if (p2 && typeof p2 === 'object') {
      const ctx = {
        conversationId: p2.conversation_id || null,
        turnId: p2.turn_id || topicTurn(topicId),
        serverTs: p2.server_timestamp_ms || null,
      };
      if (p2.type === 'heartbeat') {
        stats.heartbeats++;
        if (!ctx.turnId) { note(stats.turnlessSkipped, 'heartbeat'); return; }
        const t = turnFor(ctx.conversationId, ctx.turnId);
        if (ctx.serverTs) t.timestamps.push(ctx.serverTs);
        return;
      }
      if (typeof p2.encoded_item === 'string' && p2.encoded_item) {
        stats.streamItems++;
        if (!ctx.turnId) { note(stats.turnlessSkipped, 'stream_item'); processWSEncodedItem(p2.encoded_item, ctx); return; }
        const t = turnFor(ctx.conversationId, ctx.turnId);
        t.streamItemCount++;
        if (ctx.serverTs) { if (t.startedAt == null) t.startedAt = ctx.serverTs; t.timestamps.push(ctx.serverTs); }
        processWSEncodedItem(p2.encoded_item, ctx);
        return;
      }
      // Turn-scoped completion, unlike message_stream_complete which carries only
      // a conversation id. Same standing as last_token and [DONE]: sufficient,
      // never required.
      if (p2.type === 'done') {
        if (!ctx.turnId) { note(stats.turnlessSkipped, 'done'); return; }
        const t = turnFor(ctx.conversationId, ctx.turnId);
        if (t.status !== 'complete') { t.status = 'complete'; t.finishedAt = t.finishedAt || ctx.serverTs || null; }
        return;
      }
      if (p2.message && typeof p2.message === 'object') { ingestMessageForTurn(p2.message, ctx.conversationId, ctx.turnId, 'ws_payload_message'); return; }
      // Bare {conversation_id} pings on the `conversations` topic.
      if (!p2.type && Object.keys(p2).length <= 2 && p2.conversation_id) { note(stats.unhandled, 'conversations_ping'); return; }
      note(stats.unhandled, 'no_encoded_item:' + (p2.type || '?'));
      return;
    }
    if (p1.message && typeof p1.message === 'object') {
      ingestMessageForTurn(p1.message, p1.conversation_id || null, topicTurn(topicId), 'ws_direct_message');
      return;
    }
    // conversation-update style: async-task-update-message and
    // async-task-steering-message wrap a whole message one level deeper. In the
    // reference capture these are re-deliveries whose text is byte-identical to
    // what the delta path already built -- so the freeze rejects them and loses
    // nothing -- but for turns that were never streamed live they are the ONLY
    // copy of the answer, so the path has to exist.
    if (p1.update_type && p1.update_content && p1.update_content.message) {
      note(stats.asyncUpdates, p1.update_type);
      const m = p1.update_content.message;
      const md = m.metadata || {};
      ingestMessageForTurn(m, p1.conversation_id || null, md.turn_exchange_id || md.working_turn_id || null, p1.update_type);
      return;
    }
    note(stats.unhandled, 'no_inner_payload' + (p1.update_type ? ':' + p1.update_type : ''));
  }

  return {
    turns, stats,
    feedWs(raw) {
      try {
        for (const frame of parseWSFrames(raw, () => stats.parseErrors++)) { stats.frames++; processWSMessage(frame); }
      } catch (_) { stats.thrown++; }
    },
    // The fetch / EventSource leg: block-framed SSE, no envelope around it.
    feedSse(text) {
      try {
        for (const f of parseSseFrames(text)) {
          stats.sseFrames++;
          if (!f.data || f.data === '[DONE]' || f.data === '"v1"') continue;
          let evt;
          try { evt = JSON.parse(f.data); } catch (_) { stats.parseErrors++; continue; }
          if (evt && typeof evt === 'object') dispatch(evt, f.event, null, null);
        }
      } catch (_) { stats.thrown++; }
    },
    list() { return [...turns.values()]; },
    get(turnId) { return [...turns.values()].find((t) => t.turnId === turnId) || null; },
  };
}

// Envelope shapes we deliberately do not reduce, each verified against real
// captures to carry nothing we would want:
//   reply:*          subscribe/presence/connect acks WITHOUT a catchups array
//                    (ones that DO carry catchups are unpacked, never listed here)
//   conversations_ping   a bare {conversation_id} on the `conversations` topic
//   steering-message     async-task steering frames: no turn id, no message id,
//                        and zero content length in every occurrence measured
// Anything outside this list is a genuine unknown and is surfaced by audit().
const BENIGN_UNHANDLED = [
  /^reply:(connect|subscribe|presence|unsubscribe)$/,
  /^conversations_ping$/,
  /^message_without_turn:async-task-steering-message$/,
];

function materializeTurn(t) {
  const msgs = t.order.map((id) => t.messages.get(id)).filter(Boolean);
  // Fallback only. A message the delta stream built always wins; an async copy is
  // used solely for messages that stream never produced -- which is the only way
  // turns from earlier in the conversation, never captured live, get recovered.
  let asyncOnly = 0;
  for (const [id, m] of t.asyncMessages) {
    if (t.messages.has(id)) continue;
    msgs.push(m);
    asyncOnly++;
  }
  const textOf = (m) => {
    const c = (m && m.content) || {};
    if (Array.isArray(c.parts)) return c.parts.filter((p) => typeof p === 'string').join('');
    if (typeof c.text === 'string') return c.text;
    if (typeof c.content === 'string') return c.content;
    return '';
  };
  const role = (m) => (m.author && m.author.role) || null;
  const ct = (m) => (m.content && m.content.content_type) || null;
  const md = (m) => m.metadata || {};

  // The server re-emits a thought it has already sent, with `content` blanked, as
  // an append onto the same message. Taken literally that is a duplicate entry.
  // The reduce step still applies the append verbatim -- raw stays raw -- so the
  // collapse happens here, in the derived view, and only for the exact redundant
  // shape: same message, same summary, one side empty. A genuinely
  // summary-only thought (its own summary, no twin) is untouched.
  let thoughtsDeduped = 0;
  const thoughts = [];
  for (const m of msgs) {
    if (ct(m) !== 'thoughts') continue;
    const raw = Array.isArray(m.content.thoughts) ? m.content.thoughts : [];
    const kept = [];
    for (const th of raw) {
      const sum = th.summary == null ? '' : th.summary;
      const body = th.content == null ? '' : th.content;
      const twin = kept.find((k) => k.summary === sum && (k.content === '') !== (body === ''));
      if (twin) {
        thoughtsDeduped++;
        if (body.length > twin.content.length) { twin.content = body; twin.finished = th.finished; }
        continue;
      }
      kept.push({ summary: sum, content: body, finished: th.finished });
    }
    for (const th of kept) {
      thoughts.push({
        message_id: m.id,
        summary: th.summary,
        // "" here is real data -- a summary-only thought, not a parse failure.
        content: th.content,
        finished: th.finished,
        summary_type: md(m).summary_type || null,
        reasoning_status: md(m).reasoning_status || null,
        // Lives on content, not on metadata.
        source_analysis_msg_id: m.content.source_analysis_msg_id || null,
      });
    }
  }

  const commentary = msgs
    .filter((m) => m.channel === 'commentary' && role(m) === 'assistant' && (!m.recipient || m.recipient === 'all') && ct(m) === 'text')
    .map((m) => ({ message_id: m.id, text: textOf(m), is_thinking_preamble_message: md(m).is_thinking_preamble_message === true }));

  const byParent = new Map();
  for (const m of msgs) {
    const p = md(m).parent_id;
    if (p) { if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(m); }
  }
  const tryJson = (s) => { try { return JSON.parse(s); } catch (_) { return null; } };
  const tools = msgs
    .filter((m) => role(m) === 'assistant' && m.recipient && m.recipient !== 'all')
    .map((call) => {
      const argsRaw = textOf(call);
      // Paired through the message tree, never by array position.
      const res = (byParent.get(call.id) || []).find((x) => role(x) === 'tool') || null;
      const resRaw = res ? textOf(res) : null;
      return {
        call_message_id: call.id, name: call.recipient,
        arguments: tryJson(argsRaw), arguments_raw: argsRaw,
        language: (call.content && call.content.language) || null,
        result_message_id: res ? res.id : null,
        result: resRaw == null ? null : tryJson(resRaw), result_raw: resRaw,
      };
    });

  const recapMsg = msgs.filter((m) => ct(m) === 'reasoning_recap').pop() || null;
  const reasoning_recap = recapMsg ? {
    text: textOf(recapMsg),
    finished_duration_sec: md(recapMsg).finished_duration_sec == null ? null : md(recapMsg).finished_duration_sec,
    reasoning_start_time: md(recapMsg).reasoning_start_time == null ? null : md(recapMsg).reasoning_start_time,
    reasoning_end_time: md(recapMsg).reasoning_end_time == null ? null : md(recapMsg).reasoning_end_time,
  } : null;

  // channel === 'final' is primary; the final_channel_token marker corroborates
  // it and is the fallback if the field ever goes away.
  let finalMsg = msgs.filter((m) => m.channel === 'final' && role(m) === 'assistant').pop() || null;
  if (!finalMsg) {
    const mk = t.markers.filter((x) => x.marker === 'final_channel_token' || x.marker === 'last_token').pop();
    if (mk) finalMsg = t.messages.get(mk.message_id) || null;
  }

  // `t.status` records one thing only: did a completion signal arrive. The
  // readable status is a judgement on top of that, because "complete" on a turn
  // that carries no message at all is misleading -- the server does emit real
  // control turns that run stream items and a last_token while producing nothing.
  //
  //   empty      zero messages. `empty_reason` says whether the server ran a
  //              control turn (items + completion, no content) or we simply never
  //              captured anything for it (a bare handoff stub).
  //   recovered  content exists and nothing more is coming, but no completion
  //              signal was ever seen -- the whole answer arrived as a
  //              whole-message re-delivery, typically a turn from before capture
  //              started. Reporting that as `streaming` implies a live stream
  //              that will never finish.
  //   streaming  genuinely mid-flight, or a capture that was cut short.
  const completed = t.status === 'complete';
  let status, emptyReason = null;
  if (!msgs.length) {
    status = 'empty';
    emptyReason = (completed || t.streamItemCount > 0) ? 'control' : 'no_data';
  } else if (completed) {
    status = 'complete';
  } else if (t.streamItemCount === 0 && asyncOnly > 0) {
    status = 'recovered';
  } else {
    status = 'streaming';
  }

  const ts = t.timestamps.length ? t.timestamps : null;
  return {
    conversation_id: t.conversationId,
    turn_id: t.turnId,
    model: t.model,
    thinking_effort: t.thinkingEffort,
    user: t.userText,
    thoughts, commentary, tools, reasoning_recap,
    final: finalMsg ? textOf(finalMsg) : null,
    final_message_id: finalMsg ? finalMsg.id : null,
    started_at: t.startedAt || (ts ? Math.min.apply(null, ts) : null),
    finished_at: t.finishedAt || (completed && ts ? Math.max.apply(null, ts) : null),
    status,
    empty_reason: emptyReason,
    // The unjudged fact, kept separate so nothing about the wire is hidden:
    // did last_token / [DONE] / {type:"done"} actually arrive.
    completed,
    markers: t.markers,
    handoff_options: t.handoffOptions,
    message_count: msgs.length,
    stream_item_count: t.streamItemCount,
    // Never silent: how many redundant re-emissions the readable view collapsed.
    thoughts_deduped: thoughtsDeduped,
    // Never silent: writes that arrived after last_token and were refused.
    // Nonzero means the server tried to rewrite a finished answer -- go read the
    // raw frames for that turn.
    post_final_rejected: t.postFinalRejected,
    post_final_rejected_detail: t.postFinalRejectedDetail,
    post_final_events: t.postFinalEvents,
    // How much of this turn exists only because of a whole-message re-delivery.
    async_only_messages: asyncOnly,
  };
}

function turnsToMarkdown(turns) {
  const out = [];
  const fence = (lang, body) => '```' + (lang || '') + '\n' + String(body == null ? '' : body) + '\n```';
  for (const T of turns) {
    out.push('# Turn ' + (T.turn_id || '(unknown)'), '');
    out.push('Conversation: ' + (T.conversation_id || '-'));
    out.push('Model: ' + (T.model || '-'));
    out.push('Effort: ' + (T.thinking_effort || '-'));
    if (T.reasoning_recap && T.reasoning_recap.finished_duration_sec != null) out.push('Thinking: ' + T.reasoning_recap.finished_duration_sec + 's');
    out.push('Status: ' + T.status + (T.empty_reason ? ' (' + T.empty_reason + ')' : ''), '');
    if (T.status === 'empty') {
      // Never hidden: an empty turn is either a real server control turn or a
      // parser miss, and which one it is matters. Name the markers so the
      // referenced message ids can be grepped straight out of the raw archive.
      out.push('> No message was assembled for this turn.' +
        (T.markers.length ? ' Markers seen: ' + [...new Set(T.markers.map((m) => m.marker))].join(', ') +
          '. Referenced message ids: ' + [...new Set(T.markers.map((m) => m.message_id).filter(Boolean))].join(', ') + '.' : '') +
        ' Raw frames are retained -- grep the archive for those ids before assuming the server sent nothing.', '', '---', '');
      continue;
    }
    if (T.user != null) out.push('## User', '', T.user, '');
    if (T.thoughts.length) {
      out.push('## Thoughts', '');
      for (const th of T.thoughts) {
        out.push('### ' + (th.summary || '(no summary)'), '');
        out.push(th.content === '' ? '（只有 summary）' : th.content, '');
      }
    }
    if (T.commentary.length) {
      out.push('## Commentary', '');
      for (const c of T.commentary) out.push(c.text, '');
    }
    if (T.tools.length) {
      out.push('## Tools', '');
      for (const tl of T.tools) {
        out.push('### ' + (tl.name || '(unnamed)'), '');
        out.push('Arguments', '');
        out.push(fence(tl.arguments ? 'json' : (tl.language || 'text'), tl.arguments ? JSON.stringify(tl.arguments, null, 2) : tl.arguments_raw), '');
        out.push('Result', '');
        out.push(fence(tl.result ? 'json' : 'text', tl.result ? JSON.stringify(tl.result, null, 2) : tl.result_raw), '');
      }
    }
    if (T.reasoning_recap) out.push('## Reasoning recap', '', T.reasoning_recap.text || '', '');
    out.push('## Final', '');
    out.push(T.final == null ? '(none)' : T.final, '', '---', '');
  }
  return out.join('\n');
}
/* ==PURE-END== */

  // ------------------------------------------------------------ capture core

  let idSeq = 0;
  const live = new Map();
  const dirty = new Set();
  // Survives the stream ending: a badge that goes back to green because the
  // truncated socket closed would hide the loss.
  const cappedStreams = new Set();
  const newId = () => `${Date.now().toString(36)}-${(idSeq++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // A single in-memory assembler feeds the badge. Authoritative turn data always
  // comes from rebuildTurns(), which replays the stored bytes.
  const liveAsm = makeTurnAssembler();

  // A long-lived WebSocket never calls end(), so without this its stream record
  // would sit at chunks:0 / bytes:0 forever while megabytes pile up beneath it.
  setInterval(() => {
    if (!dirty.size) return;
    for (const rec of dirty) putStream(rec);
    dirty.clear();
  }, FLUSH_MS);

  function beginStream(meta) {
    const id = newId();
    const rec = Object.assign({
      id, status: 'streaming', startedAt: Date.now(), endedAt: null,
      chunks: 0, bytes: 0, capped: false, droppedChunks: 0, droppedBytes: 0, summary: null,
    }, meta);
    const cap = makeCapGuard(maxBytesPerStream);
    const dec = new TextDecoder('utf-8');
    let seq = 0, carry = '';

    live.set(id, { rec });
    putStream(rec);
    hud.tick();

    return {
      id, rec,
      push(bytes, dir) {
        if (!cap.admit(bytes.byteLength)) {
          const first = !rec.capped;
          rec.capped = true;
          rec.droppedChunks = cap.droppedChunks;
          rec.droppedBytes = cap.droppedBytes;
          cappedStreams.add(id);
          // Loud on the first loss, then every 1000 so a long overflow keeps
          // showing up without drowning the console.
          if (first || cap.droppedChunks % 1000 === 0) {
            console.warn('%c[cgpt-archive] DATA LOST', 'color:#c00;font-weight:bold',
              'stream', id, 'exceeded the', maxBytesPerStream, 'byte cap --',
              cap.droppedChunks, 'chunks /', cap.droppedBytes, 'bytes dropped so far.',
              'Raise it with __cgptArchive.setStreamCap(bytes) and re-capture.');
          }
          putStream(rec);
          hud.tick();
          return;
        }
        // Persist first, interpret second -- and NEVER await the write here. For
        // fetch, clone() is a tee whose backpressure follows the SLOWER branch,
        // so awaiting disk I/O would stall ChatGPT's own rendering behind us.
        putChunk(id, seq, Date.now(), bytes, dir || 'in');
        seq++; rec.chunks = seq; rec.bytes += bytes.byteLength;
        dirty.add(rec);
        if (dir !== 'out') {
          try {
            if (rec.kind === 'websocket') {
              // One WS frame per chunk, so no cross-chunk carry is needed and
              // frame boundaries stay intact.
              liveAsm.feedWs(dec.decode(bytes, { stream: true }));
            } else {
              // Streaming decode: a multi-byte codepoint split across two chunks
              // would otherwise decode to U+FFFD.
              carry += dec.decode(bytes, { stream: true });
              const cut = carry.lastIndexOf('\n\n');
              if (cut !== -1) { liveAsm.feedSse(carry.slice(0, cut + 2)); carry = carry.slice(cut + 2); }
            }
          } catch (e) { LOG('live assembler threw (raw is unaffected)', e); }
        }
        hud.tick();
      },
      end(status, err) {
        if (carry.trim()) { try { liveAsm.feedSse(carry); } catch (_) {} carry = ''; }
        rec.status = status;
        if (err) rec.error = String((err && err.message) || err);
        rec.endedAt = Date.now();
        dirty.delete(rec);
        putStream(rec);
        live.delete(id);
        hud.tick();
      },
    };
  }

  // ------------------------------------------------------------- hook: fetch

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const resp = await origFetch.apply(this, arguments);
    try {
      const ct = resp.headers.get('content-type') || '';
      // The gate is the content type, not the path: this endpoint has been
      // renamed repeatedly, the media type has not.
      if (!ct.includes('text/event-stream') || !resp.body) return resp;
      const url = (typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input))) || resp.url;
      const h = beginStream({
        kind: 'fetch-sse', url, httpStatus: resp.status,
        method: (init && init.method) || (input instanceof Request ? input.method : 'GET'),
      });
      (async () => {
        try {
          let body = null;
          if (init && typeof init.body === 'string') body = init.body;
          else if (input instanceof Request && input.body) body = await input.clone().text();
          if (body != null) {
            h.rec.requestBody = body.length > 200000 ? body.slice(0, 200000) + '\n...[truncated]' : body;
            try { const j = JSON.parse(body); h.rec.conversationId = j.conversation_id || null; h.rec.model = j.model || null; } catch (_) {}
            putStream(h.rec);
          }
        } catch (_) { /* never let this break the request */ }
      })();
      // clone() before anyone reads the body. The original goes back to ChatGPT
      // untouched -- never wrapped or re-Response'd -- so url/type/redirected survive.
      const tap = resp.clone();
      (async () => {
        const reader = tap.body.getReader();
        try {
          for (;;) { const { done, value } = await reader.read(); if (done) break; h.push(value); }
          h.end('complete');
        } catch (e) { LOG('fetch stream aborted, keeping', h.rec.chunks, 'chunks', e); h.end('aborted', e); }
      })();
      LOG('capturing fetch-sse', url, '->', h.id);
    } catch (e) { LOG('fetch interceptor error (request unaffected)', e); }
    return resp;
  };

  // --------------------------------------------------------- hook: WebSocket
  // The second leg. This is where the tokens and the thinking actually arrive.

  const OrigWS = window.WebSocket;
  function ArchivedWebSocket(url, protocols) {
    const ws = protocols === undefined ? new OrigWS(url) : new OrigWS(url, protocols);
    try {
      const h = beginStream({ kind: 'websocket', url: String(url) });
      const enc = new TextEncoder();
      // A passive extra listener: it does not consume the event, reorder
      // delivery, or interfere with the page's own onmessage handler.
      ws.addEventListener('message', (ev) => {
        try {
          const d = ev.data;
          if (typeof d === 'string') h.push(enc.encode(d));
          else if (d instanceof ArrayBuffer) h.push(new Uint8Array(d));
          else if (d && typeof d.arrayBuffer === 'function') d.arrayBuffer().then((b) => h.push(new Uint8Array(b))).catch(() => {});
        } catch (e) { LOG('ws message archive failed', e); }
      });
      // Outbound frames carry the topic subscription -- the only thing that ties
      // a socket back to a turn_exchange_id.
      const origSend = ws.send.bind(ws);
      ws.send = function (data) {
        try { if (typeof data === 'string') h.push(enc.encode(data), 'out'); } catch (_) {}
        return origSend(data);
      };
      ws.addEventListener('close', (ev) => h.end('closed', ev.code !== 1000 ? 'code ' + ev.code : null));
      ws.addEventListener('error', () => h.end('error'));
      LOG('capturing websocket', String(url).slice(0, 80), '->', h.id);
    } catch (e) { LOG('ws interceptor error (socket unaffected)', e); }
    return ws;
  }
  ArchivedWebSocket.prototype = OrigWS.prototype;   // keeps `instanceof` working
  Object.setPrototypeOf(ArchivedWebSocket, OrigWS); // keeps CONNECTING/OPEN/CLOSING/CLOSED
  window.WebSocket = ArchivedWebSocket;

  // ------------------------------------------------------- hook: EventSource
  // The other half of the handoff (`resume_sse_endpoint`), which does not go
  // through fetch either.

  const OrigES = window.EventSource;
  if (OrigES) {
    const ArchivedEventSource = function (url, cfg) {
      const es = cfg === undefined ? new OrigES(url) : new OrigES(url, cfg);
      try {
        const h = beginStream({ kind: 'eventsource', url: String(url) });
        const enc = new TextEncoder();
        // EventSource only surfaces parsed events, so re-serialise to SSE shape:
        // byte-faithful to the payload, though not to the original wire framing.
        const tap = (ev) => h.push(enc.encode(`event: ${ev.type}\ndata: ${typeof ev.data === 'string' ? ev.data : ''}\n\n`));
        for (const t of ['message', 'delta', 'delta_encoding', 'update', 'done']) es.addEventListener(t, tap);
        es.addEventListener('error', () => { if (es.readyState === 2) h.end('closed'); });
        LOG('capturing eventsource', String(url).slice(0, 80), '->', h.id);
      } catch (e) { LOG('es interceptor error (stream unaffected)', e); }
      return es;
    };
    ArchivedEventSource.prototype = OrigES.prototype;
    Object.setPrototypeOf(ArchivedEventSource, OrigES);
    window.EventSource = ArchivedEventSource;
  }

  // ------------------------------------------------- derived view over raw

  async function rawChunks(id, dir) {
    return (await chunksOf(id)).filter((c) => !dir || (c.dir || 'in') === dir);
  }
  function decodeChunks(cs) {
    const total = cs.reduce((n, c) => n + c.bytes.byteLength, 0);
    const buf = new Uint8Array(total);
    let o = 0;
    for (const c of cs) { buf.set(new Uint8Array(c.bytes), o); o += c.bytes.byteLength; }
    return new TextDecoder('utf-8').decode(buf);
  }
  async function rawText(id, dir) { return decodeChunks(await rawChunks(id, dir)); }

  // Turns are always recomputed from stored bytes -- never cached, never written
  // back. Replaying the archive after a parser change is the whole point.
  async function rebuildTurns() {
    const streams = (await allStreams()).slice().sort((a, b) => a.startedAt - b.startedAt);
    const asm = makeTurnAssembler();
    for (const s of streams) {
      const cs = await rawChunks(s.id, 'in');
      if (!cs.length) continue;
      if (s.kind === 'websocket') {
        // Per chunk: one WS frame each, so frame boundaries survive the replay.
        const dec = new TextDecoder('utf-8');
        for (const c of cs) asm.feedWs(dec.decode(new Uint8Array(c.bytes)));
      } else {
        asm.feedSse(decodeChunks(cs));
      }
    }
    return { asm, turns: asm.list().map(materializeTurn) };
  }

  // ---------------------------------------------------------------- export

  function download(name, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function rawJsonl() {
    const s = await allStreams();
    const lines = [];
    for (const rec of s) {
      const cs = await rawChunks(rec.id, 'in');
      lines.push(JSON.stringify(Object.assign({}, rec, {
        raw: decodeChunks(cs),
        sent: await rawText(rec.id, 'out'),
        // Added in 0.3.0: concatenating WS frames into `raw` loses their
        // boundaries. `raw` is unchanged for compatibility; this keeps them.
        rawFrames: rec.kind === 'websocket' ? cs.map((c) => new TextDecoder('utf-8').decode(new Uint8Array(c.bytes))) : undefined,
      })));
    }
    return { text: lines.join('\n'), count: s.length };
  }

  const api = {
    async list() {
      const s = await allStreams();
      console.table(s.map((x) => ({
        id: x.id, kind: x.kind, status: x.status, chunks: x.chunks, bytes: x.bytes,
        started: new Date(x.startedAt).toLocaleTimeString(),
        url: String(x.url || '').replace(/^https?:\/\/[^/]+/, '').slice(0, 44),
      })));
      return s;
    },
    raw: rawText,
    async export(id) {
      const rec = (await allStreams()).find((x) => x.id === id);
      download(`${id}.raw.txt`, await rawText(id, 'in'));
      const out = await rawText(id, 'out');
      if (out) download(`${id}.sent.txt`, out);
      download(`${id}.meta.json`, JSON.stringify(rec, null, 2), 'application/json');
    },
    async turns() {
      const { turns, asm } = await rebuildTurns();
      console.table(turns.map((t) => ({
        turn_id: String(t.turn_id || '').slice(0, 8), status: t.status + (t.empty_reason ? ':' + t.empty_reason : ''),
        done: t.completed, model: t.model,
        effort: t.thinking_effort, thoughts: t.thoughts.length, tools: t.tools.length,
        commentary: t.commentary.length, think_s: t.reasoning_recap && t.reasoning_recap.finished_duration_sec,
        final_chars: (t.final || '').length, user: String(t.user || '').slice(0, 18),
      })));
      LOG('assembler stats', asm.stats);
      return turns;
    },
    async turn(turnId) {
      const { turns } = await rebuildTurns();
      return turns.find((t) => t.turn_id === turnId || String(t.turn_id || '').startsWith(turnId)) || null;
    },
    async exportTurns() {
      const { turns } = await rebuildTurns();
      const ts = Date.now();
      download(`chatgpt-turns-${ts}.jsonl`, turns.map((t) => JSON.stringify(t)).join('\n'), 'application/x-ndjson');
      download(`chatgpt-turns-${ts}.md`, turnsToMarkdown(turns), 'text/markdown;charset=utf-8');
      return turns.length;
    },
    // Unchanged contract: still writes the raw archive. Now also writes the two
    // derived views alongside it.
    async exportAll() {
      const ts = Date.now();
      const raw = await rawJsonl();
      download(`chatgpt-archive-${ts}.jsonl`, raw.text, 'application/x-ndjson');
      const { turns } = await rebuildTurns();
      download(`chatgpt-turns-${ts}.jsonl`, turns.map((t) => JSON.stringify(t)).join('\n'), 'application/x-ndjson');
      download(`chatgpt-turns-${ts}.md`, turnsToMarkdown(turns), 'text/markdown;charset=utf-8');
      LOG('exported', raw.count, 'streams and', turns.length, 'turns');
      return { streams: raw.count, turns: turns.length };
    },
    // The one query worth running after a capture. Encodes which conditions are
    // actually suspicious, because several perfectly normal ones look alarming:
    //   post_final_rejected > 0   normal -- async re-delivery of an answer we hold
    //   status 'empty', 0 items   normal -- we recorded the handoff and nothing else
    //   status 'recovered'        normal -- whole answer arrived as a re-delivery
    // What is NOT normal is a turn that ran stream items yet produced no message
    // (that is how the dropped catch-up backlog showed up), or a rejected copy
    // whose length differs from the one we kept (that is a real rewrite).
    async audit() {
      const { turns, asm } = await rebuildTurns();
      const lossyRejections = [];
      for (const t of turns) {
        for (const dtl of t.post_final_rejected_detail || []) {
          if (dtl.channel === 'final' && dtl.len !== (t.final || '').length) {
            lossyRejections.push({ turn_id: t.turn_id, rejected_len: dtl.len, kept_len: (t.final || '').length, message_id: dtl.message_id });
          }
        }
      }
      const allRecs = await allStreams();
      const report = {
        turns: turns.length,
        // real problems -- bytes that never reached disk are the worst of them
        cappedStreams: allRecs.filter((s) => s.capped).map((s) => ({
          id: s.id, kind: s.kind, bytes: s.bytes,
          droppedChunks: s.droppedChunks || 0, droppedBytes: s.droppedBytes || 0,
          url: String(s.url || '').slice(0, 80),
        })),
        emptyDespiteActivity: turns.filter((t) => t.status === 'empty' && t.stream_item_count > 0)
          .map((t) => ({ turn_id: t.turn_id, items: t.stream_item_count, markers: [...new Set(t.markers.map((m) => m.marker))] })),
        completeWithoutFinal: turns.filter((t) => t.status === 'complete' && !t.final).map((t) => t.turn_id),
        lossyRejections,
        parseErrors: asm.stats.parseErrors,
        parserThrew: asm.stats.thrown,
        // Only shapes we have never accounted for. Everything on the benign list
        // moves below, so a clean run also *looks* clean.
        unknownShapes: Object.fromEntries(Object.entries(asm.stats.unhandled).filter(([k]) => !BENIGN_UNHANDLED.some((re) => re.test(k)))),
        // expected, listed so they are not mistaken for problems
        benign: {
          emptyHandoffOnly: turns.filter((t) => t.status === 'empty' && t.stream_item_count === 0).length,
          recovered: turns.filter((t) => t.status === 'recovered').length,
          turnsWithRedundantRejections: turns.filter((t) => t.post_final_rejected > 0).length,
          duplicateOffsetsSkipped: asm.stats.duplicateOffsets,
          catchupsUnpacked: asm.stats.catchups,
          knownUnhandledShapes: Object.fromEntries(Object.entries(asm.stats.unhandled).filter(([k]) => BENIGN_UNHANDLED.some((re) => re.test(k)))),
        },
      };
      const bad = report.cappedStreams.length + report.emptyDespiteActivity.length + report.completeWithoutFinal.length
        + report.lossyRejections.length + report.parserThrew + report.parseErrors + Object.keys(report.unknownShapes).length;
      LOG(bad === 0 ? 'audit clean' : 'audit found ' + bad + ' suspicious item(s)', report);
      return report;
    },
    async purge(beforeTs) {
      const s = await allStreams();
      const kill = s.filter((x) => !beforeTs || x.startedAt < beforeTs);
      const d = await db();
      const t = d.transaction(['streams', 'chunks'], 'readwrite');
      for (const rec of kill) {
        t.objectStore('streams').delete(rec.id);
        t.objectStore('chunks').index('byStream').getAllKeys(rec.id).onsuccess =
          (e) => e.target.result.forEach((k) => t.objectStore('chunks').delete(k));
      }
      return kill.length;
    },
    setStreamCap(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) throw new RangeError('setStreamCap expects a positive byte count');
      maxBytesPerStream = bytes;
      LOG('per-stream cap is now', bytes, 'bytes (applies to streams started from here on)');
      return bytes;
    },
    live,
    liveTurns: liveAsm,
    _pure: { splitTopLevelJson, parseWSFrames, parseSseFrames, makeCapGuard, makeTurnAssembler, materializeTurn, turnsToMarkdown, BENIGN_UNHANDLED },
  };

  // ---------------------------------------------------------------- hud

  const hud = (() => {
    let root = null, button = null, tooltip = null, timer = null;
    const ROOT_ID = 'chatgpt-live-stream-root';
    const STYLE_ID = 'chatgpt-live-stream-style';

    function dockPoint() {
      const profiles = document.querySelectorAll(
        '[data-testid="accounts-profile-button"], ' +
        '[role="button"][aria-label*="个人资料"], ' +
        '[role="button"][aria-label*="profile" i]'
      );
      for (const profile of profiles) {
        const rightAction = profile.querySelector('[data-trailing-button]') ||
          profile.querySelector('button[aria-label="下载应用"], button[aria-label="Download app"]');
        if (rightAction && rightAction.parentElement) {
          const archive = document.getElementById('chatgpt-archive-root');
          const anchor = archive && archive.parentElement === rightAction.parentElement ? archive : rightAction;
          return { container: rightAction.parentElement, anchor };
        }
      }
      return null;
    }

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
#${ROOT_ID}{position:relative;z-index:2147483647;display:flex;flex:0 0 auto;align-items:center;color:inherit}
#${ROOT_ID}[data-docked="false"]{display:none}
#${ROOT_ID} button{position:relative;display:inline-flex;width:36px;height:36px;align-items:center;justify-content:center;padding:0;border:0;border-radius:9px;background:transparent;color:inherit;cursor:pointer}
#${ROOT_ID} button:hover,#${ROOT_ID} button:focus-visible{background:var(--token-interactive-bg-secondary-hover,rgb(0 0 0/.08));color:var(--text-primary,#0d0d0d)}
#${ROOT_ID} svg{display:block}
#${ROOT_ID} .cgls-dot{fill:currentColor}
#${ROOT_ID}[data-active="true"] .cgls-dot{fill:#10a37f}
#${ROOT_ID}[data-capped="true"] .cgls-dot{fill:#c00}
#${ROOT_ID} .cgls-tooltip{position:absolute;bottom:calc(100% + 8px);left:50%;z-index:2147483647;padding:5px 8px;border-radius:6px;background:#171717;color:#fff;font:12px/1 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;opacity:0;pointer-events:none;transform:translateX(-50%) translateY(3px);transition:opacity .12s ease,transform .12s ease;white-space:nowrap}
#${ROOT_ID} button:hover .cgls-tooltip,#${ROOT_ID} button:focus-visible .cgls-tooltip{opacity:1;transform:translateX(-50%) translateY(0)}
`;
      (document.head || document.documentElement).appendChild(style);
    }

    function ensure() {
      const point = dockPoint();
      if (!point) {
        if (root) root.dataset.docked = 'false';
        return root;
      }
      ensureStyle();
      if (!root) {
        root = document.createElement('div');
        root.id = ROOT_ID;
        root.dataset.docked = 'false';
        root.dataset.active = 'false';
        root.dataset.capped = 'false';
        root.innerHTML = `
          <button type="button" aria-label="Live Stream Recorder">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path fill="currentColor" fill-rule="evenodd" d="M10 2.085a7.915 7.915 0 1 1 0 15.83 7.915 7.915 0 0 1 0-15.83m0 1.33a6.585 6.585 0 1 0 0 13.17 6.585 6.585 0 0 0 0-13.17" clip-rule="evenodd"/>
              <path class="cgls-dot" d="M10 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10"/>
            </svg>
            <span class="cgls-tooltip">Live Stream Recorder</span>
          </button>`;
        button = root.querySelector('button');
        tooltip = root.querySelector('.cgls-tooltip');
        button.onclick = () => api.exportAll();
      }
      if (root.parentElement !== point.container || root.nextElementSibling !== point.anchor) {
        point.container.insertBefore(root, point.anchor);
      }
      root.dataset.docked = 'true';
      return root;
    }

    function render() {
      const e = ensure();
      if (!e || !tooltip || !button) return;
      let bytes = 0, ws = 0, dropped = 0;
      for (const { rec } of live.values()) {
        bytes += rec.bytes;
        dropped += rec.droppedBytes || 0;
        if (rec.kind === 'websocket') ws++;
      }
      const turns = liveAsm.turns.size;
      const capped = cappedStreams.size > 0;
      e.dataset.active = live.size ? 'true' : 'false';
      e.dataset.capped = capped ? 'true' : 'false';

      if (capped) {
        tooltip.textContent = 'CAPPED · ' + cappedStreams.size + ' stream' + (cappedStreams.size === 1 ? '' : 's') +
          ' losing data' + (dropped ? ' · ' + (dropped / 1048576).toFixed(1) + 'MB+' : '');
        button.setAttribute('aria-label', 'Live Stream Recorder: data loss detected');
        return;
      }

      const parts = ['Live Stream Recorder'];
      if (live.size) parts.push('rec ' + live.size + (ws ? ' (' + ws + ' WS)' : ''));
      if (bytes) parts.push((bytes / 1024).toFixed(1) + 'KB');
      if (turns) parts.push(turns + ' turn' + (turns === 1 ? '' : 's'));
      tooltip.textContent = parts.join(' · ');
      button.setAttribute('aria-label', tooltip.textContent);
    }

    return { tick() { clearTimeout(timer); timer = setTimeout(render, 120); }, render };
  })();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hud.render(), { once: true });
  else hud.render();
  // Safety net: nothing calls tick() while idle, so a badge torn out by a
  // client-side route change would otherwise stay gone until the next stream.
  setInterval(() => hud.render(), 2000);

  window.__cgptArchive = api;
  LOG('armed v0.4.1 -- fetch + WebSocket + EventSource hooked at document-start');
})();
