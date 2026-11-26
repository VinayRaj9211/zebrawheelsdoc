(function () {
  const { esc } = window.ZWFormat;
  const upIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const downIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const removeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12M9 7V5h6v2m-7 3 1 9h6l1-9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
  let draftsOpen = false;
  let armed = null;
  let flash = { local: -1, out: -1 };

  companyInput.addEventListener("input", () => {
    if (!doc) return;
    doc.company = companyInput.value;
    document.getElementById("sign-right").textContent = "FOR " + companyInput.value;
    dirty = true;
  });
  addressInput.addEventListener("input", () => {
    if (!doc) return;
    doc.address = addressInput.value;
    dirty = true;
  });
  mobileInput.addEventListener("input", () => {
    if (!doc) return;
    doc.mobile = mobileInput.value;
    dirty = true;
  });
  termsInput.addEventListener("input", () => {
    if (!doc) return;
    doc.terms = termsInput.value.split("\n");
    dirty = true;
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
  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
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
    doc = {
      company: latest.company || "",
      address: latest.address || "",
      mobile: latest.mobile || "",
      localRows: (latest.localRows || []).map((row) => ({ ...row })),
      outstationRows: (latest.outstationRows || []).map((row) => ({ ...row })),
      terms: [...(latest.terms || [])],
    };
    companyInput.value = doc.company;
    addressInput.value = doc.address;
    mobileInput.value = doc.mobile;
    termsInput.value = doc.terms.join("\n");
    document.getElementById("sign-right").textContent = "FOR " + doc.company;
    renderRows();
    dirty = false;
  }

  function rowsOf(section) {
    return section === "local" ? doc.localRows : doc.outstationRows;
  }

  function renderRows() {
    const drafts = readDrafts();
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
    bindPress();
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
      <button type="button" class="icon-btn" data-move="up" aria-label="Move up" ${up}>${upIcon}</button>
      <button type="button" class="icon-btn" data-move="down" aria-label="Move down" ${down}>${downIcon}</button>
      <button type="button" class="icon-btn danger" data-remove="1" aria-label="Remove row">${removeIcon}</button>
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
        <td class="row-actions actions-col"></td>
      </tr>`;
    }
    return `<tr class="draft" data-draft="out">
      <td><span class="draft-tag">Outstation cost</span><input class="cell-input" data-draft-field="vehicle" placeholder="Vehicle" aria-label="Outstation vehicle" autocomplete="off"></td>
      <td colspan="2" class="out">OUT-STATION</td>
      <td><input class="cell-input" data-draft-field="extraKm" inputmode="decimal" placeholder="₹" aria-label="Outstation extra km" autocomplete="off"></td>
      <td>---</td>
      <td><input class="cell-input" data-draft-field="night" inputmode="decimal" placeholder="₹" aria-label="Outstation night charges" autocomplete="off"></td>
      <td class="row-actions actions-col"></td>
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
      doc.localRows.push({
        vehicle: local.vehicle.trim(),
        fullDay: local.fullDay || "",
        trip12: local.trip12 || "",
        extraKm: local.extraKm || "",
        extraHrs: local.extraHrs || "",
        night: local.night || "",
      });
      flash.local = doc.localRows.length - 1;
    }
    if (outHas) {
      doc.outstationRows.push({
        vehicle: out.vehicle.trim(),
        extraKm: out.extraKm || "",
        night: out.night || "",
      });
      flash.out = doc.outstationRows.length - 1;
    }
    draftsOpen = false;
    dirty = true;
    editorError.textContent = "";
    renderRows();
    const target = document.querySelector("tr.just-added");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return { ok: true };
  }

  function onCellInput(event) {
    const field = event.target.dataset.field;
    if (!field || !doc) return;
    const row = event.target.closest("tr");
    const list = rowsOf(row.dataset.section);
    list[Number(row.dataset.index)][field] = event.target.value;
    dirty = true;
    if (armed && armed.section === row.dataset.section && armed.index === Number(row.dataset.index) && field === "vehicle") {
      moveLabel.textContent = event.target.value || "Row";
    }
  }

  function onTableClick(event) {
    const moveButton = event.target.closest("[data-move]");
    const removeButton = event.target.closest("[data-remove]");
    const row = event.target.closest("tr[data-index]");
    if (!row) return;
    if (moveButton && !moveButton.disabled) move(row.dataset.section, Number(row.dataset.index), moveButton.dataset.move === "up" ? -1 : 1);
    if (removeButton) removeRow(row.dataset.section, Number(row.dataset.index));
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
    const moved = document.querySelector(`tr[data-section="${section}"][data-index="${next}"]`);
    if (moved) moved.scrollIntoView({ block: "nearest" });
  }

  function removeRow(section, index) {
    const rows = rowsOf(section);
    const vehicle = rows[index] && rows[index].vehicle;
    if (!window.confirm(`Remove ${vehicle || "this row"}?`)) return;
    rows.splice(index, 1);
    dirty = true;
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
      window.location.href = "/";
    } catch (error) {
      editorError.textContent = "Could not reach the app. Try again.";
    } finally {
      button.disabled = false;
    }
  }
})();
