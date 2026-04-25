const STORAGE_KEY = "rakutenPointHistoryRows";
const COLUMNS = ["date", "service", "title", "action", "point", "note"];
const UTF8_BOM = new Uint8Array([0xEF, 0xBB, 0xBF]);

let allRows = [];
let filteredRows = [];

function getCurrentDateString() {
const today = new Date();
const year = today.getFullYear();
const month = (today.getMonth() + 1).toString().padStart(2, "0");
const day = today.getDate().toString().padStart(2, "0");
return `${year}${month}${day}`;
}

function parseDateFromRow(dateText) {
if (!dateText) return null;
const matched = String(dateText).match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
if (!matched) return null;
const year = matched[1];
const month = matched[2].padStart(2, "0");
const day = matched[3].padStart(2, "0");
return `${year}-${month}-${day}`;
}

function sanitizeCsvFormulaValue(value) {
if (/^[=+\-@]/.test(value)) {
return `'${value}`;
}
return value;
}

function escapeCsvValue(value) {
const raw = value == null ? "" : String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const safe = sanitizeCsvFormulaValue(raw);
if (safe.includes('"') || safe.includes(",") || safe.includes("\n")) {
return `"${safe.replace(/"/g, '""')}"`;
}
return safe;
}

function rowsToCsv(rows) {
const header = COLUMNS.join(",");
const lines = rows.map((row) => COLUMNS.map((col) => escapeCsvValue(row[col])).join(","));
return [header, ...lines].join("\n");
}

function downloadCsv(csv, fromDate, toDate) {
	const blob = new Blob([UTF8_BOM, csv], { type: "text/csv;charset=utf-8" });
	const downloadUrl = URL.createObjectURL(blob);
	const link = document.createElement("a");
	const fromLabel = fromDate || "all";
	const toLabel = toDate || "all";
	link.href = downloadUrl;
	link.download = `rakuten-point-history_${getCurrentDateString()}_${fromLabel}_${toLabel}.csv`;
	document.body.appendChild(link);
	link.click();
	requestAnimationFrame(() => {
		link.remove();
		URL.revokeObjectURL(downloadUrl);
	});
}

function getStorageRows() {
return new Promise((resolve, reject) => {
chrome.storage.local.get([STORAGE_KEY], (result) => {
if (chrome.runtime.lastError) {
reject(new Error(chrome.runtime.lastError.message));
return;
}
resolve(Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : []);
});
});
}

function formatMetricDate(dateArray, picker) {
if (dateArray.length === 0) return "-";
if (picker === "min") return dateArray[0];
return dateArray[dateArray.length - 1];
}

function updateDashboard(rows) {
const allDates = rows.map((row) => parseDateFromRow(row.date)).filter(Boolean).sort();
document.getElementById("metricTotal").textContent = String(allRows.length);
document.getElementById("metricVisible").textContent = String(rows.length);
document.getElementById("metricMinDate").textContent = formatMetricDate(allDates, "min");
document.getElementById("metricMaxDate").textContent = formatMetricDate(allDates, "max");
}

function renderHistoryTable(rows) {
const empty = document.getElementById("historyEmpty");
const body = document.getElementById("historyTableBody");
body.innerHTML = "";

if (rows.length === 0) {
empty.classList.remove("hidden");
return;
}

empty.classList.add("hidden");
rows.forEach((row) => {
const tr = document.createElement("tr");
COLUMNS.forEach((column) => {
const td = document.createElement("td");
td.textContent = row[column] || "";
tr.appendChild(td);
});
body.appendChild(tr);
});
}

function applyDateFilter() {
const fromDate = document.getElementById("fromDate").value || null;
const toDate = document.getElementById("toDate").value || null;

if (fromDate && toDate && fromDate > toDate) {
window.alert("開始日は終了日以前を指定してください");
return;
}

filteredRows = allRows.filter((row) => {
const rowDate = parseDateFromRow(row.date);
if (!rowDate) return false;
if (fromDate && rowDate < fromDate) return false;
if (toDate && rowDate > toDate) return false;
return true;
});

updateDashboard(filteredRows);
renderHistoryTable(filteredRows);
}

function clearFilter() {
document.getElementById("fromDate").value = "";
document.getElementById("toDate").value = "";
filteredRows = [...allRows];
updateDashboard(filteredRows);
renderHistoryTable(filteredRows);
}

async function refreshRows() {
try {
allRows = await getStorageRows();
filteredRows = [...allRows];
updateDashboard(filteredRows);
renderHistoryTable(filteredRows);
} catch (error) {
window.alert(`履歴の取得に失敗しました: ${error.message}`);
}
}

function startScrape() {
window.open("https://point.rakuten.co.jp/history/?page=1&scrape=1#point_history");
}

function exportCsv() {
const fromDate = document.getElementById("fromDate").value || null;
const toDate = document.getElementById("toDate").value || null;
if (fromDate && toDate && fromDate > toDate) {
window.alert("開始日は終了日以前を指定してください");
return;
}

if (filteredRows.length === 0) {
window.alert("エクスポートできる履歴がありません");
return;
}

const csv = rowsToCsv(filteredRows);
downloadCsv(csv, fromDate, toDate);
}

document.getElementById("startScrapeButton").addEventListener("click", startScrape);
document.getElementById("refreshButton").addEventListener("click", refreshRows);
document.getElementById("applyFilterButton").addEventListener("click", applyDateFilter);
document.getElementById("clearFilterButton").addEventListener("click", clearFilter);
document.getElementById("exportCsvButton").addEventListener("click", exportCsv);

chrome.storage.onChanged.addListener((changes, areaName) => {
if (areaName !== "local") return;
if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) return;
refreshRows();
});

refreshRows();
