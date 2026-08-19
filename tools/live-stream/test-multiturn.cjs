// Multi-turn suite. Same extraction trick as test-fixture.js: the parser under
// test is sliced straight out of the shipped .user.js.
const fs = require('fs'), path = require('path'), vm = require('vm');
const SCRIPT = path.join(__dirname, 'chatgpt-stream-recorder.user.js');
const src = fs.readFileSync(SCRIPT, 'utf8');
const a = src.indexOf('/* ==PURE-START=='), b = src.indexOf('/* ==PURE-END==');
if (a < 0 || b < 0) { console.error('FATAL: pure-section markers not found'); process.exit(2); }
const ctx = { console, TextDecoder, TextEncoder };
vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf('*/', a) + 2, b), ctx, { filename: 'pure.js' });
const P = vm.runInContext('({splitTopLevelJson,parseWSFrames,parseSseFrames,makeTurnAssembler,materializeTurn,turnsToMarkdown,BENIGN_UNHANDLED})', ctx);

// Content assertions run against a REAL capture, which is one of your own
// conversations. Neither the capture nor the values pulled out of it belong in a
// public repo, so both live in a local file this repo ignores:
//     fixtures/expectations.local.json      (see expectations.example.json)
// or the path in $LIVE_STREAM_EXPECTATIONS. Without it the suite reports itself
// as skipped rather than passing vacuously.
const EXP_PATH = process.env.LIVE_STREAM_EXPECTATIONS || path.join(__dirname, 'fixtures', 'expectations.local.json');
if (!fs.existsSync(EXP_PATH)) {
  console.log('\nSKIPPED -- no local expectations at ' + EXP_PATH);
  console.log('Copy fixtures/expectations.example.json, point it at one of your own captures, and re-run.');
  process.exit(0);
}
const EXPECT = JSON.parse(fs.readFileSync(EXP_PATH, 'utf8'));
const E = EXPECT.multiTurn;
const FIX = process.argv[2] || E.capture;
if (!fs.existsSync(FIX)) { console.log('\nSKIPPED -- capture not found: ' + FIX); process.exit(0); }
const recs = fs.readFileSync(FIX, 'utf8').trim().split('\n').map(JSON.parse);

let pass = 0, fail = 0;
const ok = (name, cond, got) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + '\n          got: ' + JSON.stringify(got)); }
};

// Only the fields a rewrite would target. status/markers/metadata are allowed to
// keep moving after the freeze; content is not.
const contentSig = (t) => JSON.stringify({
  user: t.user, thoughts: t.thoughts, commentary: t.commentary,
  tools: t.tools, reasoning_recap: t.reasoning_recap, final: t.final,
});

// Replay one frame at a time so we can photograph each turn the instant it
// completes, then prove nothing edited it afterwards.
const asm = P.makeTurnAssembler();
const snapshots = new Map();
const completedAtFrame = new Map();
let frameNo = 0;
function snapshotNewlyComplete() {
  for (const turn of asm.list()) {
    const k = turn.turnId || turn.key;
    // Same key for the guard and the write, or every frame silently overwrites
    // the snapshot and the whole invariant check passes vacuously.
    if (turn.status === 'complete' && !snapshots.has(k)) {
      snapshots.set(k, contentSig(P.materializeTurn(turn)));
      completedAtFrame.set(k, frameNo);
    }
  }
}
for (const r of recs.slice().sort((x, y) => x.startedAt - y.startedAt)) {
  if (!r.raw) continue;
  if (r.kind === 'websocket') {
    for (const f of P.parseWSFrames(r.raw)) { frameNo++; asm.feedWs(JSON.stringify(f)); snapshotNewlyComplete(); }
  } else {
    for (const f of P.parseSseFrames(r.raw)) {
      frameNo++;
      asm.feedSse((f.event ? 'event: ' + f.event + '\n' : '') + 'data: ' + f.data + '\n\n');
      snapshotNewlyComplete();
    }
  }
}
const turns = asm.list().map(P.materializeTurn);

console.log('\nassembler stats: ' + JSON.stringify(asm.stats));
console.log('frames replayed: ' + frameNo + ' | turns: ' + turns.length + ' | completed: ' + turns.filter(t => t.status === 'complete').length);

console.log('\n== turn independence ==');
const ids = turns.map(t => t.turn_id);
ok('every turn has a turn id -- no phantom bucket', ids.every(Boolean), ids.filter(x => !x).length + ' null of ' + ids.length);
ok('turn ids are unique -- no two turns share a bucket', new Set(ids).size === ids.length, ids.length + ' ids, ' + new Set(ids).size + ' unique');
ok('more than one turn recovered (this is the multi-turn fixture)', turns.length > 1, turns.length);
const done = turns.filter(t => t.status === 'complete');
ok('every turn with a last_token marker is complete', turns.filter(t => t.markers.some(m => m.marker === 'last_token')).every(t => t.status === 'complete'), turns.map(t => [t.status, t.markers.some(m => m.marker === 'last_token')]));
ok('every complete turn got there via last_token', done.every(t => t.markers.some(m => m.marker === 'last_token')), done.map(t => t.markers.map(m => m.marker)));
ok('a closed WebSocket did not complete anything by itself', recs.some(r => r.kind === 'websocket' && r.status === 'closed'), recs.filter(r => r.kind === 'websocket').map(r => r.status));

console.log('\n== the freeze ==');
const rejected = turns.filter(t => t.post_final_rejected > 0);
ok('the freeze actually fires (async re-deliveries land after last_token)', rejected.length > 0, turns.map(t => [String(t.turn_id).slice(0, 8), t.post_final_rejected]));
// The load-bearing one: every refusal was a byte-for-byte re-delivery of the
// answer we already had, so freezing cost us nothing.
const lossy = [];
for (const t of rejected) {
  for (const d of t.post_final_rejected_detail) {
    if (d.channel === 'final' && d.len !== (t.final || '').length) lossy.push({ turn: String(t.turn_id).slice(0, 8), rejectedLen: d.len, keptLen: (t.final || '').length });
  }
}
ok('every rejected final was identical in length to the one we kept -- no content lost', lossy.length === 0, lossy);
ok('no rejection carried a delta op (only whole-message re-delivery)', turns.every(t => t.post_final_rejected_detail.every(d => d.what !== 'delta')), turns.flatMap(t => t.post_final_rejected_detail.map(d => d.what)));
const tails = {};
for (const t of turns) for (const k of Object.keys(t.post_final_events)) tails[k] = (tails[k] || 0) + t.post_final_events[k];
ok('the post-final tail is metadata only', Object.keys(tails).length > 0 && Object.keys(tails).every(k => ['server_ste_metadata', 'message_stream_complete', 'conversation_detail_metadata', 'ads'].includes(k)), tails);

console.log('\n== later turns cannot edit earlier ones ==');
ok('every completed turn was photographed at completion', done.every(t => snapshots.has(t.turn_id)), done.length + ' complete, ' + snapshots.size + ' snapshots');
let drifted = [];
for (const t of done) {
  const key = t.turn_id;
  if (snapshots.has(key) && snapshots.get(key) !== contentSig(t)) drifted.push({ turn: String(t.turn_id).slice(0, 8), completedAtFrame: completedAtFrame.get(key) });
}
ok('content at last_token is byte-identical to content after the whole replay', drifted.length === 0, drifted);
const notLast = done.filter(t => completedAtFrame.get(t.turn_id) < frameNo - 5);
ok('and that holds for turns that finished long before the replay ended', notLast.length > 0, notLast.length + ' of ' + done.length + ' turns completed with >5 frames still to come');

console.log('\n== turns recoverable only from the async path ==');
// Three turns in this fixture were never streamed live; the async-task
// re-delivery is the only copy of their answers.
const asyncOnly = turns.filter(t => t.stream_item_count === 0 && (t.final || '').length > 0);
ok('turns with no stream items still recovered a final', asyncOnly.length >= 3, asyncOnly.map(t => [String(t.turn_id).slice(0, 8), (t.final || '').length]));

console.log('\n== content actually recovered across turns ==');
ok('most completed turns have a final', done.filter(t => (t.final || '').length > 0).length >= done.length - 1, done.map(t => (t.final || '').length));
ok('thinking recovered on at least half of them', done.filter(t => t.thoughts.length > 0).length >= done.length / 2, done.map(t => t.thoughts.length));
ok('tool calls recovered somewhere', turns.some(t => t.tools.length > 0), turns.map(t => t.tools.length));
ok('no parser exception escaped', asm.stats.thrown === 0, asm.stats);
// Reuses the shipped allowlist rather than restating it, so the test cannot
// silently drift from what audit() considers benign.
const KNOWN = P.BENIGN_UNHANDLED;
ok('every unhandled shape is a known-benign one', Object.keys(asm.stats.unhandled).every(k => KNOWN.some(re => re.test(k))), asm.stats.unhandled);
ok('async task re-deliveries were seen and routed', (asm.stats.asyncUpdates['async-task-update-message'] || 0) > 0, asm.stats.asyncUpdates);
ok('subscribe-ack catchups were unpacked', Object.keys(asm.stats.catchups).length > 0, asm.stats.catchups);
ok('no turn is both complete and empty of content', !turns.some(t => t.completed && t.message_count === 0 && t.status === 'complete'), turns.filter(t => t.completed && t.message_count === 0).map(t => [String(t.turn_id).slice(0, 8), t.status]));
// The precise bug signal. A turn that ran stream items and still produced no
// message is how the dropped catch-up backlog announced itself; a turn that is
// empty with zero items just means we captured the handoff and nothing else.
ok('no turn ran stream items yet produced no message', !turns.some(t => t.status === 'empty' && t.stream_item_count > 0), turns.filter(t => t.status === 'empty').map(t => [String(t.turn_id).slice(0, 8), t.stream_item_count]));

console.log('\n== the resume leg (fetch SSE) carries real content too ==');
const resume = recs.find(r => /\/conversation\/resume/.test(String(r.url || '')));
ok('fixture contains a /f/conversation/resume stream', !!resume, resume && resume.bytes);
if (resume) {
  const only = P.makeTurnAssembler();
  only.feedSse(resume.raw);
  const rt = only.list().map(P.materializeTurn).filter(t => (t.final || '').length > 0 || t.thoughts.length > 0);
  ok('replaying resume alone yields turn content', rt.length > 0, only.list().map(t => [t.turnId, t.status]));
}

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + '  --  ' + pass + ' passed, ' + fail + ' failed\n');
if (process.env.DUMP) {
  fs.writeFileSync('/tmp/turns-multi.json', JSON.stringify(turns, null, 1));
  fs.writeFileSync('/tmp/turns-multi.md', P.turnsToMarkdown(turns));
  console.log('dumped /tmp/turns-multi.json and /tmp/turns-multi.md');
}
process.exit(fail ? 1 : 0);
