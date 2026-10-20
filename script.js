/* PetMatch — modo local e sincronização autenticada com Firebase. */
(() => {
  "use strict";
  const STORAGE_KEY = "petmatch.data.v1";
  const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
  const $ = id => document.getElementById(id);
  const seeds = [
    { id: "sample-luke", name: "Luke", type: "cachorro", age: 2, ageUnit: "anos", size: "grande", breed: "Golden Retriever", city: "São José dos Campos", purpose: "amizade", description: "Brincalhão e sociável. Perfil de exemplo para explorar o aplicativo.", tags: ["Brincalhão", "Sociável"], emoji: "🐶" },
    { id: "sample-mel", name: "Mel", type: "cachorro", age: 3, ageUnit: "anos", size: "medio", breed: "Beagle", city: "São José dos Campos", purpose: "amizade", description: "Gosta de passeios e brincadeiras. Perfil de exemplo.", tags: ["Dócil", "Ativa"], emoji: "🐕" },
    { id: "sample-nina", name: "Nina", type: "gato", age: 1, ageUnit: "anos", size: "pequeno", breed: "SRD", city: "Jacareí", purpose: "amizade", description: "Calma e carinhosa. Perfil de exemplo.", tags: ["Calma", "Carinhosa"], emoji: "🐈" },
    { id: "sample-bento", name: "Bento", type: "cachorro", age: 4, ageUnit: "anos", size: "pequeno", breed: "Shih-tzu", city: "São José dos Campos", purpose: "amizade", description: "Tranquilo e parceiro. Perfil de exemplo.", tags: ["Tranquilo", "Parceiro"], emoji: "🐩" },
    { id: "sample-thor", name: "Thor", type: "cachorro", age: 5, ageUnit: "anos", size: "grande", breed: "Labrador", city: "Caçapava", purpose: "amizade", description: "Amigável e cheio de energia. Perfil de exemplo.", tags: ["Amigável"], emoji: "🦮" },
    { id: "sample-amora", name: "Amora", type: "cachorro", age: 2, ageUnit: "anos", size: "medio", breed: "SRD", city: "São José dos Campos", purpose: "adocao", description: "Fêmea. Perfil fictício para conhecer o fluxo de adoção; não corresponde a um animal anunciado por uma ONG.", tags: [], emoji: "🐾" },
    { id: "sample-chico", name: "Chico", type: "cachorro", age: 4, ageUnit: "anos", size: "medio", breed: "SRD", city: "Jacareí", purpose: "adocao", description: "Macho. Perfil fictício de adoção, sem contato externo.", tags: [], emoji: "🐕" },
    { id: "sample-lua", name: "Lua", type: "gato", age: 10, ageUnit: "meses", size: "pequeno", breed: "SRD", city: "Caçapava", purpose: "adocao", description: "Fêmea. Perfil fictício de adoção, sem contato externo.", tags: [], emoji: "🐈" }
  ];
  const emptyState = () => ({ schemaVersion: 1, revision: 0, pets: [], favorites: [], interests: [], reports: [], vetRequests: [] });
  let state = emptyState();
  let damagedData = null;
  let filter = "todos";
  let editingId = null;
  let editingSnapshot = "";
  let selectedPhoto = "";
  let photoJob = 0;
  let photoPending = false;
  let photoError = "";
  let returnFocus = null;
  let modalGeneration = 0;
  let toastTimer;
  let saving = false;
  let cloud = null;
  let activeUser = null;
  let accountLoaded = false;
  let publicPets = [];
  let inbox = [];
  let cloudInitError = "";
  let authBusy = false;
  const inAccount = () => Boolean(activeUser);
  const destination = () => inAccount() ? "na sua conta" : "neste navegador";
  const isExample = pet => pet.id.startsWith("sample-");
  const types = { cachorro: "Cachorro", gato: "Gato", outro: "Outro" };
  const sizes = { pequeno: "Pequeno porte", medio: "Médio porte", grande: "Grande porte" };
  const reportTypes = ["Maus-tratos", "Abandono", "Animal ferido", "Falta de alimento/água", "Outro"];
  const id = () => globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = () => new Date().toISOString();
  const clean = (value, max, required = true) => {
    if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error("Campo inválido no arquivo de dados.");
    return value.trim();
  };
  const choice = (value, allowed) => {
    if (!allowed.includes(value)) throw new Error("Opção inválida no arquivo de dados.");
    return value;
  };
  const safePhoto = value => {
    if (!value) return "";
    if (typeof value !== "string" || value.length > 700000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) throw new Error("Imagem inválida no arquivo de dados.");
    return value;
  };
  const dateValue = value => {
    const v = clean(value, 40);
    if (!Number.isFinite(Date.parse(v))) throw new Error("Data inválida no arquivo de dados.");
    return v;
  };
  const normalize = raw => {
    if (!raw || raw.schemaVersion !== 1 || !Number.isSafeInteger(raw.revision) || raw.revision < 0) throw new Error("Formato de backup incompatível.");
    for (const key of ["pets", "favorites", "interests", "reports", "vetRequests"]) {
      if (!Array.isArray(raw[key]) || raw[key].length > 1000) throw new Error("Coleção de dados inválida ou muito grande.");
    }
    const s = emptyState();
    s.revision = raw.revision;
    const seen = new Set(seeds.map(p => p.id));
    s.pets = raw.pets.map(p => {
      const petId = clean(p.id, 100);
      if (seen.has(petId)) throw new Error("Há identificadores de pets repetidos.");
      seen.add(petId);
      if (!Number.isInteger(p.age) || p.age < 0 || p.age > 40) throw new Error("Idade inválida no arquivo de dados.");
      return { id: petId, name: clean(p.name, 80), type: choice(p.type, Object.keys(types)), age: p.age, ageUnit: choice(p.ageUnit, ["anos", "meses"]), size: choice(p.size, Object.keys(sizes)), breed: clean(p.breed, 80, false), city: clean(p.city, 100), purpose: choice(p.purpose, ["amizade", "adocao"]), description: clean(p.description, 1000, false), photo: safePhoto(p.photo), createdAt: dateValue(p.createdAt), updatedAt: dateValue(p.updatedAt) };
    });
    s.favorites = [...new Set(raw.favorites.map(v => clean(v, 100)))];
    const recordIds = new Set();
    const baseRecord = r => {
      const recordId = clean(r.id, 100);
      if (recordIds.has(recordId)) throw new Error("Há registros repetidos no arquivo.");
      recordIds.add(recordId);
      return { id: recordId, createdAt: dateValue(r.createdAt) };
    };
    s.interests = raw.interests.map(r => ({ ...baseRecord(r), kind: choice(r.kind, ["amizade", "adocao"]), petId: clean(r.petId, 100), petName: clean(r.petName, 80), name: clean(r.name, 80), message: clean(r.message, 1000, false), status: choice(r.status, ["salvo", "cancelado"]), ...(r.recipientId ? { recipientId: clean(r.recipientId, 128) } : {}) }));
    const activeInterests = s.interests.filter(r => r.status === "salvo").map(r => `${r.kind}:${r.petId}`);
    if (new Set(activeInterests).size !== activeInterests.length) throw new Error("Há interesses ativos repetidos no backup.");
    s.reports = raw.reports.map(r => ({ ...baseRecord(r), type: choice(r.type, reportTypes), city: clean(r.city, 100), location: clean(r.location, 200), description: clean(r.description, 3000) }));
    s.vetRequests = raw.vetRequests.map(r => ({ ...baseRecord(r), name: clean(r.name, 80), pet: clean(r.pet, 80), city: clean(r.city, 100), service: choice(r.service, ["Vacinação", "Consulta", "Castração", "Outro"]), message: clean(r.message, 1000, false), status: choice(r.status, ["salvo", "cancelado"]) }));
    return s;
  };
  const notice = message => { $("storageNotice").textContent = message; };
  function readInitialState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        try { state = normalize(JSON.parse(raw)); }
        catch { damagedData = raw; notice("Os dados locais não puderam ser lidos. Exporte uma cópia de recuperação em Meus registros antes de restaurar um backup válido. Os dados originais foram preservados."); }
      }
    } catch {
      notice("O armazenamento está bloqueado neste navegador. Você pode explorar os perfis, mas precisará permitir o armazenamento para salvar cadastros e registros.");
    }
  }
  const withStorageLock = callback => navigator.locks ? navigator.locks.request(STORAGE_KEY, callback) : Promise.resolve().then(callback);
  async function save(next, errorTarget, effects = {}) {
    if (saving) { showToast("Aguarde o salvamento em andamento."); return false; }
    saving = true;
    const submits = [...document.querySelectorAll('button[type="submit"]')].map(button => [button, button.disabled]);
    submits.forEach(([button]) => { button.disabled = true; });
    const expectedRevision = state.revision;
    const expectedUid = activeUser?.uid || null;
    const commit = () => {
      if (damagedData !== null) throw new Error("Os dados locais estão ilegíveis. Exporte a recuperação e restaure um backup válido ou apague os dados para voltar a salvar.");
      const current = localStorage.getItem(STORAGE_KEY);
      const revision = current === null ? 0 : normalize(JSON.parse(current)).revision;
      if (revision !== expectedRevision) {
        state = current === null ? emptyState() : normalize(JSON.parse(current));
        render();
        throw new Error("Os dados mudaram em outra guia. Confira a lista e tente salvar novamente.");
      }
      next.revision = revision + 1;
      const normalized = normalize(next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      state = normalized;
      notice("Dados salvos somente neste navegador. Nenhum pedido é enviado a tutores, ONGs, clínicas ou órgãos públicos. Exporte um backup para guardar seus registros.");
      render();
      return true;
    };
    try {
      if (expectedUid) {
        if (!accountLoaded) throw new Error("Aguarde o carregamento dos dados da sua conta antes de salvar.");
        if (!cloud) throw new Error("O serviço de sincronização ainda não está disponível.");
        const result = await cloud.commit(normalize(next), expectedRevision, effects);
        if (activeUser?.uid !== expectedUid) return false;
        state = normalize(result);
        notice("Dados confirmados na sua conta. Os perfis dos seus pets ficam públicos; ocorrências, favoritos e anotações de atendimento são privados.");
        render();
        return true;
      }
      return await withStorageLock(commit);
    } catch (error) {
      const message = error.name === "QuotaExceededError" ? "Não há espaço no navegador. Exporte um backup e remova registros ou use uma foto menor. O formulário foi preservado." : (error.name === "SecurityError" ? "O navegador bloqueou o armazenamento. Permita o armazenamento ou abra o site por um servidor local. O formulário foi preservado." : error.message);
      if (errorTarget) showError(errorTarget, message);
      notice(`Não foi possível salvar: ${message}`);
      showToast("Não foi possível salvar. Confira o aviso na página.");
      return false;
    } finally {
      saving = false;
      submits.forEach(([button, disabled]) => { button.disabled = disabled; });
    }
  }
  const copyState = () => JSON.parse(JSON.stringify(state));
  const pets = () => {
    const byId = new Map(seeds.map(pet => [pet.id, pet]));
    publicPets.forEach(pet => { if (!byId.has(pet.id)) byId.set(pet.id, pet); });
    state.pets.forEach(pet => byId.set(pet.id, pet));
    return [...byId.values()];
  };
  const findPet = petId => pets().find(p => p.id === petId);
  const isOwn = petId => state.pets.some(p => p.id === petId);
  const ageText = pet => `${pet.age} ${pet.ageUnit === "meses" ? (pet.age === 1 ? "mês" : "meses") : (pet.age === 1 ? "ano" : "anos")}`;
  const normalizeSearch = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function actionButton(text, action, recordId, className = "btn btn-small btn-ghost") {
    const button = el("button", className, text);
    button.type = "button";
    button.dataset.action = action;
    button.dataset.id = recordId;
    return button;
  }
  function favoriteButton(pet) {
    const liked = state.favorites.includes(pet.id);
    const button = actionButton(liked ? "♥" : "♡", "favorite", pet.id, `heart-btn${liked ? " liked" : ""}`);
    button.setAttribute("aria-label", `${liked ? "Remover" : "Adicionar"} ${pet.name} ${liked ? "dos" : "aos"} favoritos`);
    button.setAttribute("aria-pressed", String(liked));
    return button;
  }
  function petCard(pet, index) {
    const card = el("article", "pet-card");
    card.dataset.petId = pet.id;
    card.dataset.type = `${pet.type} ${pet.size}`;
    const photo = el("div", `pet-photo photo-${index % 4 + 1}`);
    if (pet.photo) {
      const img = el("img", "pet-image");
      img.src = pet.photo;
      img.alt = `Foto de ${pet.name}`;
      img.loading = "lazy";
      photo.append(img);
    } else { const icon = el("span", "", pet.emoji || (pet.type === "gato" ? "🐈" : pet.type === "cachorro" ? "🐕" : "🐾")); icon.setAttribute("aria-hidden", "true"); photo.append(icon); }
    photo.append(favoriteButton(pet));
    const body = el("div", "pet-card-body");
    body.append(el("h3", "", `${pet.name}, ${ageText(pet)}`), el("p", "", `${pet.breed || types[pet.type]} • ${pet.city}`));
    const tags = el("div", "tags");
    [sizes[pet.size], pet.purpose === "adocao" ? "Adoção" : "Amizade", isOwn(pet.id) ? "Meu pet" : isExample(pet) ? "Exemplo" : "Perfil de tutor"].forEach(tag => tags.append(el("span", "", tag)));
    body.append(tags, actionButton("Ver perfil", "profile", pet.id, "btn btn-card"));
    if (isOwn(pet.id)) {
      const actions = el("div", "card-actions");
      actions.append(actionButton("Editar", "edit-pet", pet.id), actionButton("Excluir", "delete-pet", pet.id));
      body.append(actions);
    } else {
      const saved = state.interests.some(r => r.petId === pet.id && r.kind === pet.purpose && r.status === "salvo");
      body.append(actionButton(saved ? "Ver interesse salvo" : pet.purpose === "adocao" ? "Quero adotar" : "Dar Match", "interest", pet.id, "btn btn-card match-btn"));
    }
    card.append(photo, body);
    return card;
  }
  function render() {
    const query = normalizeSearch($("petSearch").value.trim());
    const list = pets().filter(pet => {
      const matchesSearch = normalizeSearch(`${pet.name} ${pet.breed || ""} ${pet.city} ${types[pet.type]}`).includes(query);
      const matchesFilter = filter === "favoritos" ? state.favorites.includes(pet.id) : filter === "meus" ? isOwn(pet.id) : pet.purpose === "amizade" && (filter === "todos" || pet.type === filter || pet.size === filter);
      return matchesSearch && matchesFilter;
    });
    $("matchGrid").replaceChildren(...list.map(petCard));
    $("matchEmpty").hidden = list.length > 0;
    $("adoptionList").replaceChildren(...pets().filter(p => p.purpose === "adocao").map((pet, index) => {
      const card = el("article", "adoption-card");
      card.dataset.petId = pet.id;
      const icon = el("div", "adoption-icon", pet.emoji || "🐾");
      icon.setAttribute("aria-hidden", "true");
      const body = el("div");
      body.append(el("span", "badge", isOwn(pet.id) ? (inAccount() ? "Meu anúncio" : "Meu anúncio local") : isExample(pet) ? "Perfil de exemplo" : "Disponível para adoção"), el("h3", "", pet.name), el("p", "", `${pet.breed || types[pet.type]} • ${ageText(pet)}`), el("small", "", pet.city), actionButton("Ver perfil", "profile", pet.id));
      card.append(icon, body);
      return card;
    }));
    document.querySelectorAll('.featured-card [data-action="favorite"]').forEach(button => {
      const liked = state.favorites.includes(button.dataset.id);
      button.classList.toggle("liked", liked);
      button.textContent = liked ? "♥" : "♡";
      button.setAttribute("aria-pressed", String(liked));
      button.setAttribute("aria-label", `${liked ? "Remover Luke dos" : "Adicionar Luke aos"} favoritos`);
    });
    $("statPets").textContent = pets().length;
    $("statMatches").textContent = state.interests.filter(r => r.kind === "amizade" && r.status === "salvo").length;
    $("statAdoption").textContent = state.interests.filter(r => r.kind === "adocao" && r.status === "salvo").length;
    renderActivity();
    renderInbox();
    renderAccount();
  }
  function recordCard(title, description, record, kind) {
    const card = el("article", "record-card");
    card.dataset.recordId = record.id;
    card.append(el("h3", "", title), el("p", "", description), el("small", "muted", new Date(record.createdAt).toLocaleString("pt-BR")), el("span", "status-badge", record.status === "cancelado" ? `Cancelado ${destination()}` : kind === "interest" && record.recipientId ? "Enviado ao tutor • resposta nos detalhes" : `Salvo ${destination()} • não enviado`));
    const actions = el("div", "record-actions");
    actions.append(actionButton("Ver detalhes", `details-${kind}`, record.id));
    if (record.status === "salvo") actions.append(actionButton("Cancelar interesse", `cancel-${kind}`, record.id));
    actions.append(actionButton("Excluir registro", `delete-${kind}`, record.id));
    card.append(actions);
    return card;
  }
  function renderActivity() {
    const rows = [
      ...state.interests.map(r => ({ date: r.createdAt, card: recordCard(`${r.kind === "adocao" ? "Adoção" : "Amizade"}: ${r.petName}`, r.message || `Interesse de ${r.name}`, r, "interest") })),
      ...state.reports.map(r => ({ date: r.createdAt, card: recordCard(`Ocorrência: ${r.type}`, `${r.city} • ${r.location}`, r, "report") })),
      ...state.vetRequests.map(r => ({ date: r.createdAt, card: recordCard(`Veterinário: ${r.service}`, `${r.pet} • ${r.city}`, r, "vet") }))
    ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    $("activityList").replaceChildren(...rows.map(r => r.card));
    $("activityEmpty").hidden = rows.length > 0;
    $("activityCounts").textContent = `${state.pets.length} pet(s) próprio(s) • ${state.favorites.length} favorito(s) • ${rows.length} registro(s) ${inAccount() ? "na conta" : "local(is)"}`;
    $("exportData").textContent = damagedData === null ? "Exportar meus dados" : "Exportar dados para recuperação";
  }
  function showError(target, message = "") { const field = typeof target === "string" ? $(target) : target; field.textContent = message; field.hidden = !message; }
  function showToast(message) { clearTimeout(toastTimer); $("toast").textContent = message; $("toast").classList.add("show"); toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3800); }
  function openModal(title, text) {
    modalGeneration++;
    if (!$("modal").classList.contains("show")) returnFocus = document.activeElement;
    $("modalTitle").textContent = title;
    $("modalText").textContent = text;
    $("modalBody").replaceChildren();
    $("modalActions").replaceChildren();
    showError("modalError");
    $("modalOk").hidden = false;
    $("modalOk").textContent = "Fechar";
    $("modal").classList.add("show");
    $("modal").setAttribute("aria-hidden", "false");
    document.querySelectorAll("body > header, body > main, body > footer").forEach(node => { node.inert = true; });
    document.body.style.overflow = "hidden";
    $("modal").querySelector(".modal-card").focus();
  }
  function closeModal() {
    modalGeneration++;
    document.querySelectorAll("body > header, body > main, body > footer").forEach(node => { node.inert = false; });
    $("modal").classList.remove("show");
    $("modal").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (returnFocus?.isConnected) returnFocus.focus();
    else { const fallback = $("petSearch"); fallback.focus({ preventScroll: true }); }
  }
  function confirmAction(title, text, action) {
    openModal(title, text);
    const button = el("button", "btn btn-primary", "Confirmar");
    button.type = "button";
    button.addEventListener("click", action);
    $("modalActions").append(button);
    $("modalOk").textContent = "Voltar";
  }
  function profile(petId) {
    const pet = findPet(petId);
    if (!pet) return showToast("Esse perfil não está mais disponível.");
    openModal(`${pet.name}, ${ageText(pet)}`, isOwn(petId) ? `Perfil cadastrado ${destination()}.` : isExample(pet) ? "Perfil de exemplo. Nenhum tutor ou ONG receberá mensagens." : "Perfil publicado por um tutor. Entre na sua conta para enviar um interesse.");
    const details = el("div", "profile-details");
    if (pet.photo) { const img = el("img", "pet-image"); img.src = pet.photo; img.alt = `Foto de ${pet.name}`; details.append(img); }
    details.append(el("p", "", `${types[pet.type]} • ${sizes[pet.size]} • ${pet.breed || "Raça não informada"}`), el("p", "", pet.city), el("p", "", pet.description || "Sem descrição."));
    $("modalBody").append(details);
    if (isOwn(petId)) $("modalActions").append(actionButton("Editar pet", "edit-pet", petId));
    else $("modalActions").append(actionButton(pet.purpose === "adocao" ? "Salvar interesse em adoção" : "Salvar interesse em amizade", "interest", petId, "btn btn-primary"));
  }
  function labeledField(form, label, name, options = {}) {
    const wrapper = el("label", "", label);
    const input = el(options.tag || "input");
    input.name = name;
    input.id = `modal-${name}`;
    if (options.tag === "select") options.values.forEach(value => { const option = el("option", "", value); option.value = value; input.append(option); });
    else if (options.tag !== "textarea") input.type = options.type || "text";
    if (options.tag !== "select") input.maxLength = options.max || 80;
    input.required = options.required !== false;
    if (options.tag === "textarea") input.rows = 3;
    wrapper.append(input);
    form.append(wrapper);
    return input;
  }
  function formInModal(title, description) {
    openModal(title, description);
    const form = el("form", "modal-form");
    $("modalBody").append(form);
    return form;
  }
  function addSubmit(form, label) { const button = el("button", "btn btn-primary", label); button.type = "submit"; form.append(button); }
  function openInterest(petId) {
    const pet = findPet(petId);
    if (!pet) return showToast("Esse perfil não está mais disponível.");
    if (isOwn(petId)) return profile(petId);
    const existing = state.interests.find(r => r.petId === petId && r.kind === pet.purpose && r.status === "salvo");
    if (existing) return detailsRecord("interest", existing.id);
    const canSend = inAccount() && !isExample(pet) && pet.ownerId && pet.ownerId !== activeUser.uid;
    const description = canSend ? "Ao enviar, seu nome e sua mensagem serão compartilhados com o tutor deste pet. O envio não confirma uma adoção nem um match aceito." : isExample(pet) ? "Este perfil é fictício. Seu interesse será salvo, sem envio a um tutor." : "Entre na sua conta para enviar seu nome e sua mensagem ao tutor. Sem conta, você pode guardar somente uma anotação local.";
    const form = formInModal(`${pet.purpose === "adocao" ? "Interesse em adoção" : "Interesse em amizade"}: ${pet.name}`, description);
    form.id = "interestForm";
    labeledField(form, "Seu nome", "name").value = activeUser?.displayName || "";
    labeledField(form, canSend ? "Mensagem ao tutor (opcional)" : "Anotações (opcional)", "message", { tag: "textarea", max: 1000, required: false });
    addSubmit(form, canSend ? "Enviar interesse ao tutor" : "Salvar interesse");
    const formUid = activeUser?.uid || null;
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if ((activeUser?.uid || null) !== formUid) return showError("modalError", "A conta mudou. Abra o perfil novamente.");
      const data = new FormData(form);
      const name = data.get("name").trim();
      if (!name) return showError("modalError", "Informe seu nome, sem usar apenas espaços.");
      if (state.interests.some(r => r.petId === petId && r.kind === pet.purpose && r.status === "salvo")) return showError("modalError", "Esse interesse já está salvo em Meus registros.");
      const record = { id: id(), createdAt: now(), petId, petName: pet.name, kind: pet.purpose, name, message: data.get("message").trim(), status: "salvo", ...(canSend ? { recipientId: pet.ownerId } : {}) };
      const next = copyState(); next.interests.push(record);
      if (await save(next, "modalError", canSend ? { sendInterests: [{ record, pet }] } : {})) { closeModal(); showToast(canSend ? "Interesse confirmado e enviado ao tutor." : `Interesse salvo ${destination()}. Nenhuma mensagem foi enviada.`); }
    });
  }
  function openVet() {
    const form = formInModal("Interesse em atendimento", `Organize seu pedido ${destination()}. Não há clínica parceira conectada e este registro não agenda nem encaminha atendimento.`);
    form.id = "vetForm";
    labeledField(form, "Seu nome", "name");
    labeledField(form, "Nome do pet", "pet");
    labeledField(form, "Cidade", "city", { max: 100 });
    labeledField(form, "Tipo de atendimento", "service", { tag: "select", values: ["Vacinação", "Consulta", "Castração", "Outro"] });
    labeledField(form, "Anotações (opcional)", "message", { tag: "textarea", max: 1000, required: false });
    addSubmit(form, "Salvar interesse");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      for (const key of Object.keys(data)) data[key] = data[key].trim();
      if (!data.name || !data.pet || !data.city) return showError("modalError", "Preencha nome, pet e cidade sem usar apenas espaços.");
      const next = copyState();
      next.vetRequests.push({ id: id(), createdAt: now(), ...data, status: "salvo" });
      if (await save(next, "modalError")) { closeModal(); showToast(`Interesse veterinário salvo ${destination()}. Não é um agendamento.`); }
    });
  }
  const collection = kind => ({ interest: "interests", report: "reports", vet: "vetRequests" }[kind]);
  function detailsRecord(kind, recordId) {
    const record = state[collection(kind)]?.find(r => r.id === recordId);
    if (!record) return showToast("Registro não encontrado.");
    openModal(kind === "report" ? "Detalhes da ocorrência" : "Detalhes do interesse", kind === "interest" && record.recipientId ? "Seu nome e sua mensagem foram enviados ao tutor. Isso não confirma uma adoção ou encontro." : `Registro privado ${destination()}. Nenhum dado foi encaminhado a serviços ou outras pessoas.`);
    const fields = kind === "report" ? [["Tipo", record.type], ["Cidade", record.city], ["Local", record.location], ["Descrição", record.description]] : kind === "vet" ? [["Nome", record.name], ["Pet", record.pet], ["Cidade", record.city], ["Atendimento", record.service], ["Anotações", record.message]] : [["Nome", record.name], ["Pet", record.petName], ["Finalidade", record.kind === "adocao" ? "Adoção" : "Amizade"], ["Anotações", record.message]];
    fields.push(["Data", new Date(record.createdAt).toLocaleString("pt-BR")]);
    const list = el("dl", "profile-details");
    fields.forEach(([label, value]) => { list.append(el("dt", "", label), el("dd", "", value || "Não informado")); });
    $("modalBody").append(list);
    $("modalActions").append(actionButton("Baixar registro (.txt)", `download-${kind}`, recordId));
    if (kind === "interest" && record.recipientId && activeUser && cloud?.getSentInterest) {
      const generation = modalGeneration, expectedUid = activeUser.uid;
      const response = el("p", "local-note", "Consultando a resposta do tutor…"); $("modalBody").append(response);
      cloud.getSentInterest(record.recipientId, record.id).then(remote => {
        if (modalGeneration !== generation || activeUser?.uid !== expectedUid) return;
        const labels = { pendente: "O tutor ainda não respondeu.", aceito: "O tutor aceitou seu interesse. Combine os próximos passos com responsabilidade.", recusado: "O tutor recusou este interesse.", cancelado: "Este interesse foi cancelado." };
        response.textContent = remote ? labels[remote.status] || "Interesse recebido pelo tutor." : "A mensagem não está mais disponível na caixa do tutor.";
      }).catch(error => { if (modalGeneration === generation && activeUser?.uid === expectedUid) response.textContent = error.message; });
    }
  }
  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = el("a"); anchor.href = url; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function resetPetForm() {
    photoJob++;
    photoPending = false;
    photoError = "";
    editingId = null;
    editingSnapshot = "";
    selectedPhoto = "";
    $("petForm").reset();
    $("petId").value = "";
    $("petFormTitle").textContent = "Cadastre seu pet no PetMatch";
    $("petSubmit").textContent = "Cadastrar pet";
    $("cancelEdit").hidden = true;
    $("petPhotoPreview").hidden = true;
    $("petPhotoPreview").removeAttribute("src");
    $("removePhoto").hidden = true;
    showError("petFormError");
  }
  function editPet(petId) {
    const pet = state.pets.find(p => p.id === petId);
    if (!pet) return showToast("Pet não encontrado.");
    if ($("modal").classList.contains("show")) closeModal();
    resetPetForm();
    editingId = pet.id;
    editingSnapshot = JSON.stringify(pet);
    selectedPhoto = pet.photo;
    for (const [input, value] of Object.entries({ petId: pet.id, petName: pet.name, petType: pet.type, petAge: pet.age, petAgeUnit: pet.ageUnit, petSize: pet.size, petBreed: pet.breed, petCity: pet.city, petPurpose: pet.purpose, petDescription: pet.description })) $(input).value = value;
    $("petFormTitle").textContent = `Editar ${pet.name}`;
    $("petSubmit").textContent = "Salvar alterações";
    $("cancelEdit").hidden = false;
    updatePhotoPreview();
    $("cadastro").scrollIntoView({ behavior: "smooth" });
    $("petName").focus({ preventScroll: true });
  }
  function updatePhotoPreview() {
    $("petPhotoPreview").hidden = !selectedPhoto;
    $("removePhoto").hidden = !selectedPhoto && !photoPending && !photoError;
    $("removePhoto").textContent = selectedPhoto ? "Remover foto" : "Descartar arquivo";
    if (selectedPhoto) $("petPhotoPreview").src = selectedPhoto;
    else $("petPhotoPreview").removeAttribute("src");
  }
  async function loadPhoto(file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use uma imagem JPG, PNG ou WebP.");
    if (file.size > 5 * 1024 * 1024) throw new Error("A foto deve ter no máximo 5 MB.");
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error("Não foi possível abrir essa imagem. Escolha outro arquivo.")); img.src = url; });
      if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 40000000) throw new Error("A imagem é muito grande. Use uma versão menor.");
      const ratio = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Este navegador não consegue preparar a foto.");
      context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      return safePhoto(canvas.toDataURL("image/jpeg", 0.78));
    } finally { URL.revokeObjectURL(url); }
  }
  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const recordId = button.dataset.id;
    if (action.startsWith("inbox-")) {
      const expectedUid = activeUser?.uid;
      if (!expectedUid || !cloud) return showToast("Entre na sua conta para continuar.");
      const record = inbox.find(item => item.id === recordId);
      if (!record) return showToast("Esse interesse não está mais disponível.");
      const perform = async () => {
        if (activeUser?.uid !== expectedUid) return;
        button.disabled = true;
        try {
          if (action === "inbox-delete") await cloud.deleteInbox(recordId);
          else await cloud.respondInterest(recordId, action === "inbox-accept" ? "aceito" : "recusado");
          if (activeUser?.uid !== expectedUid) return;
          if (action === "inbox-delete") closeModal();
          showToast(action === "inbox-delete" ? "Interesse recebido removido da sua caixa." : "Resposta salva e disponível para o remetente.");
        } catch (error) { showError("authError", error.message); showToast(error.message); if ($("modal").classList.contains("show")) showError("modalError", error.message); }
        finally { if (button.isConnected) button.disabled = false; }
      };
      if (action === "inbox-delete") confirmAction("Excluir interesse recebido?", "Esta mensagem será retirada da sua caixa de entrada. A exclusão não pode ser desfeita.", perform);
      else await perform();
    } else if (action === "favorite") {
      if (!findPet(recordId)) return;
      const sourceFeatured = Boolean(button.closest(".featured-card"));
      const next = copyState();
      const liked = !next.favorites.includes(recordId);
      next.favorites = liked ? [...next.favorites, recordId] : next.favorites.filter(v => v !== recordId);
      if (await save(next)) {
        const scope = sourceFeatured ? ".featured-card" : "#matchGrid";
        const replacement = [...document.querySelectorAll(`${scope} [data-action="favorite"]`)].find(node => node.dataset.id === recordId);
        (replacement || document.querySelector(`.filter[data-filter="${filter}"]`)).focus({ preventScroll: true });
        showToast(liked ? "Pet adicionado aos favoritos." : "Pet removido dos favoritos.");
      }
    } else if (action === "profile") profile(recordId);
    else if (action === "interest") openInterest(recordId);
    else if (action === "edit-pet") editPet(recordId);
    else if (action === "delete-pet") {
      const pet = state.pets.find(p => p.id === recordId);
      if (!pet) return;
      confirmAction(`Excluir ${pet.name}?`, `O perfil e seu favorito serão removidos ${destination()}${inAccount() ? " e o anúncio público será retirado" : ""}. Exporte um backup antes se quiser guardar uma cópia.`, async () => {
        const next = copyState(); next.pets = next.pets.filter(p => p.id !== recordId); next.favorites = next.favorites.filter(v => v !== recordId);
        if (await save(next, "modalError")) { if (editingId === recordId) resetPetForm(); closeModal(); showToast(`Pet excluído ${destination()}.`); }
      });
    } else {
      const [operation, kind] = action.split("-");
      const key = collection(kind);
      const record = state[key]?.find(r => r.id === recordId);
      if (!record) return;
      if (operation === "details") detailsRecord(kind, recordId);
      if (operation === "download") {
        const fields = kind === "report" ? [["Ocorrência", record.type], ["Cidade", record.city], ["Local", record.location], ["Descrição", record.description]] : kind === "vet" ? [["Nome", record.name], ["Pet", record.pet], ["Cidade", record.city], ["Serviço", record.service], ["Anotações", record.message], ["Estado", record.status]] : [["Nome", record.name], ["Pet", record.petName], ["Finalidade", record.kind], ["Anotações", record.message], ["Estado", record.status]];
        download(`PetMatch — ${kind === "interest" && record.recipientId ? "interesse enviado ao tutor" : "registro privado, não enviado a serviços externos"}\nData: ${new Date(record.createdAt).toLocaleString("pt-BR")}\nIdentificador: ${record.id}\n\n${fields.map(([k, v]) => `${k}: ${v || "Não informado"}`).join("\n")}\n`, `PetMatch-registro-${record.id.replace(/[^A-Za-z0-9-]/g, "").slice(0, 60)}.txt`, "text/plain;charset=utf-8");
      }
      if (operation === "cancel" || operation === "delete") confirmAction(operation === "cancel" ? "Cancelar este interesse?" : "Excluir este registro?", operation === "cancel" ? `O histórico será mantido como cancelado ${destination()}${record.recipientId ? " e o tutor será informado do cancelamento" : ""}.` : `Este registro será removido ${destination()}. A exclusão não pode ser desfeita sem backup.${record.recipientId ? " O interesse enviado também será cancelado." : ""}`, async () => {
        const next = copyState();
        if (operation === "delete") next[key] = next[key].filter(r => r.id !== recordId);
        else next[key] = next[key].map(r => r.id === recordId ? { ...r, status: "cancelado" } : r);
        if (await save(next, "modalError", kind === "interest" && record.recipientId && record.status === "salvo" && inAccount() ? { cancelInterests: [record] } : {})) { closeModal(); showToast(operation === "delete" ? "Registro excluído." : `Interesse cancelado ${destination()}.`); }
      });
    }
  });
  $("petForm").addEventListener("submit", async event => {
    event.preventDefault();
    showError("petFormError");
    if (!$("petForm").reportValidity()) return;
    if (photoPending) return showError("petFormError", "Aguarde a preparação da foto antes de salvar.");
    if (photoError) return showError("petFormError", photoError);
    const name = $("petName").value.trim(); const city = $("petCity").value.trim();
    if (!name || !city) return showError("petFormError", "Preencha o nome e a cidade sem usar apenas espaços.");
    const previous = state.pets.find(p => p.id === editingId);
    if (editingId && previous && JSON.stringify(previous) !== editingSnapshot) return showError("petFormError", "Esse pet foi alterado em outra guia. Cancele esta edição e abra o perfil atualizado antes de editar novamente.");
    if (editingId && !previous) return showError("petFormError", "Esse perfil foi removido em outra guia. Cancele a edição para criar um novo cadastro.");
    const pet = { id: editingId || id(), name, type: $("petType").value, age: Number($("petAge").value), ageUnit: $("petAgeUnit").value, size: $("petSize").value, breed: $("petBreed").value.trim(), city, purpose: $("petPurpose").value, description: $("petDescription").value.trim(), photo: selectedPhoto, createdAt: previous?.createdAt || now(), updatedAt: now() };
    const next = copyState();
    if (editingId) next.pets = next.pets.map(p => p.id === editingId ? pet : p);
    else next.pets.push(pet);
    if (await save(next, "petFormError")) {
      const wasEdit = Boolean(editingId); resetPetForm();
      setFilter("meus"); $("petSearch").value = ""; render();
      $("match").scrollIntoView({ behavior: "smooth" });
      showToast(wasEdit ? `Perfil atualizado ${destination()}.` : inAccount() ? "Pet cadastrado na sua conta e publicado no catálogo." : "Pet cadastrado e exibido em Meus pets.");
    }
  });
  $("cancelEdit").addEventListener("click", resetPetForm);
  $("petPhoto").addEventListener("change", async event => {
    const job = ++photoJob;
    const file = event.target.files[0];
    photoError = "";
    if (!file) { photoPending = false; showError("petFormError"); return; }
    photoPending = true; updatePhotoPreview(); showError("petFormError", "Preparando foto…");
    try { const photo = await loadPhoto(file); if (job === photoJob) { selectedPhoto = photo; updatePhotoPreview(); showError("petFormError"); } }
    catch (error) { if (job === photoJob) { photoError = error.message; showError("petFormError", photoError); event.target.value = ""; } }
    finally { if (job === photoJob) { photoPending = false; updatePhotoPreview(); } }
  });
  $("removePhoto").addEventListener("click", () => { photoJob++; photoPending = false; photoError = ""; selectedPhoto = ""; $("petPhoto").value = ""; updatePhotoPreview(); showError("petFormError"); });
  $("reportForm").addEventListener("submit", async event => {
    event.preventDefault(); const form = event.currentTarget; showError("reportFormError");
    if (!event.currentTarget.reportValidity()) return;
    const report = { id: id(), createdAt: now(), type: $("reportType").value, city: $("reportCity").value.trim(), location: $("reportLocation").value.trim(), description: $("reportDescription").value.trim() };
    if (!report.city || !report.location || !report.description) return showError("reportFormError", "Preencha cidade, local e descrição sem usar apenas espaços.");
    const next = copyState(); next.reports.push(report);
    if (await save(next, "reportFormError")) { form.reset(); openModal(`Ocorrência salva ${destination()}`, "O registro privado está em Meus registros e pode ser baixado como texto. Ele não foi encaminhado a nenhum órgão público ou serviço responsável."); }
  });
  function setFilter(value) {
    filter = value;
    document.querySelectorAll(".filter").forEach(button => { const active = button.dataset.filter === value; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
  }
  document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => { setFilter(button.dataset.filter); render(); }));
  $("petSearch").addEventListener("input", render);
  $("seeAdoption").addEventListener("click", () => {
    openModal("Pets para adoção", "Os perfis de exemplo são fictícios. Os demais perfis são publicados por tutores. Selecione um perfil para consultar seus detalhes.");
    const grid = el("div", "adoption-modal-list");
    pets().filter(p => p.purpose === "adocao").forEach(pet => grid.append(actionButton(`${pet.name} • ${pet.city}`, "profile", pet.id)));
    $("modalBody").append(grid);
  });
  $("vetBtn").addEventListener("click", openVet);
  const campaignTexts = [
    ["Vacinação salva vidas", "Organize a carteira de vacinação e anote as datas das doses e dos retornos. Leve esse histórico ao médico-veterinário para definir os cuidados do seu pet. Este site não fornece um calendário individual de vacinação."],
    ["Proteção nos dias quentes", "Prepare água fresca, sombra e um espaço arejado. Planeje passeios em horários amenos e observe as condições do piso. Organize aqui as suas anotações de cuidado e converse com um médico-veterinário sobre necessidades específicas."],
    ["Adote com responsabilidade", "Converse com todos da casa sobre a adoção. Planeje tempo, espaço, alimentação, despesas e acompanhamento veterinário. Confirme a origem do anúncio e os procedimentos com o protetor responsável. Os perfis de exemplo deste aplicativo são fictícios."]
  ];
  document.querySelectorAll(".campaign-more").forEach((button, index) => button.addEventListener("click", () => openModal(...campaignTexts[index])));
  $("exportData").addEventListener("click", () => {
    const recovery = damagedData !== null;
    const data = recovery ? damagedData : JSON.stringify({ app: "PetMatch", exportedAt: now(), data: state }, null, 2);
    download(data, `PetMatch-${recovery ? "recuperacao" : "backup"}-${new Date().toISOString().slice(0, 10)}.${recovery ? "txt" : "json"}`, recovery ? "text/plain;charset=utf-8" : "application/json");
    showToast(recovery ? "Cópia dos dados ilegíveis exportada para recuperação." : "Backup exportado. Guarde o arquivo em um local seguro.");
  });
  function restoreSafeState(imported) {
    const restored = normalize(imported);
    // A backup is not a delivery receipt and never resends private messages.
    restored.interests = restored.interests.map(({ recipientId, ...record }) => record);
    const remap = new Map();
    restored.pets.forEach(pet => {
      if (publicPets.some(other => other.id === pet.id && other.ownerId !== activeUser?.uid)) { const newId = id(); remap.set(pet.id, newId); pet.id = newId; }
    });
    restored.favorites = restored.favorites.map(petId => remap.get(petId) || petId);
    restored.interests.forEach(record => { record.petId = remap.get(record.petId) || record.petId; });
    return restored;
  }
  const outgoingToCancel = () => state.interests.filter(record => record.recipientId && record.status === "salvo");
  $("importData").addEventListener("change", async event => {
    const file = event.target.files[0]; showError("importError");
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("O backup deve ter no máximo 8 MB.");
      const backup = JSON.parse(await file.text());
      if (backup.app !== "PetMatch") throw new Error("Selecione um backup JSON exportado pelo PetMatch.");
      const imported = restoreSafeState(backup.data);
      const expectedUid = activeUser?.uid || null;
      const expectedRevision = state.revision;
      const expectedRaw = expectedUid ? null : localStorage.getItem(STORAGE_KEY);
      const extra = expectedUid ? " Os perfis dos pets serão publicados no catálogo da sua conta. Ocorrências e anotações continuam privadas. Interesses enviados atuais serão cancelados e os importados serão apenas anotações, sem reenvio." : " Nenhuma mensagem será enviada.";
      confirmAction("Restaurar este backup?", `O backup contém ${imported.pets.length} pet(s), ${imported.interests.length} interesse(s), ${imported.reports.length} ocorrência(s) e ${imported.vetRequests.length} registro(s) veterinário(s). Ele substituirá os dados ${destination()}. Exporte seus dados atuais antes de confirmar.${extra}`, async () => {
        if ((activeUser?.uid || null) !== expectedUid || state.revision !== expectedRevision) return showError("modalError", "A conta ou os dados mudaram. Feche esta janela e selecione o backup novamente.");
        if (expectedUid) {
          if (await save(imported, "modalError", { cancelInterests: outgoingToCancel() })) { resetPetForm(); setFilter("todos"); $("petSearch").value = ""; closeModal(); render(); showToast("Backup restaurado na sua conta. Interesses não foram reenviados."); }
          return;
        }
        try {
          await withStorageLock(() => {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw !== expectedRaw) throw new Error("changed");
            let revision = 0;
            try { revision = raw === null ? 0 : normalize(JSON.parse(raw)).revision; } catch { /* Recuperação confirmada de conteúdo ilegível. */ }
            imported.revision = revision + 1;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(imported));
            damagedData = null; state = imported; resetPetForm(); setFilter("todos"); $("petSearch").value = "";
            notice("Backup restaurado neste navegador. Nenhum dado é enviado a serviços externos.");
            render(); closeModal(); showToast("Backup restaurado com sucesso.");
          });
        } catch (error) { showError("modalError", error.message === "changed" ? "Os dados mudaram em outra guia. Feche esta janela, exporte os dados atuais e selecione o backup novamente." : "Não foi possível restaurar: o armazenamento está bloqueado ou sem espaço. Os dados anteriores foram preservados."); }
      });
    } catch (error) { showError("importError", `Backup não importado. ${error instanceof SyntaxError ? "O arquivo não é um JSON válido." : error.message}`); }
    finally { event.target.value = ""; }
  });
  $("clearData").addEventListener("click", () => {
    const expectedUid = activeUser?.uid || null;
    const expectedRevision = state.revision;
    let expectedRaw;
    try { expectedRaw = expectedUid ? null : localStorage.getItem(STORAGE_KEY); }
    catch { return showToast("O navegador está bloqueando o acesso ao armazenamento."); }
    confirmAction(`Apagar todos os registros ${destination()}?`, `Seus pets, favoritos, interesses e ocorrências serão excluídos ${destination()}.${expectedUid ? " Os anúncios públicos serão retirados e os interesses enviados serão cancelados. Sua conta de acesso e os dados locais deste navegador serão mantidos." : ""} Exporte um backup antes de confirmar. Esta ação não pode ser desfeita sem backup.`, async () => {
      if ((activeUser?.uid || null) !== expectedUid || state.revision !== expectedRevision) return showError("modalError", "A conta ou os dados mudaram. Feche esta janela e confira os registros.");
      if (expectedUid) {
        if (await save(emptyState(), "modalError", { cancelInterests: outgoingToCancel() })) { resetPetForm(); setFilter("todos"); $("petSearch").value = ""; render(); closeModal(); showToast("Registros da conta apagados. Sua conta de acesso foi mantida."); }
        return;
      }
      try {
        await withStorageLock(() => {
          if (localStorage.getItem(STORAGE_KEY) !== expectedRaw) throw new Error("changed");
          let previousRevision = state.revision;
          try { previousRevision = expectedRaw === null ? 0 : normalize(JSON.parse(expectedRaw)).revision; } catch { /* Recuperação confirmada de conteúdo ilegível. */ }
          const fresh = emptyState(); fresh.revision = previousRevision + 1;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
          state = fresh; damagedData = null; resetPetForm(); setFilter("todos"); $("petSearch").value = "";
          notice("Dados locais apagados. Os perfis de exemplo continuam disponíveis.");
          render(); closeModal(); showToast("Dados deste navegador apagados.");
        });
      } catch (error) { showError("modalError", error.message === "changed" ? "Os dados mudaram em outra guia. Feche esta janela e confira os registros antes de tentar novamente." : "Não foi possível apagar os dados. O armazenamento pode estar bloqueado."); }
    });
  });
  $("menuBtn").addEventListener("click", () => {
    const open = $("menu").classList.toggle("open");
    $("menuBtn").setAttribute("aria-expanded", String(open));
    $("menuBtn").setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  });
  function closeMenu() { $("menu").classList.remove("open"); $("menuBtn").setAttribute("aria-expanded", "false"); $("menuBtn").setAttribute("aria-label", "Abrir menu"); }
  document.querySelectorAll(".menu a").forEach(link => link.addEventListener("click", closeMenu));
  document.addEventListener("click", event => { if (!event.target.closest(".nav")) closeMenu(); });
  $("modalClose").addEventListener("click", closeModal);
  $("modalOk").addEventListener("click", closeModal);
  $("modal").addEventListener("click", event => { if (event.target.dataset.close === "true") closeModal(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") { if ($("modal").classList.contains("show")) closeModal(); else closeMenu(); }
    if (event.key !== "Tab" || !$("modal").classList.contains("show")) return;
    const focusable = [...$("modal").querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')].filter(node => !node.hidden && !node.disabled && node.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $("modal").querySelector(".modal-card"))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === $("modal").querySelector(".modal-card"))) { event.preventDefault(); first.focus(); }
  });
  window.addEventListener("scroll", () => document.querySelector(".header").classList.toggle("scrolled", window.scrollY > 15), { passive: true });
  window.addEventListener("storage", event => {
    if (inAccount() || (event.key !== STORAGE_KEY && event.key !== null)) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const next = raw === null ? emptyState() : normalize(JSON.parse(raw));
      state = next; damagedData = null; render(); showToast("Lista atualizada com as alterações de outra guia.");
    } catch { notice("Os dados mudaram em outra guia e não puderam ser lidos. Recarregue a página para recuperar os registros."); }
  });
  function renderAccount() {
    $("authStatus").textContent = activeUser ? `Conectado como ${activeUser.displayName || activeUser.email || "tutor"}.${accountLoaded ? " Seus registros estão na sua conta." : " Carregando seus registros…"}` : "Você está usando o modo local. Os dados ficam somente neste navegador.";
    $("authForm").hidden = Boolean(activeUser);
    $("logoutBtn").hidden = !activeUser;
    $("syncLocalBtn").hidden = !activeUser;
    $("syncLocalBtn").disabled = !accountLoaded || saving;
    $("localModeBtn").hidden = Boolean(activeUser);
    $("clearData").textContent = activeUser ? "Apagar meus registros da conta" : "Apagar dados deste navegador";
  }
  function renderInbox() {
    const statusLabels = { pendente: "Aguardando sua resposta", aceito: "Interesse aceito", recusado: "Interesse recusado", cancelado: "Cancelado pelo remetente" };
    const rows = activeUser ? inbox.slice().sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) : [];
    $("inboxCount").textContent = rows.filter(record => record.status === "pendente").length;
    $("inboxEmpty").hidden = rows.length > 0;
    $("inboxEmpty").textContent = activeUser ? "Nenhum interesse recebido pelos seus pets até agora." : "Entre na sua conta para acompanhar os interesses recebidos pelos seus pets.";
    $("inboxList").replaceChildren(...rows.map(record => {
      const card = el("article", "record-card"); card.dataset.inboxId = record.id;
      card.append(el("span", "status-badge", statusLabels[record.status] || "Interesse recebido"), el("h3", "", `${record.name} quer conhecer ${record.petName}`), el("p", "", record.message || "Sem mensagem adicional."), el("small", "muted", new Date(record.createdAt).toLocaleString("pt-BR")));
      const actions = el("div", "record-actions");
      if (record.status === "pendente") actions.append(actionButton("Aceitar interesse", "inbox-accept", record.id), actionButton("Recusar", "inbox-reject", record.id));
      actions.append(actionButton("Excluir", "inbox-delete", record.id)); card.append(actions); return card;
    }));
  }
  function switchAccount(user) {
    if ((activeUser?.uid || null) === (user?.uid || null)) { activeUser = user; renderAccount(); return; }
    activeUser = user; accountLoaded = false; state = emptyState(); damagedData = null; inbox = [];
    if ($("modal").classList.contains("show")) closeModal();
    resetPetForm(); $("reportForm").reset(); showError("reportFormError"); showError("importError"); showError("authError");
    $("authPassword").value = ""; $("authName").value = ""; $("authEmail").value = "";
    $("petSearch").value = ""; setFilter("todos");
    if (!user) { readInitialState(); notice("Modo local. Seus dados ficam neste navegador e não são enviados a outros tutores."); }
    else notice("Carregando os registros privados da sua conta. Os dados locais não serão importados automaticamente.");
    render();
  }
  async function authAction(operation) {
    if (authBusy) return;
    showError("authError");
    if (!cloud || cloudInitError) return showError("authError", cloudInitError || "O serviço de contas ainda está carregando. Aguarde e tente novamente.");
    const email = $("authEmail").value.trim(), password = $("authPassword").value;
    if (operation !== "logout") {
      if (!email || !$("authEmail").reportValidity()) return;
      if (operation !== "reset" && !$("authPassword").reportValidity()) return;
      if (operation === "register" && !$("authName").value.trim()) return showError("authError", "Informe seu nome para criar a conta.");
    }
    authBusy = true;
    const buttons = ["loginBtn","registerBtn","resetPasswordBtn","logoutBtn"];
    buttons.forEach(key => { $(key).disabled = true; });
    try {
      if (operation === "login") await cloud.login(email, password);
      if (operation === "register") await cloud.register(email, password, $("authName").value.trim());
      if (operation === "logout") await cloud.logout();
      if (operation === "reset") { await cloud.resetPassword(email); showToast("Se o endereço puder receber a recuperação, confira a caixa de entrada e o spam."); }
      $("authPassword").value = "";
    } catch (error) { showError("authError", error.message); showToast(error.message); }
    finally { authBusy = false; buttons.forEach(key => { $(key).disabled = false; }); renderAccount(); }
  }
  $("authForm").addEventListener("submit", event => { event.preventDefault(); authAction("login"); });
  $("registerBtn").addEventListener("click", () => authAction("register"));
  $("resetPasswordBtn").addEventListener("click", () => authAction("reset"));
  $("logoutBtn").addEventListener("click", () => authAction("logout"));
  $("localModeBtn").addEventListener("click", () => { showError("authError"); showToast("Modo local selecionado. Seus dados continuam neste navegador."); $("match").scrollIntoView({ behavior: "smooth" }); });
  $("syncLocalBtn").addEventListener("click", () => {
    if (!activeUser || !accountLoaded) return showToast("Aguarde o carregamento da sua conta.");
    let local;
    try { const raw = localStorage.getItem(STORAGE_KEY); local = raw === null ? emptyState() : restoreSafeState(JSON.parse(raw)); }
    catch { return showToast("Os dados locais não puderam ser lidos. Exporte uma recuperação no modo local antes de continuar."); }
    const expectedUid = activeUser.uid, expectedRevision = state.revision;
    const merge = (current, incoming) => [...new Map([...current, ...incoming].map(record => [record.id, record])).values()];
    confirmAction("Importar os dados locais para sua conta?", `${local.pets.length} pet(s) serão acrescentados ou atualizados e seus perfis serão publicados no catálogo para outros tutores. Favoritos, ocorrências e anotações serão privados. Os interesses serão importados como anotações e não serão enviados. Os dados originais deste navegador serão mantidos.`, async () => {
      if (activeUser?.uid !== expectedUid || state.revision !== expectedRevision) return showError("modalError", "A conta ou os dados mudaram. Feche esta janela e tente novamente.");
      const next = copyState();
      next.pets = merge(next.pets, local.pets); next.favorites = [...new Set([...next.favorites, ...local.favorites])];
      next.reports = merge(next.reports, local.reports); next.vetRequests = merge(next.vetRequests, local.vetRequests);
      const currentIds = new Set(next.interests.map(record => record.id));
      const currentActive = new Set(next.interests.filter(record => record.status === "salvo").map(record => `${record.kind}:${record.petId}`));
      local.interests.forEach(record => { if (!currentIds.has(record.id) && !(record.status === "salvo" && currentActive.has(`${record.kind}:${record.petId}`))) next.interests.push(record); });
      if (await save(next, "modalError")) { closeModal(); showToast("Dados locais importados. Os perfis dos seus pets foram publicados."); }
    });
  });
  $("analyticsConsent").addEventListener("change", async event => {
    const enabled = event.target.checked;
    try {
      if (!cloud) throw new Error("O serviço de métricas ainda não está disponível.");
      if (enabled) { const result = await cloud.enableAnalytics(); if (result === false) { event.target.checked = false; showToast("As métricas opcionais não estão disponíveis neste navegador."); } }
      else if (typeof cloud.disableAnalytics === "function") await cloud.disableAnalytics();
      else { event.target.checked = true; throw new Error("Recarregue a página para encerrar as métricas desta sessão. Elas iniciam desativadas em cada abertura."); }
    } catch (error) { if (enabled) event.target.checked = false; showToast(error.message); }
  });
  async function startCloud() {
    if (location.protocol === "file:") { cloudInitError = "Para conectar a conta, abra o site pelo GitHub Pages ou pelo servidor local. A abertura direta pelo arquivo mantém o modo local."; $("connectionStatus").textContent = cloudInitError; return; }
    try {
      ({ cloud } = await import("./firebase-service.js"));
      await cloud.init({
        onAuth: switchAccount,
        onState: data => {
          if (!activeUser || data === null) return;
          try { state = normalize(data); accountLoaded = true; damagedData = null; render(); }
          catch { accountLoaded = false; notice("Os dados da conta não puderam ser lidos. Nenhum dado foi substituído. Verifique as regras e o formato do banco."); }
        },
        onPets: list => {
          publicPets = (Array.isArray(list) ? list : []).slice(0,1000).flatMap(pet => {
            try { const normalized = normalize({ ...emptyState(), pets: [pet] }).pets[0]; return [{ ...normalized, ownerId: clean(pet.ownerId, 128) }]; } catch { return []; }
          }); render();
        },
        onInbox: list => { if (!activeUser) return; inbox = (Array.isArray(list) ? list : []).filter(record => record && typeof record.id === "string" && record.recipientId === activeUser.uid); renderInbox(); },
        onStatus: status => { $("connectionStatus").textContent = status.message || "Verificando conexão…"; $("connectionStatus").dataset.phase = status.phase || "loading"; },
        onError: error => { $("connectionStatus").textContent = error.message; if (activeUser) showToast(error.message); }
      });
      cloudInitError = "";
    } catch (error) { cloudInitError = error.message || "Não foi possível carregar a conexão. O modo local continua disponível."; $("connectionStatus").textContent = cloudInitError; }
  }
  $("year").textContent = new Date().getFullYear();
  document.querySelectorAll(".reveal").forEach(node => node.classList.add("visible"));
  readInitialState(); setFilter("todos"); render();
  startCloud();
})();
