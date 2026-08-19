# live-stream recorder

A Tampermonkey userscript that captures ChatGPT's **live model stream** in the
browser and reassembles it into logical turns — thoughts, commentary, tool calls,
reasoning recap, final answer.

This is complementary to the rest of this repo, not a replacement. `src/` archives
conversations through the REST API *after* the fact; this captures the wire
*while it happens*, which is the only way to keep frames the server later
rewrites or drops from the conversation JSON.

## Why three hooks

`POST /backend-api/f/conversation` no longer carries the tokens. It answers with
a ~1 KB SSE that ends in a handoff:

```
event: delta_encoding   -> "v1"
{"type":"resume_conversation_token", ...}
{"type":"stream_handoff", conversation_id, turn_exchange_id,
 "options":[{"type":"resume_sse_endpoint","topic_id":"conversation-turn-<id>"},
            {"type":"subscribe_ws_topic", "topic_id":"conversation-turn-<id>"}]}
[DONE]
```

The real stream arrives on whichever transport the client picks, and **neither
EventSource nor WebSocket goes through `fetch`**. So `fetch`, `WebSocket` and
`EventSource` are all patched, at `document-start`, in the page realm.

`@grant none` is load-bearing: under any `@grant`, Tampermonkey hands you a
sandboxed window proxy and the patches silently do nothing.

## Install

Tampermonkey → new script → paste `chatgpt-stream-recorder.user.js` → save →
reload chatgpt.com. A badge appears bottom-right; click it to export.

```js
__cgptArchive.audit()        // the one query worth running -- see below
__cgptArchive.turns()        // logical turns, replayed from raw
__cgptArchive.turn(id)       // one turn (id prefix accepted)
__cgptArchive.exportAll()    // raw JSONL + turns JSONL + Markdown
__cgptArchive.exportTurns()  // just the derived views
__cgptArchive.list() / .raw(id) / .export(id) / .purge(ts) / .live
```

## Design

**Raw bytes are the source of truth, append-only.** Every chunk is written to
IndexedDB before it is interpreted, and `turns()` re-derives everything from
those bytes on every call — nothing is cached or written back. A parser change
can be replayed against everything ever captured.

**Never await a write inside the read loop.** `Response.clone()` is a tee whose
backpressure follows the *slower* branch, so awaiting disk I/O there would stall
ChatGPT's own rendering behind the archiver.

**Bytes, not strings.** Chunks are stored as `Uint8Array`, which makes the
archive immune to a multi-byte codepoint split across a chunk boundary. Only the
live parser decodes, with a streaming `TextDecoder`.

**Content freezes at `last_token`.** After a turn completes, writes that try to
change its content are refused and counted (`post_final_rejected`), so a later
rewrite cannot edit an answer you already watched arrive. Raw capture is
unaffected — the rewrite is still on disk.

## Protocol notes

Findings from real captures. Where public implementations disagree with a
capture, the capture wins.

- **`o` and `p` in the v1 delta encoding are sticky.** A frame may carry neither
  and inherit both from the previous `delta` frame. In one reference capture 25
  of 37 delta frames were bare `{v: …}`. Ops resolve against the most recently
  added message, which is what keeps a commentary block and the final answer
  apart even though both append to `/message/content/parts/0`.
- **A subscribe ack is not empty.** `{type:"reply", reply:{type:"subscribe", …,
  catchups:[…]}}` carries the topic's buffered backlog whenever a turn was
  already under way when the socket attached. Dropping replies loses those turns
  entirely: their markers still arrive live, so the turn looks complete while
  holding no messages. Catch-ups are a replay, so envelopes are de-duplicated by
  `(topic_id, offset)` — `add` is idempotent, `append` is not.
- **Turn completion is `last_token`**, with `[DONE]` and a turn-scoped
  `{type:"done", turn_id}` also accepted. None is required. `message_stream_complete`
  is deliberately ignored: it carries a conversation id and no turn id. The
  WebSocket is long-lived and multiplexes every turn, so its close means nothing.
- **`async-task-update-message`** delivers whole messages out of band. They are a
  fallback source only — folding one into a turn that is still streaming doubles
  its text — but for turns that were never streamed live they are the only copy.
- **Citation markers are private-use codepoints** (`U+E200 … U+E201`). Kept
  verbatim; strip with `replace(/[^]*/g, '')` if you want clean
  prose.
- `source_analysis_msg_id` lives on `content`, not `metadata`.

## The byte cap

There is a last-resort per-stream budget (`256 MB`, `__cgptArchive.setStreamCap(bytes)`)
so a runaway stream cannot exhaust the origin's IndexedDB quota. Mind the unit: a
ChatGPT WebSocket is long-lived and multiplexes every turn, so for that socket the
cap is effectively a whole-session budget.

Hitting it means **bytes were lost**, which defeats the tool's one promise, so it
is not a quiet condition:

- the badge turns red and reads `CAPPED -- N streams losing data`
- `audit()` reports `cappedStreams` as a top-level error with exact
  `droppedChunks` / `droppedBytes`
- the console gets a `DATA LOST` warning on the first drop and every 1000 after

Once a stream is capped it refuses **everything** from then on, including chunks
that would still fit. A stream truncated at a known point is honest; one with a
hole in the middle is worse than useless, because an append-based delta stream
with a gap silently reassembles into *wrong* text rather than obviously missing
text.

## audit()

Several perfectly normal conditions look alarming, so `audit()` separates them:

| condition | verdict |
|---|---|
| `post_final_rejected > 0` | normal — redundant re-delivery, refused by the freeze |
| `status: 'empty'`, `stream_item_count === 0` | normal — only the handoff was captured |
| `status: 'recovered'` | normal — whole answer arrived as a re-delivery |
| `status: 'empty'`, `stream_item_count > 0` | **bug** — ran a stream, produced no message |
| rejected final length ≠ kept final length | **bug** — a finished answer is being rewritten |
| `cappedStreams` non-empty | **bug** — the byte cap dropped data; raise it and re-capture |

Clean means the top level is empty and `unknownShapes` is `{}`.

## Tests

```sh
sh tools/live-stream/test.sh
```

Both suites slice the parser out of `chatgpt-stream-recorder.user.js` between the
`==PURE-START==` / `==PURE-END==` markers, so they exercise the shipped code
rather than a copy that can drift.

They assert against a **real capture**, which is one of your own conversations,
so neither the capture nor the values derived from it are committed. Copy
`fixtures/expectations.example.json` to `expectations.local.json` (git-ignored),
point it at a capture of your own, and re-run. Without it the suites print
`SKIPPED` — they never pass vacuously.

`fixtures/empty-control-turn.jsonl` is synthetic (regenerate with
`node make-empty-turn-fixture.cjs`) and contains no real conversation data.

## Not verified

- Turn reassembly has only been exercised against a handful of captures.
  Regeneration, branch edits and concurrent conversations have no samples yet.
- Whether ChatGPT ever opens its WebSocket inside a Worker, which a page-level
  `window.WebSocket` patch would not see.
