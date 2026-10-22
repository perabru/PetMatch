import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// All SDK and security checks in this file are local doubles. No Firebase
// endpoint, production account, credential, or live database is contacted.
const source = await readFile(new URL('../firebase-service.js', import.meta.url), 'utf8');
const { createCloudService } = await import('data:text/javascript;base64,' + Buffer.from(source + '\n//# sourceURL=petmatch-service-under-test.mjs').toString('base64'));
const tick = () => new Promise(resolve => setImmediate(resolve));
const state = (revision = 0) => ({ schemaVersion: 1, revision, pets: [], favorites: [], interests: [], reports: [], vetRequests: [] });
const error = code => Object.assign(new Error(code), { code });

function sdk({ initialUser = null, connected = true } = {}) {
  const calls = [], listeners = [], authListeners = [];
  let user = initialUser, profileWork = async () => {}, sdkWork = async () => {};
  const values = new Map();
  const auth = {};
  const current = path => path === '.info/connected' ? connected : values.get(path) ?? null;
  const emitAuth = next => { user = next; authListeners.filter(row => row.live).forEach(row => row.callback(next)); };
  const appSdk = { getApps: () => [], initializeApp: (config, name) => ({ config, name }) };
  const authSdk = {
    getAuth: () => { calls.push({ method: 'getAuth' }); return auth; },
    browserLocalPersistence: {}, inMemoryPersistence: {}, setPersistence: async () => {},
    onAuthStateChanged: (_, callback) => { const row = { live: true, callback }; authListeners.push(row); queueMicrotask(() => { if (row.live) callback(user); }); return () => { row.live = false; }; },
    signInWithEmailAndPassword: async (_, email) => { calls.push({ method: 'login', email }); const next = { uid: 'email-user', email, displayName: 'Email' }; emitAuth(next); return { user: next }; },
    createUserWithEmailAndPassword: async (_, email) => { calls.push({ method: 'register', email }); const next = { uid: 'new-user', email, displayName: '' }; emitAuth(next); return { user: next }; },
    updateProfile: async (target, props) => { await profileWork(); Object.assign(target, props); },
    GoogleAuthProvider: class { setCustomParameters() {} },
    signInWithPopup: async () => { calls.push({ method: 'google' }); const next = { uid: 'google-user', email: 'google@example.test', displayName: 'Google' }; emitAuth(next); return { user: next }; },
    signOut: async () => { calls.push({ method: 'logout' }); emitAuth(null); },
    sendPasswordResetEmail: async (_, email) => { calls.push({ method: 'reset', email }); }
  };
  const dbSdk = {
    getDatabase: () => { calls.push({ method: 'getDatabase' }); return {}; },
    ref: (_, path = '') => ({ path }),
    onValue: (reference, callback) => {
      calls.push({ method: 'onValue', path: reference.path });
      const row = { path: reference.path, callback, live: true }; listeners.push(row);
      queueMicrotask(() => { if (row.live) callback({ val: () => current(row.path) }); });
      return () => { row.live = false; };
    },
    get: async reference => { calls.push({ method: 'get', path: reference.path }); const value = current(reference.path); return { val: () => value, exists: () => value !== null }; },
    update: async (reference, updates) => { calls.push({ method: 'update', path: reference.path, updates }); },
    remove: async reference => { calls.push({ method: 'remove', path: reference.path }); }
  };
  return {
    calls, listeners, authListeners, values, emitAuth,
    set profileWork(value) { profileWork = value; },
    set sdkWork(value) { sdkWork = value; },
    loadSdk: async () => { await sdkWork(); return [appSdk, authSdk, dbSdk]; },
    databaseCalls: () => calls.filter(call => ['getDatabase', 'onValue', 'get', 'update', 'remove'].includes(call.method))
  };
}

for (const code of ['unsafe-rules', 'security-check-failed']) {
  test(`Auth remains available while database security rejects ${code}`, async () => {
    const fake = sdk({ initialUser: { uid: 'restored', email: 'restored@example.test', displayName: 'Restored' } });
    const authEvents = [], dataEvents = [];
    const cloud = createCloudService({ ...fake, checkSecurity: async () => { throw error(code); } });
    await cloud.init({ onAuth: value => authEvents.push(value), onState: value => dataEvents.push(value) });
    await tick();
    assert.equal(cloud.authReady, true);
    assert.equal(cloud.syncAllowed, false);
    assert.equal(cloud.securityError.code, code);
    assert.equal(cloud.ready, false);
    assert.equal(cloud.user.uid, 'restored');
    assert.equal(authEvents.at(-1).uid, 'restored');
    assert.ok(dataEvents.every(value => value === null));
    assert.deepEqual(fake.databaseCalls(), []);
    await cloud.login('email@example.test', 'test-password');
    await cloud.resetPassword('email@example.test');
    await cloud.loginWithGoogle();
    await cloud.register('new@example.test', 'test-password', 'New tutor');
    await cloud.logout();
    assert.equal(cloud.user, null);
    assert.deepEqual(fake.databaseCalls(), []);
    assert.deepEqual(fake.calls.filter(call => ['login', 'reset', 'google', 'register', 'logout'].includes(call.method)).map(call => call.method), ['login', 'reset', 'google', 'register', 'logout']);
    cloud.destroy();
  });
}

test('blocked database writes reject without any database SDK access', async () => {
  const fake = sdk({ initialUser: { uid: 'restored', email: 'restored@example.test' } });
  const cloud = createCloudService({ ...fake, checkSecurity: async () => { throw error('unsafe-rules'); } });
  await cloud.init(); await tick();
  await assert.rejects(cloud.commit(state(), 0), value => ['unsafe-rules', 'not-ready', 'sync-blocked'].includes(value.code));
  assert.deepEqual(fake.databaseCalls(), []);
  cloud.destroy();
});

test('retry unlocks synchronization only after a successful security check', async () => {
  const fake = sdk({ initialUser: { uid: 'restored', email: 'restored@example.test' } });
  let allowed = false, checks = 0;
  const cloud = createCloudService({ ...fake, checkSecurity: async () => { checks++; if (!allowed) throw error('unsafe-rules'); return true; } });
  await cloud.init(); await tick();
  assert.deepEqual(fake.databaseCalls(), []);
  allowed = true;
  await cloud.retrySync(); await tick();
  assert.equal(checks, 2);
  assert.equal(cloud.authReady, true); assert.equal(cloud.syncAllowed, true); assert.equal(cloud.securityError, null); assert.equal(cloud.ready, true);
  assert.equal(fake.calls.filter(call => call.method === 'getDatabase').length, 1);
  assert.equal(fake.listeners.filter(row => row.live && row.path === 'petmatchV1/users/restored/state').length, 1);
  assert.equal(fake.listeners.filter(row => row.live && row.path === 'petmatchV1/inbox/restored').length, 1);
  cloud.destroy();
});

test('simultaneous retries share one guard and do not duplicate database listeners', async () => {
  const fake = sdk(); let allowed = false, checks = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const cloud = createCloudService({ ...fake, checkSecurity: async () => { checks++; if (!allowed) throw error('unsafe-rules'); await gate; return true; } });
  await cloud.init(); await tick(); allowed = true;
  const first = cloud.retrySync(), second = cloud.retrySync();
  await tick(); assert.equal(checks, 2);
  release(); await Promise.all([first, second]); await tick();
  assert.equal(fake.listeners.filter(row => row.live && row.path === '.info/connected').length, 1);
  assert.equal(fake.listeners.filter(row => row.live && row.path === 'petmatchV1/publicPets').length, 1);
  cloud.destroy();
});

test('SDK initialization failure can be retried without reloading the page', async () => {
  const fake = sdk(); let attempts = 0;
  fake.sdkWork = async () => { if (++attempts === 1) throw new Error('Local simulated CDN failure'); };
  const cloud = createCloudService({ ...fake, checkSecurity: async () => true });
  await assert.rejects(cloud.init(), value => value.code === 'sdk-unavailable');
  assert.equal(cloud.authReady, false);
  await cloud.retrySync(); await tick();
  assert.equal(attempts, 2); assert.equal(cloud.authReady, true); assert.equal(cloud.syncAllowed, true);
  cloud.destroy();
});

test('a renewed unsafe security check detaches database listeners and keeps Auth', async () => {
  const fake = sdk({ initialUser: { uid: 'restored', email: 'restored@example.test' } });
  let allowed = true;
  const cloud = createCloudService({ ...fake, checkSecurity: async () => { if (!allowed) throw error('unsafe-rules'); return true; } });
  await cloud.init(); await tick(); assert.equal(cloud.ready, true);
  allowed = false; await cloud.retrySync(); await tick();
  assert.equal(cloud.authReady, true); assert.equal(cloud.syncAllowed, false); assert.equal(cloud.ready, false);
  assert.equal(fake.listeners.filter(row => row.live).length, 0);
  await cloud.logout(); assert.equal(cloud.user, null);
  cloud.destroy();
});

test('offline synchronization rejects writes while email recovery and logout remain available', async () => {
  const fake = sdk({ initialUser: { uid: 'restored', email: 'restored@example.test' }, connected: false });
  const cloud = createCloudService({ ...fake, checkSecurity: async () => true });
  await cloud.init(); await tick();
  assert.equal(cloud.connected, false);
  await assert.rejects(cloud.commit(state(), 0), value => value.code === 'offline');
  assert.equal(fake.calls.filter(call => call.method === 'update').length, 0);
  await cloud.resetPassword('restored@example.test'); await cloud.logout();
  assert.equal(cloud.user, null); cloud.destroy();
});

test('late registration profile completion cannot restore an externally signed-out session', async () => {
  const fake = sdk(); let release;
  fake.profileWork = () => new Promise(resolve => { release = resolve; });
  const authEvents = [], cloud = createCloudService({ ...fake, checkSecurity: async () => true });
  await cloud.init({ onAuth: value => authEvents.push(value?.uid ?? null) }); await tick();
  const pending = cloud.register('new@example.test', 'test-password', 'New tutor');
  await tick(); assert.equal(cloud.user.uid, 'new-user');
  fake.emitAuth(null); const index = authEvents.length;
  release();
  await assert.rejects(pending, value => value.code === 'session-changed');
  assert.equal(cloud.user, null);
  assert.deepEqual(authEvents.slice(index), []);
  cloud.destroy();
});

test('registration profile failure preserves the created account and reports the partial result', async () => {
  const fake = sdk(), warnings = [];
  fake.profileWork = async () => { throw error('auth/network-request-failed'); };
  const cloud = createCloudService({ ...fake, checkSecurity: async () => true });
  await cloud.init({ onError: value => warnings.push(value) }); await tick();
  const user = await cloud.register('new@example.test', 'test-password', 'New tutor');
  assert.equal(user.uid, 'new-user'); assert.equal(cloud.user.uid, 'new-user');
  assert.equal(fake.calls.filter(call => call.method === 'register').length, 1);
  assert.equal(warnings.at(-1).code, 'profile-update-failed');
  assert.match(warnings.at(-1).message, /conta foi criada/);
  cloud.destroy();
});

test('a synchronous SDK loader failure can be retried without reloading', async () => {
  const fake = sdk(); let attempts = 0;
  const cloud = createCloudService({ ...fake, loadSdk: () => { if (++attempts === 1) throw new Error('Synchronous local loader failure'); return fake.loadSdk(); }, checkSecurity: async () => true });
  await assert.rejects(cloud.init(), value => value.code === 'sdk-unavailable');
  await cloud.retrySync(); await tick();
  assert.equal(attempts, 2); assert.equal(cloud.authReady, true);
  cloud.destroy();
});

test('opting out while Analytics loads prevents late collection activation', async () => {
  const fake = sdk(), analyticsCalls = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const cloud = createCloudService({ ...fake, checkSecurity: async () => true, loadAnalytics: async () => { await gate; return { isSupported: async () => true, getAnalytics: () => { analyticsCalls.push('instance'); return {}; }, setAnalyticsCollectionEnabled: (_, value) => analyticsCalls.push(value) }; } });
  await cloud.init(); await tick();
  const enabling = cloud.enableAnalytics();
  await cloud.disableAnalytics(); release();
  assert.equal(await enabling, false);
  assert.deepEqual(analyticsCalls, []);
  cloud.destroy();
});

test('destroy during a pending security check cannot reattach database listeners', async () => {
  const fake = sdk(); let checking = false, release;
  const gate = new Promise(resolve => { release = resolve; });
  const cloud = createCloudService({ ...fake, checkSecurity: async () => { checking = true; await gate; return true; } });
  const pending = cloud.init(); await tick(); assert.equal(checking, true);
  cloud.destroy(); release(); await pending; await tick();
  assert.equal(cloud.authReady, false); assert.equal(cloud.syncAllowed, false); assert.equal(cloud.user, null);
  assert.deepEqual(fake.databaseCalls(), []);
  assert.equal(fake.authListeners.filter(row => row.live).length, 0);
});
