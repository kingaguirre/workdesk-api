// Express app (no app.listen here)
import express from "express";
import cors from "cors";

const BASE_DELAY = Number.isFinite(Number(process.env.DELAY_MS)) ? Number(process.env.DELAY_MS) : 100;
const JITTER = Number.isFinite(Number(process.env.DELAY_JITTER)) ? Number(process.env.DELAY_JITTER) : 50;

const app = express();
app.use(cors());
app.use(express.json());

// ---------- delay middleware ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.use(async (req, _res, next) => {
  if (req.path === "/health") return next();
  const qd = Number(req.query.__delay);
  const override = Number.isFinite(qd) ? Math.max(0, qd) : null;
  const rnd = Math.floor(Math.random() * (JITTER * 2 + 1)) - JITTER;
  const delay = override ?? Math.max(0, BASE_DELAY + rnd);
  if (delay > 0) await sleep(delay);
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));

// ---------- data generation ----------
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20250921);

const BANKS = [
  "Standard Chartered Bank (Singapore) Ltd",
  "SCB Malaysia Berhad",
  "SCB Hong Kong Ltd"
];
const STAGES = [
  // ack workflow stages (first 3)
  "SPLCP - Split Completed",
  "SPLIN - Split Initiated",
  "APRV - Approved",
  // txn processing stages (next)
  "EXEMK - Exception Handling Maker",
  "PRINP - Processing In-Progress",
  "TXPMK - Transaction Pending Maker",
  "PPRMK - Pre Processing Maker"
];
const SUBMISSION = ["EML", "TNG", "OTC"];
const PRODUCTS = ["EIF", "IIF", "SUF"];
const CUSTOMERS = [
  "100006898 - TXOPT TESTING LONG NAME COMPANY LTD",
  "100009999 - SAMPLE INDUSTRIES PTE LTD",
  "100001111 - DEMO GROUP HOLDINGS"
];
const CNTP = ["PHARMA MED", "100502577 - TEST", "NG-Adaptor-IIF6"];

// 4 tokens rotate colors in UI; "NULL" neutral for tdOpsApproval
const TOKENS = ["ZEKE", "BOLT", "ECHO", "RISK"];
const tokenForIndex = (i) => TOKENS[i % TOKENS.length];

const ROWS = [];
// Keep N modest for serverless; bump if running stateful.
const N = 4934;
const base = Date.parse("2025-06-06T07:30:00Z");

const fmt = (ms) =>
  new Date(ms)
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC"
    })
    .replace(", ", ", ");

for (let i = 0; i < N; i++) {
  const receivedAtMs = base + i * 57 * 60_000;
  const regMs = base + i * 37 * 60_000;
  const relMs = base + i * 59 * 60_000;

  ROWS.push({
    id: i + 1,
    // Common keys used by Ack
    arn: String(2_500_000 + i),
    bookingLocation: BANKS[i % BANKS.length],
    workflowStage: STAGES[i % STAGES.length],
    submissionMode: SUBMISSION[i % SUBMISSION.length],
    receivedAt: fmt(receivedAtMs),
    __receivedAtMs: receivedAtMs,
    generatedBy: "System",

    // Extra keys used by Txn
    trn: `SPBTR25RFC${String(3129 + i).padStart(6, "0")}`,
    customer: CUSTOMERS[i % CUSTOMERS.length],
    counterparty: CNTP[i % CNTP.length],
    product: PRODUCTS[i % PRODUCTS.length],
    step: "NEW001",
    subStep: "DRFF",
    lockedBy: String(1201231 + (i % 9999)),
    stage: STAGES[(i + 3) % STAGES.length],
    lli: tokenForIndex(i + 0),
    aml: tokenForIndex(i + 1),
    snc: tokenForIndex(i + 2),
    clbk: tokenForIndex(i + 3),
    cocoa: tokenForIndex(i + 4), // with 4-token ring cocoa==lli; keep if you want more repeats
    tdOpsApproval: "NULL", // neutral
    customerRef: i % 11 === 0 ? "NG-Adaptor-IIF6" : "NG-STPAdaptor-EIF",
    regDate: fmt(regMs),
    relDate: fmt(relMs),
    segment: "ME",
    subSegment: "03",
    splitId: String(251 + (i % 9))
  });
}

// ---------- helpers ----------
function cmp(a, b, order) {
  const dir = order === "desc" ? -1 : 1;
  if (a == null && b == null) return 0;
  if (a == null) return -1 * dir;
  if (b == null) return 1 * dir;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return (na - nb) * dir;
  return String(a).localeCompare(String(b)) * dir;
}
function matchesGlobal(row, q) {
  if (!q) return true;
  const s = String(q).toLowerCase();
  return Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(s));
}
function applyColumnFilters(rows, filtersJson) {
  if (!filtersJson) return rows;
  let filters = [];
  try {
    filters = JSON.parse(String(filtersJson));
  } catch {}
  if (!Array.isArray(filters)) return rows;
  let out = rows;
  for (const f of filters) {
    const id = String(f.id ?? "");
    const raw = f.value;
    const mode = f.filterBy || "includesString";
    if (raw == null || raw === "") continue;
    out = out.filter((r) => {
      const cell = String(r[id] ?? "");
      if (mode === "includesStringSensitive") return cell.includes(String(raw));
      return cell.toLowerCase().includes(String(raw).toLowerCase());
    });
  }
  return out;
}
function deriveStatus(row) {
  return /Initiated/i.test(row.workflowStage) ? "PENDING" : "REGISTERED";
}

// ---------- routes ----------
// GET /workdesk/search?q=&limit=&skip=&sortBy=&order=&filters=&status=&trnSearch=&hideAcr=&savedFilter=
app.get("/workdesk/search", (req, res) => {
  let {
    q = "",
    limit = 30,
    skip = 0,
    sortBy,
    order = "asc",
    filters,
    status,         // PENDING | REGISTERED | ALL
    trnSearch = "", // txn header
    hideAcr = "",   // "true"
    savedFilter = "" // MKIP | LOCKED_ME
  } = req.query;

  let rows = ROWS.slice();

  // header-style filters
  const statusStr = typeof status === "string" ? status.trim().toUpperCase() : "";
  if (statusStr && statusStr !== "ALL") {
    rows = rows.filter((r) => deriveStatus(r) === statusStr);
  }
  if (String(trnSearch).trim()) {
    const needle = String(trnSearch).toLowerCase();
    rows = rows.filter((r) => String(r.trn).toLowerCase().includes(needle));
  }
  if (String(hideAcr) === "true") {
    rows = rows.filter((_, i) => i % 7 !== 0);
  }
  if (String(savedFilter).toUpperCase() === "MKIP") {
    rows = rows.filter((r) => /In-Progress/i.test(r.stage));
  } else if (String(savedFilter).toUpperCase() === "LOCKED_ME") {
    rows = rows.filter((_, i) => i % 5 === 0);
  }

  // DataTable global + column filters
  rows = rows.filter((r) => matchesGlobal(r, q));
  rows = applyColumnFilters(rows, filters);

  // sorting
  if (sortBy) {
    const id = String(sortBy);
    rows = rows.slice().sort((a, b) => {
      if (id === "receivedAt") {
        return cmp(a.__receivedAtMs, b.__receivedAtMs, order);
      }
      return cmp(a[id], b[id], order);
    });
  }

  const total = rows.length;
  const off = Number(skip);
  const lim = Number(limit);
  const page = lim > 0 ? rows.slice(off, off + lim) : rows.slice();

  res.json({ rows: page, total });
});

// CRUD (future demos)

// GET /workdesk/:id
app.get("/workdesk/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = ROWS.find((r) => r.id === id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// PATCH /workdesk/:id
app.patch("/workdesk/:id", (req, res) => {
  const id = Number(req.params.id);
  const idx = ROWS.findIndex((r) => r.id === id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  ROWS[idx] = { ...ROWS[idx], ...req.body };
  res.json(ROWS[idx]);
});

// POST /workdesk
app.post("/workdesk", (req, res) => {
  const id = ROWS.length ? ROWS[ROWS.length - 1].id + 1 : 1;
  const now = Date.now();

  const row = {
    id,
    arn: String(2_500_000 + id),
    bookingLocation: BANKS[id % BANKS.length],
    workflowStage: STAGES[id % STAGES.length],
    submissionMode: SUBMISSION[id % SUBMISSION.length],
    receivedAt: fmt(now),
    __receivedAtMs: now,
    generatedBy: "System",

    trn: req.body?.trn ?? `SPBTR25RFC${String(3129 + id).padStart(6, "0")}`,
    customer: req.body?.customer ?? CUSTOMERS[id % CUSTOMERS.length],
    counterparty: CNTP[id % CNTP.length],
    product: PRODUCTS[id % PRODUCTS.length],
    step: "NEW001",
    subStep: "DRFF",
    lockedBy: String(1201231 + (id % 9999)),
    stage: STAGES[(id + 3) % STAGES.length],
    lli: tokenForIndex(id + 0),
    aml: tokenForIndex(id + 1),
    snc: tokenForIndex(id + 2),
    clbk: tokenForIndex(id + 3),
    cocoa: tokenForIndex(id + 4),
    tdOpsApproval: "NULL",
    customerRef: id % 11 === 0 ? "NG-Adaptor-IIF6" : "NG-STPAdaptor-EIF",
    regDate: fmt(now),
    relDate: fmt(now + 3600_000),
    segment: "ME",
    subSegment: "03",
    splitId: String(251 + (id % 9))
  };

  ROWS.push(row);
  res.status(201).json(row);
});

// DELETE /workdesk/:id
app.delete("/workdesk/:id", (req, res) => {
  const id = Number(req.params.id);
  const idx = ROWS.findIndex((r) => r.id === id);
  if (idx < 0) return res.status(404).json({ error: "Not found" });
  ROWS.splice(idx, 1);
  res.json({ ok: true });
});

// PATCH /workdesk/ack/booking-location
app.patch("/workdesk/ack/booking-location", (req, res) => {
  const { arn, bookingLocation } = req.body || {};
  if (!arn) return res.status(400).json({ error: "arn required" });

  const idx = ROWS.findIndex((r) => String(r.arn) === String(arn));
  if (idx < 0) return res.status(404).json({ error: "Not found" });

  ROWS[idx] = { ...ROWS[idx], bookingLocation };
  return res.json({ ok: true, row: ROWS[idx] });
});

export default app;
