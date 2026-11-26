(function () {
  const { esc, formatMoney } = window.ZWFormat;

  function termLine(value) {
    return esc(String(value ?? "").replace(/^\d+\.\s*/, ""));
  }

  function renderSheet(doc) {
    const local = (doc.localRows || [])
      .map(
        (row) => `<tr>
          <td>${esc(row.vehicle)}</td>
          <td>${esc(formatMoney(row.fullDay))}</td>
          <td>${esc(formatMoney(row.trip12))}</td>
          <td>${esc(formatMoney(row.extraKm))}</td>
          <td>${esc(formatMoney(row.extraHrs))}</td>
          <td>${esc(formatMoney(row.night))}</td>
        </tr>`
      )
      .join("");
    const outstation = (doc.outstationRows || [])
      .map(
        (row) => `<tr>
          <td>${esc(row.vehicle)}</td>
          <td colspan="2" class="out">OUT-STATION</td>
          <td>${esc(formatMoney(row.extraKm))}</td>
          <td>---</td>
          <td>${esc(formatMoney(row.night))}</td>
        </tr>`
      )
      .join("");
    const terms = (doc.terms || []).map((term) => `<li>${termLine(term)}</li>`).join("");
    return `<article class="sheet readonly">
      <h1 class="doc-title">${esc(doc.company)}</h1>
      <p class="doc-address">${esc(doc.address)}</p>
      <p class="doc-mobile">MOBILE No:- ${esc(doc.mobile)}</p>
      <h2 class="doc-rate">RATE LIST</h2>
      <h3 class="doc-local">LOCAL CHARGES:</h3>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>TYPES OF<br>VEHICLE</th>
              <th>8HOURS/80KM<br>FULL DAY</th>
              <th>12HRS/200KM</th>
              <th>EXTRA<br>KM(per km)</th>
              <th>EXTRA HRS<br>(per hour)</th>
              <th>NIGHT<br>CHARGES (per night)</th>
            </tr>
          </thead>
          <tbody>${local}${outstation}</tbody>
        </table>
      </div>
      <h3 class="doc-terms">Terms &amp; Condition</h3>
      <ol class="terms">${terms}</ol>
      <div class="signs">
        <div class="sign">Provided By</div>
        <div class="sign">FOR ${esc(doc.company)}</div>
      </div>
    </article>`;
  }

  window.ZWSheet = { renderSheet };
})();
