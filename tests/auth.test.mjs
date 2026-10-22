import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../firebase-service.js', import.meta.url), 'utf8');
const { createCloudService } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const tick = () => new Promise(resolve => setImmediate(resolve));

function sdk() {
  const calls = [], listeners = [], authListeners = [];
  let popupError = null;
  const auth = {};
  const user = { uid: 'google-user', email: 'tutor@example.test', displayName: 'Tutor Google' };
  const appSdk = { getApps: () => [], initializeApp: (config, name) => ({ config, name }) };
  const authSdk = {
    getAuth: () => auth,
    browserLocalPersistence: {}, inMemoryPersistence: {},
    setPersistence: async () => {},
    onAuthStateChanged: (_, callback) => { authListeners.push(callback); queueMicrotask(() => callback(null)); return () => {}; },
    GoogleAuthProvider: class {
      providerId = 'google.com';
      setCustomParameters(parameters) { this.parameters = parameters; }
    },
    signInWithPopup: async (authObject, provider) => {
      calls.push({ authObject, provider });
      if (popupError) throw Object.assign(new Error('Provider error'), { code: popupError });
      authListeners.forEach(callback => callback(user));
      return { user };
    },
    signOut: async () => authListeners.forEach(callback => callback(null))
  };
  const dbSdk = {
    getDatabase: () => ({}), ref: (_, path) => ({ path }),
    onValue: (reference, callback) => {
      const listener = { path: reference.path, callback, live: true };
      listeners.push(listener);
      queueMicrotask(() => { if (listener.live) callback({ val: () => reference.path === '.info/connected' ? true : null }); });
      return () => { listener.live = false; };
    }
  };
  return { calls, listeners, auth, user, loadSdk: async () => [appSdk, authSdk, dbSdk], fail: code => { popupError = code; } };
}

test('Google login requires initialized Firebase and never opens a premature popup', async () => {
  const fake = sdk(), cloud = createCloudService(fake);
  await assert.rejects(cloud.loginWithGoogle(), error => error.code === 'not-ready');
  assert.equal(fake.calls.length, 0);
});

test('Google popup selects an account, uses existing auth and emits session through normal listeners', async () => {
  const fake = sdk(), events = [], cloud = createCloudService(fake);
  await cloud.init({ onAuth: user => events.push(user) });
  await tick();
  const result = await cloud.loginWithGoogle();
  await tick();
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].authObject, fake.auth);
  assert.equal(fake.calls[0].provider.providerId, 'google.com');
  assert.equal(fake.calls[0].provider.parameters.prompt, 'select_account');
  assert.deepEqual(result, fake.user);
  assert.deepEqual(events.at(-1), fake.user);
  assert.equal(cloud.ready, true);
  assert.ok(fake.listeners.some(listener => listener.live && listener.path === 'petmatchV1/users/google-user/state'));
  await cloud.logout();
  assert.equal(cloud.user, null);
  assert.equal(fake.listeners.some(listener => listener.live && listener.path.includes('/google-user/')), false);
  cloud.destroy();
});

for (const [code, message] of [
  ['auth/popup-blocked', 'Permita pop-ups'],
  ['auth/popup-closed-by-user', 'foi fechada'],
  ['auth/operation-not-allowed', 'E-mail/senha ou Google'],
  ['auth/unauthorized-domain', 'domínio'],
  ['auth/account-exists-with-different-credential', 'outro método']
]) {
  test(`Google error ${code} is explained without creating a local session`, async () => {
    const fake = sdk(), cloud = createCloudService(fake);
    await cloud.init(); await tick(); fake.fail(code);
    await assert.rejects(cloud.loginWithGoogle(), error => error.code === code && error.message.includes(message));
    assert.equal(cloud.user, null);
    cloud.destroy();
  });
}

// Exercise the actual account event handlers with small DOM doubles. No network,
// browser, production account or real credential is used by these checks.
function ui() {
  const elements = new Map(), calls = [], errors = [];
  const element = id => {
    if (elements.has(id)) return elements.get(id);
    const value = {
      value: '', hidden: false, required: false, disabled: false, type: 'password', attributes: {}, events: {},
      classList: { toggle() {}, contains() { return false; } },
      setAttribute(key, v) { this.attributes[key] = v; },
      addEventListener(key, callback) { this.events[key] = callback; },
      reportValidity() { return this.valid !== false; },
      scrollIntoView() {}
    };
    elements.set(id, value); return value;
  };
  const context = vm.createContext({
    $: element, activeUser: null, accountLoaded: false, saving: false,
    authBusy: false, authMode: 'login', cloudInitError: '', cloudStarting: false,
    cloud: Object.fromEntries(['login', 'register', 'loginWithGoogle', 'resetPassword', 'logout'].map(method => [method, async (...args) => { calls.push({ method, args }); }])),
    showError: (_, message) => { element('authError').textContent = message || ''; errors.push(message || ''); },
    showToast() {}
  });
  return { element, context, calls, errors };
}
const script = await readFile(new URL('../script.js', import.meta.url), 'utf8');
const accountCode = script.slice(script.indexOf('  function renderAccount()'), script.indexOf('  $("syncLocalBtn").addEventListener'));
function account() { const value = ui(); vm.runInContext(accountCode, value.context); return value; }

test('email registration changes required fields and validates password confirmation', async () => {
  const { context, element, calls } = account();
  element('authRegisterTab').events.click();
  assert.equal(element('authName').required, true);
  assert.equal(element('authConfirmPassword').required, true);
  assert.equal(element('registerBtn').hidden, false);
  assert.equal(element('loginBtn').hidden, true);
  element('authEmail').value = 'tutor@example.test';
  element('authName').value = ' Tutor ';
  element('authPassword').value = 'test-password';
  element('authConfirmPassword').value = 'different';
  await vm.runInContext('authAction("register")', context);
  assert.equal(calls.length, 0);
  assert.match(element('authError').textContent, /senhas não conferem/);
  element('authConfirmPassword').value = 'test-password';
  await vm.runInContext('authAction("register")', context);
  assert.equal(calls[0].method, 'register');
  assert.deepEqual([...calls[0].args], ['tutor@example.test', 'test-password', 'Tutor']);
  assert.equal(element('authPassword').value, '');
  assert.equal(element('authConfirmPassword').value, '');
});

test('Google button does not validate empty email/password fields', async () => {
  const { context, element, calls } = account();
  element('authEmail').valid = false;
  element('authPassword').valid = false;
  await vm.runInContext('authAction("google")', context);
  assert.equal(calls[0].method, 'loginWithGoogle');
});

test('email login submits the current form mode and trims email', async () => {
  const { element, calls } = account();
  element('authEmail').value = ' tutor@example.test ';
  element('authPassword').value = 'test-password';
  let prevented = false;
  element('authForm').events.submit({ preventDefault() { prevented = true; } });
  await tick();
  assert.equal(prevented, true);
  assert.equal(calls[0].method, 'login');
  assert.deepEqual([...calls[0].args], ['tutor@example.test', 'test-password']);
});

test('password reset only needs email, and login mode restores hidden registration fields', async () => {
  const { context, element, calls } = account();
  element('authRegisterTab').events.click();
  element('authLoginTab').events.click();
  assert.equal(element('authName').required, false);
  assert.equal(element('authConfirmPassword').required, false);
  assert.equal(element('authConfirmField').hidden, true);
  element('authEmail').value = 'tutor@example.test';
  element('authPassword').valid = false;
  await vm.runInContext('authAction("reset")', context);
  assert.equal(calls[0].method, 'resetPassword');
});

test('pending authentication blocks duplicate actions, restores controls and exposes failure', async () => {
  const { context, element, calls } = account();
  let reject;
  context.cloud.loginWithGoogle = () => { calls.push({ method: 'google' }); return new Promise((_, fail) => { reject = fail; }); };
  const pending = vm.runInContext('authAction("google")', context);
  assert.equal(element('googleLoginBtn').disabled, true);
  await vm.runInContext('authAction("google")', context);
  assert.equal(calls.length, 1);
  reject(new Error('Janela bloqueada'));
  await pending;
  assert.equal(element('googleLoginBtn').disabled, false);
  assert.equal(element('authOptions').attributes['aria-busy'], 'false');
  assert.equal(element('authError').textContent, 'Janela bloqueada');
});

test('password toggle shows both fields and resets when changing access mode', () => {
  const { element } = account();
  element('togglePasswordBtn').events.click();
  assert.equal(element('authPassword').type, 'text');
  assert.equal(element('authConfirmPassword').type, 'text');
  element('authRegisterTab').events.click();
  assert.equal(element('authPassword').type, 'password');
  assert.equal(element('togglePasswordBtn').attributes['aria-pressed'], 'false');
});
