(function () {
  const { esc, formatWhen } = window.ZWFormat;
  const { renderSheet } = window.ZWSheet;

  const loginScreen = document.getElementById("login-screen");
  const homeScreen = document.getElementById("home-screen");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const loginButton = document.getElementById("login-button");
  const preview = document.getElementById("preview");
  const updateList = document.getElementById("update-list");
  const whenLabel = document.getElementById("when-label");
  const olderNote = document.getElementById("older-note");
  const editButton = document.getElementById("edit-button");
  const downloadButton = document.getElementById("download-button");
  const modal = document.getElementById("modal");
  const passcodeForm = document.getElementById("passcode-form");
  const passcodeInput = document.getElementById("passcode");
  const passcodeError = document.getElementById("passcode-error");
  const passcodeCard = modal.querySelector(".modal-card");

  const icons = {
    view: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  let versions = [];
  let currentId = "";
  let pending = null;

  loginForm.addEventListener("submit", onLogin);
  document.getElementById("logout").addEventListener("click", logout);
  editButton.addEventListener("click", () => openPasscode({ type: "edit" }));
  downloadButton.addEventListener("click", () => openPasscode({ type: "download", id: currentId }));
  passcodeForm.addEventListener("submit", onPasscode);
  document.getElementById("passcode-cancel").addEventListener("click", closePasscode);
  updateList.addEventListener("click", onListClick);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closePasscode();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closePasscode();
  });

  boot();

  async function boot() {
    const me = await fetch("/api/me", { credentials: "same-origin" });
    if (!me.ok) {
      showLogin();
      return;
    }
    const meData = await me.json();
    document.getElementById("signed-in").textContent = "Signed in as " + meData.user;
    await loadVersions();
  }

  function showLogin() {
    loginScreen.hidden = false;
    homeScreen.hidden = true;
  }

  async function onLogin(event) {
    event.preventDefault();
    loginError.textContent = "";
    loginButton.disabled = true;
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: document.getElementById("username").value,
          password: document.getElementById("password").value,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        loginError.textContent = data.error || "Incorrect username or password.";
        return;
      }
      document.getElementById("password").value = "";
      document.getElementById("signed-in").textContent = "Signed in as " + data.user;
      await loadVersions();
    } catch (error) {
      loginError.textContent = "Could not reach the app. Try again.";
    } finally {
      loginButton.disabled = false;
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    versions = [];
    showLogin();
  }

  async function loadVersions() {
    const res = await fetch("/api/versions", { credentials: "same-origin" });
    if (res.status === 401) {
      showLogin();
      return;
    }
    const data = await res.json();
    versions = data.versions || [];
    loginScreen.hidden = true;
    homeScreen.hidden = false;
    const params = new URLSearchParams(location.search);
    const requested = params.get("v");
    const match = versions.find((item) => item.id === requested);
    showVersion(match ? match.id : versions[0] && versions[0].id, false);
  }

  function showVersion(id, scroll) {
    const version = versions.find((item) => item.id === id) || versions[0];
    if (!version) return;
    currentId = version.id;
    const latest = versions[0];
    const isLatest = version.id === latest.id;
    whenLabel.textContent = (isLatest ? "Last updated · " : "Viewing update · ") + formatWhen(version.updatedAt);
    olderNote.hidden = isLatest;
    editButton.hidden = !isLatest;
    preview.innerHTML = renderSheet(version);
    updateList.innerHTML = versions
      .map((item, index) => {
        const active = item.id === currentId;
        const count = (item.localRows || []).length + (item.outstationRows || []).length;
        return `<li class="update${active ? " is-active" : ""}" data-id="${esc(item.id)}">
          <div class="update-text">
            <span class="when">${esc(formatWhen(item.updatedAt))}</span>
            ${index === 0 ? '<span class="badge">Latest</span>' : `<span class="badge">${count} vehicles</span>`}
          </div>
          <div class="update-actions">
            <button type="button" data-act="view" aria-label="View this update" aria-pressed="${active ? "true" : "false"}">${icons.view}</button>
            <button type="button" data-act="download" aria-label="Download this update">${icons.download}</button>
          </div>
        </li>`;
      })
      .join("");
    const url = new URL(location.href);
    url.searchParams.set("v", version.id);
    history.replaceState(null, "", url.pathname + url.search);
    if (scroll) preview.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onListClick(event) {
    const button = event.target.closest("button[data-act]");
    if (!button) return;
    const id = button.closest("[data-id]").dataset.id;
    if (button.dataset.act === "view") showVersion(id, true);
    if (button.dataset.act === "download") openPasscode({ type: "download", id });
  }

  function openPasscode(action) {
    pending = action;
    passcodeInput.value = "";
    passcodeError.textContent = "";
    passcodeCard.classList.remove("shake");
    modal.hidden = false;
    passcodeInput.focus();
  }

  function closePasscode() {
    modal.hidden = true;
    passcodeInput.value = "";
    pending = null;
  }

  async function onPasscode(event) {
    event.preventDefault();
    if (!pending) return;
    const passcode = passcodeInput.value;
    passcodeInput.value = "";
    passcodeError.textContent = "";
    const button = document.getElementById("passcode-continue");
    button.disabled = true;
    try {
      if (pending.type === "edit") {
        const res = await fetch("/api/unlock-edit", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          failPasscode(data.error || "Incorrect passcode.");
          return;
        }
        window.location.href = "/edit";
        return;
      }
      const res = await fetch("/api/download", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, id: pending.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        failPasscode(data.error || "Incorrect passcode.");
        return;
      }
      const blob = await res.blob();
      const header = res.headers.get("Content-Disposition") || "";
      const match = /filename="([^"]+)"/.exec(header);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = match ? match[1] : "Zebra-Wheels-Rate-List.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1500);
      closePasscode();
    } catch (error) {
      failPasscode("Could not finish that request.");
    } finally {
      button.disabled = false;
    }
  }

  function failPasscode(message) {
    passcodeError.textContent = message;
    passcodeCard.classList.remove("shake");
    void passcodeCard.offsetWidth;
    passcodeCard.classList.add("shake");
    passcodeInput.focus();
  }
})();
