const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const regularPath = path.join(__dirname, "fonts", "NotoSans-Regular.ttf");
const boldPath = path.join(__dirname, "fonts", "NotoSans-Bold.ttf");

function formatMoney(value) {
  const v = String(value ?? "").trim();
  if (!v) return "";
  if (v === "---" || v === "--" || v === "-" || v === "–") return "---";
  if (/^₹/.test(v) || /^rs\.?/i.test(v)) return v;
  if (/^\d+(\.\d+)?$/.test(v)) return "₹" + v;
  return v;
}

function termText(value) {
  return String(value ?? "").replace(/^\d+\.\s*/, "").trim();
}

function buildPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: "Zebra Wheels Travels Rate List",
        Author: data.company || "Zebra Wheels Travels",
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.registerFont("Regular", regularPath);
    doc.registerFont("Bold", boldPath);
    draw(doc, data);
    const range = doc.bufferedPageRange();
    if (range.count > 1) {
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        doc.font("Regular").fontSize(8).fillColor("#000");
        doc.text(`${i + 1} / ${range.count}`, 40, doc.page.height - 38, {
          width: doc.page.width - 80,
          align: "center",
          lineBreak: false,
        });
      }
    }
    doc.end();
  });
}

function pageBorder(doc) {
  doc.save();
  doc.lineWidth(1).strokeColor("#000");
  doc.rect(22, 22, doc.page.width - 44, doc.page.height - 44).stroke();
  doc.restore();
}

function textHeight(doc, text, width, font, size) {
  doc.font(font).fontSize(size);
  return doc.heightOfString(String(text), { width: width - 8, align: "center" });
}

function draw(doc, data) {
  const widths = [90, 86, 90, 78, 82, 94];
  const tableWidth = widths.reduce((sum, w) => sum + w, 0);
  const x0 = (doc.page.width - tableWidth) / 2;
  const bottom = () => doc.page.height - 48;
  let y = 48;

  pageBorder(doc);

  function newPage() {
    doc.addPage();
    pageBorder(doc);
    y = 48;
  }

  function need(height) {
    if (y + height > bottom()) newPage();
  }

  doc.fillColor("#000");
  doc.font("Bold").fontSize(22);
  doc.text(data.company || "ZEBRA WHEELS TRAVELS", 40, y, {
    width: doc.page.width - 80,
    align: "center",
  });
  y = doc.y + 8;
  doc.font("Regular").fontSize(11);
  doc.text(data.address || "", 40, y, {
    width: doc.page.width - 80,
    align: "center",
  });
  y = doc.y + 6;
  doc.text(`MOBILE No:- ${data.mobile || ""}`, 40, y, {
    width: doc.page.width - 80,
    align: "center",
  });
  y = doc.y + 12;
  doc.font("Bold").fontSize(14);
  doc.text("RATE LIST", 40, y, {
    width: doc.page.width - 80,
    align: "center",
  });
  y = doc.y + 14;
  doc.font("Regular").fontSize(13);
  doc.text("LOCAL CHARGES:", x0, y, { lineBreak: false });
  y += 22;

  const headers = [
    "TYPES OF\nVEHICLE",
    "8HOURS/80KM\nFULL DAY",
    "12HRS/200KM",
    "EXTRA\nKM(per km)",
    "EXTRA HRS\n(per hour)",
    "NIGHT\nCHARGES (per\nnight)",
  ];

  function drawCells(cells, fontSize, fontName, minHeight) {
    let height = minHeight;
    let cursor = 0;
    cells.forEach((cell) => {
      const span = cell.span || 1;
      const width = widths.slice(cursor, cursor + span).reduce((sum, w) => sum + w, 0);
      cursor += span;
      height = Math.max(height, textHeight(doc, cell.text, width, cell.font || fontName, cell.size || fontSize) + 8);
    });
    if (y + height > bottom()) {
      newPage();
      drawHeader();
    }
    let x = x0;
    cursor = 0;
    doc.lineWidth(0.8).strokeColor("#000").fillColor("#000");
    cells.forEach((cell) => {
      const span = cell.span || 1;
      const width = widths.slice(cursor, cursor + span).reduce((sum, w) => sum + w, 0);
      cursor += span;
      const font = cell.font || fontName;
      const size = cell.size || fontSize;
      doc.rect(x, y, width, height).stroke();
      const inner = width - 8;
      const th = textHeight(doc, cell.text, width, font, size);
      doc.font(font).fontSize(size).text(String(cell.text), x + 4, y + Math.max(3, (height - th) / 2), {
        width: inner,
        align: "center",
      });
      x += width;
    });
    y += height;
  }

  function drawHeader() {
    drawCells(
      headers.map((text) => ({ text, font: "Bold", size: 8.5 })),
      8.5,
      "Bold",
      36
    );
  }

  drawHeader();

  (data.localRows || []).forEach((row) => {
    drawCells(
      [
        { text: row.vehicle },
        { text: formatMoney(row.fullDay) },
        { text: formatMoney(row.trip12) },
        { text: formatMoney(row.extraKm) },
        { text: formatMoney(row.extraHrs) },
        { text: formatMoney(row.night) },
      ],
      11,
      "Regular",
      24
    );
  });

  (data.outstationRows || []).forEach((row) => {
    drawCells(
      [
        { text: row.vehicle },
        { text: "OUT-STATION", span: 2, size: 12 },
        { text: formatMoney(row.extraKm) },
        { text: "---" },
        { text: formatMoney(row.night) },
      ],
      11,
      "Regular",
      24
    );
  });

  y += 18;
  need(28);
  doc.font("Regular").fontSize(13).fillColor("#000");
  doc.text("Terms & Condition", x0, y, { lineBreak: false });
  y += 22;

  const terms = (data.terms || []).map(termText).filter(Boolean);
  terms.forEach((term, index) => {
    const line = `${index + 1}. ${term}`;
    doc.font("Regular").fontSize(10);
    const height = doc.heightOfString(line, { width: tableWidth });
    need(height + 4);
    doc.text(line, x0, y, { width: tableWidth });
    y = doc.y + 3;
  });

  y += 16;
  const boxW = 168;
  const boxH = 78;
  if (y + boxH > doc.page.height - 40) {
    newPage();
    y = 48;
  }
  const lowest = doc.page.height - 50 - boxH;
  if (y < lowest) y = lowest;
  const rightX = x0 + tableWidth - boxW;
  doc.lineWidth(1).rect(x0, y, boxW, boxH).stroke();
  doc.lineWidth(1).rect(rightX, y, boxW, boxH).stroke();
  doc.font("Regular").fontSize(11);
  doc.text("Provided By", x0 + 8, y + 8, { width: boxW - 16, lineBreak: false });
  doc.text("FOR " + (data.company || "ZEBRA WHEELS TRAVELS"), rightX + 8, y + 8, {
    width: boxW - 16,
    align: "center",
    lineBreak: false,
  });
}

module.exports = { buildPdf, formatMoney };

if (require.main === module) {
  console.log("pdf fonts", fs.existsSync(regularPath), fs.existsSync(boldPath));
}
