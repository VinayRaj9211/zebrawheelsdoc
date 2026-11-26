const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const express = require("express");
const session = require("express-session");
const { buildPdf } = require("./pdf");

loadEnvFile(path.join(__dirname, ".env"));
loadEnvFile("C:\\xampp\\zwdoc-secrets\\.env");

const required = ["APP_USERNAME", "APP_PASSWORD", "APP_PASSCODE", "SESSION_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error("Missing configuration:", missing.join(", "));
  console.error("Add them to C:\\xampp\\zwdoc-secrets\\.env (this folder is outside the website).");
  process.exit(1);
}

const DATA_FILE = path.join(__dirname, "data", "documents.json");
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map();

const seed = {
  versions: [
    {
      id: "original",
      updatedAt: "2026-08-05T12:05:12.000Z",
      company: "ZEBRA WHEELS TRAVELS",
      address: "A 12 sector 24 Noida, Gautam Budha Nagar",
      mobile: "91 9211451112,8586858281",
      localRows: [
        { vehicle: "DZIRE", fullDay: "1600", trip12: "3000", extraKm: "13", extraHrs: "200", night: "300" },
        { vehicle: "ERTIGA", fullDay: "2500", trip12: "3800", extraKm: "16", extraHrs: "200", night: "300" },
        { vehicle: "KIA", fullDay: "2500", trip12: "4000", extraKm: "17", extraHrs: "200", night: "400" },
        { vehicle: "INNOVA CRYSTA", fullDay: "3000", trip12: "5000", extraKm: "20", extraHrs: "200", night: "400" },
      ],
      outstationRows: [
        { vehicle: "DZIRE", extraKm: "13", night: "400" },
        { vehicle: "ERTIGA", extraKm: "16", night: "400" },
        { vehicle: "KIA", extraKm: "17", night: "400" },
        { vehicle: "INNOVA CRYSTA", extraKm: "20", night: "400" },
      ],
      terms: [
        "Time & Km To be charge from garage.",
        "Toll tax / Parking & state permit tax will be Extra Charge.",
        "Outstation minimum 250Km per day Charge.",
        "Driver Charge for Outstation Rs. 400 per day.",
        "Local night Charges for extra between 22hrs to 0500hrs.",
        "After 4hrs, Full day Charge.",
        "After 10hrs, Double duty charge.",
        "Smoking & Drinking not Allowed in the Cab.",
        "Payment will be clear with in 15 days after submitted the Bill.",
        "company Will not be responsible for lost luggage & articles",
      ],
    },
  ],
};

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "200kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(
  session({
    name: "zwdoc.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 12 * 60 * 60 * 1000,
    },
  })
);

app.get("/favicon.ico", (req, res) => {
  res.redirect(302, "/favicon.svg");
});

app.post("/api/login", (req, res) => {
  if (locked(req, "login")) return res.status(429).json({ error: "Too many attempts. Please wait 15 minutes." });
  const username = String((req.body && req.body.username) || "").trim().toLowerCase();
  const password = String((req.body && req.body.password) || "");
  const userOk = safeEqual(username, String(process.env.APP_USERNAME).trim().toLowerCase());
  const passOk = safeEqual(password, String(process.env.APP_PASSWORD));
  if (!userOk || !passOk) {
    markFail(req, "login");
    return res.status(401).json({ error: "Incorrect username or password." });
  }
  markOk(req, "login");
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: "Could not sign in." });
    req.session.user = String(process.env.APP_USERNAME).trim();
    req.session.editUnlocked = false;
    req.session.save((saveError) => {
      if (saveError) return res.status(500).json({ error: "Could not sign in." });
      res.json({ ok: true, user: req.session.user });
    });
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("zwdoc.sid");
    res.json({ ok: true });
  });
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Sign in required." });
  const editing = req.query.editing === "1";
  if (!editing) req.session.editUnlocked = false;
  res.json({ user: req.session.user, editUnlocked: Boolean(req.session.editUnlocked) });
});

app.get("/api/versions", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Sign in required." });
  const store = readStore();
  res.json({ versions: store.versions });
});

app.post("/api/unlock-edit", (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Sign in required." });
  if (locked(req, "passcode")) return res.status(429).json({ error: "Too many attempts. Please wait 15 minutes." });
  const passcode = String((req.body && req.body.passcode) || "");
  if (!safeEqual(passcode, String(process.env.APP_PASSCODE))) {
    markFail(req, "passcode");
    return res.status(401).json({ error: "Incorrect passcode." });
  }
  markOk(req, "passcode");
  req.session.editUnlocked = true;
  req.session.save((error) => {
    if (error) return res.status(500).json({ error: "Could not open the editor." });
    res.json({ ok: true });
  });
});

app.post("/api/download", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Sign in required." });
  if (locked(req, "passcode")) return res.status(429).json({ error: "Too many attempts. Please wait 15 minutes." });
  const passcode = String((req.body && req.body.passcode) || "");
  if (!safeEqual(passcode, String(process.env.APP_PASSCODE))) {
    markFail(req, "passcode");
    return res.status(401).json({ error: "Incorrect passcode." });
  }
  markOk(req, "passcode");
  const store = readStore();
  const version = store.versions.find((item) => item.id === String((req.body && req.body.id) || ""));
  if (!version) return res.status(404).json({ error: "That update could not be found." });
  try {
    const pdf = await buildPdf(version);
    const filename = `Zebra-Wheels-Rate-List-${fileStamp(version.updatedAt)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.send(pdf);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "The PDF could not be created." });
  }
});

app.post("/api/versions", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Sign in required." });
  if (!req.session.editUnlocked) return res.status(403).json({ error: "Enter the passcode from the latest file before saving." });
  const normalized = normalizeDoc(req.body || {});
  if (normalized.error) return res.status(400).json({ error: normalized.error });
  const store = readStore();
  const version = {
    id: crypto.randomBytes(8).toString("hex"),
    updatedAt: new Date().toISOString(),
    ...normalized.doc,
  };
  store.versions.unshift(version);
  try {
    writeStore(store);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "The update could not be saved." });
  }
  res.json({ ok: true, version });
});

app.get("/edit", (req, res) => {
  if (!req.session.user || !req.session.editUnlocked) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "edit.html"));
});

app.use(express.static(path.join(__dirname, "public"), { index: "index.html" }));

const preferred = Number(process.env.PORT) || 8787;
listen(preferred);

function listen(port) {
  const server = app.listen(port, "0.0.0.0");
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && port < preferred + 20) {
      listen(port + 1);
      return;
    }
    console.error(error);
    process.exit(1);
  });
  server.on("listening", () => {
    const ips = lanAddresses();
    console.log("");
    console.log("Zebra Wheels rate list is running");
    console.log(`On this computer:  http://localhost:${port}`);
    ips.forEach((ip) => console.log(`On this Wi-Fi:      http://${ip}:${port}`));
    console.log("");
  });
}

function readStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return structuredClone(seed);
    const store = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (!store || !Array.isArray(store.versions) || !store.versions.length) return structuredClone(seed);
    store.versions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return store;
  } catch (error) {
    console.error(error);
    return structuredClone(seed);
  }
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.copyFileSync(tmp, DATA_FILE);
  fs.unlinkSync(tmp);
}

function normalizeDoc(input) {
  const company = clean(input.company, 80);
  const address = clean(input.address, 180);
  const mobile = clean(input.mobile, 80);
  if (!company) return { error: "Company name is required." };
  const localRows = asRows(input.localRows, "local");
  const outstationRows = asRows(input.outstationRows, "out");
  if (!localRows.length && !outstationRows.length) return { error: "Add at least one vehicle." };
  return {
    doc: {
      company,
      address,
      mobile,
      localRows,
      outstationRows,
      terms: asTerms(input.terms),
    },
  };
}

function asRows(list, kind) {
  if (!Array.isArray(list)) return [];
  return list
    .slice(0, 80)
    .map((row) => {
      const vehicle = clean(row && row.vehicle, 60);
      if (kind === "local") {
        return {
          vehicle,
          fullDay: cleanMoney(row && row.fullDay),
          trip12: cleanMoney(row && row.trip12),
          extraKm: cleanMoney(row && row.extraKm),
          extraHrs: cleanMoney(row && row.extraHrs),
          night: cleanMoney(row && row.night),
        };
      }
      return {
        vehicle,
        extraKm: cleanMoney(row && row.extraKm),
        night: cleanMoney(row && row.night),
      };
    })
    .filter((row) => row.vehicle);
}

function asTerms(terms) {
  const lines = Array.isArray(terms) ? terms : String(terms || "").split(/\n/);
  return lines
    .map((line) => clean(String(line).replace(/^\d+\.\s*/, ""), 240))
    .filter(Boolean)
    .slice(0, 40);
}

function clean(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanMoney(value) {
  return String(value ?? "")
    .replace(/₹/g, "")
    .replace(/,/g, "")
    .replace(/^rs\.?\s*/i, "")
    .replace(/\s+/g, "")
    .trim()
    .slice(0, 16);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function attemptKey(req, bucket) {
  return `${bucket}:${req.ip || "unknown"}`;
}

function locked(req, bucket) {
  const record = attempts.get(attemptKey(req, bucket));
  return Boolean(record && record.lockedUntil && record.lockedUntil > Date.now());
}

function markFail(req, bucket) {
  const key = attemptKey(req, bucket);
  const record = attempts.get(key) || { count: 0, lockedUntil: 0 };
  if (record.lockedUntil && record.lockedUntil > Date.now()) return;
  record.count += 1;
  if (record.count >= MAX_FAILS) {
    record.lockedUntil = Date.now() + LOCK_MS;
    record.count = 0;
  }
  attempts.set(key, record);
}

function markOk(req, bucket) {
  attempts.delete(attemptKey(req, bucket));
}

function fileStamp(iso) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const pick = (type) => parts.find((part) => part.type === type).value;
  return `${pick("year")}-${pick("month")}-${pick("day")}-${pick("hour")}${pick("minute")}`;
}

function lanAddresses() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === "IPv4" && !item.internal) found.push(item.address);
    }
  }
  return found;
}

function loadEnvFile(file) {
  if (!file || !fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
