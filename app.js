// ═══════════════════════════════════════════════════════════
//   HianStudios Workspace — app.js
//   Firebase: Auth + Firestore + Storage + Realtime Database
// ═══════════════════════════════════════════════════════════

// ── FIREBASE CONFIG ──────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, onSnapshot,
  serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  getDatabase, ref as dbRef, set, onValue, remove, serverTimestamp as dbTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCydvTOakjkyCTkNlCRPtqnD1foEFvkchw",
  authDomain: "hianstudio.firebaseapp.com",
  databaseURL: "https://hianstudio-default-rtdb.firebaseio.com",
  projectId: "hianstudio",
  storageBucket: "hianstudio.firebasestorage.app",
  messagingSenderId: "405903984171",
  appId: "1:405903984171:web:32b9abf52f544177f5cc6e",
  measurementId: "G-BSTZP36JNK"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);
const storage     = getStorage(firebaseApp);
const rtdb        = getDatabase(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// ── STATE ─────────────────────────────────────────────────
let currentUser   = null;
let currentRoom   = "general";
let messagesUnsub = null;
let notifUnsub    = null;
let projectsList  = [];
let clientsList   = [];
let notifications = [];

// ═══════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════

function toggleAuth() {
  const lf = document.getElementById("login-form");
  const rf = document.getElementById("register-form");
  lf.classList.toggle("active");
  rf.classList.toggle("active");
  clearAuthErrors();
}
window.toggleAuth = toggleAuth;

async function loginEmail() {
  const email = document.getElementById("login-email").value.trim();
  const pass  = document.getElementById("login-password").value;
  if (!email || !pass) return showAuthError("auth-error", "Completa todos los campos.");
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    showAuthError("auth-error", friendlyAuthError(e.code));
  }
}
window.loginEmail = loginEmail;

async function loginGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        name: user.displayName || "Usuario Google",
        email: user.email,
        role: "admin",
        createdAt: serverTimestamp()
      });
    }
  } catch (e) {
    showAuthError("auth-error", friendlyAuthError(e.code));
  }
}
window.loginGoogle = loginGoogle;

async function registerEmail() {
  const name  = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const pass  = document.getElementById("reg-password").value;
  const role  = document.getElementById("reg-role").value;
  if (!name || !email || !pass) return showAuthError("reg-error", "Completa todos los campos.");
  if (pass.length < 6) return showAuthError("reg-error", "La contraseña debe tener al menos 6 caracteres.");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), {
      name, email, role, createdAt: serverTimestamp()
    });
  } catch (e) {
    showAuthError("reg-error", friendlyAuthError(e.code));
  }
}
window.registerEmail = registerEmail;

async function logout() {
  await setOnlineStatus(false);
  await signOut(auth);
}
window.logout = logout;

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove("hidden");
}

function clearAuthErrors() {
  document.getElementById("auth-error").classList.add("hidden");
  document.getElementById("reg-error").classList.add("hidden");
}

function friendlyAuthError(code) {
  const map = {
    "auth/invalid-email": "Email inválido.",
    "auth/user-not-found": "No existe una cuenta con ese email.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/email-already-in-use": "Ese email ya está registrado.",
    "auth/weak-password": "La contraseña es muy débil.",
    "auth/network-request-failed": "Error de red. Revisa tu conexión.",
    "auth/popup-closed-by-user": "Se cerró el popup de Google.",
    "auth/invalid-credential": "Credenciales inválidas. Verifica tus datos.",
  };
  return map[code] || "Error inesperado. Intenta de nuevo.";
}

// ── AUTH STATE ─────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await loadUserProfile(user);
    showApp();
    setupPresence(user.uid);
    await loadAll();
    listenNotifications();
  } else {
    currentUser = null;
    showAuthScreen();
  }
});

async function loadUserProfile(user) {
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    const data = snap.exists() ? snap.data() : {};
    const name = data.name || user.displayName || user.email || "Usuario";
    const role = data.role || "admin";
    document.getElementById("user-name").textContent  = name;
    document.getElementById("user-role").textContent  = role;
    document.getElementById("user-avatar").textContent = name.charAt(0).toUpperCase();
  } catch (e) {
    console.error("Error loading profile:", e);
  }
}

// ═══════════════════════════════════════════════════════════
//  UI NAVIGATION
// ═══════════════════════════════════════════════════════════

function showApp() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
}

function showAuthScreen() {
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

function showSection(name) {
  document.querySelectorAll(".content-section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById(`section-${name}`)?.classList.add("active");
  document.querySelector(`[data-section="${name}"]`)?.classList.add("active");
  const titles = { projects: "Proyectos", files: "Archivos", chat: "Chat", clients: "Clientes" };
  document.getElementById("page-title").textContent = titles[name] || name;
  if (name === "chat") startChatListener();
  if (name === "files") loadFiles();
}
window.showSection = showSection;

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}
window.toggleSidebar = toggleSidebar;

// Close sidebar on outside click (mobile)
document.addEventListener("click", (e) => {
  const sidebar = document.getElementById("sidebar");
  if (window.innerWidth <= 768 && sidebar.classList.contains("open")) {
    if (!sidebar.contains(e.target) && !e.target.closest(".mobile-menu-btn")) {
      sidebar.classList.remove("open");
    }
  }
});

// ═══════════════════════════════════════════════════════════
//  LOAD ALL DATA
// ═══════════════════════════════════════════════════════════

async function loadAll() {
  await loadProjects();
  await loadClients();
  startChatListener();
  listenOnlineUsers();
}

// ═══════════════════════════════════════════════════════════
//  PROJECTS
// ═══════════════════════════════════════════════════════════

async function loadProjects() {
  const grid = document.getElementById("project-grid");
  grid.innerHTML = '<div class="loading-state">Cargando proyectos...</div>';
  try {
    const q = query(
      collection(db, "projects"),
      where("ownerId", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    projectsList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProjects();
    updateProjectStats();
    populateProjectSelects();
  } catch (e) {
    console.error("Error loading projects:", e);
    grid.innerHTML = '<div class="empty-state">Error al cargar proyectos.</div>';
  }
}

function renderProjects() {
  const grid = document.getElementById("project-grid");
  if (projectsList.length === 0) {
    grid.innerHTML = `
      <div class="empty-card">
        <div class="empty-icon">◈</div>
        <p>Sin proyectos aún.<br>Crea tu primer proyecto.</p>
      </div>`;
    return;
  }
  grid.innerHTML = projectsList.map(p => {
    const statusClass = p.status.replace(" ", "-").toLowerCase();
    const statusLabel = p.status.charAt(0).toUpperCase() + p.status.slice(1);
    return `
      <div class="project-card">
        <div class="project-card-header">
          <div class="project-name">${escHtml(p.name)}</div>
          <span class="status-badge status-${statusClass}">${escHtml(statusLabel)}</span>
        </div>
        <div class="project-desc">${escHtml(p.description || "Sin descripción.")}</div>
        <div class="project-card-footer">
          <div class="project-actions">
            <button class="action-btn" onclick="openEditProject('${p.id}')">✏ Editar</button>
            <button class="action-btn danger" onclick="confirmDelete('project','${p.id}','${escHtml(p.name)}')">✕ Eliminar</button>
          </div>
        </div>
      </div>`;
  }).join("");
}

function updateProjectStats() {
  document.getElementById("stat-active").textContent   = projectsList.filter(p => p.status === "activo").length;
  document.getElementById("stat-progress").textContent = projectsList.filter(p => p.status === "en progreso").length;
  document.getElementById("stat-done").textContent     = projectsList.filter(p => p.status === "terminado").length;
}

function populateProjectSelects() {
  const selects = ["file-project-filter", "proj-client"];
  const filterSel = document.getElementById("file-project-filter");
  filterSel.innerHTML = '<option value="">Todos los proyectos</option>' +
    projectsList.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join("");

  const clientSel = document.getElementById("proj-client");
  clientSel.innerHTML = '<option value="">Sin cliente</option>' +
    clientsList.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join("");
}

function openProjectModal() {
  document.getElementById("proj-name").value    = "";
  document.getElementById("proj-desc").value    = "";
  document.getElementById("proj-status").value  = "activo";
  document.getElementById("proj-id").value      = "";
  document.getElementById("project-modal-title").textContent = "Nuevo Proyecto";
  openModal("project-modal");
}
window.openProjectModal = openProjectModal;

function openEditProject(id) {
  const p = projectsList.find(x => x.id === id);
  if (!p) return;
  document.getElementById("proj-name").value   = p.name;
  document.getElementById("proj-desc").value   = p.description || "";
  document.getElementById("proj-status").value = p.status;
  document.getElementById("proj-id").value     = id;
  document.getElementById("project-modal-title").textContent = "Editar Proyecto";
  openModal("project-modal");
}
window.openEditProject = openEditProject;

async function saveProject() {
  const name   = document.getElementById("proj-name").value.trim();
  const desc   = document.getElementById("proj-desc").value.trim();
  const status = document.getElementById("proj-status").value;
  const client = document.getElementById("proj-client").value;
  const id     = document.getElementById("proj-id").value;
  if (!name) return showToast("El nombre es obligatorio.", "error");

  const data = { name, description: desc, status, clientId: client, ownerId: currentUser.uid };

  try {
    if (id) {
      await updateDoc(doc(db, "projects", id), { ...data, updatedAt: serverTimestamp() });
      showToast("Proyecto actualizado ✓", "success");
      addNotification(`Proyecto "${name}" actualizado.`);
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, "projects"), data);
      showToast("Proyecto creado ✓", "success");
      addNotification(`Nuevo proyecto: "${name}"`);
    }
    closeModal("project-modal");
    loadProjects();
  } catch (e) {
    console.error(e);
    showToast("Error al guardar el proyecto.", "error");
  }
}
window.saveProject = saveProject;

// ═══════════════════════════════════════════════════════════
//  CLIENTS
// ═══════════════════════════════════════════════════════════

async function loadClients() {
  const grid = document.getElementById("client-grid");
  grid.innerHTML = '<div class="loading-state">Cargando clientes...</div>';
  try {
    const q = query(
      collection(db, "clients"),
      where("ownerId", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    clientsList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderClients();
    populateProjectSelects();
  } catch (e) {
    console.error("Error loading clients:", e);
    grid.innerHTML = '<div class="empty-state">Error al cargar clientes.</div>';
  }
}

function renderClients() {
  const grid = document.getElementById("client-grid");
  if (clientsList.length === 0) {
    grid.innerHTML = `
      <div class="empty-card">
        <div class="empty-icon">⊕</div>
        <p>Sin clientes aún.<br>Agrega tu primer cliente.</p>
      </div>`;
    return;
  }
  grid.innerHTML = clientsList.map(c => `
    <div class="client-card">
      <div class="client-card-header">
        <div class="client-avatar">${escHtml(c.name.charAt(0).toUpperCase())}</div>
        <div class="client-info">
          <div class="client-name-text">${escHtml(c.name)}</div>
          <div class="client-email-text">${escHtml(c.email || "")}</div>
        </div>
      </div>
      ${c.country ? `<div class="client-detail">🌍 ${escHtml(c.country)}</div>` : ""}
      ${c.notes   ? `<div class="client-detail">${escHtml(c.notes)}</div>` : ""}
      <div class="client-actions">
        <button class="action-btn danger" onclick="confirmDelete('client','${c.id}','${escHtml(c.name)}')">✕ Eliminar</button>
      </div>
    </div>`).join("");
}

function openClientModal() {
  document.getElementById("client-name").value    = "";
  document.getElementById("client-email").value   = "";
  document.getElementById("client-country").value = "";
  document.getElementById("client-notes").value   = "";
  openModal("client-modal");
}
window.openClientModal = openClientModal;

async function saveClient() {
  const name    = document.getElementById("client-name").value.trim();
  const email   = document.getElementById("client-email").value.trim();
  const country = document.getElementById("client-country").value.trim();
  const notes   = document.getElementById("client-notes").value.trim();
  if (!name) return showToast("El nombre es obligatorio.", "error");
  try {
    await addDoc(collection(db, "clients"), {
      name, email, country, notes,
      ownerId: currentUser.uid,
      createdAt: serverTimestamp()
    });
    showToast("Cliente guardado ✓", "success");
    closeModal("client-modal");
    loadClients();
  } catch (e) {
    console.error(e);
    showToast("Error al guardar el cliente.", "error");
  }
}
window.saveClient = saveClient;

// ═══════════════════════════════════════════════════════════
//  FILES
// ═══════════════════════════════════════════════════════════

async function loadFiles() {
  const grid     = document.getElementById("file-grid");
  const projectId = document.getElementById("file-project-filter").value;
  grid.innerHTML = '<div class="loading-state">Cargando archivos...</div>';
  try {
    let q;
    if (projectId) {
      q = query(collection(db, "files"),
        where("ownerId", "==", currentUser.uid),
        where("projectId", "==", projectId),
        orderBy("uploadedAt", "desc"));
    } else {
      q = query(collection(db, "files"),
        where("ownerId", "==", currentUser.uid),
        orderBy("uploadedAt", "desc"));
    }
    const snap = await getDocs(q);
    const files = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (files.length === 0) {
      grid.innerHTML = `<div class="empty-card"><div class="empty-icon">⊡</div><p>Sin archivos aún.<br>Sube tu primer archivo.</p></div>`;
      return;
    }
    grid.innerHTML = files.map(f => `
      <div class="file-card">
        <div class="file-icon">${getFileIcon(f.name)}</div>
        <div class="file-name">${escHtml(f.name)}</div>
        <div class="file-meta">${formatBytes(f.size || 0)} · ${formatDate(f.uploadedAt)}</div>
        <div class="file-actions">
          <a class="action-btn" href="${f.url}" target="_blank" rel="noopener">⬇ Descargar</a>
          <button class="action-btn danger" onclick="deleteFile('${f.id}','${escHtml(f.storagePath || "")}')">✕</button>
        </div>
      </div>`).join("");
  } catch (e) {
    console.error("Error loading files:", e);
    grid.innerHTML = '<div class="empty-state">Error al cargar archivos.</div>';
  }
}
window.loadFiles = loadFiles;

async function uploadFile() {
  const input     = document.getElementById("file-input");
  const projectId = document.getElementById("file-project-filter").value;
  const files     = Array.from(input.files);
  if (!files.length) return;

  const progressBar = document.getElementById("upload-progress");
  const fill        = document.getElementById("progress-fill");
  const text        = document.getElementById("progress-text");
  progressBar.classList.remove("hidden");

  for (let i = 0; i < files.length; i++) {
    const file  = files[i];
    const path  = `uploads/${currentUser.uid}/${Date.now()}_${file.name}`;
    const ref   = storageRef(storage, path);
    const task  = uploadBytesResumable(ref, file);

    await new Promise((resolve, reject) => {
      task.on("state_changed",
        snap => {
          const pct = Math.round(snap.bytesTransferred / snap.totalBytes * 100);
          fill.style.width = pct + "%";
          text.textContent = `Subiendo ${file.name}… ${pct}%`;
        },
        reject,
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          await addDoc(collection(db, "files"), {
            name: file.name,
            url, storagePath: path,
            size: file.size,
            type: file.type,
            projectId: projectId || null,
            ownerId: currentUser.uid,
            uploadedAt: serverTimestamp()
          });
          resolve();
        }
      );
    });
  }

  fill.style.width = "100%";
  text.textContent = "¡Subida completada!";
  showToast("Archivo(s) subido(s) ✓", "success");
  addNotification("Archivo subido al workspace.");
  setTimeout(() => { progressBar.classList.add("hidden"); fill.style.width = "0%"; }, 1500);
  input.value = "";
  loadFiles();
}
window.uploadFile = uploadFile;

async function deleteFile(fileId, storagePath) {
  try {
    await deleteDoc(doc(db, "files", fileId));
    if (storagePath) {
      const ref = storageRef(storage, storagePath);
      await deleteObject(ref).catch(() => {});
    }
    showToast("Archivo eliminado.", "success");
    loadFiles();
  } catch (e) {
    console.error(e);
    showToast("Error al eliminar el archivo.", "error");
  }
}
window.deleteFile = deleteFile;

// ═══════════════════════════════════════════════════════════
//  CHAT
// ═══════════════════════════════════════════════════════════

function startChatListener() {
  if (messagesUnsub) messagesUnsub();
  const area = document.getElementById("messages-area");
  area.innerHTML = '<div class="loading-state">Cargando mensajes...</div>';

  const q = query(
    collection(db, `chat/${currentRoom}/messages`),
    orderBy("timestamp", "asc"),
    limit(100)
  );

  messagesUnsub = onSnapshot(q, (snap) => {
    area.innerHTML = "";
    if (snap.empty) {
      area.innerHTML = '<div class="empty-state">Sin mensajes. ¡Escribe el primero!</div>';
      return;
    }
    snap.docs.forEach(d => renderMessage(d.data()));
    area.scrollTop = area.scrollHeight;
  }, (e) => {
    console.error("Chat error:", e);
    area.innerHTML = '<div class="empty-state">Error al cargar el chat.</div>';
  });
}

function renderMessage(data) {
  const area = document.getElementById("messages-area");
  const isOwn = data.uid === currentUser.uid;
  const initial = (data.displayName || "?").charAt(0).toUpperCase();
  const time = data.timestamp?.toDate
    ? data.timestamp.toDate().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })
    : "";

  const div = document.createElement("div");
  div.className = `message ${isOwn ? "own" : ""}`;
  div.innerHTML = `
    <div class="msg-avatar">${initial}</div>
    <div class="msg-bubble">
      <div class="msg-header">
        <span class="msg-name">${escHtml(data.displayName || "Usuario")}</span>
        <span class="msg-time">${time}</span>
      </div>
      <div class="msg-text">${escHtml(data.text)}</div>
    </div>`;
  area.appendChild(div);
}

async function sendMessage() {
  const input = document.getElementById("msg-input");
  const text  = input.value.trim();
  if (!text) return;
  input.value = "";
  const displayName = currentUser.displayName || document.getElementById("user-name").textContent || "Usuario";
  try {
    await addDoc(collection(db, `chat/${currentRoom}/messages`), {
      text,
      uid: currentUser.uid,
      displayName,
      timestamp: serverTimestamp()
    });
  } catch (e) {
    console.error("Send msg error:", e);
    showToast("No se pudo enviar el mensaje.", "error");
  }
}
window.sendMessage = sendMessage;

function handleMsgKey(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}
window.handleMsgKey = handleMsgKey;

function selectRoom(room) {
  currentRoom = room;
  document.querySelectorAll(".room-item").forEach(r => r.classList.remove("active"));
  event.currentTarget.classList.add("active");
  document.getElementById("chat-room-name").textContent = `# ${room}`;
  const descs = { general: "Canal principal del equipo", proyectos: "Discusión de proyectos", entregas: "Entregas y revisiones" };
  document.querySelector(".chat-room-desc").textContent = descs[room] || "";
  startChatListener();
}
window.selectRoom = selectRoom;

// ═══════════════════════════════════════════════════════════
//  ONLINE PRESENCE (Realtime Database)
// ═══════════════════════════════════════════════════════════

function setupPresence(uid) {
  const userRef = dbRef(rtdb, `presence/${uid}`);
  const displayName = currentUser.displayName || "Usuario";
  set(userRef, { online: true, name: displayName, uid, lastSeen: dbTimestamp() });
  window.addEventListener("beforeunload", () => setOnlineStatus(false));
  setInterval(() => set(userRef, { online: true, name: displayName, uid, lastSeen: dbTimestamp() }), 30000);
}

async function setOnlineStatus(online) {
  if (!currentUser) return;
  const userRef = dbRef(rtdb, `presence/${currentUser.uid}`);
  if (online) {
    await set(userRef, { online: true, name: currentUser.displayName || "Usuario", uid: currentUser.uid });
  } else {
    await remove(userRef);
  }
}

function listenOnlineUsers() {
  const presenceRef = dbRef(rtdb, "presence");
  onValue(presenceRef, (snap) => {
    const bar  = document.getElementById("online-users-bar");
    const data = snap.val() || {};
    const users = Object.values(data).filter(u => u.online);
    bar.innerHTML = users.slice(0, 5).map(u => {
      const initial = (u.name || "?").charAt(0).toUpperCase();
      return `<div class="online-user-dot" title="${escHtml(u.name || "")}">${initial}</div>`;
    }).join("");
  });
}

// ═══════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

async function addNotification(msg) {
  try {
    await addDoc(collection(db, `users/${currentUser.uid}/notifications`), {
      message: msg,
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (e) { console.error("Notif error:", e); }
}

function listenNotifications() {
  if (notifUnsub) notifUnsub();
  const q = query(
    collection(db, `users/${currentUser.uid}/notifications`),
    orderBy("createdAt", "desc"),
    limit(20)
  );
  notifUnsub = onSnapshot(q, (snap) => {
    notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const unread  = notifications.filter(n => !n.read).length;
    const count   = document.getElementById("notif-count");
    if (unread > 0) {
      count.style.display = "flex";
      count.textContent   = unread;
    } else {
      count.style.display = "none";
    }
    renderNotifications();
  });
}

function renderNotifications() {
  const list = document.getElementById("notif-list");
  if (notifications.length === 0) {
    list.innerHTML = '<p class="empty-state" style="padding:16px">Sin notificaciones</p>';
    return;
  }
  list.innerHTML = notifications.map(n => `
    <div class="notif-item">
      <strong>${n.read ? "" : "🔵 "}${escHtml(n.message)}</strong>
      ${n.createdAt?.toDate ? formatDate(n.createdAt) : ""}
    </div>`).join("");
}

async function toggleNotifications() {
  const panel = document.getElementById("notif-panel");
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden") && notifications.some(n => !n.read)) {
    for (const n of notifications.filter(x => !x.read)) {
      await updateDoc(doc(db, `users/${currentUser.uid}/notifications`, n.id), { read: true }).catch(() => {});
    }
  }
}
window.toggleNotifications = toggleNotifications;

// Close notifications on outside click
document.addEventListener("click", (e) => {
  const panel = document.getElementById("notif-panel");
  if (!panel.classList.contains("hidden") &&
      !panel.contains(e.target) &&
      !e.target.closest(".notif-bell")) {
    panel.classList.add("hidden");
  }
});

// ═══════════════════════════════════════════════════════════
//  DELETE CONFIRMATION
// ═══════════════════════════════════════════════════════════

function confirmDelete(type, id, name) {
  document.getElementById("delete-msg").textContent = `¿Eliminar "${name}"? Esta acción no se puede deshacer.`;
  const btn = document.getElementById("delete-confirm-btn");
  btn.onclick = async () => {
    closeModal("delete-modal");
    if (type === "project") {
      await deleteDoc(doc(db, "projects", id));
      showToast("Proyecto eliminado.", "success");
      loadProjects();
    } else if (type === "client") {
      await deleteDoc(doc(db, "clients", id));
      showToast("Cliente eliminado.", "success");
      loadClients();
    }
  };
  openModal("delete-modal");
}
window.confirmDelete = confirmDelete;

// ═══════════════════════════════════════════════════════════
//  MODALS
// ═══════════════════════════════════════════════════════════

function openModal(id) {
  document.getElementById(id).classList.remove("hidden");
}
function closeModal(id) {
  document.getElementById(id).classList.add("hidden");
}
window.openModal  = openModal;
window.closeModal = closeModal;

// Close modal on backdrop click
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.add("hidden");
  });
});

// ═══════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════

let toastTimeout;
function showToast(msg, type = "") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className   = `toast ${type}`;
  toast.classList.remove("hidden");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add("hidden"), 3000);
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
}

function getFileIcon(name) {
  if (!name) return "📄";
  const ext = name.split(".").pop().toLowerCase();
  const icons = {
    pdf: "📕", doc: "📝", docx: "📝", xls: "📊", xlsx: "📊",
    ppt: "📊", pptx: "📊", png: "🖼", jpg: "🖼", jpeg: "🖼",
    gif: "🖼", webp: "🖼", mp4: "🎬", mov: "🎬", mp3: "🎵",
    wav: "🎵", zip: "🗜", rar: "🗜", txt: "📄", ai: "🎨",
    psd: "🎨", fig: "🎨", svg: "🎨"
  };
  return icons[ext] || "📄";
}

// ── ESC key closes modals ─────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay:not(.hidden)").forEach(m => m.classList.add("hidden"));
    document.getElementById("notif-panel").classList.add("hidden");
  }
});

console.log("🚀 HianStudios Workspace loaded.");
