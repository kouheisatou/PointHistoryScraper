const STORAGE_KEY = "rakutenPointHistoryRows";
const LAST_SCRAPE_DATE_KEY = "rakutenPointHistoryLastScrapeDate";
const LAST_SCRAPE_ADDED_COUNT_KEY = "rakutenPointHistoryLastScrapeAddedCount";
const SCRAPE_SESSION_ADDED_KEY = "rakutenPointHistorySessionAddedCount";
const SCRAPE_CANCEL_KEY = "rakutenPointHistoryCancelScrape";
const PENDING_EXPORT_KEY = "rakutenPointHistoryPendingExport";
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

function downloadXlsx(rows, from, to) {
const header = COLUMNS.slice();
const data = [header, ...rows.map((r) => COLUMNS.map((c) => r[c] || ""))];
const ws = XLSX.utils.aoa_to_sheet(data);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "ポイント履歴");
const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = `rakuten-point-history_${getCurrentDateString()}_${from || "all"}_${to || "all"}.xlsx`;
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

function fmt(n) { return "¥" + n.toLocaleString("ja-JP"); }


/* ── Tab switching ── */

document.querySelectorAll(".tab").forEach((tab) => {
tab.addEventListener("click", () => {
document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
tab.classList.add("active");
document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
document.getElementById("exportCallout").classList.add("hidden");
});
});

function switchTab(name) {
document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
const btn = document.querySelector(`.tab[data-tab="${name}"]`);
if (btn) btn.classList.add("active");
document.getElementById("tab-" + name)?.classList.add("active");
}

// 月別グラフクリック → 履歴タブでその月を表示
function navigateToMonth(label) {
const [y, m] = label.split("/");
const mi = parseInt(m, 10);
const ms = String(mi).padStart(2, "0");
const lastDay = new Date(parseInt(y, 10), mi, 0).getDate();
document.getElementById("fromDate").value = `${y}-${ms}-01`;
document.getElementById("toDate").value = `${y}-${ms}-${String(lastDay).padStart(2, "0")}`;
document.getElementById("yearShortcuts").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
activeServiceFilters.clear();
activeActionFilters.clear();
document.getElementById("serviceShortcuts").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
document.getElementById("actionShortcuts").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
applyFilter();
switchTab("history");
}

/* ── Dashboard ── */

function computeStats(rows) {
let totalGain = 0, totalCharge = 0, totalUsed = 0, totalInterest = 0;
let yearGain = 0, yearCharge = 0, yearUsed = 0;
const cy = String(new Date().getFullYear());
const monthlyGain = {}, monthlyCharge = {}, monthlyUsed = {};
const serviceGain = {};

rows.forEach((row) => {
const month = parseMonthFromRow(row.date);
const point = parsePointValue(row.point);
const type = classifyAction(row.action);
const service = row.service || "その他";

if (row.service === "ポイント利息" && row.action === "追加完了") totalInterest += point;

const rowYear = month ? month.split("/")[0] : null;

if (type === "gain") {
totalGain += point;
if (rowYear === cy) yearGain += point;
if (month) monthlyGain[month] = (monthlyGain[month] || 0) + point;
serviceGain[service] = (serviceGain[service] || 0) + point;
} else if (type === "charge") {
totalCharge += point;
if (rowYear === cy) yearCharge += point;
if (month) monthlyCharge[month] = (monthlyCharge[month] || 0) + point;
} else if (type === "used") {
totalUsed += point;
if (rowYear === cy) yearUsed += point;
if (month) monthlyUsed[month] = (monthlyUsed[month] || 0) + point;
}
});

const allMonths = new Set([...Object.keys(monthlyGain), ...Object.keys(monthlyCharge), ...Object.keys(monthlyUsed)]);
const sortedMonths = [...allMonths].sort();
const numMonths = Math.max(sortedMonths.length, 1);

const dates = rows.map((r) => parseDateFromRow(r.date)).filter(Boolean).sort();
const dateFrom = dates.length > 0 ? dates[0] : null;
const dateTo = dates.length > 0 ? dates[dates.length - 1] : null;

return {
totalGain, totalCharge, totalUsed, totalInterest,
yearGain, yearCharge, yearUsed,
avgGain: Math.round(totalGain / numMonths),
avgUsed: Math.round(totalUsed / numMonths),
sortedMonths, monthlyGain, monthlyCharge, monthlyUsed,
serviceGain, dateFrom, dateTo,
};
}

let lastStats = null;
let monthlyPage = 0; // 0=最新12ヶ月, -1=その前12ヶ月, ...

function drawAllCharts() {
if (!lastStats) return;
drawMonthlyChart();
drawServiceDonut();
drawUsedDonut();
}

function updateDashboard(rows) {
const s = computeStats(rows);
lastStats = s;
// 初期表示: 最新の年・月
monthlyPage = 0;
document.getElementById("metricYearGain").textContent = fmt(s.yearGain);
document.getElementById("metricYearCharge").textContent = fmt(s.yearCharge);
document.getElementById("metricYearUsed").textContent = fmt(s.yearUsed);
document.getElementById("metricTotalGain").textContent = fmt(s.totalGain);
document.getElementById("metricTotalCharge").textContent = fmt(s.totalCharge);
document.getElementById("metricTotalUsed").textContent = fmt(s.totalUsed);
document.getElementById("metricInterest").textContent = fmt(s.totalInterest);
document.getElementById("metricAvgGain").textContent = fmt(s.avgGain);
document.getElementById("metricAvgUsed").textContent = fmt(s.avgUsed);
requestAnimationFrame(drawAllCharts);
}

window.addEventListener("resize", () => requestAnimationFrame(drawAllCharts));

/* ── Charts & Tooltip ── */

const COLOR_CUM = "#ff9800";
const tooltipEl = document.getElementById("chartTooltip");
const chartHitAreas = new Map(); // canvas -> [{x,y,w,h,text}]

function registerHitAreas(canvas, areas) {
chartHitAreas.set(canvas, areas);
}

function setupTooltipListeners(canvas) {
if (canvas._tooltipBound) return;
canvas._tooltipBound = true;
canvas.addEventListener("mousemove", (e) => {
const rect = canvas.getBoundingClientRect();
const mx = e.clientX - rect.left;
const my = e.clientY - rect.top;
const areas = chartHitAreas.get(canvas) || [];
const hit = areas.find((a) => mx >= a.x && mx <= a.x + a.w && my >= a.y && my <= a.y + a.h);
if (hit) {
tooltipEl.textContent = hit.text;
tooltipEl.classList.remove("hidden");
tooltipEl.style.left = "0px";
tooltipEl.style.top = "0px";
const tw = tooltipEl.offsetWidth;
const th = tooltipEl.offsetHeight;
const pw = document.body.clientWidth;
let tx = e.clientX + 10;
let ty = e.clientY - th - 6;
if (tx + tw > pw) tx = Math.max(4, e.clientX - tw - 10);
if (ty < 0) ty = e.clientY + 16;
tooltipEl.style.left = tx + "px";
tooltipEl.style.top = ty + "px";
} else {
tooltipEl.classList.add("hidden");
}
});
canvas.addEventListener("mouseleave", () => tooltipEl.classList.add("hidden"));
canvas.addEventListener("click", (e) => {
const rect = canvas.getBoundingClientRect();
const mx = e.clientX - rect.left;
const my = e.clientY - rect.top;
const areas = chartHitAreas.get(canvas) || [];
const hit = areas.find((a) => mx >= a.x && mx <= a.x + a.w && my >= a.y && my <= a.y + a.h);
if (hit && hit.label && hit.onBarClick) hit.onBarClick(hit.label);
});
}

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

// 1000,2000,3000,...,10000,20000,30000,...,100000,200000,... のようなキリの良い値に切り上げ
function niceCeil(val) {
if (val <= 0) return 1000;
const exp = Math.pow(10, Math.floor(Math.log10(val)));
return Math.ceil(val / exp) * exp;
}

function measureLeftPad(ctx, maxVal) {
ctx.font = "10px sans-serif";
return Math.ceil(ctx.measureText(fmt(maxVal)).width) + 10;
}

// cumData: { label: cumulativeValue } - 累計獲得の折れ線データ
function drawBarChartWithLine(canvas, ctx, w, h, labels, series, legendItems, xLabelFn, cumData, onBarClick) {
const hitAreas = [];
if (labels.length === 0) {
ctx.fillStyle = "#aaa"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
ctx.fillText("データがありません", w / 2, h / 2);
return;
}

const rawMax = Math.max(1,
...series.flatMap((sr) => labels.map((l) => sr.data[l] || 0)),
...labels.map((l) => cumData[l] || 0));
const maxVal = niceCeil(rawMax);
const niceStep = niceCeil(maxVal / 4);
const tickCount = Math.max(Math.round(maxVal / niceStep), 1);

const leftPad = measureLeftPad(ctx, maxVal);
const pad = { top: 22, right: 6, bottom: 44, left: leftPad };
const cw = w - pad.left - pad.right;
const ch = h - pad.top - pad.bottom;
const colW = cw / labels.length;
const barCount = series.length;
const barW = Math.max(Math.min((colW - 4) / barCount, 20), 2);
const groupW = barW * barCount + (barCount - 1);

// Y grid
ctx.strokeStyle = "#e8e8e8"; ctx.lineWidth = 1;
ctx.fillStyle = "#999"; ctx.font = "10px sans-serif"; ctx.textAlign = "right";
for (let i = 0; i <= tickCount; i++) {
const v = niceStep * i;
const y = pad.top + ch - (v / maxVal) * ch;
ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
ctx.fillText(fmt(v), pad.left - 4, y + 3);
}

// Bars
const seriesNames = ["獲得", "チャージ", "利用"];
let cumRunning = 0;
labels.forEach((l, li) => {
if (cumData[l] != null) cumRunning = cumData[l];
const gx = pad.left + colW * li + (colW - groupW) / 2;
const parts = series.map((sr, si) => `${seriesNames[si]}: ${fmt(sr.data[l] || 0)}`);
parts.push(`累計獲得: ${fmt(cumRunning)}`);
const xlTip = xLabelFn(l);
const tipLabel = Array.isArray(xlTip) ? xlTip.join("") : xlTip;
hitAreas.push({ x: pad.left + colW * li, y: pad.top, w: colW, h: ch, text: tipLabel + "\n" + parts.join("\n"), label: l, onBarClick });
series.forEach((sr, si) => {
const v = sr.data[l] || 0;
if (v <= 0) return;
const bh = (v / maxVal) * ch;
ctx.fillStyle = sr.color;
ctx.fillRect(gx + si * (barW + 1), pad.top + ch - bh, barW, bh);
});
});

// Cumulative line (データのない日は直前の値を引き継ぐ)
const cumLine = [];
let lastCum = 0;
labels.forEach((l, i) => {
if (cumData[l] != null) lastCum = cumData[l];
cumLine.push({ x: pad.left + colW * i + colW / 2, v: lastCum });
});

ctx.strokeStyle = COLOR_CUM; ctx.lineWidth = 2;
ctx.beginPath();
cumLine.forEach((pt, i) => {
const y = pad.top + ch - (pt.v / maxVal) * ch;
if (i === 0) ctx.moveTo(pt.x, y); else ctx.lineTo(pt.x, y);
});
ctx.stroke();
cumLine.forEach((pt) => {
const y = pad.top + ch - (pt.v / maxVal) * ch;
ctx.fillStyle = COLOR_CUM;
ctx.beginPath(); ctx.arc(pt.x, y, 3, 0, Math.PI * 2); ctx.fill();
});

// X labels
ctx.fillStyle = "#999"; ctx.font = "9px sans-serif"; ctx.textAlign = "center";
labels.forEach((l, i) => {
const xl = xLabelFn(l);
const cx = pad.left + colW * i + colW / 2;
if (Array.isArray(xl)) {
ctx.fillText(xl[0], cx, h - pad.bottom + 12);
ctx.fillText(xl[1], cx, h - pad.bottom + 24);
} else {
ctx.fillText(xl, cx, h - pad.bottom + 14);
}
});

// Legend
ctx.font = "10px sans-serif"; ctx.textAlign = "left";
let lx = pad.left;
[...legendItems, { label: "累計獲得", color: COLOR_CUM }].forEach((item) => {
ctx.fillStyle = item.color;
ctx.fillRect(lx, 5, 10, 10);
ctx.fillStyle = "#666";
ctx.fillText(item.label, lx + 13, 14);
lx += ctx.measureText(item.label).width + 24;
});

registerHitAreas(canvas, hitAreas);
setupTooltipListeners(canvas);
}

const LEGEND = [
{ label: "獲得", color: COLOR_GAIN },
{ label: "チャージ", color: COLOR_CHARGE },
{ label: "利用", color: COLOR_USED },
];

function makeSeries(g, c, u) {
return [{ data: g, color: COLOR_GAIN }, { data: c, color: COLOR_CHARGE }, { data: u, color: COLOR_USED }];
}

// 12ヶ月ウィンドウのラベル生成 (yyyy/MM)
function buildMonthlyWindow(page) {
const now = new Date();
const endY = now.getFullYear();
const endM = now.getMonth(); // 0-based
const labels = [];
for (let i = 11; i >= 0; i--) {
const d = new Date(endY, endM - i + page, 1);
const y = d.getFullYear();
const m = String(d.getMonth() + 1).padStart(2, "0");
labels.push(`${y}/${m}`);
}
return labels;
}

function buildMonthlyCumGain(stats, labels) {
const cum = {};
const firstLabel = labels[0];
const lastLabel = labels[labels.length - 1];
// 最初にデータが存在する月を特定
const firstDataMonth = stats.sortedMonths.find((m) => (stats.monthlyGain[m] || 0) > 0);
let total = 0;
stats.sortedMonths.forEach((m) => {
total += (stats.monthlyGain[m] || 0);
if (m >= firstLabel && m <= lastLabel) cum[m] = total;
});
// データがない月の補間:
// - 最初のデータ月より前 → 0
// - それ以降 → 直前の累計値を引き継ぐ
let prev = 0;
labels.forEach((m) => {
if (m in cum) { prev = cum[m]; }
else if (firstDataMonth && m < firstDataMonth) { cum[m] = 0; }
else { cum[m] = prev; }
});
return cum;
}

function monthlyWindowTitle(labels) {
const first = labels[0];
const last = labels[labels.length - 1];
const [fy, fm] = first.split("/");
const [ly, lm] = last.split("/");
return `${fy}/${parseInt(fm, 10)} 〜 ${ly}/${parseInt(lm, 10)}`;
}

function getMinPage(stats) {
if (stats.sortedMonths.length === 0) return 0;
const earliest = stats.sortedMonths[0];
const [ey, em] = earliest.split("/").map(Number);
const now = new Date();
const diffMonths = (now.getFullYear() - ey) * 12 + now.getMonth() - (em - 1);
return -Math.max(diffMonths - 11, 0);
}

// ── Monthly chart ──

function drawMonthlyChart() {
if (!lastStats) return;
const stats = lastStats;
const minPage = getMinPage(stats);

document.getElementById("monthlyPrev").disabled = (monthlyPage <= minPage);
document.getElementById("monthlyNext").disabled = (monthlyPage >= 0);

const labels = buildMonthlyWindow(monthlyPage);
document.getElementById("monthlyTitle").textContent = monthlyWindowTitle(labels);

const cumGain = buildMonthlyCumGain(stats, labels);

const canvas = document.getElementById("chartMonthly");
const r = setupCanvas(canvas, 0.55);
if (!r) return;
drawBarChartWithLine(canvas, r.ctx, r.w, r.h, labels,
makeSeries(stats.monthlyGain, stats.monthlyCharge, stats.monthlyUsed),
LEGEND, (m) => { const [y, mo] = m.split("/"); return [y + "年", parseInt(mo, 10) + "月"]; }, cumGain, navigateToMonth);
}

document.getElementById("monthlyPrev").addEventListener("click", () => {
if (!lastStats) return;
const minPage = getMinPage(lastStats);
if (monthlyPage > minPage) { monthlyPage--; drawMonthlyChart(); }
});
document.getElementById("monthlyNext").addEventListener("click", () => {
if (monthlyPage < 0) { monthlyPage++; drawMonthlyChart(); }
});

// ── Service donut ──

function formatDateJP(d) {
if (!d) return "";
const [y, m, day] = d.split("-");
return `${y}年${parseInt(m, 10)}月${parseInt(day, 10)}日`;
}

function computeServiceGainForRange(rows, from, to) {
const serviceGain = {};
rows.forEach((row) => {
const d = parseDateFromRow(row.date);
if (!d) return;
if (from && d < from) return;
if (to && d > to) return;
const type = classifyAction(row.action);
if (type !== "gain") return;
const point = parsePointValue(row.point);
const service = row.service || "その他";
serviceGain[service] = (serviceGain[service] || 0) + point;
});
return serviceGain;
}

function truncateToWidth(ctx, text, maxWidth) {
if (maxWidth <= 0) return "";
if (ctx.measureText(text).width <= maxWidth) return text;
const ell = "…";
const ellW = ctx.measureText(ell).width;
if (ellW > maxWidth) return "";
let lo = 0, hi = text.length;
while (lo < hi) {
const mid = (lo + hi + 1) >> 1;
if (ctx.measureText(text.slice(0, mid)).width + ellW <= maxWidth) lo = mid;
else hi = mid - 1;
}
return text.slice(0, lo) + ell;
}

function computeOuterLabelPositions(slices, cx, cy, outerLabelR, w, h, minSpacing, padTop, padBottom) {
const result = new Map();
const left = [];
const right = [];
slices.forEach((s, idx) => {
if (!s._outer) return;
const lx = cx + Math.cos(s.midAngle) * outerLabelR;
const ly = cy + Math.sin(s.midAngle) * outerLabelR;
const isRight = Math.cos(s.midAngle) >= 0;
const item = { idx, lx, ly, isRight };
(isRight ? right : left).push(item);
});
const place = (arr) => {
arr.sort((a, b) => a.ly - b.ly);
for (let i = 1; i < arr.length; i++) {
if (arr[i].ly - arr[i - 1].ly < minSpacing) arr[i].ly = arr[i - 1].ly + minSpacing;
}
const maxY = h - padBottom;
for (let i = arr.length - 1; i >= 0; i--) {
if (arr[i].ly > maxY) arr[i].ly = maxY;
if (i > 0 && arr[i].ly - arr[i - 1].ly < minSpacing) arr[i - 1].ly = arr[i].ly - minSpacing;
}
for (let i = 0; i < arr.length; i++) {
if (arr[i].ly < padTop) arr[i].ly = padTop;
if (i > 0 && arr[i].ly - arr[i - 1].ly < minSpacing) arr[i].ly = arr[i - 1].ly + minSpacing;
}
arr.forEach((it) => result.set(it.idx, { lx: it.lx, ly: it.ly, isRight: it.isRight }));
};
place(left);
place(right);
return result;
}

function drawDonutLabels(ctx, slices, total, cx, cy, labelR, outerLabelR, w, h) {
slices.forEach((s, i) => { s._outer = ((s.val / total) * 100) < 6; });
const outerPos = computeOuterLabelPositions(slices, cx, cy, outerLabelR, w, h, 26, 14, 14);
slices.forEach((s, i) => {
const pct = (s.val / total) * 100;
const large = !s._outer;
ctx.save();
ctx.textBaseline = "middle";
if (large) {
const lx = cx + Math.cos(s.midAngle) * labelR;
const ly = cy + Math.sin(s.midAngle) * labelR;
ctx.textAlign = "center";
ctx.lineJoin = "round";
ctx.miterLimit = 2;
ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
ctx.fillStyle = "#fff";
ctx.font = "bold 13px sans-serif";
const nameMaxW = Math.min(labelR * 1.4, 140);
const nameText = truncateToWidth(ctx, s.name, nameMaxW);
ctx.lineWidth = 3;
ctx.strokeText(nameText, lx, ly - 8);
ctx.fillText(nameText, lx, ly - 8);
ctx.font = "12px sans-serif";
ctx.lineWidth = 2.5;
const valText = `${pct.toFixed(1)}% ${fmt(s.val)}`;
ctx.strokeText(valText, lx, ly + 9);
ctx.fillText(valText, lx, ly + 9);
} else {
const pos = outerPos.get(i);
if (!pos) { ctx.restore(); return; }
const isRight = pos.isRight;
ctx.textAlign = isRight ? "left" : "right";
const ox = isRight ? 4 : -4;
const margin = 6;
const maxW = isRight ? Math.max(0, w - pos.lx - ox - margin) : Math.max(0, pos.lx + ox - margin);
ctx.fillStyle = s.color;
ctx.font = "bold 13px sans-serif";
const nameText = truncateToWidth(ctx, s.name, maxW);
ctx.fillText(nameText, pos.lx + ox, pos.ly - 8);
ctx.fillStyle = "#888";
ctx.font = "12px sans-serif";
const valText = truncateToWidth(ctx, `${pct.toFixed(1)}% ${fmt(s.val)}`, maxW);
ctx.fillText(valText, pos.lx + ox, pos.ly + 9);
}
ctx.restore();
});
}

function drawServiceDonut() {
if (!lastStats) return;
const canvas = document.getElementById("chartService");
const periodEl = document.getElementById("servicePeriod");
const from = document.getElementById("donutFromDate").value || null;
const to = document.getElementById("donutToDate").value || null;
if (from && to) {
periodEl.textContent = `${formatDateJP(from)} 〜 ${formatDateJP(to)}`;
} else {
periodEl.textContent = "";
}

const serviceGain = computeServiceGainForRange(allRows, from, to);
const entries = Object.entries(serviceGain).sort((a, b) => b[1] - a[1]);
if (entries.length === 0) {
const r = setupCanvas(canvas, 0.4);
if (!r) return;
r.ctx.fillStyle = "#aaa"; r.ctx.font = "12px sans-serif"; r.ctx.textAlign = "center";
r.ctx.fillText("データがありません", r.w / 2, r.h / 2);
return;
}

const total = entries.reduce((s, e) => s + e[1], 0);
const topN = entries.slice(0, 8);
const otherSum = entries.slice(8).reduce((s, e) => s + e[1], 0);
if (otherSum > 0) topN.push(["その他", otherSum]);

const r = setupCanvas(canvas, 1.0);
if (!r) return;
const { ctx, w, h } = r;

const cx = w / 2;
const cy = h / 2;
const radius = Math.min(w, h) * 0.44;
const inner = radius * 0.52;
const labelR = (radius + inner) / 2;
const outerLabelR = radius + 20;

// Draw slices
let angle = -Math.PI / 2;
const slices = [];
topN.forEach(([name, val], i) => {
const slice = (val / total) * Math.PI * 2;
const midAngle = angle + slice / 2;
ctx.fillStyle = DONUT_COLORS[i % DONUT_COLORS.length];
ctx.beginPath();
ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
ctx.arc(cx, cy, radius, angle, angle + slice);
ctx.arc(cx, cy, inner, angle + slice, angle, true);
ctx.closePath();
ctx.fill();
slices.push({ name, val, slice, midAngle, color: DONUT_COLORS[i % DONUT_COLORS.length] });
angle += slice;
});

// Labels
drawDonutLabels(ctx, slices, total, cx, cy, labelR, outerLabelR, w, h);

// Center text
ctx.fillStyle = "#333"; ctx.font = "bold 18px sans-serif";
ctx.textAlign = "center"; ctx.textBaseline = "middle";
ctx.fillText(fmt(total), cx, cy - 9);
ctx.font = "12px sans-serif"; ctx.fillStyle = "#888";
ctx.fillText("獲得合計", cx, cy + 12);

// Register donut hit areas for hover/click
setupDonutListeners(canvas, cx, cy, inner, radius, slices, total);
}

function setupDonutListeners(canvas, cx, cy, inner, radius, slices, total) {
const getSliceAtPoint = (mx, my) => {
const dx = mx - cx;
const dy = my - cy;
const dist = Math.sqrt(dx * dx + dy * dy);
if (dist < inner || dist > radius) return null;
let a = Math.atan2(dy, dx);
if (a < -Math.PI / 2) a += Math.PI * 2;
let cumAngle = -Math.PI / 2;
for (const s of slices) {
if (a >= cumAngle && a < cumAngle + s.slice) return s;
cumAngle += s.slice;
}
return null;
};

if (!canvas._donutBound) {
canvas._donutBound = true;
canvas.style.cursor = "pointer";
canvas.addEventListener("mousemove", (e) => {
const rect = canvas.getBoundingClientRect();
const mx = e.clientX - rect.left;
const my = e.clientY - rect.top;
const hit = canvas._donutGetSlice?.(mx, my);
if (hit) {
const pct = ((hit.val / (canvas._donutTotal || 1)) * 100).toFixed(1);
tooltipEl.textContent = `${hit.name}\n${pct}%  ${fmt(hit.val)}`;
tooltipEl.classList.remove("hidden");
tooltipEl.style.left = "0px";
tooltipEl.style.top = "0px";
const tw = tooltipEl.offsetWidth;
const th = tooltipEl.offsetHeight;
const pw = document.body.clientWidth;
let tx = e.clientX + 10;
let ty = e.clientY - th - 6;
if (tx + tw > pw) tx = Math.max(4, e.clientX - tw - 10);
if (ty < 0) ty = e.clientY + 16;
tooltipEl.style.left = tx + "px";
tooltipEl.style.top = ty + "px";
} else {
tooltipEl.classList.add("hidden");
}
});
canvas.addEventListener("mouseleave", () => tooltipEl.classList.add("hidden"));
canvas.addEventListener("click", (e) => {
const rect = canvas.getBoundingClientRect();
const mx = e.clientX - rect.left;
const my = e.clientY - rect.top;
const hit = canvas._donutGetSlice?.(mx, my);
if (hit && hit.name !== "その他") {
const donutFrom = document.getElementById("donutFromDate").value || "";
const donutTo = document.getElementById("donutToDate").value || "";
if (donutFrom) document.getElementById("fromDate").value = donutFrom;
if (donutTo) document.getElementById("toDate").value = donutTo;
document.getElementById("yearShortcuts").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
activeServiceFilters.clear();
activeServiceFilters.add(hit.name);
activeActionFilters.clear();
document.getElementById("serviceShortcuts").querySelectorAll("button").forEach((b) => {
b.classList.toggle("active", b.textContent === hit.name);
});
document.getElementById("actionShortcuts").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
applyFilter();
switchTab("history");
}
});
}
canvas._donutGetSlice = getSliceAtPoint;
canvas._donutTotal = total;
}

/* ── Used donut (by title) ── */

function computeTitleUsedForRange(rows, from, to) {
const titleUsed = {};
rows.forEach((row) => {
const d = parseDateFromRow(row.date);
if (!d) return;
if (from && d < from) return;
if (to && d > to) return;
const type = classifyAction(row.action);
if (type !== "used") return;
const point = parsePointValue(row.point);
const title = row.title || "その他";
titleUsed[title] = (titleUsed[title] || 0) + Math.abs(point);
});
return titleUsed;
}

function drawUsedDonut() {
if (!lastStats) return;
const canvas = document.getElementById("chartUsed");
const periodEl = document.getElementById("usedPeriod");
const from = document.getElementById("usedDonutFromDate").value || null;
const to = document.getElementById("usedDonutToDate").value || null;
if (from && to) {
periodEl.textContent = `${formatDateJP(from)} 〜 ${formatDateJP(to)}`;
} else {
periodEl.textContent = "";
}

const titleUsed = computeTitleUsedForRange(allRows, from, to);
const entries = Object.entries(titleUsed).sort((a, b) => b[1] - a[1]);
if (entries.length === 0) {
const r = setupCanvas(canvas, 0.4);
if (!r) return;
r.ctx.fillStyle = "#aaa"; r.ctx.font = "12px sans-serif"; r.ctx.textAlign = "center";
r.ctx.fillText("データがありません", r.w / 2, r.h / 2);
return;
}

const total = entries.reduce((s, e) => s + e[1], 0);
const topN = entries.slice(0, 8);
const otherSum = entries.slice(8).reduce((s, e) => s + e[1], 0);
if (otherSum > 0) topN.push(["その他", otherSum]);

const r = setupCanvas(canvas, 1.0);
if (!r) return;
const { ctx, w, h } = r;

const cx = w / 2;
const cy = h / 2;
const radius = Math.min(w, h) * 0.44;
const inner = radius * 0.52;
const labelR = (radius + inner) / 2;
const outerLabelR = radius + 20;

let angle = -Math.PI / 2;
const slices = [];
topN.forEach(([name, val], i) => {
const slice = (val / total) * Math.PI * 2;
const midAngle = angle + slice / 2;
ctx.fillStyle = DONUT_COLORS[i % DONUT_COLORS.length];
ctx.beginPath();
ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
ctx.arc(cx, cy, radius, angle, angle + slice);
ctx.arc(cx, cy, inner, angle + slice, angle, true);
ctx.closePath();
ctx.fill();
slices.push({ name, val, slice, midAngle, color: DONUT_COLORS[i % DONUT_COLORS.length] });
angle += slice;
});

drawDonutLabels(ctx, slices, total, cx, cy, labelR, outerLabelR, w, h);

ctx.fillStyle = "#333"; ctx.font = "bold 18px sans-serif";
ctx.textAlign = "center"; ctx.textBaseline = "middle";
ctx.fillText(fmt(total), cx, cy - 9);
ctx.font = "12px sans-serif"; ctx.fillStyle = "#888";
ctx.fillText("利用合計", cx, cy + 12);

setupDonutListeners(canvas, cx, cy, inner, radius, slices, total);
}

/* ── Chart share (save as image) ── */

const SHARE_BRAND_TITLE = "楽天ポイント履歴一括保存";
const SHARE_FOOTER_TEXT = "Chromeウェブストアで「楽天ポイント履歴一括保存」を検索";
const X_INTENT_HASHTAG = "楽天ポイント履歴一括保存";
const STORE_URL = "https://share.google/zKFhTSTBqN4y7cy0A";

let cachedIconImage = null;
function loadBrandIcon() {
if (cachedIconImage) return Promise.resolve(cachedIconImage);
return new Promise((resolve, reject) => {
const img = new Image();
img.onload = () => { cachedIconImage = img; resolve(img); };
img.onerror = reject;
img.src = "icon.png";
});
}

async function buildBrandedImage(contentCanvas, subtitle) {
const icon = await loadBrandIcon().catch(() => null);
const dpr = window.devicePixelRatio || 1;
const sw = contentCanvas.width;
const sh = contentCanvas.height;
const padX = Math.round(28 * dpr);
const padY = Math.round(24 * dpr);
const iconSize = Math.round(36 * dpr);
const brandTitleSize = Math.round(20 * dpr);
const headerGap = Math.round(12 * dpr);
const headerH = Math.max(iconSize, Math.round(brandTitleSize * 1.2));
const subtitleLines = subtitle ? subtitle.split("\n") : [];
const subtitleLineH = Math.round(20 * dpr);
const subtitleH = subtitleLines.length > 0 ? subtitleLineH * subtitleLines.length + Math.round(8 * dpr) : 0;
const footerSize = Math.round(10 * dpr);
const footerH = Math.round(28 * dpr);

const tmp = document.createElement("canvas");
tmp.width = sw + padX * 2;
tmp.height = padY + headerH + headerGap + subtitleH + sh + footerH + padY;
const tctx = tmp.getContext("2d");

tctx.fillStyle = "#ffffff";
tctx.fillRect(0, 0, tmp.width, tmp.height);

const brandTitle = SHARE_BRAND_TITLE;
tctx.font = `700 ${brandTitleSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
const titleW = tctx.measureText(brandTitle).width;
const groupW = (icon ? iconSize + Math.round(10 * dpr) : 0) + titleW;
const groupX = (tmp.width - groupW) / 2;
const headerY = padY;

if (icon) {
tctx.drawImage(icon, groupX, headerY + (headerH - iconSize) / 2, iconSize, iconSize);
}
tctx.fillStyle = "#222";
tctx.textAlign = "left";
tctx.textBaseline = "middle";
tctx.fillText(brandTitle, groupX + (icon ? iconSize + Math.round(10 * dpr) : 0), headerY + headerH / 2);

let cursorY = headerY + headerH + headerGap;

if (subtitleLines.length > 0) {
tctx.textAlign = "center";
tctx.textBaseline = "middle";
subtitleLines.forEach((line, i) => {
if (i === 0) {
tctx.fillStyle = "#444";
tctx.font = `600 ${Math.round(13 * dpr)}px sans-serif`;
} else {
tctx.fillStyle = "#888";
tctx.font = `${Math.round(11 * dpr)}px sans-serif`;
}
tctx.fillText(line, tmp.width / 2, cursorY + subtitleLineH * i + subtitleLineH / 2);
});
cursorY += subtitleH;
}

tctx.drawImage(contentCanvas, padX, cursorY);
cursorY += sh;

tctx.fillStyle = "#9ca3af";
tctx.font = `${footerSize}px sans-serif`;
tctx.textAlign = "right";
tctx.textBaseline = "middle";
tctx.fillText(SHARE_FOOTER_TEXT, tmp.width - padX, cursorY + footerH / 2 + Math.round(2 * dpr));

return tmp;
}

function downloadCanvas(canvas, filename) {
const link = document.createElement("a");
link.download = filename;
link.href = canvas.toDataURL("image/png");
link.click();
}

function canvasToBlob(canvas) {
return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function showShareToast(message, ms = 4500) {
const el = document.getElementById("shareToast");
if (!el) return;
el.textContent = message;
el.classList.remove("hidden");
requestAnimationFrame(() => el.classList.add("show"));
clearTimeout(showShareToast._t);
showShareToast._t = setTimeout(() => {
el.classList.remove("show");
setTimeout(() => el.classList.add("hidden"), 250);
}, ms);
}

function showInfoDialog(title, message, opts = {}) {
return new Promise((resolve) => {
document.getElementById("infoTitle").textContent = title;
document.getElementById("infoMessage").innerHTML = message;
const okBtn = document.getElementById("infoOk");
okBtn.textContent = opts.okLabel || "OK";
const overlay = document.getElementById("infoOverlay");
overlay.classList.remove("hidden");
const close = (confirmed) => {
overlay.classList.add("hidden");
okBtn.removeEventListener("click", onOk);
document.getElementById("infoClose").removeEventListener("click", onCancel);
overlay.removeEventListener("click", outsideClick);
resolve(confirmed);
};
const onOk = () => {
if (typeof opts.onConfirm === "function") opts.onConfirm();
close(true);
};
const onCancel = () => close(false);
const outsideClick = (e) => { if (e.target === overlay) close(false); };
okBtn.addEventListener("click", onOk);
document.getElementById("infoClose").addEventListener("click", onCancel);
overlay.addEventListener("click", outsideClick);
});
}

async function saveCanvasAsImage(canvas, title) {
const branded = await buildBrandedImage(canvas, title);
const filename = (title || "share").replace(/\n/g, "_") + ".png";
downloadCanvas(branded, filename);
}

async function shareCanvasToX(canvas, subtitle, tweetText) {
const branded = await buildBrandedImage(canvas, subtitle);
const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(STORE_URL)}`;
let copied = false;
try {
const blob = await canvasToBlob(branded);
if (blob && navigator.clipboard && window.ClipboardItem) {
await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
copied = true;
}
} catch (e) {
copied = false;
}
window.open(intent, "_blank", "noopener");
if (!copied) {
const filename = (subtitle || "share").replace(/\n/g, "_") + ".png";
downloadCanvas(branded, filename);
showInfoDialog(
"Xに共有",
`<div class="dialog-headline">Xの投稿画面に画像を添付してください</div>
<p class="dialog-subtext">画像をダウンロードフォルダに保存しました。<br>Xの投稿画面の画像追加から添付できます。</p>`
);
} else {
showInfoDialog(
"Xに共有",
`<div class="dialog-headline">Xの投稿画面で画像を貼り付けてください</div>
<div class="dialog-shortcut"><kbd>⌘V</kbd>（Windowsは <kbd>Ctrl</kbd> + <kbd>V</kbd>）</div>
<p class="dialog-subtext">画像はクリップボードにコピー済みです。<br>Xの投稿画面が新しいタブで開きました。</p>`
);
}
}

/* ── Summary share canvas ── */

function drawSummaryCanvas(metrics, opts = {}) {
const dpr = window.devicePixelRatio || 1;
const cols = 3;
const rows = Math.ceil(metrics.length / cols);
const cellW = Math.round(180 * dpr);
const cellH = Math.round(74 * dpr);
const gap = Math.round(10 * dpr);
const padX = Math.round(8 * dpr);
const padY = Math.round(8 * dpr);

const canvas = document.createElement("canvas");
canvas.width = padX * 2 + cellW * cols + gap * (cols - 1);
canvas.height = padY * 2 + cellH * rows + gap * (rows - 1);
const ctx = canvas.getContext("2d");

ctx.fillStyle = "#edf0f5";
ctx.fillRect(0, 0, canvas.width, canvas.height);

metrics.forEach((m, i) => {
const c = i % cols;
const r = Math.floor(i / cols);
const x = padX + c * (cellW + gap);
const y = padY + r * (cellH + gap);
const radius = Math.round(10 * dpr);

ctx.fillStyle = "#eef1f6";
roundRect(ctx, x, y, cellW, cellH, radius);
ctx.fill();

ctx.strokeStyle = "rgba(205, 210, 218, 0.55)";
ctx.lineWidth = Math.max(1, Math.round(1 * dpr));
ctx.stroke();

ctx.fillStyle = "#8a929e";
ctx.font = `${Math.round(11 * dpr)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
ctx.textAlign = "left";
ctx.textBaseline = "top";
ctx.fillText(m.label, x + Math.round(12 * dpr), y + Math.round(12 * dpr));

ctx.fillStyle = m.color || "#444";
ctx.font = `700 ${Math.round(20 * dpr)}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
ctx.textBaseline = "alphabetic";
ctx.fillText(m.value, x + Math.round(12 * dpr), y + cellH - Math.round(14 * dpr));
});

return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
ctx.beginPath();
ctx.moveTo(x + r, y);
ctx.lineTo(x + w - r, y);
ctx.quadraticCurveTo(x + w, y, x + w, y + r);
ctx.lineTo(x + w, y + h - r);
ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
ctx.lineTo(x + r, y + h);
ctx.quadraticCurveTo(x, y + h, x, y + h - r);
ctx.lineTo(x, y + r);
ctx.quadraticCurveTo(x, y, x + r, y);
ctx.closePath();
}

function getTotalSummaryMetrics() {
return [
{ label: "獲得合計", value: document.getElementById("metricTotalGain").textContent, color: "#1b8a3e" },
{ label: "累計チャージ額", value: document.getElementById("metricTotalCharge").textContent, color: "#1565c0" },
{ label: "合計利用額", value: document.getElementById("metricTotalUsed").textContent, color: "#c62828" },
{ label: "ポイント利息累計", value: document.getElementById("metricInterest").textContent, color: "#444" },
{ label: "月平均獲得", value: document.getElementById("metricAvgGain").textContent, color: "#444" },
{ label: "月平均利用", value: document.getElementById("metricAvgUsed").textContent, color: "#444" },
];
}

function getYearSummaryMetrics() {
return [
{ label: "獲得合計", value: document.getElementById("metricYearGain").textContent, color: "#1b8a3e" },
{ label: "累計チャージ額", value: document.getElementById("metricYearCharge").textContent, color: "#1565c0" },
{ label: "合計利用額", value: document.getElementById("metricYearUsed").textContent, color: "#c62828" },
];
}

function buildTweetTextForSummary(periodLabel, metrics) {
const lines = [`楽天ポイントの${periodLabel}サマリー`, ""];
metrics.forEach((m) => lines.push(`${m.label}: ${m.value}`));
lines.push("", `#${X_INTENT_HASHTAG}`);
return lines.join("\n");
}

function computeTotalsForPeriod(rows, from, to) {
let gain = 0, charge = 0, used = 0;
rows.forEach((row) => {
const d = parseDateFromRow(row.date);
if (!d) return;
if (from && d < from) return;
if (to && d > to) return;
const point = parsePointValue(row.point);
const type = classifyAction(row.action);
if (type === "gain") gain += point;
else if (type === "charge") charge += point;
else if (type === "used") used += point;
});
return { gain, charge, used };
}

function buildChartTweet(chartLabel, totals) {
const lines = [chartLabel, ""];
lines.push(`獲得: ${fmt(totals.gain)}`, `チャージ: ${fmt(totals.charge)}`, `利用: ${fmt(totals.used)}`);
lines.push("", `#${X_INTENT_HASHTAG}`);
return lines.join("\n");
}

function buildBreakdownTweet(chartLabel, breakdown) {
const lines = [chartLabel];
const topN = breakdown.slice(0, 3);
topN.forEach(([name, val], i) => {
lines.push(`${i + 1}位 ${name}: ${fmt(val)}`);
});
lines.push("", `#${X_INTENT_HASHTAG}`);
return lines.join("\n");
}

function getMonthlyChartRange() {
const labels = buildMonthlyWindow(monthlyPage);
const first = labels[0];
const last = labels[labels.length - 1];
const [fy, fm] = first.split("/").map(Number);
const [ly, lm] = last.split("/").map(Number);
const lastDay = new Date(ly, lm, 0).getDate();
return {
from: `${fy}-${String(fm).padStart(2, "0")}-01`,
to: `${ly}-${String(lm).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
label: `${fy}/${fm} 〜 ${ly}/${lm}`,
};
}

function getDonutPeriodLabel(fromVal, toVal) {
if (fromVal && toVal) return `${formatDateJP(fromVal)} 〜 ${formatDateJP(toVal)}`;
const dates = allRows.map((r) => parseDateFromRow(r.date)).filter(Boolean).sort();
if (dates.length === 0) return "";
return `${formatDateJP(dates[0])} 〜 ${formatDateJP(dates[dates.length - 1])}`;
}

document.getElementById("monthlyShare").addEventListener("click", () => {
const title = document.getElementById("monthlyTitle").textContent;
saveCanvasAsImage(document.getElementById("chartMonthly"), title);
});
document.getElementById("monthlyShareX").addEventListener("click", () => {
const title = document.getElementById("monthlyTitle").textContent;
const { from, to } = getMonthlyChartRange();
const totals = computeTotalsForPeriod(allRows, from, to);
shareCanvasToX(document.getElementById("chartMonthly"), title, buildChartTweet("楽天ポイント月別推移", totals));
});

document.getElementById("totalShareImage").addEventListener("click", () => {
const metrics = getTotalSummaryMetrics();
const canvas = drawSummaryCanvas(metrics);
saveCanvasAsImage(canvas, "全期間サマリー");
});
document.getElementById("totalShareX").addEventListener("click", () => {
const metrics = getTotalSummaryMetrics();
const canvas = drawSummaryCanvas(metrics);
shareCanvasToX(canvas, "全期間サマリー", buildTweetTextForSummary("全期間", metrics));
});
document.getElementById("yearShareImage").addEventListener("click", () => {
const metrics = getYearSummaryMetrics();
const canvas = drawSummaryCanvas(metrics);
saveCanvasAsImage(canvas, "今年のサマリー");
});
document.getElementById("yearShareX").addEventListener("click", () => {
const metrics = getYearSummaryMetrics();
const canvas = drawSummaryCanvas(metrics);
shareCanvasToX(canvas, "今年のサマリー", buildTweetTextForSummary("今年", metrics));
});
document.getElementById("donutPeriodToggle").addEventListener("click", () => {
const panel = document.getElementById("donutPeriodPanel");
const btn = document.getElementById("donutPeriodToggle");
panel.classList.toggle("hidden");
btn.classList.toggle("open");
});
document.getElementById("donutFromDate").addEventListener("change", () => drawServiceDonut());
document.getElementById("donutToDate").addEventListener("change", () => drawServiceDonut());

document.getElementById("serviceShare").addEventListener("click", () => {
const period = document.getElementById("servicePeriod").textContent;
const title = "サービス別獲得ポイント" + (period ? "\n" + period : "");
saveCanvasAsImage(document.getElementById("chartService"), title);
});
document.getElementById("serviceShareX").addEventListener("click", () => {
const period = document.getElementById("servicePeriod").textContent;
const title = "サービス別獲得ポイント" + (period ? "\n" + period : "");
const fromVal = document.getElementById("donutFromDate").value || null;
const toVal = document.getElementById("donutToDate").value || null;
const serviceGain = computeServiceGainForRange(allRows, fromVal, toVal);
const entries = Object.entries(serviceGain).sort((a, b) => b[1] - a[1]);
shareCanvasToX(document.getElementById("chartService"), title, buildBreakdownTweet("楽天ポイント獲得内訳", entries));
});
document.getElementById("usedDonutPeriodToggle").addEventListener("click", () => {
const panel = document.getElementById("usedDonutPeriodPanel");
const btn = document.getElementById("usedDonutPeriodToggle");
panel.classList.toggle("hidden");
btn.classList.toggle("open");
});
document.getElementById("usedDonutFromDate").addEventListener("change", () => drawUsedDonut());
document.getElementById("usedDonutToDate").addEventListener("change", () => drawUsedDonut());
document.getElementById("usedShare").addEventListener("click", () => {
const period = document.getElementById("usedPeriod").textContent;
const title = "詳細別利用ポイント" + (period ? "\n" + period : "");
saveCanvasAsImage(document.getElementById("chartUsed"), title);
});
document.getElementById("usedShareX").addEventListener("click", () => {
const period = document.getElementById("usedPeriod").textContent;
const title = "詳細別利用ポイント" + (period ? "\n" + period : "");
const fromVal = document.getElementById("usedDonutFromDate").value || null;
const toVal = document.getElementById("usedDonutToDate").value || null;
const titleUsed = computeTitleUsedForRange(allRows, fromVal, toVal);
const entries = Object.entries(titleUsed).sort((a, b) => b[1] - a[1]);
shareCanvasToX(document.getElementById("chartUsed"), title, buildBreakdownTweet("楽天ポイント利用内訳", entries));
});

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

let activeServiceFilters = new Set();
let activeActionFilters = new Set();
let sortColumn = "date";
let sortDirection = "desc";

function sortFilteredRows() {
filteredRows.sort((a, b) => {
let cmp = 0;
if (sortColumn === "date") {
const da = parseDateFromRow(a.date) || "";
const db = parseDateFromRow(b.date) || "";
cmp = da.localeCompare(db);
} else if (sortColumn === "point") {
cmp = parsePointValue(a.point) - parsePointValue(b.point);
}
return sortDirection === "asc" ? cmp : -cmp;
});
}

function updateSortUI() {
document.querySelectorAll("#tab-history th.sortable").forEach((th) => {
th.classList.remove("asc", "desc");
if (th.dataset.sort === sortColumn) th.classList.add(sortDirection);
});
}

function applyFilter() {
const from = document.getElementById("fromDate").value || null;
const to = document.getElementById("toDate").value || null;
if (from && to && from > to) return;
filteredRows = allRows.filter((row) => {
const d = parseDateFromRow(row.date);
if (!d) return false;
if (from && d < from) return false;
if (to && d > to) return false;
if (activeServiceFilters.size > 0 && !activeServiceFilters.has(row.service)) return false;
if (activeActionFilters.size > 0 && !activeActionFilters.has(classifyAction(row.action))) return false;
return true;
});
sortFilteredRows();
updateSortUI();
renderHistoryTable(filteredRows);
}

function setDefaultDates() {
const dates = allRows.map((r) => parseDateFromRow(r.date)).filter(Boolean).sort();
if (dates.length === 0) return;
document.getElementById("fromDate").value = dates[0];
document.getElementById("toDate").value = dates[dates.length - 1];
document.getElementById("donutFromDate").value = dates[0];
document.getElementById("donutToDate").value = dates[dates.length - 1];
document.getElementById("usedDonutFromDate").value = dates[0];
document.getElementById("usedDonutToDate").value = dates[dates.length - 1];
buildYearShortcuts();
buildServiceShortcuts();
buildActionShortcuts();
}

function buildYearShortcuts() {
const container = document.getElementById("yearShortcuts");
container.innerHTML = "";
const now = new Date();
const cy = now.getFullYear();
const cm = now.getMonth(); // 0-based

const dates = allRows.map((r) => parseDateFromRow(r.date)).filter(Boolean).sort();
const items = [];
// 全期間
if (dates.length > 0) {
items.push({ label: "全期間", from: dates[0], to: dates[dates.length - 1] });
}
// 3年前から今年まで
for (let y = cy - 3; y <= cy; y++) {
items.push({ label: String(y), from: `${y}-01-01`, to: `${y}-12-31` });
}
// 3ヶ月前から今月まで
for (let i = 3; i >= 0; i--) {
const d = new Date(cy, cm - i, 1);
const y = d.getFullYear();
const m = d.getMonth() + 1;
const ms = String(m).padStart(2, "0");
const lastDay = new Date(y, m, 0).getDate();
items.push({ label: `${y}年${m}月`, from: `${y}-${ms}-01`, to: `${y}-${ms}-${String(lastDay).padStart(2, "0")}` });
}

items.forEach((item, idx) => {
const btn = document.createElement("button");
btn.type = "button";
btn.textContent = item.label;
if (idx === 0) btn.classList.add("active");
btn.addEventListener("click", () => {
document.getElementById("fromDate").value = item.from;
document.getElementById("toDate").value = item.to;
container.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
btn.classList.add("active");
applyFilter();
});
container.appendChild(btn);
});
}

function buildServiceShortcuts() {
const container = document.getElementById("serviceShortcuts");
container.innerHTML = "";
const services = new Set(allRows.map((r) => r.service).filter(Boolean));
const sorted = [...services].sort();

sorted.forEach((svc) => {
const btn = document.createElement("button");
btn.type = "button";
btn.textContent = svc;
btn.addEventListener("click", () => {
if (activeServiceFilters.has(svc)) {
activeServiceFilters.delete(svc);
btn.classList.remove("active");
} else {
activeServiceFilters.add(svc);
btn.classList.add("active");
}
applyFilter();
});
container.appendChild(btn);
});
}

function buildActionShortcuts() {
const container = document.getElementById("actionShortcuts");
container.innerHTML = "";
const types = [
{ key: "gain", label: "獲得" },
{ key: "charge", label: "チャージ" },
{ key: "used", label: "利用" },
];
types.forEach(({ key, label }) => {
const btn = document.createElement("button");
btn.type = "button";
btn.textContent = label;
btn.addEventListener("click", () => {
if (activeActionFilters.has(key)) {
activeActionFilters.delete(key);
btn.classList.remove("active");
} else {
activeActionFilters.add(key);
btn.classList.add("active");
}
applyFilter();
});
container.appendChild(btn);
});
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

function sortRowsByDate(rows) {
return rows.slice().sort((a, b) => {
const da = parseDateFromRow(a.date) || "";
const db = parseDateFromRow(b.date) || "";
return db.localeCompare(da); // 新しい順
});
}

async function refreshRows() {
try {
allRows = sortRowsByDate(await getStorageRows());
filteredRows = [...allRows];
updateDashboard(allRows);
setDefaultDates();
renderHistoryTable(filteredRows);
} catch (e) {
showInfoDialog("エラー", "履歴の取得に失敗しました: " + e.message);
}
}

function getStoredValue(key) {
return new Promise((resolve) => {
chrome.storage.local.get([key], (r) => resolve(r[key]));
});
}

async function downloadAllRowsCsv(rows) {
if (!rows || rows.length === 0) {
await showInfoDialog("エクスポート", "エクスポートできる履歴がありません");
return;
}
const sorted = sortRowsByDate(rows);
downloadCsv(rowsToCsv(sorted), null, null);
}

function setScrapingButtonState(isScraping) {
const btn = document.getElementById("dashboardExportButton");
const checkbox = document.getElementById("forceFullScrape");
if (isScraping) {
btn.classList.add("scraping");
btn.innerHTML = '<span class="progress-spinner" aria-hidden="true"></span><span>取得中止</span>';
checkbox.disabled = true;
} else {
btn.classList.remove("scraping");
btn.textContent = "全期間CSVエクスポート";
checkbox.disabled = false;
}
}

async function cancelScrape() {
await new Promise((resolve) => {
chrome.storage.local.set({
[SCRAPE_CANCEL_KEY]: true,
[PENDING_EXPORT_KEY]: false,
}, resolve);
});
setScrapingButtonState(false);
showShareToast("取得を中止しました。", 2500);
setTimeout(() => {
chrome.storage.local.remove([SCRAPE_CANCEL_KEY, SCRAPE_SESSION_ADDED_KEY]);
}, 1500);
}

async function handleDashboardExport() {
const btn = document.getElementById("dashboardExportButton");
if (btn.classList.contains("scraping")) {
await cancelScrape();
return;
}
const forceFull = document.getElementById("forceFullScrape").checked;
const lastScrapeDate = await getStoredValue(LAST_SCRAPE_DATE_KEY);
if (!forceFull && lastScrapeDate === getCurrentDateString()) {
const rows = await getStorageRows();
showShareToast("本日取得済みのためスキップしてCSVを出力します。", 3000);
await downloadAllRowsCsv(rows);
return;
}
await new Promise((resolve) => {
chrome.storage.local.set({
[PENDING_EXPORT_KEY]: true,
[SCRAPE_SESSION_ADDED_KEY]: 0,
}, resolve);
});
chrome.storage.local.remove([SCRAPE_CANCEL_KEY]);
setScrapingButtonState(true);
showShareToast("履歴を取得中です。完了後に自動でCSVをダウンロードします。", 4000);
const url = forceFull
? "https://point.rakuten.co.jp/history/?page=1&scrape=1&full=1#point_history"
: "https://point.rakuten.co.jp/history/?page=1&scrape=1#point_history";
window.open(url);
}

document.getElementById("dashboardExportButton").addEventListener("click", handleDashboardExport);
document.getElementById("exportCsvButton").addEventListener("click", async () => {
const from = document.getElementById("fromDate").value || null;
const to = document.getElementById("toDate").value || null;
if (from && to && from > to) { await showInfoDialog("エクスポート", "開始日は終了日以前を指定してください"); return; }
if (filteredRows.length === 0) { await showInfoDialog("エクスポート", "エクスポートできる履歴がありません"); return; }
downloadCsv(rowsToCsv(filteredRows), from, to);
});
document.getElementById("exportXlsxButton").addEventListener("click", async () => {
const from = document.getElementById("fromDate").value || null;
const to = document.getElementById("toDate").value || null;
if (from && to && from > to) { await showInfoDialog("エクスポート", "開始日は終了日以前を指定してください"); return; }
if (filteredRows.length === 0) { await showInfoDialog("エクスポート", "エクスポートできる履歴がありません"); return; }
downloadXlsx(filteredRows, from, to);
});
document.getElementById("fromDate").addEventListener("change", () => {
document.getElementById("yearShortcuts").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
applyFilter();
});
document.getElementById("toDate").addEventListener("change", () => {
document.getElementById("yearShortcuts").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
applyFilter();
});

document.querySelector("#tab-history table thead").addEventListener("click", (e) => {
const th = e.target.closest("th.sortable");
if (!th) return;
const col = th.dataset.sort;
if (sortColumn === col) {
sortDirection = sortDirection === "asc" ? "desc" : "asc";
} else {
sortColumn = col;
sortDirection = "desc";
}
sortFilteredRows();
updateSortUI();
renderHistoryTable(filteredRows);
});

const importInput = document.getElementById("importCsvInput");
document.getElementById("importCsvButton").addEventListener("click", () => { importInput.value = ""; importInput.click(); });
importInput.addEventListener("change", () => { if (importInput.files.length > 0) importCsvFiles(importInput.files); });

const CALLOUT_SHOWN_KEY = "exportCalloutShown";

function showExportCalloutIfNeeded() {
chrome.storage.local.get([CALLOUT_SHOWN_KEY], (r) => {
if (r[CALLOUT_SHOWN_KEY]) return;
chrome.storage.local.set({ [CALLOUT_SHOWN_KEY]: true });
const el = document.getElementById("exportCallout");
el.classList.remove("hidden");
el.addEventListener("click", () => el.classList.add("hidden"));
setTimeout(() => el.classList.add("hidden"), 6000);
});
}

chrome.storage.onChanged.addListener((changes, area) => {
if (area !== "local") return;
if (Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) refreshRows();
if (Object.prototype.hasOwnProperty.call(changes, LAST_SCRAPE_DATE_KEY)) {
chrome.storage.local.get([PENDING_EXPORT_KEY, LAST_SCRAPE_ADDED_COUNT_KEY], async (r) => {
if (!r[PENDING_EXPORT_KEY]) return;
chrome.storage.local.set({ [PENDING_EXPORT_KEY]: false });
setScrapingButtonState(false);
const addedCount = typeof r[LAST_SCRAPE_ADDED_COUNT_KEY] === "number" ? r[LAST_SCRAPE_ADDED_COUNT_KEY] : 0;
const rows = await getStorageRows();
await downloadAllRowsCsv(rows);
await showInfoDialog("取得完了", `履歴取得が完了しました（新規追加 ${addedCount} 件）`);
});
}
});

async function syncScrapingButtonState() {
await new Promise((resolve) => {
chrome.storage.local.remove([PENDING_EXPORT_KEY, SCRAPE_SESSION_ADDED_KEY, SCRAPE_CANCEL_KEY], resolve);
});
setScrapingButtonState(false);
}

// レイアウト完了後に初回描画
requestAnimationFrame(() => requestAnimationFrame(() => {
refreshRows();
showExportCalloutIfNeeded();
syncScrapingButtonState();
}));
