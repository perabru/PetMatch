/**
 * PetMatch / Firebase SDK 13.0.0.
 * Authentication identifies the owner; Realtime Database rules enforce access.
 * A commit updates private state, public pet projections and optional inbox effects
 * atomically. The state revision is checked by database.rules.json, not by trusting
 * a client-side read. No service-account credential belongs in this file.
 */
export const firebaseConfig = Object.freeze({
  apiKey: "AIzaSyA0rMhUaC4vrP_6k-X3MpKd0bJMGu2e8sQ",
  authDomain: "camada2.firebaseapp.com",
  databaseURL: "https://camada2.firebaseio.com",
  projectId: "camada2",
  storageBucket: "camada2.firebasestorage.app",
  messagingSenderId: "300681473888",
  appId: "1:300681473888:web:c328decb4a23f71560f805",
  measurementId: "G-CTE5MFW9G8"
});
const SDK_BASE = "https://www.gstatic.com/firebasejs/13.0.0/";
const ROOT = "petmatchV1";
const LISTS = ["pets", "favorites", "interests", "reports", "vetRequests"];
const emptyState = () => ({ schemaVersion: 1, revision: 0, pets: [], favorites: [], interests: [], reports: [], vetRequests: [] });
const clone = value => JSON.parse(JSON.stringify(value));
const safeKey = value => typeof value === "string" && value.length > 0 && value.length <= 128 && !/[.#$\[\]/\u0000-\u001f\u007f]/.test(value);
const toList = value => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter(item => item != null);
  if (typeof value === "object") return Object.keys(value).sort((a, b) => Number(a) - Number(b)).map(key => value[key]).filter(item => item != null);
  throw serviceError("invalid-data", "O banco retornou uma coleção em formato inválido.");
};
export function hydrateState(raw) {
  if (raw == null) return emptyState();
  if (typeof raw !== "object" || raw.schemaVersion !== 1 || !Number.isSafeInteger(raw.revision) || raw.revision < 0) throw serviceError("invalid-data", "Os dados da conta estão em um formato incompatível. Nenhum dado foi substituído.");
  const state = { schemaVersion: 1, revision: raw.revision };
  for (const key of LISTS) state[key] = toList(raw[key]);
  return state;
}
function serviceError(code, message, original) {
  const error = new Error(message);
  error.code = code;
  if (original) error.cause = original;
  return error;
}
export function explainFirebaseError(original) {
  const code = String(original?.code || "").toLowerCase();
  if (original?.petmatchMapped) return original;
  const descriptions = {
    "auth/email-already-in-use": "Este e-mail já tem uma conta. Entre com sua senha ou solicite a recuperação.",
    "auth/invalid-email": "Informe um endereço de e-mail válido.",
    "auth/weak-password": "Use uma senha com pelo menos seis caracteres.",
    "auth/invalid-credential": "E-mail ou senha não conferem.",
    "auth/user-not-found": "E-mail ou senha não conferem.",
    "auth/wrong-password": "E-mail ou senha não conferem.",
    "auth/user-disabled": "Esta conta foi desativada no Firebase.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
    "auth/network-request-failed": "Não foi possível acessar o Firebase. Confira a conexão e tente novamente.",
    "auth/operation-not-allowed": "Este método de acesso precisa ser habilitado em Authentication no Firebase: E-mail/senha ou Google.",
    "auth/popup-blocked": "O navegador bloqueou a janela do Google. Permita pop-ups para este site e toque em Entrar com Google novamente. Em navegadores internos de aplicativos, abra o PetMatch no Chrome ou Safari.",
    "auth/popup-closed-by-user": "A janela do Google foi fechada antes de concluir. Toque em Entrar com Google para tentar novamente.",
    "auth/cancelled-popup-request": "A tentativa anterior de entrar com Google foi cancelada. Tente novamente.",
    "auth/account-exists-with-different-credential": "Este e-mail já usa outro método de acesso. Entre com o método usado ao criar sua conta para acessar seus registros.",
    "auth/operation-not-supported-in-this-environment": "Este navegador não oferece suporte ao acesso com Google. Abra o site pelo GitHub Pages no Chrome, Edge, Firefox ou Safari.",
    "auth/configuration-not-found": "O Authentication ainda precisa ser configurado no projeto Firebase.",
    "auth/unauthorized-domain": "Este domínio ainda precisa ser autorizado em Authentication no projeto Firebase.",
    "auth/invalid-api-key": "A configuração do Firebase não foi aceita pelo projeto. Confira a chave e suas restrições.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "A configuração do Firebase não foi aceita pelo projeto. Confira a chave e suas restrições.",
    "permission_denied": "O Firebase recusou o acesso. Confira as regras de petmatchV1 e a conta conectada.",
    "database/permission-denied": "O Firebase recusou o acesso. Confira as regras de petmatchV1 e a conta conectada.",
    "unavailable": "O banco está indisponível no momento. Confira a conexão e tente novamente.",
    "disconnected": "A conexão com o Firebase caiu. Mantenha a página aberta para acompanhar a confirmação.",
    "network_error": "Não foi possível alcançar o Firebase. Confira a conexão e tente novamente."
  };
  const own = ["not-ready", "not-authenticated", "offline", "busy", "conflict", "invalid-data", "invalid-interest", "not-found", "sdk-unavailable", "session-changed", "unsafe-rules", "security-check-failed", "profile-update-failed"].includes(code);
  const message = descriptions[code] || (own ? original.message : "Não foi possível concluir a operação no Firebase. Confira a conexão, o Authentication e as regras do banco.");
  const result = serviceError(code || "firebase-error", message, original);
  result.petmatchMapped = true;
  return result;
}
const defaultLoader = () => Promise.all([
  import(`${SDK_BASE}firebase-app.js`),
  import(`${SDK_BASE}firebase-auth.js`),
  import(`${SDK_BASE}firebase-database.js`)
]);

/**
 * Fail closed before Database can attach listeners or read/write account data.
 * Authentication is independent and can remain usable while synchronization is blocked.
 * This checks an intentionally nonexistent sentinel only; it never downloads an
 * actual user's private state. A readable sentinel proves the private namespace
 * is open. Denial is a prerequisite, not a substitute for deploying the rules.
 */
export async function verifyDatabaseSecurity({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw serviceError("security-check-failed", "Não foi possível verificar a proteção do banco. A sincronização está bloqueada; o modo local continua disponível.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetchImpl(`${firebaseConfig.databaseURL}/petmatchV1/users/__petmatch_access_probe__/state.json`, {
      method: "GET", cache: "no-store", credentials: "omit", redirect: "error",
      headers: { Accept: "application/json" }, signal: controller.signal
    });
  } catch (error) {
    throw serviceError("security-check-failed", "Não foi possível verificar a proteção do banco. Confira a conexão e as regras do Firebase antes de sincronizar. O modo local continua disponível.", error);
  } finally { clearTimeout(timer); }
  if (response.status === 401 || response.status === 403) return true;
  if (response.status === 200) throw serviceError("unsafe-rules", "A sincronização foi bloqueada porque o banco permite leitura sem login na área privada. Publique as regras de proteção de petmatchV1 no Firebase antes de sincronizar registros. Você pode acessar sua conta; seus registros não serão carregados nem enviados enquanto a proteção estiver pendente.");
  throw serviceError("security-check-failed", `Não foi possível confirmar a proteção do Firebase (resposta ${response.status}). A sincronização está bloqueada e o modo local continua disponível.`);
}

/** Dependency injection exists for isolated tests; the browser singleton uses the official SDK. */
export function createCloudService({ loadSdk = defaultLoader, loadAnalytics = () => import(`${SDK_BASE}firebase-analytics.js`), checkSecurity = loadSdk === defaultLoader ? verifyDatabaseSecurity : async () => true } = {}) {
  let appSdk, authSdk, dbSdk, app, auth, db;
  let callbacks = {};
  let initialized = false;
  let initPromise;
  let syncPromise;
  let syncAllowed = false;
  let securityFailure = null;
  let lifecycle = 0;
  let syncEpoch = 0;
  let sessionUser = null;
  let stateLoaded = false;
  let privateState = emptyState();
  let connected = false;
  let generation = 0;
  let authGeneration = 0;
  let writing = false;
  let destroyed = false;
  let analytics;
  let analyticsSdk;
  let analyticsGeneration = 0;
  let globalOff = [];
  let syncOff = [];
  let userOff = [];
  const buffered = new Map();
  const publicUser = user => user ? { uid: user.uid, email: user.email || "", displayName: user.displayName || "" } : null;
  const emit = (name, payload) => {
    if (destroyed) return;
    try { callbacks[name]?.(payload); } catch { /* UI callback errors cannot change a confirmed database operation. */ }
  };
  const ready = () => initialized && syncAllowed && (!sessionUser || stateLoaded);
  const status = (phase, message, code = securityFailure?.code || null) => emit("onStatus", { phase, message, code, connected, ready: ready(), authReady: initialized, syncAllowed, pending: writing });
  const emitData = (name, payload) => { if (writing) buffered.set(name, payload); else emit(name, payload); };
  const flush = () => { for (const [name, payload] of buffered) emit(name, payload); buffered.clear(); };
  const mapThrow = original => { throw explainFirebaseError(original); };
  const ref = path => path ? dbSdk.ref(db, path) : dbSdk.ref(db);
  const statePath = uid => `${ROOT}/users/${uid}/state`;
  const requireSession = () => {
    if (!initialized) throw serviceError("not-ready", "A conexão com o Firebase ainda não está pronta.");
    if (!syncAllowed) throw securityFailure || serviceError("not-ready", "A sincronização ainda não está liberada. Sua conta pode entrar, mas os registros aguardam a verificação das regras do banco.");
    if (!sessionUser) throw serviceError("not-authenticated", "Entre na sua conta para sincronizar os dados.");
    if (!stateLoaded) throw serviceError("not-ready", "Aguarde o carregamento dos dados da sua conta.");
    if (!connected) throw serviceError("offline", "O Firebase está desconectado. O formulário foi preservado; tente salvar quando a conexão voltar.");
    if (writing) throw serviceError("busy", "Aguarde a confirmação do salvamento em andamento.");
    return sessionUser.uid;
  };
  const requireAuthReady = () => {
    if (!initialized) throw serviceError("not-ready", "A conexão com o Firebase ainda não está pronta.");
    if (writing) throw serviceError("busy", "Aguarde a confirmação do salvamento antes de trocar de conta.");
  };
  const listenFailure = error => { const mapped = explainFirebaseError(error); status("error", mapped.message); emit("onError", mapped); };
  const unsubscribeUser = () => { userOff.forEach(off => off()); userOff = []; buffered.clear(); };
  const attachUserData = user => {
    const activeGeneration = ++generation;
    unsubscribeUser();
    stateLoaded = false;
    privateState = emptyState();
    emit("onState", null);
    emit("onInbox", []);
    if (!syncAllowed) {
      status(securityFailure ? "blocked" : "loading", securityFailure?.message || "A conta está disponível. A sincronização aguarda a verificação de proteção do banco.");
      return;
    }
    if (!user) { status(connected ? "ready" : "offline", "Explore os perfis ou entre na sua conta para sincronizar."); return; }
    status("loading", "Carregando os dados da sua conta…");
    userOff.push(dbSdk.onValue(ref(statePath(user.uid)), snapshot => {
      if (activeGeneration !== generation || !syncAllowed) return;
      try {
        privateState = hydrateState(snapshot.val());
        stateLoaded = true;
        emitData("onState", clone(privateState));
        if (!writing) status(connected ? "ready" : "offline", connected ? "Conta sincronizada com o Firebase." : "Sem conexão com o Firebase. Seus dados já carregados continuam visíveis.");
      } catch (error) { stateLoaded = false; listenFailure(error); }
    }, error => { if (activeGeneration === generation) { stateLoaded = false; listenFailure(error); } }));
    userOff.push(dbSdk.onValue(ref(`${ROOT}/inbox/${user.uid}`), snapshot => {
      if (activeGeneration !== generation || !syncAllowed) return;
      const records = snapshot.val() || {};
      emitData("onInbox", Object.entries(records).map(([id, value]) => ({ ...value, id })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
    }, error => { if (activeGeneration === generation) listenFailure(error); }));
  };
  const subscribeUser = user => {
    if ((sessionUser?.uid || null) !== (user?.uid || null)) ++authGeneration;
    sessionUser = user;
    emit("onAuth", publicUser(user));
    attachUserData(user);
  };
  function stopDatabase() {
    ++syncEpoch; ++generation;
    syncAllowed = false; connected = false; stateLoaded = false;
    unsubscribeUser();
    syncOff.forEach(off => off()); syncOff = [];
    privateState = emptyState();
    if (db && typeof dbSdk?.goOffline === "function") dbSdk.goOffline(db);
    emit("onState", null); emit("onInbox", []); emit("onPets", []);
  }
  async function write(label, perform) {
    if (writing) throw explainFirebaseError(serviceError("busy", "Aguarde a confirmação do salvamento em andamento."));
    writing = true;
    const writeGeneration = generation;
    status("pending", `${label} Aguardando confirmação do Firebase…`);
    const timer = setTimeout(() => status("pending", "O Firebase ainda não confirmou o salvamento. Mantenha esta página aberta; a operação pode ser concluída quando a conexão voltar. Não reenvie o formulário."), 8000);
    try {
      const result = await perform();
      if (writeGeneration !== generation) throw serviceError("session-changed", "A conta mudou durante a operação. Confira os registros da conta atual antes de continuar.");
      clearTimeout(timer);
      writing = false;
      flush();
      status(connected ? "ready" : "offline", "Operação confirmada pelo Firebase.");
      return result;
    } catch (error) {
      clearTimeout(timer);
      writing = false;
      flush();
      const mapped = explainFirebaseError(error);
      status("error", mapped.message);
      throw mapped;
    }
  }
  function publicProjection(pet, uid) {
    if (!safeKey(pet.id)) throw serviceError("invalid-data", "O identificador de um pet não é válido para publicação.");
    const fields = ["id", "name", "type", "age", "ageUnit", "size", "breed", "city", "purpose", "description", "photo", "createdAt", "updatedAt"];
    const result = { ownerId: uid };
    for (const key of fields) if (pet[key] !== undefined) result[key] = pet[key];
    return result;
  }
  function prepareInterest(record, pet, uid) {
    if (!record || !pet || !safeKey(record.id) || !safeKey(pet.id) || !safeKey(pet.ownerId) || pet.ownerId === uid || pet.id.startsWith("sample-")) throw serviceError("invalid-interest", "Selecione o pet publicado por outro tutor para enviar um interesse.");
    if (record.petId !== pet.id || !["amizade", "adocao"].includes(record.kind)) throw serviceError("invalid-interest", "Os dados do interesse não correspondem ao perfil selecionado.");
    return { id: record.id, senderId: uid, recipientId: pet.ownerId, petId: pet.id, petName: pet.name, kind: record.kind, name: String(record.name || "").trim(), message: String(record.message || "").trim(), createdAt: record.createdAt, status: "pendente" };
  }
  const api = {
    get user() { return publicUser(sessionUser); },
    get ready() { return ready(); },
    get connected() { return connected; },
    get pending() { return writing; },
    get authReady() { return initialized; },
    get syncAllowed() { return syncAllowed; },
    get securityError() { return securityFailure; },
    async init(nextCallbacks = {}) {
      callbacks = nextCallbacks;
      if (initPromise) return initPromise;
      destroyed = false;
      const attemptLifecycle = ++lifecycle;
      status("loading", "Preparando o acesso à sua conta…");
      initPromise = (async () => {
        try {
          [appSdk, authSdk, dbSdk] = await Promise.resolve().then(loadSdk);
          if (destroyed || attemptLifecycle !== lifecycle) throw serviceError("session-changed", "A conexão foi encerrada. Tente conectar novamente.");
          app = appSdk.getApps().find(value => value.name === "petmatch") || appSdk.initializeApp(firebaseConfig, "petmatch");
          auth = authSdk.getAuth(app);
          try { await authSdk.setPersistence(auth, authSdk.browserLocalPersistence); }
          catch { await authSdk.setPersistence(auth, authSdk.inMemoryPersistence); }
          if (destroyed || attemptLifecycle !== lifecycle) throw serviceError("session-changed", "A conexão foi encerrada. Tente conectar novamente.");
          initialized = true;
          globalOff.push(authSdk.onAuthStateChanged(auth, subscribeUser, listenFailure));
          await api.retrySync();
          return api;
        } catch (error) {
          const mapped = explainFirebaseError(error.code === "session-changed" ? error : serviceError("sdk-unavailable", "Não foi possível carregar o acesso à conta. O modo local continua disponível; confira a internet e tente conectar novamente.", error));
          if (attemptLifecycle === lifecycle && !destroyed) {
            initialized = false;
            stopDatabase(); globalOff.forEach(off => off()); globalOff = [];
            sessionUser = null; emit("onAuth", null);
            initPromise = null;
            status("error", mapped.message, mapped.code); emit("onError", mapped);
          }
          throw mapped;
        }
      })();
      return initPromise;
    },
    async retrySync() {
      if (!initialized) return api.init(callbacks);
      if (writing) throw explainFirebaseError(serviceError("busy", "Aguarde a confirmação do salvamento antes de verificar a conexão novamente."));
      if (syncPromise) return syncPromise;
      stopDatabase();
      securityFailure = null;
      const attemptLifecycle = lifecycle, attemptEpoch = syncEpoch;
      status("loading", "Verificando a proteção do banco Firebase…");
      syncPromise = (async () => {
        try {
          if (await checkSecurity() !== true) throw serviceError("security-check-failed", "Não foi possível confirmar a proteção do banco. A sincronização permanece bloqueada.");
          if (destroyed || attemptLifecycle !== lifecycle || attemptEpoch !== syncEpoch) return api;
          // Database is never initialized or resumed until the guard accepts.
          db = db || dbSdk.getDatabase(app);
          if (typeof dbSdk.goOnline === "function") dbSdk.goOnline(db);
          syncAllowed = true;
          syncOff.push(dbSdk.onValue(ref(".info/connected"), snapshot => {
            if (attemptEpoch !== syncEpoch || !syncAllowed) return;
            connected = snapshot.val() === true;
            if (!writing) status(connected ? (ready() ? "ready" : "loading") : "offline", connected ? "Conexão com o Firebase estabelecida." : "Sem conexão com o Firebase. Novos salvamentos aguardam a reconexão.");
          }));
          syncOff.push(dbSdk.onValue(ref(`${ROOT}/publicPets`), snapshot => {
            if (attemptEpoch !== syncEpoch || !syncAllowed) return;
            const raw = snapshot.val() || {};
            const list = Object.entries(raw).filter(([, value]) => value && typeof value === "object").map(([id, value]) => ({ ...value, id }));
            emitData("onPets", list);
          }, listenFailure));
          attachUserData(sessionUser);
        } catch (error) {
          if (destroyed || attemptLifecycle !== lifecycle || attemptEpoch !== syncEpoch) return api;
          stopDatabase();
          securityFailure = explainFirebaseError(error);
          status("blocked", securityFailure.message, securityFailure.code);
          emit("onError", securityFailure);
        }
        return api;
      })();
      try { return await syncPromise; }
      finally { if (attemptLifecycle === lifecycle) syncPromise = null; }
    },
    async register(email, password, name = "") {
      try {
        requireAuthReady();
        const result = await authSdk.createUserWithEmailAndPassword(auth, String(email).trim(), password);
        const accountGeneration = authGeneration;
        const sameAccount = () => authGeneration === accountGeneration && (auth && "currentUser" in auth ? auth.currentUser?.uid : sessionUser?.uid) === result.user.uid;
        if (String(name).trim()) {
          try { await authSdk.updateProfile(result.user, { displayName: String(name).trim().slice(0, 80) }); }
          catch (error) {
            if (!sameAccount()) throw serviceError("session-changed", "A conta mudou durante o cadastro. Confira a sessão atual antes de continuar.");
            emit("onError", explainFirebaseError(serviceError("profile-update-failed", "Sua conta foi criada, mas não foi possível salvar o nome do perfil. Você já pode entrar com seu e-mail e senha.", error)));
          }
        }
        if (!sameAccount()) throw serviceError("session-changed", "A conta mudou durante o cadastro. Confira a sessão atual antes de continuar.");
        emit("onAuth", publicUser(sessionUser || result.user));
        return publicUser(result.user);
      } catch (error) { mapThrow(error); }
    },
    async login(email, password) {
      try { requireAuthReady(); const result = await authSdk.signInWithEmailAndPassword(auth, String(email).trim(), password); return publicUser(result.user); }
      catch (error) { mapThrow(error); }
    },
    async loginWithGoogle() {
      try {
        requireAuthReady();
        const provider = new authSdk.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        // Invoke directly from the button gesture, before awaiting anything.
        // Popup auth also avoids cross-site redirect storage on GitHub Pages.
        const result = await authSdk.signInWithPopup(auth, provider);
        return publicUser(result.user);
      } catch (error) { mapThrow(error); }
    },
    async logout() {
      try { requireAuthReady(); await authSdk.signOut(auth); }
      catch (error) { mapThrow(error); }
    },
    async resetPassword(email) {
      try { requireAuthReady(); await authSdk.sendPasswordResetEmail(auth, String(email).trim()); }
      catch (error) { mapThrow(error); }
    },
    async commit(next, expectedRevision, effects = {}) {
      let uid;
      try {
        uid = requireSession();
        const operationGeneration = generation;
        const sameSession = () => operationGeneration === generation && sessionUser?.uid === uid;
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || privateState.revision !== expectedRevision) throw serviceError("conflict", "Os dados da conta foram atualizados em outra guia ou dispositivo. Confira a lista e tente novamente.");
        const nextState = hydrateState(clone({ ...next, revision: expectedRevision + 1 }));
        const currentIds = new Set(privateState.pets.map(pet => pet.id));
        const nextIds = new Set(nextState.pets.map(pet => pet.id));
        if (nextIds.size !== nextState.pets.length) throw serviceError("invalid-data", "Há identificadores de pets repetidos.");
        const updates = { [statePath(uid)]: nextState };
        for (const petId of currentIds) {
          if (!safeKey(petId)) throw serviceError("invalid-data", "Um identificador de pet salvo não é válido para publicação.");
          if (!nextIds.has(petId)) updates[`${ROOT}/publicPets/${petId}`] = null;
        }
        for (const pet of nextState.pets) updates[`${ROOT}/publicPets/${pet.id}`] = publicProjection(pet, uid);
        for (const effect of effects.sendInterests || []) {
          const message = prepareInterest(effect.record, effect.pet, uid);
          updates[`${ROOT}/inbox/${message.recipientId}/${message.id}`] = message;
        }
        const cancelPaths = [];
        for (const record of effects.cancelInterests || []) {
          if (!safeKey(record.id) || !safeKey(record.recipientId)) throw serviceError("invalid-interest", "O destinatário deste interesse não foi encontrado.");
          cancelPaths.push(`${ROOT}/inbox/${record.recipientId}/${record.id}`);
        }
        return await write("Salvando seus dados.", async () => {
          try {
            // A receiver may already have removed a received record. In that
            // case only the sender's private history needs to be cancelled.
            for (const path of cancelPaths) {
              const snapshot = await dbSdk.get(ref(path));
              if (!sameSession()) throw serviceError("session-changed", "A conta mudou durante a operação. Confira os registros da conta atual antes de continuar.");
              if (snapshot.exists()) updates[`${path}/status`] = "cancelado";
            }
            try { await dbSdk.update(ref(""), updates); }
            catch (firstError) {
              // One safe retry handles removal between the preflight read and
              // atomic write. No state change is retried over a new revision.
              let removed = false;
              if (sameSession() && cancelPaths.length && /permission/i.test(String(firstError.code || ""))) {
                const current = hydrateState((await dbSdk.get(ref(statePath(uid)))).val());
                if (!sameSession()) throw serviceError("session-changed", "A conta mudou durante a operação. Confira os registros da conta atual antes de continuar.");
                if (current.revision === expectedRevision) {
                  for (const path of cancelPaths) {
                    if (updates[`${path}/status`] && !(await dbSdk.get(ref(path))).exists()) { delete updates[`${path}/status`]; removed = true; }
                  }
                }
              }
              if (!removed) throw firstError;
              if (!sameSession()) throw serviceError("session-changed", "A conta mudou durante a operação. Confira os registros da conta atual antes de continuar.");
              await dbSdk.update(ref(""), updates);
            }
          }
          catch (error) {
            if (!sameSession()) throw serviceError("session-changed", "A conta mudou durante a operação. Confira os registros da conta atual antes de continuar.");
            // A rejected CAS has no partial writes. A fresh read distinguishes
            // a changed revision from missing deployment permissions.
            try {
              const snapshot = await dbSdk.get(ref(statePath(uid)));
              if (!sameSession()) throw serviceError("session-changed", "A conta mudou durante a operação. Confira os registros da conta atual antes de continuar.");
              const current = hydrateState(snapshot.val());
              privateState = current;
              buffered.set("onState", clone(current));
              if (current.revision !== expectedRevision) throw serviceError("conflict", "Os dados foram atualizados em outra guia ou dispositivo. Seu formulário foi preservado; confira os dados e tente novamente.");
            } catch (readError) { if (["conflict", "session-changed"].includes(readError.code)) throw readError; }
            throw error;
          }
          if (!sameSession()) throw serviceError("session-changed", "A conta mudou durante a operação. Confira os registros da conta atual antes de continuar.");
          privateState = nextState;
          buffered.set("onState", clone(nextState));
          return clone(nextState);
        });
      } catch (error) { mapThrow(error); }
    },
    async saveState(next, expectedRevision, effects) { return api.commit(next, expectedRevision, effects); },
    async publishOwnPets(pets) {
      requireSession();
      return api.commit({ ...clone(privateState), pets: clone(pets) }, privateState.revision);
    },
    async sendInterest(record, pet) {
      const uid = requireSession();
      const message = prepareInterest(record, pet, uid);
      return write("Enviando interesse ao tutor.", () => dbSdk.update(ref(""), { [`${ROOT}/inbox/${message.recipientId}/${message.id}`]: message }));
    },
    async cancelInterest(record) {
      const uid = requireSession(), operationGeneration = generation;
      if (!safeKey(record.id) || !safeKey(record.recipientId)) throw explainFirebaseError(serviceError("invalid-interest", "O destinatário deste interesse não foi encontrado."));
      return write("Cancelando interesse.", async () => {
        const path = `${ROOT}/inbox/${record.recipientId}/${record.id}`;
        const snapshot = await dbSdk.get(ref(path));
        if (operationGeneration !== generation || sessionUser?.uid !== uid) throw serviceError("session-changed", "A conta mudou durante a operação. Confira os registros da conta atual antes de continuar.");
        if (!snapshot.exists()) return { missing: true };
        await dbSdk.update(ref(path), { status: "cancelado" });
        return { missing: false };
      });
    },
    async respondInterest(recordId, response) {
      const uid = requireSession();
      if (!safeKey(recordId) || !["aceito", "recusado"].includes(response)) throw explainFirebaseError(serviceError("invalid-interest", "Selecione uma resposta válida para este interesse."));
      return write("Salvando resposta.", () => dbSdk.update(ref(`${ROOT}/inbox/${uid}/${recordId}`), { status: response }));
    },
    async deleteInbox(recordId) {
      const uid = requireSession();
      if (!safeKey(recordId)) throw explainFirebaseError(serviceError("invalid-interest", "Registro inválido."));
      return write("Excluindo registro recebido.", () => dbSdk.remove(ref(`${ROOT}/inbox/${uid}/${recordId}`)));
    },
    async getSentInterest(recipientId, recordId) {
      const uid = requireSession(), operationGeneration = generation;
      if (!safeKey(recipientId) || !safeKey(recordId)) throw explainFirebaseError(serviceError("invalid-interest", "Registro inválido."));
      try {
        const snapshot = await dbSdk.get(ref(`${ROOT}/inbox/${recipientId}/${recordId}`));
        if (operationGeneration !== generation || sessionUser?.uid !== uid) throw serviceError("session-changed", "A conta mudou durante a operação. Confira os registros da conta atual antes de continuar.");
        return snapshot.exists() ? { ...snapshot.val(), id: recordId } : null;
      }
      catch (error) { mapThrow(error); }
    },
    async enableAnalytics() {
      if (!initialized) throw explainFirebaseError(serviceError("not-ready", "O Firebase ainda não está pronto."));
      const consentGeneration = ++analyticsGeneration;
      try {
        analyticsSdk = analyticsSdk || await loadAnalytics();
        if (!(await analyticsSdk.isSupported()) || consentGeneration !== analyticsGeneration || destroyed) return false;
        analytics = analytics || analyticsSdk.getAnalytics(app);
        analyticsSdk.setAnalyticsCollectionEnabled(analytics, true);
        return true;
      } catch { return false; }
    },
    async disableAnalytics() {
      // Invalidates an enable still waiting on a slow SDK import.
      ++analyticsGeneration;
      if (!analytics) return true;
      try { analyticsSdk.setAnalyticsCollectionEnabled(analytics, false); return true; }
      catch { return false; }
    },
    destroy() {
      if (writing) throw explainFirebaseError(serviceError("busy", "Aguarde o salvamento antes de desconectar o serviço."));
      destroyed = true; ++lifecycle; ++authGeneration; ++analyticsGeneration;
      stopDatabase(); globalOff.forEach(off => off()); globalOff = [];
      sessionUser = null; stateLoaded = false; initialized = false; connected = false; securityFailure = null; initPromise = null; syncPromise = null;
    }
  };
  return api;
}
export const cloud = createCloudService();
