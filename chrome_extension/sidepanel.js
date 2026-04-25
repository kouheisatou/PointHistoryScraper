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
const outerLabelR = radius + 14;

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
slices.forEach((s) => {
const pct = (s.val / total) * 100;
const large = pct >= 6;
const lx = cx + Math.cos(s.midAngle) * (large ? labelR : outerLabelR);
const ly = cy + Math.sin(s.midAngle) * (large ? labelR : outerLabelR);

ctx.save();
ctx.textAlign = "center"; ctx.textBaseline = "middle";
if (large) {
ctx.fillStyle = "#fff";
ctx.font = "bold 10px sans-serif";
ctx.fillText(s.name, lx, ly - 6);
ctx.font = "9px sans-serif";
ctx.fillText(`${pct.toFixed(1)}% ${fmt(s.val)}`, lx, ly + 7);
} else {
ctx.fillStyle = s.color;
ctx.font = "8px sans-serif";
const isRight = Math.cos(s.midAngle) >= 0;
ctx.textAlign = isRight ? "left" : "right";
ctx.fillText(`${s.name} ${pct.toFixed(1)}%`, lx + (isRight ? 4 : -4), ly - 5);
ctx.fillStyle = "#888";
ctx.fillText(`${fmt(s.val)}`, lx + (isRight ? 4 : -4), ly + 6);
}
ctx.restore();
});

// Center text
ctx.fillStyle = "#333"; ctx.font = "bold 14px sans-serif";
ctx.textAlign = "center"; ctx.textBaseline = "middle";
ctx.fillText(fmt(total), cx, cy - 7);
ctx.font = "10px sans-serif"; ctx.fillStyle = "#888";
ctx.fillText("獲得合計", cx, cy + 9);

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
const outerLabelR = radius + 14;

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

slices.forEach((s) => {
const pct = (s.val / total) * 100;
const large = pct >= 6;
const lx = cx + Math.cos(s.midAngle) * (large ? labelR : outerLabelR);
const ly = cy + Math.sin(s.midAngle) * (large ? labelR : outerLabelR);

ctx.save();
ctx.textAlign = "center"; ctx.textBaseline = "middle";
if (large) {
ctx.fillStyle = "#fff";
ctx.font = "bold 10px sans-serif";
ctx.fillText(s.name, lx, ly - 6);
ctx.font = "9px sans-serif";
ctx.fillText(`${pct.toFixed(1)}% ${fmt(s.val)}`, lx, ly + 7);
} else {
ctx.fillStyle = s.color;
ctx.font = "8px sans-serif";
const isRight = Math.cos(s.midAngle) >= 0;
ctx.textAlign = isRight ? "left" : "right";
ctx.fillText(`${s.name} ${pct.toFixed(1)}%`, lx + (isRight ? 4 : -4), ly - 5);
ctx.fillStyle = "#888";
ctx.fillText(`${fmt(s.val)}`, lx + (isRight ? 4 : -4), ly + 6);
}
ctx.restore();
});

ctx.fillStyle = "#333"; ctx.font = "bold 14px sans-serif";
ctx.textAlign = "center"; ctx.textBaseline = "middle";
ctx.fillText(fmt(total), cx, cy - 7);
ctx.font = "10px sans-serif"; ctx.fillStyle = "#888";
ctx.fillText("利用合計", cx, cy + 9);

setupDonutListeners(canvas, cx, cy, inner, radius, slices, total);
}

/* ── Chart share (save as image) ── */

function saveCanvasAsImage(canvas, title) {
const dpr = window.devicePixelRatio || 1;
const sw = canvas.width;
const sh = canvas.height;
const pad = Math.round(32 * dpr);
const headerH = Math.round(24 * dpr);
const lines = title.split("\n");
const titleLineH = Math.round(22 * dpr);
const titleH = titleLineH * lines.length;
const tmp = document.createElement("canvas");
tmp.width = sw + pad * 2;
tmp.height = sh + pad + headerH + titleH + pad;
const tctx = tmp.getContext("2d");
// Background
tctx.fillStyle = "#fff";
tctx.fillRect(0, 0, tmp.width, tmp.height);
// Header: 楽天ポイント獲得利用履歴
tctx.fillStyle = "#888";
tctx.font = `${12 * dpr}px sans-serif`;
tctx.textAlign = "center";
tctx.textBaseline = "middle";
tctx.fillText("楽天ポイント獲得利用履歴", tmp.width / 2, pad + headerH / 2);
// Title (multi-line)
tctx.fillStyle = "#333";
tctx.font = `bold ${14 * dpr}px sans-serif`;
lines.forEach((line, i) => {
if (i > 0) { tctx.font = `${11 * dpr}px sans-serif`; tctx.fillStyle = "#888"; }
tctx.fillText(line, tmp.width / 2, pad + headerH + titleLineH * i + titleLineH / 2);
});
// Chart
tctx.drawImage(canvas, pad, pad + headerH + titleH);
// Download
const link = document.createElement("a");
link.download = title.replace(/\n/g, "_") + ".png";
link.href = tmp.toDataURL("image/png");
link.click();
}

document.getElementById("monthlyShare").addEventListener("click", () => {
const title = document.getElementById("monthlyTitle").textContent;
saveCanvasAsImage(document.getElementById("chartMonthly"), title);
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
document.getElementById("exportXlsxButton").addEventListener("click", () => {
const from = document.getElementById("fromDate").value || null;
const to = document.getElementById("toDate").value || null;
if (from && to && from > to) { window.alert("開始日は終了日以前を指定してください"); return; }
if (filteredRows.length === 0) { window.alert("エクスポートできる履歴がありません"); return; }
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
if (area === "local" && Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) refreshRows();
});

// レイアウト完了後に初回描画
requestAnimationFrame(() => requestAnimationFrame(() => {
refreshRows();
showExportCalloutIfNeeded();
}));
