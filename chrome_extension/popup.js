const STORAGE_KEY = "rakutenPointHistoryRows";
const COLUMNS = ["date", "service", "title", "action", "point", "note"];

function getCurrentDate() {
	const today = new Date();
	const year = today.getFullYear();
	const month = (today.getMonth() + 1).toString().padStart(2, "0");
	const day = today.getDate().toString().padStart(2, "0");
	return `${year}${month}${day}`;
}

function getStorageRows() {
	return new Promise((resolve) => {
		chrome.storage.local.get([STORAGE_KEY], (result) => {
			resolve(Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : []);
		});
	});
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

function escapeCsvValue(value) {
	const raw = value == null ? "" : String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	if (raw.includes('"') || raw.includes(",") || raw.includes("\n")) {
		return `"${raw.replace(/"/g, '""')}"`;
	}
	return raw;
}

function rowsToCsv(rows) {
	const header = COLUMNS.join(",");
	const lines = rows.map((row) => COLUMNS.map((col) => escapeCsvValue(row[col])).join(","));
	return [header, ...lines].join("\n");
}

function downloadCsv(csv, fromDate, toDate) {
	const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: "text/csv;charset=utf-8" });
	const downloadUrl = URL.createObjectURL(blob);
	const link = document.createElement("a");
	const fromLabel = fromDate || "all";
	const toLabel = toDate || "all";
	link.href = downloadUrl;
	link.download = `rakuten-point-history_${getCurrentDate()}_${fromLabel}_${toLabel}.csv`;
	link.click();
	URL.revokeObjectURL(downloadUrl);
}

document.getElementById("startScrapeButton").addEventListener("click", function () {
	window.open("https://point.rakuten.co.jp/history/?page=1&scrape=1#point_history");
});

document.getElementById("exportCsvButton").addEventListener("click", async function () {
	const fromDate = document.getElementById("fromDate").value || null;
	const toDate = document.getElementById("toDate").value || null;
	if (fromDate && toDate && fromDate > toDate) {
		window.alert("開始日は終了日以前を指定してください");
		return;
	}

	const rows = await getStorageRows();
	if (rows.length === 0) {
		window.alert("保存済みの履歴がありません");
		return;
	}

	const filtered = rows.filter((row) => {
		const rowDate = parseDateFromRow(row.date);
		if (!rowDate) return false;
		if (fromDate && rowDate < fromDate) return false;
		if (toDate && rowDate > toDate) return false;
		return true;
	});

	if (filtered.length === 0) {
		window.alert("指定期間の履歴がありません");
		return;
	}

	const csv = rowsToCsv(filtered);
	downloadCsv(csv, fromDate, toDate);
});

const openSidePanelButton = document.getElementById("openSidePanelButton");
if (openSidePanelButton) {
	openSidePanelButton.addEventListener("click", async () => {
		try {
			const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
			const activeTab = tabs[0];
			if (!activeTab || typeof activeTab.windowId !== "number") {
				window.alert("サイドパネルを開く対象のタブが見つかりません");
				return;
			}
			await chrome.sidePanel.open({ windowId: activeTab.windowId });
			window.close();
		} catch (error) {
			window.alert(`サイドパネルを開けませんでした: ${error.message}`);
		}
	});
}
