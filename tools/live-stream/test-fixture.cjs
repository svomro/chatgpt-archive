// Runs the SHIPPED parser. Extracts the marked pure section straight out of the
// .user.js so there is exactly one source of truth -- no copy to drift.
const fs = require('fs'), path = require('path'), vm = require('vm');
const SCRIPT = path.join(__dirname, 'chatgpt-stream-recorder.user.js');
const src = fs.readFileSync(SCRIPT, 'utf8');
const a = src.indexOf('/* ==PURE-START==');
const b = src.indexOf('/* ==PURE-END==');
if (a < 0 || b < 0) { console.error('FATAL: pure-section markers not found in', SCRIPT); process.exit(2); }
const pure = src.slice(src.indexOf('*/', a) + 2, b);
const ctx = { console, TextDecoder, TextEncoder };
vm.createContext(ctx);
vm.runInContext(pure, ctx, { filename: 'pure.js' });
const P = vm.runInContext('({splitTopLevelJson,parseSseFrames,makeCapGuard,makeTurnAssembler,materializeTurn,turnsToMarkdown})', ctx);

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
const E = EXPECT.singleTurn;
const FIX = process.argv[2] || E.capture;
if (!fs.existsSync(FIX)) { console.log('\nSKIPPED -- capture not found: ' + FIX); process.exit(0); }
const recs = fs.readFileSync(FIX, 'utf8').trim().split('\n').map(JSON.parse);

const asm = P.makeTurnAssembler();
for (const r of recs) {
  if (r.kind === 'websocket') asm.feedWs(r.raw);
  else if (r.raw) asm.feedSse(r.raw);
}
const turns = asm.list().map(P.materializeTurn);

let pass = 0, fail = 0;
const ok = (name, cond, got) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + '\n          got: ' + JSON.stringify(got)); }
};

console.log('\nassembler stats: ' + JSON.stringify(asm.stats));
console.log('turns recovered: ' + turns.length);
console.log('\n== no junk turn buckets ==');
ok('no turn keyed on unknown/unknown', !turns.some(t => !t.conversation_id && !t.turn_id), turns.map(t => (t.conversation_id || '?') + '|' + (t.turn_id || '?')));
ok('every turn has a conversation id', turns.every(t => !!t.conversation_id), turns.map(t => t.conversation_id));
ok('every turn has a turn id (no blank bucket from resume_conversation_token)', turns.every(t => !!t.turn_id), turns.map(t => t.turn_id));
// The fixture holds two real turns: the captured one, and an earlier one whose
// WebSocket leg predates the WS hook so only its handoff was recorded.
ok('both real turns recovered, no more', turns.length === 2, turns.map(t => t.turn_id));
const legs = turns.find(t => t.turn_id === E.turnId);
ok('fetch leg and WS leg merge into ONE turn', !!legs && !!legs.handoff_options && legs.stream_item_count > 0, legs && { handoff: !!legs.handoff_options, items: legs.stream_item_count });
// A handoff with no stream behind it is `empty`, not `streaming`: nothing is
// in flight and nothing ever will be.
ok('the content-less turn is labelled empty, not streaming', turns.filter(t => t.stream_item_count === 0 && t.message_count === 0).every(t => t.status === 'empty' && t.final === null), turns.map(t => [t.stream_item_count, t.message_count, t.status]));


const T = turns.find(t => t.turn_id === E.turnId);
console.log('\n== turn identity ==');
ok('turn found', !!T, turns.map(t => t.turn_id));
if (!T) process.exit(1);
ok('conversation_id', T.conversation_id === E.conversationId, T.conversation_id);
ok('model matches the capture', T.model === E.model, T.model);
ok('thinking_effort matches the capture', T.thinking_effort === E.thinkingEffort, T.thinking_effort);
ok('user = the prompt text', T.user === E.user, T.user);

console.log('\n== thoughts ==');
ok('4 thoughts after collapsing the server\'s blanked re-emission', T.thoughts.length === E.thoughtCount, T.thoughts.map(x => [x.summary, x.content.length]));
ok('the collapse is reported, not silent', T.thoughts_deduped === E.thoughtsDeduped, T.thoughts_deduped);
ok('the surviving copy keeps its content', T.thoughts.filter(x => x.summary === E.thoughtWithContent).every(x => x.content.length > 0), T.thoughts.filter(x => x.summary === E.thoughtWithContent).map(x => x.content.length));
const summaries = T.thoughts.map(t => t.summary);
for (const s of E.thoughtSummaries)
  ok('expected thought summary present', summaries.includes(s), summaries.length);
ok('thought[0] content non-empty', (T.thoughts[0].content || '').length > 0, (T.thoughts[0].content || '').length);
ok('thought[1] content non-empty', (T.thoughts[1].content || '').length > 0, (T.thoughts[1].content || '').length);
ok('empty-content thought preserved, not dropped', T.thoughts.some(t => t.content === ''), T.thoughts.map(t => (t.content || '').length));
ok('summary_type kept where present', T.thoughts.some(t => t.summary_type === 'raw_cot'), T.thoughts.map(t => t.summary_type));
ok('summary_type absent where truly absent', T.thoughts.some(t => !t.summary_type), T.thoughts.map(t => t.summary_type));
ok('source_analysis_msg_id kept (lives on content, not metadata)', T.thoughts.some(t => !!t.source_analysis_msg_id), T.thoughts.map(t => t.source_analysis_msg_id));

console.log('\n== reasoning recap ==');
ok('recap text', T.reasoning_recap && T.reasoning_recap.text === E.recapText, T.reasoning_recap);
ok('recap duration matches', T.reasoning_recap && T.reasoning_recap.finished_duration_sec === E.recapSeconds, T.reasoning_recap && T.reasoning_recap.finished_duration_sec);

console.log('\n== final (needs sticky o/p delta state) ==');
ok('final starts correctly', (T.final || '').startsWith(E.finalStartsWith), (T.final || '').slice(0, 30));
ok('final contains the closing line', (T.final || '').includes(E.finalContains), (T.final || '').slice(-40));
ok('final reassembled to full length (>400 chars)', (T.final || '').length > E.finalMinLength, (T.final || '').length);
// U+E200/U+E201 are ChatGPT's private-use citation delimiters. Asserting on the
// exact codepoints proves the reassembly is byte-verbatim and strips nothing.
ok('final keeps the private-use citation delimiters verbatim', (T.final || '').endsWith(E.finalEndsWith), Array.from((T.final || '').slice(-10)).map(c => 'U+' + c.codePointAt(0).toString(16)));
ok('final does not swallow commentary', !!T.commentary[0] && !(T.final || '').includes(T.commentary[0].text.slice(0, 24)), (T.final || '').length);
ok('final does not swallow tool code', !(T.final || '').includes('api_tool'), (T.final || '').length);

console.log('\n== commentary / tools ==');
ok('2 commentary blocks', T.commentary.length === E.commentaryCount, T.commentary.length);
ok('preamble commentary flagged', T.commentary.some(c => c.is_thinking_preamble_message === true), T.commentary.map(c => c.is_thinking_preamble_message));
ok('3 tool calls', T.tools.length === E.toolCount, T.tools.length);
ok('tool names resolved', T.tools.every(t => /^api_tool\./.test(t.name || '')), T.tools.map(t => t.name));
ok('every call paired to a result via parent_id', T.tools.every(t => !!t.result_message_id), T.tools.map(t => t.result_message_id));
ok('at least one arguments blob parsed as JSON', T.tools.some(t => t.arguments && typeof t.arguments === 'object'), T.tools.map(t => typeof t.arguments));
ok('arguments_raw always retained', T.tools.every(t => typeof t.arguments_raw === 'string'), T.tools.map(t => typeof t.arguments_raw));

console.log('\n== turn boundary ==');
ok('markers include last_token', T.markers.some(m => m.marker === 'last_token'), T.markers.map(m => m.marker));
ok('status complete from last_token, not socket close', T.status === 'complete', T.status);
ok('finished_at set', !!T.finished_at, T.finished_at);
ok('WS stream itself stays streaming', recs.find(r => r.kind === 'websocket').status === 'streaming', recs.find(r => r.kind === 'websocket').status);

console.log('\n== derived views ==');
const md = P.turnsToMarkdown(turns);
ok('markdown names the turn', md.includes(E.turnId.slice(0, 8)), md.slice(0, 80));
ok('markdown marks summary-only thoughts', md.includes('（只有 summary）'), 'marker missing');
ok('markdown carries final verbatim', md.includes(E.finalStartsWith), 'final missing from md');
ok('no parser exception escaped', asm.stats.thrown === 0, asm.stats);

console.log('\n== catch-up backlog ==');
ok('subscribe-ack catchups were unpacked, not dropped', Object.keys(asm.stats.catchups).length > 0, asm.stats.catchups);
// Catch-ups are a REPLAY. `add` is idempotent, `append` is not -- without offset
// dedupe a second delivery of the same frames doubles every answer.
const twice = P.makeTurnAssembler();
for (const r of recs) { if (!r.raw) continue; if (r.kind === 'websocket') { twice.feedWs(r.raw); twice.feedWs(r.raw); } else { twice.feedSse(r.raw); } }
const T2 = twice.list().map(P.materializeTurn).find(x => x.turn_id === E.turnId);
ok('replaying the same stream twice does not double the answer', !!T2 && T2.final === T.final, { once: (T.final || '').length, twice: T2 && (T2.final || '').length });
ok('the duplicate frames were counted, not silently ignored', Object.keys(twice.stats.duplicateOffsets).length > 0, twice.stats.duplicateOffsets);

console.log('\n== byte cap accounting ==');
{
  const g = P.makeCapGuard(100);
  ok('admits while under budget', g.admit(40) === true && g.admit(40) === true, g.used);
  ok('refuses the chunk that would overshoot', g.admit(40) === false, { used: g.used, capped: g.capped });
  ok('never overshoots the budget', g.used <= 100, g.used);
  ok('counts what was dropped, not just that something was', g.droppedChunks === 1 && g.droppedBytes === 40, { chunks: g.droppedChunks, bytes: g.droppedBytes });
  // A small chunk must NOT slip into the leftover budget after a big one was
  // refused: that would leave a hole mid-stream, and an append-based delta
  // stream with a hole reassembles into wrong text, not visibly missing text.
  g.admit(1000);
  ok('refuses even a chunk that would still fit, once capped', g.admit(7) === false, { used: g.used, dropped: g.droppedBytes });
  ok('keeps counting every later loss', g.droppedChunks === 3 && g.droppedBytes === 1047, { chunks: g.droppedChunks, bytes: g.droppedBytes });
  ok('capped latches on', g.capped === true, g.capped);
  const h = P.makeCapGuard(10);
  ok('a single oversized chunk is refused whole, not truncated', h.admit(11) === false && h.used === 0, { used: h.used, dropped: h.droppedBytes });
}

console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + '  --  ' + pass + ' passed, ' + fail + ' failed\n');
if (process.env.DUMP) {
  fs.writeFileSync('/tmp/turns.json', JSON.stringify(turns, null, 1));
  fs.writeFileSync('/tmp/turns.md', md);
  console.log('dumped /tmp/turns.json and /tmp/turns.md');
}
process.exit(fail ? 1 : 0);
