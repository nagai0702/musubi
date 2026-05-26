import { google } from 'googleapis';
import { getOAuthClient } from '../sheets';

function client() {
  return google.sheets({ version: 'v4', auth: getOAuthClient() });
}

export async function readRange(spreadsheetId: string, range: string): Promise<string[][]> {
  const res = await client().spreadsheets.values.get({ spreadsheetId, range });
  return (res.data.values as string[][]) || [];
}

export async function readRanges(spreadsheetId: string, ranges: string[]): Promise<string[][][]> {
  const res = await client().spreadsheets.values.batchGet({ spreadsheetId, ranges });
  return (res.data.valueRanges || []).map(v => (v.values as string[][]) || []);
}

const cache = new Map<string, { at: number; data: string[][] }>();
const TTL_MS = 60_000;

export async function readRangeCached(spreadsheetId: string, range: string, ttlMs = TTL_MS): Promise<string[][]> {
  const key = `${spreadsheetId}::${range}`;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.data;
  const data = await readRange(spreadsheetId, range);
  cache.set(key, { at: now, data });
  return data;
}

export const SOURCES = {
  GYOSEKI: '1lXrgl6J5-j2upoaxRLh46PTeMH51thprQ6xXIvUMA0A',
  ML_TX: '1XXgxPVIxDXO8r3NaaQJluycbSkFWgoRM5tUMDDvhf48',
  KOBETSU: '1uO1bT47fS-alD49z1Gp8rXi597Bj2yq6ypAm_0vNRcc',
  KAIN_BUNSEKI: '1b0XnLYZYf_7_42xYLLWRwO7jCYcyh_-k_KISEJw43Z4',
  EA_NYUKIN: '1CUf0cWeMPxfcwVUxX7rUyAcYeXs3lhPjU85Yr-qDcps',
} as const;

export function parseYen(s: string | undefined | null): number {
  if (!s) return 0;
  const trimmed = String(s).trim();
  if (!trimmed || trimmed.startsWith('#')) return 0;
  const n = Number(trimmed.replace(/[¥,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function parseNum(s: string | undefined | null): number {
  if (!s) return 0;
  const trimmed = String(s).trim();
  if (!trimmed || trimmed.startsWith('#')) return 0;
  const n = Number(trimmed.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function parsePct(s: string | undefined | null): number | null {
  if (!s) return null;
  const trimmed = String(s).trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (!trimmed.includes('%')) return null;
  const n = Number(trimmed.replace(/[%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}
