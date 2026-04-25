const STORAGE_KEY = "rakutenPointHistoryRows";
const COLUMNS = ["date", "service", "title", "action", "point", "note"];
const UTF8_BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);

const COLOR_GAIN = "#4caf50";
const COLOR_CHARGE = "#2196f3";
const COLOR_USED = "#e53935";
const DONUT_COLORS = [
"#bf0000", "#e85d26", "#f5a623", "#4caf50", "#2196f3",
"#9c27b0", "#00bcd4", "#795548", "#607d8b", "#e91e63",
];

let allRows = [];
let filteredRows = [];

/* ── Utilities ── */

function getCurrentDateString() {
const d = new Date();
return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function parseDateFromRow(dateText) {
if (!dateText) return null;
const m = String(dateText).match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
if (!m) return null;
return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function parseMonthFromRow(dateText) {
if (!dateText) return null;
const m = String(dateText).match(/(\d{4})\/(\d{1,2})/);
if (!m) return null;
return `${m[1]}/${m[2].padStart(2, "0")}`;
}

function parsePointValue(pointText) {
if (!pointText) return 0;
const cleaned = String(pointText).replace(/[,\s]/g, "");
const m = cleaned.match(/^-?\d+/);
return m ? parseInt(m[0], 10) : 0;
}

function classifyAction(action) {
const a = String(action || "");
if (a === "利用") return "used";
if (a === "獲得" || a.startsWith("獲得.") || a.startsWith("獲得（")) return "gain";
if (a.includes("チャージ") || a === "追加完了") return "charge";
return "other";
}

function buildRowKey(row) {
return COLUMNS.map((col) => row[col] || "").join("\u0001");
}

function sanitize(v) { return /^[=+\-@]/.test(v) ? "'" + v : v; }

function escapeCsvValue(value) {
const raw = value == null ? "" : String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const safe = sanitize(raw);
if (safe.includes('"') || safe.includes(",") || safe.includes("\n"))
return '"' + safe.replace(/"/g, '""') + '"';
return safe;
}

function rowsToCsv(rows) {
return [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => escapeCsvValue(r[c])).join(","))].join("\n");
}

function downloadCsv(csv, from, to) {
const blob = new Blob([UTF8_BOM, csv], { type: "text/csv;charset=utf-8" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = `rakuten-point-history_${getCurrentDateString()}_${from || "all"}_${to || "all"}.csv`;
document.body.appendChild(a);
a.click();
requestAnimationFrame(() => { a.remove(); URL.revokeObjectURL(url); });
}

function getStorageRows() {
return new Promise((resolve, reject) => {
chrome.storage.local.get([STORAGE_KEY], (r) => {
if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
resolve(Array.isArray(r[STORAGE_KEY]) ? r[STORAGE_KEY] : []);
});
});
}

function setStorageRows(rows) {
return new Promise((resolve, reject) => {
chrome.storage.local.set({ [STORAGE_KEY]: rows }, () => {
if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
resolve();
});
});
}

function fmt(n) { return n.toLocaleString("ja-JP"); }

function currentMonth() {
const d = new Date();
return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getLast30Days() {
const days = [];
const d = new Date();
for (let i = 29; i >= 0; i--) {
const t = new Date(d); t.setDate(d.getDate() - i);
days.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`);
}
return days;
}

/* ── Tab switching ── */

document.querySelectorAll(".tab").forEach((tab) => {
tab.addEventListener("click", () => {
document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
tab.classList.add("active");
document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
});
});

/* ── Dashboard ── */

function computeStats(rows) {
let totalGain = 0, totalCharge = 0, totalUsed = 0, totalInterest = 0;
let monthGain = 0, monthCharge = 0, monthUsed = 0;
const cm = currentMonth();
const monthlyGain = {}, monthlyCharge = {}, monthlyUsed = {};
const dailyGain = {}, dailyCharge = {}, dailyUsed = {};
const serviceGain = {};

rows.forEach((row) => {
const d = parseDateFromRow(row.date);
const month = parseMonthFromRow(row.date);
const point = parsePointValue(row.point);
const type = classifyAction(row.action);
const service = row.service || "その他";

if (row.service === "ポイント利息" && row.action === "追加完了") totalInterest += point;

if (type === "gain") {
totalGain += point;
if (month === cm) monthGain += point;
if (month) monthlyGain[month] = (monthlyGain[month] || 0) + point;
if (d) dailyGain[d] = (dailyGain[d] || 0) + point;
serviceGain[service] = (serviceGain[service] || 0) + point;
} else if (type === "charge") {
totalCharge += point;
if (month === cm) monthCharge += point;
if (month) monthlyCharge[month] = (monthlyCharge[month] || 0) + point;
if (d) dailyCharge[d] = (dailyCharge[d] || 0) + point;
} else if (type === "used") {
totalUsed += point;
if (month === cm) monthUsed += point;
if (month) monthlyUsed[month] = (monthlyUsed[month] || 0) + point;
if (d) dailyUsed[d] = (dailyUsed[d] || 0) + point;
}
});

const allMonths = new Set([...Object.keys(monthlyGain), ...Object.keys(monthlyCharge), ...Object.keys(monthlyUsed)]);
const sortedMonths = [...allMonths].sort();
const numMonths = Math.max(sortedMonths.length, 1);

return {
totalGain, totalCharge, totalUsed, totalInterest,
monthGain, monthCharge, monthUsed,
avgGain: Math.round(totalGain / numMonths),
avgUsed: Math.round(totalUsed / numMonths),
sortedMonths, monthlyGain, monthlyCharge, monthlyUsed,
dailyGain, dailyCharge, dailyUsed, serviceGain,
};
}

let lastStats = null;

function drawAllCharts() {
if (!lastStats) return;
drawMonthlyChart(lastStats);
drawDailyChart(lastStats);
drawServiceDonut(lastStats);
}

function updateDashboard(rows) {
const s = computeStats(rows);
lastStats = s;
document.getElementById("metricMonthGain").textContent = "+" + fmt(s.monthGain);
document.getElementById("metricMonthCharge").textContent = fmt(s.monthCharge);
document.getElementById("metricMonthUsed").textContent = "-" + fmt(s.monthUsed);
document.getElementById("metricTotalGain").textContent = "+" + fmt(s.totalGain);
document.getElementById("metricTotalCharge").textContent = fmt(s.totalCharge);
document.getElementById("metricTotalUsed").textContent = "-" + fmt(s.totalUsed);
document.getElementById("metricInterest").textContent = fmt(s.totalInterest);
document.getElementById("metricAvgGain").textContent = "+" + fmt(s.avgGain);
document.getElementById("metricAvgUsed").textContent = "-" + fmt(s.avgUsed);
requestAnimationFrame(drawAllCharts);
}

// サイドパネルのリサイズ時にグラフを再描画
window.addEventListener("resize", () => requestAnimationFrame(drawAllCharts));

/* ── Charts ── */

function setupCanvas(canvas, aspect) {
if (!canvas || !canvas.parentElement) return null;
const dpr = window.devicePixelRatio || 1;
const parent = canvas.parentElement;
const style = getComputedStyle(parent);
const padL = parseFloat(style.paddingLeft) || 0;
const padR = parseFloat(style.paddingRight) || 0;
const w = parent.clientWidth - padL - padR;
if (w <= 0) return null;
const h = Math.round(w * aspect);
canvas.width = w * dpr;
canvas.height = h * dpr;
canvas.style.width = w + "px";
canvas.style.height = h + "px";
const ctx = canvas.getContext("2d");
ctx.scale(dpr, dpr);
return { ctx, w, h };
}

function measureLeftPad(ctx, maxVal) {
ctx.font = "10px sans-serif";
return Math.ceil(ctx.measureText(fmt(maxVal)).width) + 10;
}

function drawBarChart(ctx, w, h, labels, series, legendItems, xLabelFn) {
if (labels.length === 0) {
ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
ctx.fillText("データがありません", w / 2, h / 2);
return;
}

const maxVal = Math.max(1, ...series.flatMap((sr) => labels.map((l) => sr.data[l] || 0)));
const leftPad = measureLeftPad(ctx, maxVal);
const pad = { top: 22, right: 6, bottom: 34, left: leftPad };
const cw = w - pad.left - pad.right;
const ch = h - pad.top - pad.bottom;
const colW = cw / labels.length;
const barCount = series.length;
const barW = Math.max(Math.min((colW - 4) / barCount, 20), 2);
const groupW = barW * barCount + (barCount - 1);

// Y grid
ctx.strokeStyle = "#e8e8e8"; ctx.lineWidth = 1;
ctx.fillStyle = "#999"; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
for (let i = 0; i <= 4; i++) {
const v = Math.round((maxVal / 4) * i);
const y = pad.top + ch - (ch * i) / 4;
ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
ctx.fillText(fmt(v), pad.left - 4, y + 3);
}

// Bars
labels.forEach((l, li) => {
const gx = pad.left + colW * li + (colW - groupW) / 2;
series.forEach((sr, si) => {
const v = sr.data[l] || 0;
if (v <= 0) return;
const bh = (v / maxVal) * ch;
const x = gx + si * (barW + 1);
const y = pad.top + ch - bh;
ctx.fillStyle = sr.color;
ctx.fillRect(x, y, barW, bh);
});
});

// X labels
ctx.fillStyle = "#999"; ctx.font = "9px sans-serif"; ctx.textAlign = "center";
labels.forEach((l, i) => {
ctx.fillText(xLabelFn(l), pad.left + colW * i + colW / 2, h - pad.bottom + 14);
});

// Legend
ctx.font = "10px sans-serif"; ctx.textAlign = "left";
let lx = pad.left;
legendItems.forEach((item) => {
ctx.fillStyle = item.color;
ctx.fillRect(lx, 5, 10, 10);
ctx.fillStyle = "#666";
ctx.fillText(item.label, lx + 13, 14);
lx += ctx.measureText(item.label).width + 24;
});
}

const LEGEND = [
{ label: "獲得", color: COLOR_GAIN },
{ label: "チャージ", color: COLOR_CHARGE },
{ label: "利用", color: COLOR_USED },
];

function makeSeries(g, c, u) {
return [{ data: g, color: COLOR_GAIN }, { data: c, color: COLOR_CHARGE }, { data: u, color: COLOR_USED }];
}

function drawMonthlyChart(stats) {
const r = setupCanvas(document.getElementById("chartMonthly"), 0.5);
if (!r) return;
drawBarChart(r.ctx, r.w, r.h, stats.sortedMonths.slice(-12),
makeSeries(stats.monthlyGain, stats.monthlyCharge, stats.monthlyUsed),
LEGEND, (m) => m.split("/")[1] + "月");
}

function drawDailyChart(stats) {
const r = setupCanvas(document.getElementById("chartDaily"), 0.5);
if (!r) return;
drawBarChart(r.ctx, r.w, r.h, getLast30Days(),
makeSeries(stats.dailyGain, stats.dailyCharge, stats.dailyUsed),
LEGEND, (d) => String(parseInt(d.split("-")[2], 10)));
}

function drawServiceDonut(stats) {
const r = setupCanvas(document.getElementById("chartService"), 0.6);
if (!r) return;
const { ctx, w, h } = r;

const entries = Object.entries(stats.serviceGain).sort((a, b) => b[1] - a[1]);
if (entries.length === 0) {
ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
ctx.fillText("データがありません", w / 2, h / 2);
return;
}

const total = entries.reduce((s, e) => s + e[1], 0);
const topN = entries.slice(0, 8);
const otherSum = entries.slice(8).reduce((s, e) => s + e[1], 0);
if (otherSum > 0) topN.push(["その他", otherSum]);

const cx = w * 0.3;
const cy = h / 2;
const radius = Math.min(cx - 8, cy - 8);
const inner = radius * 0.55;

let angle = -Math.PI / 2;
topN.forEach(([, val], i) => {
const slice = (val / total) * Math.PI * 2;
ctx.fillStyle = DONUT_COLORS[i % DONUT_COLORS.length];
ctx.beginPath();
ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
ctx.arc(cx, cy, radius, angle, angle + slice);
ctx.arc(cx, cy, inner, angle + slice, angle, true);
ctx.closePath();
ctx.fill();
angle += slice;
});

// Center
ctx.fillStyle = "#333"; ctx.font = "bold 13px sans-serif";
ctx.textAlign = "center"; ctx.textBaseline = "middle";
ctx.fillText(fmt(total), cx, cy - 6);
ctx.font = "10px sans-serif"; ctx.fillStyle = "#888";
ctx.fillText("獲得合計", cx, cy + 10);

// Legend
const lx = w * 0.58;
const lineH = Math.min(22, (h - 16) / topN.length);
ctx.textAlign = "left"; ctx.textBaseline = "top";
topN.forEach(([name, val], i) => {
const y = 10 + i * lineH;
ctx.fillStyle = DONUT_COLORS[i % DONUT_COLORS.length];
ctx.beginPath(); ctx.arc(lx + 5, y + 5, 4, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = "#333"; ctx.font = "10px sans-serif";
const pct = ((val / total) * 100).toFixed(1);
const maxLen = Math.max(Math.floor((w - lx - 60) / 6), 4);
const label = name.length > maxLen ? name.slice(0, maxLen) + "…" : name;
ctx.fillText(`${label} ${pct}%`, lx + 14, y);
});
}

/* ── History table ── */

function renderHistoryTable(rows) {
const empty = document.getElementById("historyEmpty");
const body = document.getElementById("historyTableBody");
document.getElementById("historyCount").textContent = rows.length + "件";
body.innerHTML = "";
if (rows.length === 0) { empty.classList.remove("hidden"); return; }
empty.classList.add("hidden");
rows.forEach((row) => {
const tr = document.createElement("tr");
COLUMNS.forEach((col) => {
const td = document.createElement("td");
td.textContent = row[col] || "";
tr.appendChild(td);
});
body.appendChild(tr);
});
}

/* ── Filters ── */

function applyDateFilter() {
const from = document.getElementById("fromDate").value || null;
const to = document.getElementById("toDate").value || null;
if (from && to && from > to) return;
filteredRows = allRows.filter((row) => {
const d = parseDateFromRow(row.date);
if (!d) return false;
if (from && d < from) return false;
if (to && d > to) return false;
return true;
});
renderHistoryTable(filteredRows);
}

function setDefaultDates() {
const dates = allRows.map((r) => parseDateFromRow(r.date)).filter(Boolean).sort();
if (dates.length === 0) return;
document.getElementById("fromDate").value = dates[0];
document.getElementById("toDate").value = dates[dates.length - 1];
}

/* ── CSV Import ── */

function parseCsvText(text) {
const rows = [];
const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
let pos = src.charCodeAt(0) === 0xFEFF ? 1 : 0;

function field() {
if (pos >= src.length) return "";
if (src[pos] === '"') {
pos++; let v = "";
while (pos < src.length) {
if (src[pos] === '"') { if (pos + 1 < src.length && src[pos + 1] === '"') { v += '"'; pos += 2; } else { pos++; break; } }
else { v += src[pos]; pos++; }
}
return v;
}
let v = "";
while (pos < src.length && src[pos] !== "," && src[pos] !== "\n") { v += src[pos]; pos++; }
return v;
}

function line() {
const f = [field()];
while (pos < src.length && src[pos] === ",") { pos++; f.push(field()); }
if (pos < src.length && src[pos] === "\n") pos++;
return f;
}

const header = line().map((h) => h.trim().toLowerCase());
if (!COLUMNS.every((c) => header.includes(c))) return null;
const idx = {};
COLUMNS.forEach((c) => { idx[c] = header.indexOf(c); });

while (pos < src.length) {
if (src[pos] === "\n") { pos++; continue; }
const f = line();
if (f.length < COLUMNS.length) continue;
const row = {};
COLUMNS.forEach((c) => { row[c] = (f[idx[c]] || "").trim(); });
if (row.date) rows.push(row);
}
return rows;
}

async function importCsvFiles(files) {
const el = document.getElementById("importStatus");
el.classList.remove("hidden", "error");
el.textContent = "インポート中...";
try {
const existing = await getStorageRows();
const merged = [...existing];
const keys = new Set(existing.map(buildRowKey));
let added = 0;
const errors = [];
for (const file of files) {
try {
const parsed = parseCsvText(await file.text());
if (!parsed) { errors.push(file.name); continue; }
parsed.forEach((row) => { const k = buildRowKey(row); if (!keys.has(k)) { keys.add(k); merged.push(row); added++; } });
} catch (e) { errors.push(file.name); }
}
if (added > 0) await setStorageRows(merged);
let msg = `${added}件の新規レコードをインポートしました。`;
if (errors.length) { msg += ` エラー: ${errors.join(", ")}`; el.classList.add("error"); }
el.textContent = msg;
await refreshRows();
} catch (e) {
el.classList.add("error");
el.textContent = "インポートに失敗しました: " + e.message;
}
}

/* ── Actions ── */

async function refreshRows() {
try {
allRows = await getStorageRows();
filteredRows = [...allRows];
updateDashboard(allRows);
setDefaultDates();
renderHistoryTable(filteredRows);
} catch (e) {
window.alert("履歴の取得に失敗しました: " + e.message);
}
}

document.getElementById("startScrapeButton").addEventListener("click", () => {
window.open("https://point.rakuten.co.jp/history/?page=1&scrape=1#point_history");
});
document.getElementById("exportCsvButton").addEventListener("click", () => {
const from = document.getElementById("fromDate").value || null;
const to = document.getElementById("toDate").value || null;
if (from && to && from > to) { window.alert("開始日は終了日以前を指定してください"); return; }
if (filteredRows.length === 0) { window.alert("エクスポートできる履歴がありません"); return; }
downloadCsv(rowsToCsv(filteredRows), from, to);
});
document.getElementById("fromDate").addEventListener("change", applyDateFilter);
document.getElementById("toDate").addEventListener("change", applyDateFilter);

const importInput = document.getElementById("importCsvInput");
document.getElementById("importCsvButton").addEventListener("click", () => { importInput.value = ""; importInput.click(); });
importInput.addEventListener("change", () => { if (importInput.files.length > 0) importCsvFiles(importInput.files); });

chrome.storage.onChanged.addListener((changes, area) => {
if (area === "local" && Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) refreshRows();
});

// レイアウト完了後に初回描画
requestAnimationFrame(() => requestAnimationFrame(() => refreshRows()));
