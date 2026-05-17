const INITIAL_USERS = ["Umut", "Arkadas1", "Arkadas2"];
const STICKERS_PER_TEAM = 20;
const SAVE_DEBOUNCE_MS = 500;

const GROUPS = [
  { name: "A Grubu", teams: ["Meksika", "Güney Afrika", "Güney Kore", "Çekya"] },
  { name: "B Grubu", teams: ["Kanada", "Bosna-Hersek", "Katar", "İsviçre"] },
  { name: "C Grubu", teams: ["Brezilya", "Fas", "Haiti", "İskoçya"] },
  { name: "D Grubu", teams: ["ABD", "Paraguay", "Avustralya", "Türkiye"] },
  { name: "E Grubu", teams: ["Almanya", "Curaçao", "Fildişi Sahili", "Ekvador"] },
  { name: "F Grubu", teams: ["Hollanda", "Japonya", "İsveç", "Tunus"] },
  { name: "G Grubu", teams: ["Belçika", "Mısır", "İran", "Yeni Zelanda"] },
  { name: "H Grubu", teams: ["İspanya", "Yeşil Burun Adaları", "Suudi Arabistan", "Uruguay"] },
  { name: "I Grubu", teams: ["Fransa", "Senegal", "Irak", "Norveç"] },
  { name: "J Grubu", teams: ["Arjantin", "Cezayir", "Avusturya", "Ürdün"] },
  { name: "K Grubu", teams: ["Portekiz", "Demokratik Kongo Cumhuriyeti", "Özbekistan", "Kolombiya"] },
  { name: "L Grubu", teams: ["İngiltere", "Hırvatistan", "Gana", "Panama"] }
];

const els = {
  syncStatus: document.querySelector("#syncStatus"),
  setupPanel: document.querySelector("#setupPanel"),
  mainContent: document.querySelector("#mainContent"),
  offlineNotice: document.querySelector("#offlineNotice"),
  activeUserSelect: document.querySelector("#activeUserSelect"),
  addUserButton: document.querySelector("#addUserButton"),
  summaryStrip: document.querySelector("#summaryStrip"),
  collectionGrid: document.querySelector("#collectionGrid"),
  searchInput: document.querySelector("#searchInput"),
  tradeSections: document.querySelector("#tradeSections"),
  copyTradesButton: document.querySelector("#copyTradesButton"),
  tradeCopyNotice: document.querySelector("#tradeCopyNotice"),
  summaryDetail: document.querySelector("#summaryDetail")
};

const state = {
  users: [...INITIAL_USERS],
  activeUser: INITIAL_USERS[0],
  stickers: {},
  allStickers: [],
  stickerById: new Map(),
  filter: "all",
  search: "",
  view: "collection",
  db: null,
  docRef: null,
  unsubscribe: null,
  saveTimers: new Map(),
  isReady: false
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  state.allStickers = buildStickerCatalog();
  state.stickerById = new Map(state.allStickers.map((sticker) => [sticker.id, sticker]));

  wireUiEvents();
  setOfflineNotice();
  window.addEventListener("online", setOfflineNotice);
  window.addEventListener("offline", setOfflineNotice);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // PWA cache should never block the Firestore-first app.
    });
  }

  setSyncStatus("Bağlanıyor…");

  try {
    const configModule = await import("./firebase-config.js");
    if (!configModule.firebaseConfig || !configModule.firebaseConfig.projectId) {
      throw new Error("MISSING_FIREBASE_CONFIG");
    }
    await connectFirebase(configModule.firebaseConfig);
  } catch (error) {
    showSetupError(
      "Firebase bağlantısı eksik. Lütfen firebase-config.js dosyasını oluşturun.",
      error
    );
  }
}

async function connectFirebase(firebaseConfig) {
  try {
    const appModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

    const firebaseApp = appModule.initializeApp(firebaseConfig);
    state.db = firestoreModule.getFirestore(firebaseApp);
    state.firestore = firestoreModule;
    state.docRef = firestoreModule.doc(state.db, "collections", "main");

    await ensureMainDocument();
    listenToMainDocument();
  } catch (error) {
    showSetupError(buildFirebaseErrorMessage(error), error);
  }
}

async function ensureMainDocument() {
  const { getDoc, setDoc, serverTimestamp } = state.firestore;
  const snapshot = await getDoc(state.docRef);
  if (snapshot.exists()) return;

  const stickers = {};
  for (const sticker of state.allStickers) {
    stickers[sticker.id] = buildEmptyCounts(INITIAL_USERS);
  }

  await setDoc(state.docRef, {
    users: [...INITIAL_USERS],
    stickers,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

function listenToMainDocument() {
  const { onSnapshot } = state.firestore;
  state.unsubscribe = onSnapshot(
    state.docRef,
    (snapshot) => {
      if (!snapshot.exists()) return;
      const normalized = normalizeCollectionData(snapshot.data());
      state.users = normalized.users;
      state.stickers = normalized.stickers;
      if (!state.users.includes(state.activeUser)) {
        state.activeUser = state.users[0] || INITIAL_USERS[0];
      }
      state.isReady = true;
      els.setupPanel.classList.add("hidden");
      els.mainContent.classList.remove("hidden");
      els.activeUserSelect.disabled = false;
      els.addUserButton.disabled = false;
      setSyncStatus("Kaydedildi", "ok");
      render();
    },
    (error) => {
      setSyncStatus("Bağlantı hatası", "error");
      showSetupError(buildFirebaseErrorMessage(error), error);
    }
  );
}

function normalizeCollectionData(data) {
  const users = normalizeUsers(data.users);
  const stickers = {};

  for (const sticker of state.allStickers) {
    const existingCounts = data.stickers?.[sticker.id] || {};
    stickers[sticker.id] = normalizeStickerCounts(existingCounts, users);
  }

  return { users, stickers };
}

function normalizeUsers(users) {
  const source = Array.isArray(users) && users.length ? users : INITIAL_USERS;
  const cleanUsers = [];
  for (const user of source) {
    const name = String(user || "").trim();
    if (name && !cleanUsers.includes(name)) cleanUsers.push(name);
  }
  return cleanUsers.length ? cleanUsers : [...INITIAL_USERS];
}

function normalizeStickerCounts(counts, users) {
  const normalized = {};
  for (const user of users) {
    normalized[user] = sanitizeCount(counts?.[user]);
  }
  return normalized;
}

function sanitizeCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(3, Math.floor(number));
}

function buildEmptyCounts(users) {
  return Object.fromEntries(users.map((user) => [user, 0]));
}

function buildStickerCatalog() {
  const catalog = [];
  for (const group of GROUPS) {
    for (const team of group.teams) {
      for (let number = 1; number <= STICKERS_PER_TEAM; number += 1) {
        catalog.push({
          id: `${slugifyTeamName(team)}-${number}`,
          group: group.name,
          team,
          number
        });
      }
    }
  }
  return catalog;
}

function slugifyTeamName(teamName) {
  const trMap = {
    ç: "c",
    Ç: "c",
    ğ: "g",
    Ğ: "g",
    ı: "i",
    I: "i",
    İ: "i",
    ö: "o",
    Ö: "o",
    ş: "s",
    Ş: "s",
    ü: "u",
    Ü: "u"
  };

  return teamName
    .split("")
    .map((char) => trMap[char] ?? char)
    .join("")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function wireUiEvents() {
  els.activeUserSelect.addEventListener("change", (event) => {
    state.activeUser = event.target.value;
    render();
  });

  els.addUserButton.addEventListener("click", addUserFromPrompt);

  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      renderViewState();
    });
  });

  document.querySelectorAll(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll(".filter-button").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      renderCollection();
    });
  });

  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    renderCollection();
  });

  els.copyTradesButton.addEventListener("click", copyTradeText);
}

async function addUserFromPrompt() {
  const rawName = window.prompt("Yeni kullanıcı adı");
  if (rawName === null) return;

  const name = rawName.trim();
  const validationError = validateUserName(name);
  if (validationError) {
    showTransientNotice(validationError, true);
    return;
  }

  try {
    setSyncStatus("Kaydediliyor…");
    const { updateDoc, serverTimestamp } = state.firestore;
    await updateDoc(state.docRef, {
      users: [...state.users, name],
      updatedAt: serverTimestamp()
    });
    state.activeUser = name;
  } catch (error) {
    setSyncStatus("Bağlantı hatası", "error");
    showTransientNotice(buildFirebaseErrorMessage(error), true);
  }
}

function validateUserName(name) {
  if (!name) return "Kullanıcı adı boş olamaz.";
  if (name.length > 30) return "Kullanıcı adı en fazla 30 karakter olabilir.";
  if (state.users.includes(name)) return "Bu kullanıcı zaten var.";
  return "";
}

function render() {
  renderUsers();
  renderSummaryStrip();
  renderCollection();
  renderTrades();
  renderSummaryDetail();
  renderViewState();
}

function renderUsers() {
  els.activeUserSelect.innerHTML = state.users
    .map((user) => `<option value="${escapeHtml(user)}">${escapeHtml(user)}</option>`)
    .join("");
  els.activeUserSelect.value = state.activeUser;
}

function renderSummaryStrip() {
  const summary = getSummary(state.activeUser);
  els.summaryStrip.innerHTML = [
    summaryCard("Unique", summary.uniqueOwned),
    summaryCard("Eksik", summary.missing),
    summaryCard("Duplicate türü", summary.duplicateTypes),
    summaryCard("Fazladan", summary.extraDuplicates),
    summaryCard("Tamamlanma", `${summary.completion}%`)
  ].join("");
}

function summaryCard(label, value) {
  return `<article class="summary-card"><span>${label}</span><strong>${value}</strong></article>`;
}

function renderCollection() {
  if (!state.isReady) return;

  const tradeOpportunityIds = new Set(getIncomingOffers(state.activeUser).flatMap((offer) => offer.stickers.map((sticker) => sticker.id)));
  const query = normalizeSearch(state.search);
  let html = renderHeaderRow();

  for (const group of GROUPS) {
    const rows = group.teams
      .map((team) => renderTeamRow(team, query, tradeOpportunityIds))
      .filter(Boolean)
      .join("");
    if (!rows) continue;
    html += `<div class="group-row">${escapeHtml(group.name)}</div>${rows}`;
  }

  els.collectionGrid.innerHTML = html || `<div class="group-row">Sonuç bulunamadı</div>`;

  els.collectionGrid.querySelectorAll(".sticker-cell").forEach((button) => {
    button.addEventListener("click", () => cycleStickerCount(button.dataset.stickerId));
  });
}

function renderHeaderRow() {
  const numberCells = Array.from({ length: STICKERS_PER_TEAM }, (_, index) => {
    return `<div class="number-cell">${index + 1}</div>`;
  }).join("");
  return `<div class="grid-row header-row"><div class="team-cell">Takım</div>${numberCells}</div>`;
}

function renderTeamRow(team, query, tradeOpportunityIds) {
  const teamStickers = state.allStickers.filter((sticker) => sticker.team === team);
  const visibleStickers = teamStickers.filter((sticker) => stickerMatches(sticker, query) && stickerPassesFilter(sticker, tradeOpportunityIds));

  if (query && visibleStickers.length === 0) return "";
  if (!query && state.filter !== "all" && visibleStickers.length === 0) return "";

  const cells = teamStickers
    .map((sticker) => renderStickerCell(sticker, visibleStickers.includes(sticker), tradeOpportunityIds.has(sticker.id)))
    .join("");

  return `<div class="grid-row"><div class="team-cell">${escapeHtml(team)}</div>${cells}</div>`;
}

function renderStickerCell(sticker, isVisible, hasTradeOpportunity) {
  const count = getStickerCount(sticker.id, state.activeUser);
  const classes = ["sticker-cell"];
  if (count === 1) classes.push("owned");
  if (count > 1) classes.push("duplicate");
  if (hasTradeOpportunity) classes.push("trade-match");
  const style = isVisible ? "" : ' style="opacity: 0.18"';
  const badge = count > 1 ? `<span class="badge">x${count}</span>` : "";

  return `
    <button class="${classes.join(" ")}" type="button" data-sticker-id="${sticker.id}" aria-label="${escapeHtml(sticker.team)} ${sticker.number}, adet ${count}"${style}>
      ${sticker.number}
      ${badge}
    </button>
  `;
}

function stickerMatches(sticker, normalizedQuery) {
  if (!normalizedQuery) return true;
  const haystacks = [
    normalizeSearch(sticker.team),
    sticker.id,
    `${normalizeSearch(sticker.team)} ${sticker.number}`,
    `${slugifyTeamName(sticker.team)}-${sticker.number}`,
    String(sticker.number)
  ];
  return haystacks.some((item) => item.includes(normalizedQuery));
}

function stickerPassesFilter(sticker, tradeOpportunityIds) {
  const count = getStickerCount(sticker.id, state.activeUser);
  if (state.filter === "missing") return count === 0;
  if (state.filter === "owned") return count > 0;
  if (state.filter === "duplicates") return count > 1;
  if (state.filter === "trade") return tradeOpportunityIds.has(sticker.id) || count > 1;
  return true;
}

function normalizeSearch(value) {
  return slugifyTeamName(String(value || "").replace("#", " "));
}

function cycleStickerCount(stickerId) {
  const current = getStickerCount(stickerId, state.activeUser);
  const next = current >= 3 ? 0 : current + 1;
  state.stickers[stickerId] = {
    ...normalizeStickerCounts(state.stickers[stickerId], state.users),
    [state.activeUser]: next
  };
  render();
  queueStickerSave(stickerId);
}

function queueStickerSave(stickerId) {
  window.clearTimeout(state.saveTimers.get(stickerId));
  setSyncStatus("Kaydediliyor…");
  state.saveTimers.set(
    stickerId,
    window.setTimeout(() => saveSticker(stickerId), SAVE_DEBOUNCE_MS)
  );
}

async function saveSticker(stickerId) {
  try {
    const { updateDoc, serverTimestamp } = state.firestore;
    const counts = normalizeStickerCounts(state.stickers[stickerId], state.users);
    await updateDoc(state.docRef, {
      [`stickers.${stickerId}`]: counts,
      updatedAt: serverTimestamp()
    });
    setSyncStatus("Kaydedildi", "ok");
  } catch (error) {
    setSyncStatus("Bağlantı hatası", "error");
    showTransientNotice(buildFirebaseErrorMessage(error), true);
  } finally {
    state.saveTimers.delete(stickerId);
  }
}

function getStickerCount(stickerId, user) {
  return sanitizeCount(state.stickers?.[stickerId]?.[user]);
}

function getNeeds(user) {
  return state.allStickers.filter((sticker) => getStickerCount(sticker.id, user) === 0);
}

function getDuplicates(user) {
  return state.allStickers.filter((sticker) => getStickerCount(sticker.id, user) > 1);
}

function getIncomingOffers(activeUser) {
  const activeNeeds = new Set(getNeeds(activeUser).map((sticker) => sticker.id));
  return state.users
    .filter((user) => user !== activeUser)
    .map((fromUser) => ({
      fromUser,
      toUser: activeUser,
      stickers: getDuplicates(fromUser).filter((sticker) => activeNeeds.has(sticker.id))
    }))
    .filter((offer) => offer.stickers.length > 0);
}

function getOutgoingOffers(activeUser) {
  const activeDuplicates = getDuplicates(activeUser);
  return state.users
    .filter((user) => user !== activeUser)
    .map((toUser) => {
      const needs = new Set(getNeeds(toUser).map((sticker) => sticker.id));
      return {
        fromUser: activeUser,
        toUser,
        stickers: activeDuplicates.filter((sticker) => needs.has(sticker.id))
      };
    })
    .filter((offer) => offer.stickers.length > 0);
}

function getMutualTrades(userA, userB) {
  const aToB = getOutgoingOffers(userA).find((offer) => offer.toUser === userB)?.stickers || [];
  const bToA = getOutgoingOffers(userB).find((offer) => offer.toUser === userA)?.stickers || [];
  return { userA, userB, aToB, bToA };
}

function renderTrades() {
  if (!state.isReady) return;
  const incoming = getIncomingOffers(state.activeUser);
  const outgoing = getOutgoingOffers(state.activeUser);
  const mutual = state.users
    .filter((user) => user !== state.activeUser)
    .map((user) => getMutualTrades(state.activeUser, user))
    .filter((trade) => trade.aToB.length > 0 && trade.bToA.length > 0);

  els.tradeSections.innerHTML = [
    renderOfferCard("Bana gelebilecekler", incoming, "incoming"),
    renderOfferCard("Ben verebilirim", outgoing, "outgoing"),
    renderMutualCard(mutual)
  ].join("");
}

function renderOfferCard(title, offers, type) {
  const body = offers.length
    ? `<div class="trade-list">${offers.map((offer) => renderOfferItem(offer, type)).join("")}</div>`
    : `<p class="empty-state">Şimdilik öneri yok.</p>`;
  return `<article class="trade-card"><h3>${title}</h3>${body}</article>`;
}

function renderOfferItem(offer) {
  return `
    <div class="trade-item">
      <strong>${escapeHtml(offer.fromUser)} → ${escapeHtml(offer.toUser)}</strong>
      <div class="chips">${offer.stickers.map((sticker) => `<span class="chip">${formatSticker(sticker)}</span>`).join("")}</div>
    </div>
  `;
}

function renderMutualCard(mutualTrades) {
  const body = mutualTrades.length
    ? `<div class="trade-list">${mutualTrades.map(renderMutualItem).join("")}</div>`
    : `<p class="empty-state">Karşılıklı takas fırsatı yok.</p>`;
  return `<article class="trade-card"><h3>Karşılıklı takas</h3>${body}</article>`;
}

function renderMutualItem(trade) {
  return `
    <div class="trade-item">
      <strong>${escapeHtml(trade.userA)} ↔ ${escapeHtml(trade.userB)}</strong>
      <p>${escapeHtml(trade.userA)} verir:</p>
      <div class="chips">${trade.aToB.map((sticker) => `<span class="chip">${formatSticker(sticker)}</span>`).join("")}</div>
      <p>${escapeHtml(trade.userB)} verir:</p>
      <div class="chips">${trade.bToA.map((sticker) => `<span class="chip">${formatSticker(sticker)}</span>`).join("")}</div>
    </div>
  `;
}

function renderSummaryDetail() {
  if (!state.isReady) return;
  const rows = state.users
    .map((user) => {
      const summary = getSummary(user);
      return `
        <tr>
          <td>${escapeHtml(user)}</td>
          <td>${summary.uniqueOwned}</td>
          <td>${summary.missing}</td>
          <td>${summary.duplicateTypes}</td>
          <td>${summary.extraDuplicates}</td>
          <td>${summary.completion}%</td>
        </tr>
      `;
    })
    .join("");

  els.summaryDetail.innerHTML = `
    <article class="summary-block">
      <h3>Kullanıcı özeti</h3>
      <table class="summary-table">
        <thead>
          <tr>
            <th>Kullanıcı</th>
            <th>Unique</th>
            <th>Eksik</th>
            <th>Duplicate</th>
            <th>Fazladan</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </article>
  `;
}

function getSummary(user) {
  let uniqueOwned = 0;
  let missing = 0;
  let duplicateTypes = 0;
  let extraDuplicates = 0;

  for (const sticker of state.allStickers) {
    const count = getStickerCount(sticker.id, user);
    if (count > 0) uniqueOwned += 1;
    if (count === 0) missing += 1;
    if (count > 1) duplicateTypes += 1;
    extraDuplicates += Math.max(count - 1, 0);
  }

  return {
    uniqueOwned,
    missing,
    duplicateTypes,
    extraDuplicates,
    completion: Math.round((uniqueOwned / state.allStickers.length) * 100)
  };
}

function renderViewState() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `${state.view}View`);
  });
}

function formatSticker(sticker) {
  return `${escapeHtml(sticker.team)} #${sticker.number}`;
}

async function copyTradeText() {
  const text = buildTradeText();
  try {
    await navigator.clipboard.writeText(text);
    els.tradeCopyNotice.textContent = "Takas metni kopyalandı.";
  } catch {
    els.tradeCopyNotice.textContent = "Kopyalama başarısız. Tarayıcı izinlerini kontrol edin.";
  }
  window.setTimeout(() => {
    els.tradeCopyNotice.textContent = "";
  }, 2500);
}

function buildTradeText() {
  const incoming = getIncomingOffers(state.activeUser);
  const outgoing = getOutgoingOffers(state.activeUser);
  const lines = ["Panini WM 2026 Takas Önerisi", ""];

  lines.push(`${state.activeUser}'a gelebilecekler:`);
  appendOfferLines(lines, incoming);
  lines.push("");
  lines.push(`${state.activeUser} verebilir:`);
  appendOfferLines(lines, outgoing);

  return lines.join("\n");
}

function appendOfferLines(lines, offers) {
  if (!offers.length) {
    lines.push("- Öneri yok");
    return;
  }
  for (const offer of offers) {
    lines.push(`${offer.fromUser} → ${offer.toUser}:`);
    for (const sticker of offer.stickers) {
      lines.push(`- ${sticker.team} #${sticker.number}`);
    }
  }
}

function setSyncStatus(text, mode = "") {
  els.syncStatus.textContent = text;
  els.syncStatus.classList.toggle("ok", mode === "ok");
  els.syncStatus.classList.toggle("error", mode === "error");
}

function showSetupError(message, error) {
  setSyncStatus(message.includes("config") ? "Firebase config eksik" : "Bağlantı hatası", "error");
  els.mainContent.classList.add("hidden");
  els.activeUserSelect.disabled = true;
  els.addUserButton.disabled = true;
  els.setupPanel.classList.remove("hidden");
  els.setupPanel.innerHTML = `
    <h2>${escapeHtml(message)}</h2>
    <p><code>firebase-config.example.js</code> dosyasını kopyalayıp <code>firebase-config.js</code> olarak kaydedin ve kendi Firebase Web config bilgilerinizi girin.</p>
    <p>Bu uygulamada demo database, mock database veya localStorage fallback yoktur. Değişiklikler yalnızca Firestore'a yazılır.</p>
    ${error?.code ? `<p>Teknik detay: ${escapeHtml(error.code)}</p>` : ""}
  `;
}

function showTransientNotice(message, isError = false) {
  els.setupPanel.classList.remove("hidden");
  els.setupPanel.innerHTML = `<h2>${escapeHtml(message)}</h2>`;
  if (!isError && state.isReady) {
    window.setTimeout(() => els.setupPanel.classList.add("hidden"), 2200);
  }
}

function buildFirebaseErrorMessage(error) {
  if (error?.code === "permission-denied") {
    return "Firestore erişim izni reddedildi. Lütfen Firestore rules ayarlarını kontrol edin.";
  }
  if (String(error?.message || "").includes("firebase-config")) {
    return "Firebase bağlantısı eksik. Lütfen firebase-config.js dosyasını oluşturun.";
  }
  return "Firestore bağlantısı kurulamadı. Firebase config ve internet bağlantısını kontrol edin.";
}

function setOfflineNotice() {
  els.offlineNotice.classList.toggle("hidden", navigator.onLine);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
