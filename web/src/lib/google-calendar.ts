/** Google Calendar API — 今日の予定取得 */
import { google } from 'googleapis';
import { getOAuthClient } from './sheets';

export type CalendarEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  hangoutLink?: string;
  attendees: string[];
};

function client() {
  return google.calendar({ version: 'v3', auth: getOAuthClient() });
}

/** 今日（JST）の予定をすべて取得。startTime 昇順。 */
export async function getTodayEvents(): Promise<CalendarEvent[]> {
  const now = new Date(Date.now() + 9 * 3600_000);
  const ymd = now.toISOString().slice(0, 10);
  const timeMin = `${ymd}T00:00:00+09:00`;
  const timeMax = `${ymd}T23:59:59+09:00`;

  const res = await client().events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50,
  });

  return (res.data.items || []).map((e) => ({
    id: e.id || '',
    summary: e.summary || '(タイトルなし)',
    start: e.start?.dateTime || e.start?.date || '',
    end: e.end?.dateTime || e.end?.date || '',
    location: e.location || undefined,
    hangoutLink: e.hangoutLink || undefined,
    attendees: (e.attendees || []).map((a) => a.displayName || a.email || '').filter(Boolean),
  }));
}
