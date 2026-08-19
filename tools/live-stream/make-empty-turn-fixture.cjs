// SYNTHETIC. Reproduces the empty/control turn Vesper observed in a live v0.3.1
// capture (turn_id present on both a 1-chunk fetch-SSE handoff and the long-lived
// WS; 8 stream items; last_token; the four post-final metadata frames; zero
// messages). No real capture of this shape was available, so the frames are
// assembled by hand from shapes seen in the real fixtures. Regenerate with:
//   node make-empty-turn-fixture.cjs > fixtures/empty-control-turn.jsonl
const CID = '00000000-0000-4000-8000-000000000c1d'; // synthetic, not a real conversation
const TID = '00000000-0000-4000-8000-0000000017d0'; // synthetic
const T0 = 1787161000000;

const sse = (event, data) => (event ? 'event: ' + event + '\n' : '') + 'data: ' + data + '\n\n';
let off = 0, si = 0;
const item = (encoded) => JSON.stringify({
  type: 'message', topic_id: 'conversation-turn-' + TID, offset: off++,
  payload: {
    type: 'conversation-turn-stream',
    payload: {
      type: 'stream-item', conversation_id: CID, turn_id: TID,
      encoded_item: encoded,
      stream_item_id: 'ffffffff-0000-4000-8000-' + String(si).padStart(12, '0'),
      parent_stream_item_id: si === 0 ? null : 'ffffffff-0000-4000-8000-' + String(si - 1).padStart(12, '0'),
      server_timestamp_ms: T0 + (si++ * 120),
    },
  },
});

const wsFrames = [
  item(sse('delta_encoding', '"v1"')),
  item(sse(null, JSON.stringify({ type: 'message_marker', conversation_id: CID, message_id: 'aaaaaaaa-0000-4000-8000-000000000001', marker: 'cot_token', event: 'first' }))),
  item(sse(null, JSON.stringify({ type: 'message_marker', conversation_id: CID, message_id: 'aaaaaaaa-0000-4000-8000-000000000001', marker: 'last_token', event: 'last' }))),
  item(sse(null, JSON.stringify({ type: 'server_ste_metadata', conversation_id: CID, metadata: { tool_invoked: false, fast_convo: true } }))),
  item(sse(null, JSON.stringify({ type: 'message_stream_complete', conversation_id: CID }))),
  item(sse(null, JSON.stringify({ type: 'conversation_detail_metadata', conversation_id: CID, banner_info: null, blocked_features: [] }))),
  item(sse(null, JSON.stringify({ type: 'ads', conversation_id: CID, visibility: { status: 'hidden', reason: null }, content: null }))),
  item(sse(null, '[DONE]')),
];

const handoff =
  sse('delta_encoding', '"v1"') +
  sse(null, JSON.stringify({ type: 'resume_conversation_token', kind: 'topic', token: 'SYNTHETIC', conversation_id: CID })) +
  sse(null, JSON.stringify({
    type: 'stream_handoff', conversation_id: CID, turn_exchange_id: TID,
    options: [
      { type: 'resume_sse_endpoint', topic_id: 'conversation-turn-' + TID },
      { type: 'subscribe_ws_topic', topic_id: 'conversation-turn-' + TID },
    ],
  })) +
  sse(null, '[DONE]');

const out = [
  { id: 'syn-fetch', kind: 'fetch-sse', url: 'https://chatgpt.com/backend-api/f/conversation', method: 'POST', status: 'complete', httpStatus: 200, startedAt: T0 - 500, endedAt: T0, chunks: 1, bytes: handoff.length, capped: false, conversationId: CID, raw: handoff, sent: '' },
  { id: 'syn-ws', kind: 'websocket', url: 'wss://ws.chatgpt.com/p6/ws/user/user-SYNTHETIC', status: 'streaming', startedAt: T0 - 1000, endedAt: null, chunks: wsFrames.length, bytes: wsFrames.join('').length, capped: false, raw: wsFrames.join(''), rawFrames: wsFrames, sent: '' },
];
process.stdout.write(out.map((o) => JSON.stringify(o)).join('\n') + '\n');
