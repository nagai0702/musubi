/**
 * Slack 出勤チャンネル ポーリング
 * スクリプトプロパティ:
 *   SLACK_BOT_TOKEN  - xoxb-... (channels:history, users:read 権限)
 *   ATTENDANCE_CHANNEL_ID - 例 C0123456789
 *
 * 5分ごとのトリガー: pollSlackAttendance
 */

const ATTENDANCE_KEYWORDS = {
  '出勤': 'in',
  '退勤': 'out',
  '休憩開始': 'break_start',
  '休憩終了': 'break_end',
  '外出': 'away',
  '戻り': 'back'
};

function pollSlackAttendance() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('SLACK_BOT_TOKEN');
  const channel = props.getProperty('ATTENDANCE_CHANNEL_ID');
  if (!token || !channel) throw new Error('SLACK_BOT_TOKEN / ATTENDANCE_CHANNEL_ID 未設定');

  const lastTs = props.getProperty('LAST_TS') || String(Math.floor(Date.now() / 1000) - 3600);
  const url = 'https://slack.com/api/conversations.history?channel=' + channel + '&oldest=' + lastTs + '&limit=200';
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  const data = JSON.parse(res.getContentText());
  if (!data.ok) throw new Error('Slack API error: ' + data.error);

  const rows = [];
  let maxTs = parseFloat(lastTs);
  data.messages.forEach(function (m) {
    if (m.subtype) return; // bot/joinなど除外
    const text = (m.text || '').trim();
    const type = ATTENDANCE_KEYWORDS[text];
    if (!type) return;
    const userName = lookupUserName(token, m.user);
    rows.push({ ts: parseFloat(m.ts), userId: m.user, userName: userName, type: type });
    if (parseFloat(m.ts) > maxTs) maxTs = parseFloat(m.ts);
  });

  if (rows.length) {
    rows.sort(function (a, b) { return a.ts - b.ts; });
    Sheets.appendAttendanceFromSlack(rows);
  }
  props.setProperty('LAST_TS', String(maxTs));
  return rows.length;
}

const _userCache = {};
function lookupUserName(token, userId) {
  if (_userCache[userId]) return _userCache[userId];
  const res = UrlFetchApp.fetch('https://slack.com/api/users.info?user=' + userId, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  const data = JSON.parse(res.getContentText());
  const name = (data.ok && data.user) ? (data.user.real_name || data.user.name) : userId;
  _userCache[userId] = name;
  return name;
}

function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'pollSlackAttendance') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('pollSlackAttendance').timeBased().everyMinutes(5).create();
}
