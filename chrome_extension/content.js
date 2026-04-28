const STORAGE_KEY = "rakutenPointHistoryRows";
const LAST_SCRAPE_DATE_KEY = "rakutenPointHistoryLastScrapeDate";
const LAST_SCRAPE_ADDED_COUNT_KEY = "rakutenPointHistoryLastScrapeAddedCount";
const SCRAPE_SESSION_ADDED_KEY = "rakutenPointHistorySessionAddedCount";
const SCRAPE_CANCEL_KEY = "rakutenPointHistoryCancelScrape";
const COLUMNS = ["date", "service", "title", "action", "point", "note"];

function getTodayKey() {
	const d = new Date();
	return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function getSessionAddedCount() {
	return new Promise((resolve) => {
		chrome.storage.local.get([SCRAPE_SESSION_ADDED_KEY], (r) => {
			resolve(typeof r[SCRAPE_SESSION_ADDED_KEY] === "number" ? r[SCRAPE_SESSION_ADDED_KEY] : 0);
		});
	});
}

function getStorageRows() {
	return new Promise((resolve) => {
		chrome.storage.local.get([STORAGE_KEY], (result) => {
			resolve(Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : []);
		});
	});
}

function setStorageRows(rows) {
	return new Promise((resolve) => {
		chrome.storage.local.set({ [STORAGE_KEY]: rows }, resolve);
	});
}

function buildRowKey(row) {
	return COLUMNS.map((column) => row[column] || "").join("\u0001");
}

function normalizeText(value) {
	return String(value || "").replace(/\r/g, "").trim();
}

function extractRowsFromPage() {
	const tableBody = document.querySelector(".history-table tbody");
	if (!tableBody) return [];

	const rows = [];
	for (let i = 0; i < tableBody.children.length; i++) {
		const row = tableBody.children[i];
		try {
			const date = normalizeText(row.querySelector(".date").innerText).replace(/\n/g, "/");
			const service = normalizeText(row.querySelector(".service").innerText).replace(/\n/g, " ");
			const title = normalizeText(row.querySelector(".detail").innerText).split("\n")[0];
			const action = normalizeText(row.querySelector(".action").innerText).replace(/\n/g, ".");
			const point = normalizeText(row.querySelector(".point").innerText).replace(/\n/g, "");
			const note = normalizeText(row.querySelector(".note").innerText);
			rows.push({ date, service, title, action, point, note });
		} catch (e) {
		}
	}
	return rows;
}

const currentUrlParams = new URL(window.location.href).searchParams;
const isScrapeEnabled = currentUrlParams.get("scrape") === "1";
const isFullScrape = currentUrlParams.get("full") === "1";

function getNextPageUrl() {
	const pagination = document.querySelector(".pagination");
	if (!pagination || pagination.children.length === 0) return null;
	const nextButton = pagination.children[pagination.children.length - 1];
	if (!nextButton || !nextButton.innerText || !nextButton.innerText.includes("NEXT")) return null;
	const anchor = nextButton.querySelector("a");
	if (!anchor || !anchor.href) return null;
	const url = new URL(anchor.href);
	url.searchParams.set("scrape", "1");
	if (isFullScrape) url.searchParams.set("full", "1");
	url.hash = "point_history";
	return url.toString();
}

async function collectHistory() {
	const existingRows = await getStorageRows();
	const mergedRows = [...existingRows];
	const keySet = new Set(existingRows.map(buildRowKey));
	const currentPageRows = extractRowsFromPage();
	let addedThisPage = 0;
	let duplicateFound = false;

	currentPageRows.forEach((row) => {
		const key = buildRowKey(row);
		if (keySet.has(key)) {
			duplicateFound = true;
			return;
		}
		keySet.add(key);
		mergedRows.push(row);
		addedThisPage += 1;
	});

	if (addedThisPage > 0) {
		await setStorageRows(mergedRows);
	}

	const totalAdded = (await getSessionAddedCount()) + addedThisPage;

	const shouldStop = duplicateFound && !isFullScrape;
	const nextPageUrl = shouldStop ? null : getNextPageUrl();
	if (nextPageUrl) {
		await new Promise((resolve) => {
			chrome.storage.local.set({ [SCRAPE_SESSION_ADDED_KEY]: totalAdded }, resolve);
		});
		setTimeout(() => {
			window.open(nextPageUrl);
			window.close();
		}, 3000);
		return;
	}

	await new Promise((resolve) => {
		chrome.storage.local.remove([SCRAPE_SESSION_ADDED_KEY], resolve);
	});
	await new Promise((resolve) => {
		chrome.storage.local.set({
			[LAST_SCRAPE_ADDED_COUNT_KEY]: totalAdded,
			[LAST_SCRAPE_DATE_KEY]: getTodayKey(),
		}, resolve);
	});
	window.close();
}

if (isScrapeEnabled) {
	chrome.storage.local.get([SCRAPE_CANCEL_KEY], (r) => {
		if (r[SCRAPE_CANCEL_KEY]) {
			window.close();
			return;
		}
		chrome.storage.onChanged.addListener((changes, area) => {
			if (area !== "local") return;
			if (changes[SCRAPE_CANCEL_KEY] && changes[SCRAPE_CANCEL_KEY].newValue) {
				window.close();
			}
		});
		collectHistory();
	});
}
