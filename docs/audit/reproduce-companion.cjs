// Run from the repository root: node docs/audit/reproduce-companion.cjs
// Executes the real client with an in-memory WebSocket and deterministic timers.
// No network connections, microphone access, or desktop input are performed.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');

function fixture() {
  const sockets = [];
  const timers = new Map();
  let id = 0;
  class Socket {
    static OPEN = 1;
    readyState = 1;
    constructor() {
      sockets.push(this);
      queueMicrotask(() => this.onopen?.());
    }
    close() { this.readyState = 3; }
    fireClose() { this.readyState = 3; this.onclose?.(); }
    send(raw) {
      const request = JSON.parse(raw);
      const type = request.type === 'hello' ? 'hello.ok'
        : request.type === 'auth' ? 'auth.ok' : 'ok';
      queueMicrotask(() => this.onmessage?.({data: JSON.stringify({
        v: 1, id: request.id, type,
        payload: {deviceId: 'device', credential: 'test-credential'},
      })}));
    }
  }
  const output = ts.transpileModule(fs.readFileSync('companion/src/companionClient.ts', 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, WebSocket: Socket,
    require: () => ({makeEnvelope: (type, payload) => ({v: 1, id: String(++id), type, payload})}),
    setTimeout: (fn, delay) => { const key = ++id; timers.set(key, {fn, delay}); return key; },
    clearTimeout: key => timers.delete(key),
    setInterval: () => ++id, clearInterval: () => {},
  });
  return {client: new exports.CompanionClient(), sockets, timers};
}
const cred = {hostId: 'host', deviceId: 'device', credential: 'test', lastIp: '127.0.0.1', port: 1};
const pairing = {hostId: 'host', ip: '127.0.0.1', port: 1, pairingToken: 'test', protocolVersion: 1};
let failures = 0;
async function check(name, run) {
  try { await run(); console.log('PASS:', name); }
  catch (error) { failures++; console.log('FAIL:', name, '\n ', error.message); }
}
(async () => {
  await check('a delayed close from the old socket must not erase the new connection', async () => {
    const {client, sockets} = fixture();
    await client.connectWithCredential(cred);
    const old = sockets[0];
    await client.connectWithCredential(cred);
    assert.equal(client.getStatus(), 'connected');
    old.fireClose();
    assert.equal(client.getStatus(), 'connected');
    await client.send('ping');
  });
  await check('pairing after Forget must restore automatic reconnection', async () => {
    const {client, sockets} = fixture();
    client.disconnect();
    await client.pair(pairing);
    sockets.at(-1).fireClose();
    assert.equal(client.getStatus(), 'reconnecting');
  });
  await check('disconnect must cancel a socket that is still connecting', async () => {
    const {client, sockets} = fixture();
    const connecting = client.connectWithCredential(cred);
    client.disconnect();
    await connecting;
    assert.equal(client.getStatus(), 'disconnected');
    assert.equal(sockets[0].readyState, 3);
  });
  process.exitCode = failures ? 1 : 0;
})();
