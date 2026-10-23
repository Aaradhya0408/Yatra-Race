import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('both theme packs have at least ten landmarks', () => {
  for (const theme of ['world', 'bharat']) {
    const match = server.match(new RegExp(`${theme}: \\[([\\s\\S]*?)\\n  \\]`));
    assert.ok(match, `missing ${theme} theme`);
    const count = (match[1].match(/q\('/g) || []).length;
    assert.ok(count >= 10, `${theme} has only ${count} landmarks`);
  }
});

test('server validates turns and answer deadlines', () => {
  assert.match(server, /if\(id!==active\) return roomError\(socket,'It is not your turn yet\.'/);
  assert.match(server, /if\(now\(\)>room\.deadline\) return roomError\(socket,'Time is up\.'/);
  assert.match(server, /const correct=String\(answer\)===item\.answer/);
});

test('room size and rotating turns are implemented', () => {
  assert.match(server, /const MAX_PLAYERS = 8/);
  assert.match(server, /room\.turnIndex\+\+/);
  assert.match(server, /room\.turnOrder=\[\.\.\.room\.players\.values\(\)\]/);
});

test('guest reconnect and theme selection are present', () => {
  assert.match(server, /room:rejoin/);
  assert.match(server, /TOKEN_SECRET/);
  assert.match(server, /room:theme/);
  assert.match(client, /localStorage\.setItem\('yatra-session'/);
});

test('accessible mobile-first app shell and help dialog exist', () => {
  assert.match(html, /name="viewport"/);
  assert.match(html, /howDialog/);
  assert.match(client, /function homeView\(\)/);
});
