chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const BACKUP_ALARM_NAME = "backupReminder";
const BACKUP_NOTIFICATION_ID = "backupReminderNotification";
const BACKUP_SETTINGS_KEY = "backupNotificationSettings";

function intervalToMinutes(days) {
return days * 24 * 60;
}

async function applyBackupSchedule(settings) {
await chrome.alarms.clear(BACKUP_ALARM_NAME);
if (!settings || !settings.enabled || !settings.intervalDays) return;
const minutes = intervalToMinutes(settings.intervalDays);
chrome.alarms.create(BACKUP_ALARM_NAME, {
delayInMinutes: minutes,
periodInMinutes: minutes,
});
}

chrome.runtime.onInstalled.addListener(() => {
chrome.storage.local.get([BACKUP_SETTINGS_KEY], (r) => {
const s = r[BACKUP_SETTINGS_KEY];
if (s && s.enabled) applyBackupSchedule(s);
});
});

chrome.runtime.onStartup.addListener(() => {
chrome.storage.local.get([BACKUP_SETTINGS_KEY], (r) => {
const s = r[BACKUP_SETTINGS_KEY];
if (s && s.enabled) applyBackupSchedule(s);
});
});

chrome.alarms.onAlarm.addListener((alarm) => {
if (alarm.name !== BACKUP_ALARM_NAME) return;
chrome.notifications.create(BACKUP_NOTIFICATION_ID, {
type: "basic",
iconUrl: "icon.png",
title: "楽天ポイント履歴のバックアップ時期です",
message: "サイドパネルを開いて履歴を取得し、CSV/Excelにエクスポートしましょう。",
priority: 1,
});
});

chrome.notifications.onClicked.addListener((notificationId) => {
if (notificationId !== BACKUP_NOTIFICATION_ID) return;
chrome.tabs.create({ url: "https://point.rakuten.co.jp/history/?page=1&scrape=1#point_history" });
chrome.notifications.clear(notificationId);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
if (msg && msg.type === "setBackupSchedule") {
applyBackupSchedule(msg.settings || {})
.then(() => sendResponse({ ok: true }))
.catch((e) => sendResponse({ ok: false, error: String(e) }));
return true;
}
});
