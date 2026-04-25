chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ── 月次バックアップリマインダー通知 ──

const ALARM_NAME = "monthly-backup-reminder";
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
chrome.alarms.get(ALARM_NAME, (existing) => {
if (!existing) {
chrome.alarms.create(ALARM_NAME, {
delayInMinutes: 60 * 24 * 30,
periodInMinutes: 60 * 24 * 30,
});
}
});
});

chrome.alarms.onAlarm.addListener((alarm) => {
if (alarm.name === ALARM_NAME) {
chrome.notifications.create(ALARM_NAME, {
type: "basic",
iconUrl: "icon.png",
title: "楽天ポイント履歴のバックアップ",
message: "楽天ポイント履歴が見られなくなる前にバックアップしませんか？",
priority: 1,
});
}
});

chrome.notifications.onClicked.addListener((notifId) => {
if (notifId === ALARM_NAME) {
chrome.tabs.create({ url: "https://point.rakuten.co.jp/history/?page=1&scrape=1#point_history" });
}
});
