(function () {
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function formatMoney(value) {
    const v = String(value ?? "").trim();
    if (!v) return "";
    if (v === "---" || v === "--" || v === "-" || v === "–") return "---";
    if (/^₹/.test(v) || /^rs\.?/i.test(v)) return v;
    if (/^\d+(\.\d+)?$/.test(v)) return "₹" + v;
    return v;
  }

  function formatWhen(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }

  window.ZWFormat = { esc, formatMoney, formatWhen };
})();
