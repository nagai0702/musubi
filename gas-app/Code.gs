/**
 * 株式会社結び 出勤 & 会議室予約アプリ
 * Web App エントリーポイント
 */

const ROOMS = ['会議室', '撮影部屋', '洗面所'];
const SLOT_MINUTES = 15;
const OPEN_HOUR = 9;
const CLOSE_HOUR = 21;

function doGet(e) {
  // Slack OAuth コールバック
  if (e && e.parameter && e.parameter.action === 'callback') {
    return handleSlackCallback(e);
  }

  const user = getCurrentUser();
  if (!user) {
    return HtmlService.createHtmlOutput(
      '<a href="' + getSlackAuthUrl() + '">Slackでログイン</a>'
    ).setTitle('結び 勤怠 & 会議室');
  }

  const tmpl = HtmlService.createTemplateFromFile('Index');
  tmpl.user = user;
  tmpl.rooms = ROOMS;
  return tmpl.evaluate()
    .setTitle('結び 勤怠 & 会議室')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ===== クライアントから呼ばれるAPI ===== */

function api_getAttendance(dateStr) {
  return Sheets.getAttendance(dateStr);
}

function api_getBookings(dateStr) {
  return {
    rooms: ROOMS,
    slots: generateSlots(),
    bookings: Sheets.getBookings(dateStr),
    visitors: Sheets.getVisitors(dateStr)
  };
}

function api_createBooking(payload) {
  const user = getCurrentUser();
  if (!user) throw new Error('ログインが必要です');
  return Sheets.createBooking({
    date: payload.date,
    room: payload.room,
    start: payload.start,
    end: payload.end,
    title: payload.title,
    userId: user.id,
    userName: user.name
  });
}

function api_deleteBooking(id) {
  const user = getCurrentUser();
  if (!user) throw new Error('ログインが必要です');
  return Sheets.deleteBooking(id, user.id);
}

function api_addVisitor(payload) {
  const user = getCurrentUser();
  if (!user) throw new Error('ログインが必要です');
  return Sheets.addVisitor({
    date: payload.date,
    time: payload.time,
    name: payload.name,
    company: payload.company,
    purpose: payload.purpose,
    host: user.name
  });
}

/* ===== ヘルパー ===== */

function generateSlots() {
  const slots = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      slots.push(('0' + h).slice(-2) + ':' + ('0' + m).slice(-2));
    }
  }
  return slots;
}
