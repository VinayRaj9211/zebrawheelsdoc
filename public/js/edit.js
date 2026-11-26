(function () {
  const { esc } = window.ZWFormat;
  const DRAFT_KEY = "zwdoc.editorDraft";

  const companyInput = document.getElementById("company");
  const addressInput = document.getElementById("address");
  const mobileInput = document.getElementById("mobile");
  const termsInput = document.getElementById("terms");
  const localBody = document.getElementById("local-body");
  const outBody = document.getElementById("out-body");
  const table = document.getElementById("rate-table");
  const editorError = document.getElementById("editor-error");
  const addToggle = document.getElementById("add-toggle");
  const draftActions = document.getElementById("draft-actions");
  const movebar = document.getElementById("movebar");
  const moveLabel = document.getElementById("move-label");

  let doc = null;
  let dirty = false;
  let ready = false;
  let keepDraft = true;
  let draftsOpen = false;
  let pendingDrafts = null;
  let persistTimer = null;
  let armed = null;
  let flash = { local: -1, out: -1 };

  companyInput.addEventListener("input", () => {
    if (!doc) return;
    doc.company = companyInput.value;
    document.getElementById("sign-right").textContent = "FOR " + companyInput.value;
    dirty = true;
    schedulePersist();
  });
  addressInput.addEventListener("input", () => {
    if (!doc) return;
    doc.address = addressInput.value;
    dirty = true;
    schedulePersist();
  });
  mobileInput.addEventListener("input", () => {
    if (!doc) return;
    doc.mobile = mobileInput.value;
    dirty = true;
    schedulePersist();
  });
  termsInput.addEventListener("input", () => {
    if (!doc) return;
    doc.terms = termsInput.value.split("\n");
    dirty = true;
    schedulePersist();
  });
  addToggle.addEventListener("click", () => {
    draftsOpen = !draftsOpen;
    editorError.textContent = "";
    renderRows();
  });
  document.getElementById("cancel-drafts").addEventListener("click", () => {
    draftsOpen = false;
    editorError.textContent = "";
    renderRows();
  });
  document.getElementById("commit-drafts").addEventListener("click", () => {
    const result = commitDrafts(false);
    if (!result.ok) editorError.textContent = result.error;
  });
  document.getElementById("save-button").addEventListener("click", save);
  document.getElementById("back-link").addEventListener("click", leaveEditor);
  table.addEventListener("input", onCellInput);
  table.addEventListener("click", onTableClick);
  document.getElementById("move-up").addEventListener("click", () => armed && move(armed.section, armed.index, -1));
  document.getElementById("move-down").addEventListener("click", () => armed && move(armed.section, armed.index, 1));
  document.getElementById("move-done").addEventListener("click", () => {
    armed = null;
    renderArmed();
    updateMoveBar();
  });
  document.getElementById("move-remove").addEventListener("click", () => {
    if (!armed) return;
    removeRow(armed.section, armed.index);
  });
  window.addEventListener("resize", updateMoveBar);
  window.addEventListener("pagehide", () => {
    if (!keepDraft || !doc || !ready) return;
    persistDraft({ keepalive: true });
  });

  boot();

  async function boot() {
    const me = await fetch("/api/me?editing=1", { credentials: "same-origin" });
    if (!me.ok) {
      window.location.href = "/";
      return;
    }
    const meData = await me.json();
    if (!meData.editUnlocked) {
      window.location.href = "/";
      return;
    }
    const res = await fetch("/api/versions", { credentials: "same-origin" });
    if (!res.ok) {
      window.location.href = "/";
      return;
    }
    const data = await res.json();
    const latest = data.versions[0];
    const draft = await loadDraft();
    if (draft) applyState(draft, true);
    else applyState(latest, false);
    ready = true;
  }

  function applyState(source, restored) {
    doc = {
      company: source.company || "",
      address: source.address || "",
      mobile: source.mobile || "",
      localRows: (source.localRows || []).map((row) => copyRow(row, "local")),
      outstationRows: (source.outstationRows || []).map((row) => copyRow(row, "out")),
      terms: [...(source.terms || [])],
    };
    draftsOpen = restored ? Boolean(source.draftsOpen) : false;
    pendingDrafts = restored
      ? {
          local: source.draftLocal ? copyRow(source.draftLocal, "local") : null,
          out: source.draftOut ? copyRow(source.draftOut, "out") : null,
        }
      : null;
    companyInput.value = doc.company;
    addressInput.value = doc.address;
    mobileInput.value = doc.mobile;
    termsInput.value = doc.terms.join("\n");
    document.getElementById("sign-right").textContent = "FOR " + doc.company;
    const note = document.getElementById("restore-note");
    note.hidden = !restored;
    renderRows();
    dirty = restored;
  }

  function copyRow(row, kind) {
    const vehicle = String((row && row.vehicle) || "").trim().toUpperCase();
    if (kind === "local") {
      return {
        vehicle,
        fullDay: (row && row.fullDay) || "",
        trip12: (row && row.trip12) || "",
        extraKm: (row && row.extraKm) || "",
        extraHrs: (row && row.extraHrs) || "",
        night: (row && row.night) || "",
      };
    }
    return {
      vehicle,
      extraKm: (row && row.extraKm) || "",
      night: (row && row.night) || "",
    };
  }

  function upperName(value) {
    return String(value || "").toUpperCase();
  }

  async function loadDraft() {
    let local = null;
    try {
      local = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    } catch (error) {
      local = null;
    }
    let remote = null;
    try {
      const res = await fetch("/api/draft", { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        remote = data.draft || null;
      }
    } catch (error) {
      remote = null;
    }
    if (!local) return remote;
    if (!remote) return local;
    return new Date(local.savedAt || 0) >= new Date(remote.savedAt || 0) ? local : remote;
  }

  function snapshot() {
    return {
      company: companyInput.value,
      address: addressInput.value,
      mobile: mobileInput.value,
      localRows: doc.localRows,
      outstationRows: doc.outstationRows,
      terms: termsInput.value.split("\n"),
      draftsOpen,
      draftLocal: readDraft("local"),
      draftOut: readDraft("out"),
      savedAt: new Date().toISOString(),
    };
  }

  function persistDraft(options) {
    if (!doc || !keepDraft) return Promise.resolve();
    const state = snapshot();
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    return fetch("/api/draft", {
      method: "POST",
      credentials: "same-origin",
      keepalive: Boolean(options && options.keepalive),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    }).catch(() => {});
  }

  function schedulePersist() {
    if (!ready || !keepDraft || !doc) return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => persistDraft(), 300);
  }

  async function leaveEditor(event) {
    event.preventDefault();
    clearTimeout(persistTimer);
    await persistDraft();
    window.location.href = "/";
  }

  async function clearStoredDraft() {
    keepDraft = false;
    clearTimeout(persistTimer);
    sessionStorage.removeItem(DRAFT_KEY);
    await fetch("/api/draft", { method: "DELETE", credentials: "same-origin", keepalive: true }).catch(() => {});
  }

  function rowsOf(section) {
    return section === "local" ? doc.localRows : doc.outstationRows;
  }

  function renderRows() {
    const drafts = pendingDrafts || readDrafts();
    pendingDrafts = null;
    localBody.innerHTML = doc.localRows.map((row, index) => dataRow("local", row, index)).join("") +
      (draftsOpen ? draftRow("local") : "");
    outBody.innerHTML = `<tr class="split"><td class="split-cell" colspan="7">Outstation</td></tr>` +
      doc.outstationRows.map((row, index) => dataRow("out", row, index)).join("") +
      (draftsOpen ? draftRow("out") : "");
    if (drafts.local) fillDraft("local", drafts.local);
    if (drafts.out) fillDraft("out", drafts.out);
    addToggle.textContent = draftsOpen ? "Close new rows" : "+ Add row";
    draftActions.hidden = !draftsOpen;
    flash = { local: -1, out: -1 };
    renderArmed();
    updateMoveBar();
    document.querySelectorAll("tr.just-added").forEach((row) => {
      setTimeout(() => row.classList.remove("just-added"), 1600);
    });
  }

  function dataRow(section, row, index) {
    const flashed = (section === "local" ? flash.local : flash.out) === index ? " just-added" : "";
    const up = index === 0 ? "disabled" : "";
    const down = index === rowsOf(section).length - 1 ? "disabled" : "";
    if (section === "local") {
      return `<tr data-section="local" data-index="${index}" class="${flashed.trim()}">
        <td>${cell("vehicle", row.vehicle, "Vehicle")}</td>
        <td>${cell("fullDay", row.fullDay, "8 hours / 80 km")}</td>
        <td>${cell("trip12", row.trip12, "12 hrs / 200 km")}</td>
        <td>${cell("extraKm", row.extraKm, "Extra km")}</td>
        <td>${cell("extraHrs", row.extraHrs, "Extra hours")}</td>
        <td>${cell("night", row.night, "Night charges")}</td>
        ${actions(up, down)}
      </tr>`;
    }
    return `<tr data-section="out" data-index="${index}" class="${flashed.trim()}">
      <td>${cell("vehicle", row.vehicle, "Vehicle")}</td>
      <td colspan="2" class="out">OUT-STATION</td>
      <td>${cell("extraKm", row.extraKm, "Extra km")}</td>
      <td>---</td>
      <td>${cell("night", row.night, "Night charges")}</td>
      ${actions(up, down)}
    </tr>`;
  }

  function cell(field, value, label) {
    const mode = field === "vehicle" ? "text" : "decimal";
    return `<input class="cell-input" data-field="${field}" value="${esc(value)}" aria-label="${label}" inputmode="${mode}" autocomplete="off">`;
  }

  function actions(up, down) {
    return `<td class="row-actions actions-col">
      <button type="button" class="row-btn" data-move="up" ${up}>Up</button>
      <button type="button" class="row-btn" data-move="down" ${down}>Down</button>
      <button type="button" class="row-btn danger" data-remove="1">Delete</button>
    </td>`;
  }

  function draftRow(section) {
    if (section === "local") {
      return `<tr class="draft" data-draft="local">
        <td><span class="draft-tag">Local cost</span><input class="cell-input" data-draft-field="vehicle" placeholder="Vehicle" aria-label="Local vehicle" autocomplete="off"></td>
        <td><input class="cell-input" data-draft-field="fullDay" inputmode="decimal" placeholder="₹" aria-label="Local 8 hours / 80 km" autocomplete="off"></td>
        <td><input class="cell-input" data-draft-field="trip12" inputmode="decimal" placeholder="₹" aria-label="Local 12 hrs / 200 km" autocomplete="off"></td>
        <td><input class="cell-input" data-draft-field="extraKm" inputmode="decimal" placeholder="₹" aria-label="Local extra km" autocomplete="off"></td>
        <td><input class="cell-input" data-draft-field="extraHrs" inputmode="decimal" placeholder="₹" aria-label="Local extra hours" autocomplete="off"></td>
        <td><input class="cell-input" data-draft-field="night" inputmode="decimal" placeholder="₹" aria-label="Local night charges" autocomplete="off"></td>
        ${actions("", "disabled")}
      </tr>`;
    }
    return `<tr class="draft" data-draft="out">
      <td><span class="draft-tag">Outstation cost</span><input class="cell-input" data-draft-field="vehicle" placeholder="Vehicle" aria-label="Outstation vehicle" autocomplete="off"></td>
      <td colspan="2" class="out">OUT-STATION</td>
      <td><input class="cell-input" data-draft-field="extraKm" inputmode="decimal" placeholder="₹" aria-label="Outstation extra km" autocomplete="off"></td>
      <td>---</td>
      <td><input class="cell-input" data-draft-field="night" inputmode="decimal" placeholder="₹" aria-label="Outstation night charges" autocomplete="off"></td>
      ${actions("", "disabled")}
    </tr>`;
  }

  function readDrafts() {
    return { local: readDraft("local"), out: readDraft("out") };
  }

  function readDraft(section) {
    const row = document.querySelector(`tr[data-draft="${section}"]`);
    if (!row) return null;
    const values = {};
    row.querySelectorAll("[data-draft-field]").forEach((input) => {
      values[input.dataset.draftField] = input.value;
    });
    return values;
  }

  function fillDraft(section, values) {
    const row = document.querySelector(`tr[data-draft="${section}"]`);
    if (!row) return;
    row.querySelectorAll("[data-draft-field]").forEach((input) => {
      if (values[input.dataset.draftField] != null) input.value = values[input.dataset.draftField];
    });
  }

  function commitDrafts(silentEmpty) {
    if (!draftsOpen) return { ok: true };
    const local = readDraft("local") || {};
    const out = readDraft("out") || {};
    const localHas = Object.values(local).some((value) => String(value).trim());
    const outHas = Object.values(out).some((value) => String(value).trim());
    if (localHas && !String(local.vehicle || "").trim()) {
      return { ok: false, error: "Enter a vehicle name for the local cost row." };
    }
    if (outHas && !String(out.vehicle || "").trim()) {
      return { ok: false, error: "Enter a vehicle name for the outstation cost row." };
    }
    if (!localHas && !outHas) {
      if (!silentEmpty) return { ok: false, error: "Enter a vehicle name in the row you want to add." };
      draftsOpen = false;
      renderRows();
      return { ok: true };
    }
    flash = { local: -1, out: -1 };
    if (localHas) {
      doc.localRows.push(copyRow(local, "local"));
      flash.local = doc.localRows.length - 1;
    }
    if (outHas) {
      doc.outstationRows.push(copyRow(out, "out"));
      flash.out = doc.outstationRows.length - 1;
    }
    draftsOpen = false;
    dirty = true;
    editorError.textContent = "";
    renderRows();
    schedulePersist();
    const target = document.querySelector("tr.just-added");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return { ok: true };
  }

  function onCellInput(event) {
    const input = event.target;
    if (input.dataset.field === "vehicle" || input.dataset.draftField === "vehicle") forceUpper(input);
    const field = input.dataset.field;
    if (!field || !doc) {
      if (input.dataset.draftField) {
        dirty = true;
        schedulePersist();
      }
      return;
    }
    const row = input.closest("tr");
    const list = rowsOf(row.dataset.section);
    list[Number(row.dataset.index)][field] = input.value;
    dirty = true;
    schedulePersist();
    if (armed && armed.section === row.dataset.section && armed.index === Number(row.dataset.index) && field === "vehicle") {
      moveLabel.textContent = input.value || "Row";
    }
  }

  function forceUpper(input) {
    const upper = upperName(input.value);
    if (input.value === upper) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = upper;
    if (start != null) input.setSelectionRange(start, end);
  }

  function onTableClick(event) {
    const moveButton = event.target.closest("[data-move]");
    const removeButton = event.target.closest("[data-remove]");
    const draft = event.target.closest("tr[data-draft]");
    if (draft) {
      onDraftAction(draft.dataset.draft, moveButton, removeButton);
      return;
    }
    const row = event.target.closest("tr[data-index]");
    if (!row) return;
    if (moveButton && !moveButton.disabled) move(row.dataset.section, Number(row.dataset.index), moveButton.dataset.move === "up" ? -1 : 1);
    if (removeButton) removeRow(row.dataset.section, Number(row.dataset.index));
  }

  function onDraftAction(section, moveButton, removeButton) {
    if (removeButton) {
      clearDraftRow(section);
      return;
    }
    if (!moveButton || moveButton.disabled) return;
    const before = rowsOf(section).length;
    const result = commitDrafts(false);
    if (!result.ok) {
      editorError.textContent = result.error;
      return;
    }
    const after = rowsOf(section).length;
    if (after > before) move(section, after - 1, moveButton.dataset.move === "up" ? -1 : 1);
  }

  function clearDraftRow(section) {
    const label = section === "local" ? "local cost row" : "outstation cost row";
    if (!window.confirm(`Delete this ${label}?`)) return;
    const row = document.querySelector(`tr[data-draft="${section}"]`);
    if (row) row.querySelectorAll("input").forEach((input) => {
      input.value = "";
    });
    const localHas = Object.values(readDraft("local") || {}).some((value) => String(value).trim());
    const outHas = Object.values(readDraft("out") || {}).some((value) => String(value).trim());
    if (!localHas && !outHas) {
      draftsOpen = false;
      renderRows();
    }
    dirty = true;
    schedulePersist();
  }

  function move(section, index, delta) {
    const rows = rowsOf(section);
    const next = index + delta;
    if (next < 0 || next >= rows.length) return;
    const [item] = rows.splice(index, 1);
    rows.splice(next, 0, item);
    dirty = true;
    flash = { local: -1, out: -1 };
    if (armed && armed.section === section && armed.index === index) armed = { section, index: next };
    renderRows();
    schedulePersist();
    const moved = document.querySelector(`tr[data-section="${section}"][data-index="${next}"]`);
    if (moved) moved.scrollIntoView({ block: "nearest" });
  }

  function removeRow(section, index) {
    const rows = rowsOf(section);
    const vehicle = rows[index] && rows[index].vehicle;
    const name = vehicle ? `“${vehicle}”` : "this row";
    if (!window.confirm(`Delete ${name}?`)) return;
    rows.splice(index, 1);
    dirty = true;
    schedulePersist();
    if (armed && armed.section === section) {
      if (armed.index === index) armed = null;
      else if (armed.index > index) armed.index -= 1;
    }
    renderRows();
  }

  function bindPress() {
    document.querySelectorAll("#rate-table tr[data-index]").forEach((row) => {
      let timer = null;
      let startX = 0;
      let startY = 0;
      const cancel = () => {
        clearTimeout(timer);
        timer = null;
      };
      row.addEventListener("pointerdown", (event) => {
        if (!window.matchMedia("(max-width: 820px)").matches) return;
        if (event.target.closest("button, a")) return;
        startX = event.clientX;
        startY = event.clientY;
        timer = setTimeout(() => {
          timer = null;
          armed = { section: row.dataset.section, index: Number(row.dataset.index) };
          renderArmed();
          updateMoveBar();
          if (navigator.vibrate) navigator.vibrate(18);
        }, 520);
      });
      row.addEventListener("pointermove", (event) => {
        if (!timer) return;
        if (Math.hypot(event.clientX - startX, event.clientY - startY) > 14) cancel();
      });
      row.addEventListener("pointerup", cancel);
      row.addEventListener("pointercancel", cancel);
      row.addEventListener("contextmenu", (event) => {
        if (window.matchMedia("(max-width: 820px)").matches) event.preventDefault();
      });
    });
  }

  function renderArmed() {
    document.querySelectorAll("#rate-table tr[data-index]").forEach((row) => {
      const on = armed && row.dataset.section === armed.section && Number(row.dataset.index) === armed.index;
      row.classList.toggle("is-armed", Boolean(on));
    });
  }

  function updateMoveBar() {
    const mobile = window.matchMedia("(max-width: 820px)").matches;
    if (!armed || !mobile || !doc) {
      movebar.hidden = true;
      document.body.classList.remove("is-moving");
      return;
    }
    const rows = rowsOf(armed.section);
    const row = rows[armed.index];
    if (!row) {
      armed = null;
      movebar.hidden = true;
      document.body.classList.remove("is-moving");
      return;
    }
    movebar.hidden = false;
    document.body.classList.add("is-moving");
    moveLabel.textContent = row.vehicle || "Row";
    document.getElementById("move-up").disabled = armed.index === 0;
    document.getElementById("move-down").disabled = armed.index === rows.length - 1;
  }

  async function save() {
    editorError.textContent = "";
    const committed = commitDrafts(true);
    if (!committed.ok) {
      editorError.textContent = committed.error;
      return;
    }
    const button = document.getElementById("save-button");
    button.disabled = true;
    try {
      const res = await fetch("/api/versions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: companyInput.value,
          address: addressInput.value,
          mobile: mobileInput.value,
          localRows: doc.localRows,
          outstationRows: doc.outstationRows,
          terms: termsInput.value.split("\n"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        editorError.textContent = data.error || "The update could not be saved.";
        return;
      }
      dirty = false;
      await clearStoredDraft();
      window.location.href = "/";
    } catch (error) {
      editorError.textContent = "Could not reach the app. Try again.";
    } finally {
      button.disabled = false;
    }
  }
})();
