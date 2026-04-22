const STORAGE_KEY = "rakutenPointHistoryRows";
const COLUMNS = ["date", "service", "title", "action", "point", "note"];

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

function getNextPageUrl() {
	const pagination = document.querySelector(".pagination");
	if (!pagination || pagination.children.length === 0) return null;
	const nextButton = pagination.children[pagination.children.length - 1];
	if (!nextButton || !nextButton.innerText || !nextButton.innerText.includes("NEXT")) return null;
	const anchor = nextButton.querySelector("a");
	if (!anchor || !anchor.href) return null;
	const url = new URL(anchor.href);
	url.searchParams.set("scrape", "1");
	url.hash = "point_history";
	return url.toString();
}

async function collectHistory() {
	const existingRows = await getStorageRows();
	const mergedRows = [...existingRows];
	const keySet = new Set(existingRows.map(buildRowKey));
	const currentPageRows = extractRowsFromPage();
	let addedCount = 0;

	currentPageRows.forEach((row) => {
		const key = buildRowKey(row);
		if (keySet.has(key)) return;
		keySet.add(key);
		mergedRows.push(row);
		addedCount += 1;
	});

	if (addedCount > 0) {
		await setStorageRows(mergedRows);
	}

	const nextPageUrl = getNextPageUrl();
	if (nextPageUrl) {
		setTimeout(() => {
			window.open(nextPageUrl);
			window.close();
		}, 3000);
		return;
	}

	window.alert(`履歴取得が完了しました（新規追加 ${addedCount} 件）`);
	window.close();
}

const isScrapeEnabled = new URL(window.location.href).searchParams.get("scrape") === "1";
if (isScrapeEnabled) {
	collectHistory();
}
