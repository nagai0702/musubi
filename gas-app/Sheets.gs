/**
 * スプレッドシートI/O
 * スクリプトプロパティ SHEET_ID に対象スプレッドシートIDを設定
 *
 * シート構成:
 *   Attendance: timestamp | user_id | user_name | type | source
 *   Bookings:   id | date | room | start | end | title | user_id | user_name | created_at
 *   Visitors:   id | date | time | name | company | purpose | host | created_at
 */

const Sheets = (function () {
  function ss() {
    const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
    return SpreadsheetApp.openById(id);
  }

  function ensureSheet(name, headers) {
    const book = ss();
    let sh = book.getSheetByName(name);
    if (!sh) {
      sh = book.insertSheet(name);
      sh.appendRow(headers);
    }
    return sh;
  }

  function init() {
    ensureSheet('Attendance', ['timestamp', 'user_id', 'user_name', 'type', 'source']);
    ensureSheet('Bookings', ['id', 'date', 'room', 'start', 'end', 'title', 'user_id', 'user_name', 'created_at']);
    ensureSheet('Visitors', ['id', 'date', 'time', 'name', 'company', 'purpose', 'host', 'created_at']);
  }

  function getAttendance(dateStr) {
    const sh = ensureSheet('Attendance', ['timestamp', 'user_id', 'user_name', 'type', 'source']);
    const values = sh.getDataRange().getValues();
    const out = [];
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const ts = new Date(row[0]);
      const d = Utilities.formatDate(ts, 'Asia/Tokyo', 'yyyy-MM-dd');
      if (d === dateStr) {
        out.push({
          time: Utilities.formatDate(ts, 'Asia/Tokyo', 'HH:mm'),
          userId: row[1],
          userName: row[2],
          type: row[3],
          source: row[4]
        });
      }
    }
    return out.sort(function (a, b) { return a.time.localeCompare(b.time); });
  }

  function getBookings(dateStr) {
    const sh = ensureSheet('Bookings', ['id', 'date', 'room', 'start', 'end', 'title', 'user_id', 'user_name', 'created_at']);
    const values = sh.getDataRange().getValues();
    const out = [];
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (r[1] === dateStr) {
        out.push({
          id: r[0], date: r[1], room: r[2], start: r[3], end: r[4],
          title: r[5], userId: r[6], userName: r[7]
        });
      }
    }
    return out;
  }

  function createBooking(b) {
    const sh = ensureSheet('Bookings', ['id', 'date', 'room', 'start', 'end', 'title', 'user_id', 'user_name', 'created_at']);
    // 重複チェック
    const existing = getBookings(b.date).filter(function (x) { return x.room === b.room; });
    for (let i = 0; i < existing.length; i++) {
      if (b.start < existing[i].end && b.end > existing[i].start) {
        throw new Error('時間が重複しています: ' + existing[i].title + ' (' + existing[i].userName + ')');
      }
    }
    const id = Utilities.getUuid();
    sh.appendRow([id, b.date, b.room, b.start, b.end, b.title, b.userId, b.userName, new Date()]);
    return { ok: true, id: id };
  }

  function deleteBooking(id, userId) {
    const sh = ensureSheet('Bookings', ['id', 'date', 'room', 'start', 'end', 'title', 'user_id', 'user_name', 'created_at']);
    const values = sh.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === id) {
        if (values[i][6] !== userId) throw new Error('予約者本人のみ削除できます');
        sh.deleteRow(i + 1);
        return { ok: true };
      }
    }
    throw new Error('予約が見つかりません');
  }

  function getVisitors(dateStr) {
    const sh = ensureSheet('Visitors', ['id', 'date', 'time', 'name', 'company', 'purpose', 'host', 'created_at']);
    const values = sh.getDataRange().getValues();
    const out = [];
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (r[1] === dateStr) {
        out.push({ id: r[0], date: r[1], time: r[2], name: r[3], company: r[4], purpose: r[5], host: r[6] });
      }
    }
    return out.sort(function (a, b) { return a.time.localeCompare(b.time); });
  }

  function addVisitor(v) {
    const sh = ensureSheet('Visitors', ['id', 'date', 'time', 'name', 'company', 'purpose', 'host', 'created_at']);
    const id = Utilities.getUuid();
    sh.appendRow([id, v.date, v.time, v.name, v.company, v.purpose, v.host, new Date()]);
    return { ok: true, id: id };
  }

  function appendAttendanceFromSlack(rows) {
    const sh = ensureSheet('Attendance', ['timestamp', 'user_id', 'user_name', 'type', 'source']);
    rows.forEach(function (r) {
      sh.appendRow([new Date(r.ts * 1000), r.userId, r.userName, r.type, 'slack']);
    });
  }

  return {
    init: init,
    getAttendance: getAttendance,
    getBookings: getBookings,
    createBooking: createBooking,
    deleteBooking: deleteBooking,
    getVisitors: getVisitors,
    addVisitor: addVisitor,
    appendAttendanceFromSlack: appendAttendanceFromSlack
  };
})();

function setupSheets() { Sheets.init(); }
