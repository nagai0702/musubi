import type { APIRoute } from 'astro';

export const prerender = false;

// Vite が research-content 配下を文字列としてバンドル（Vercelにもデプロイされる）
const RAW_FILES = import.meta.glob('../../research-content/**/*', {
  eager: true,
  query: '?raw',
  import: 'default'
}) as Record<string, string>;

// キーを相対パスに正規化: '../../research-content/love-marriage-2026-04-20/README.md' → 'love-marriage-2026-04-20/README.md'
const FILES: Record<string, string> = {};
for (const [key, val] of Object.entries(RAW_FILES)) {
  const rel = key.replace(/^.*research-content\//, '');
  FILES[rel] = val;
}

const CONTENT_TYPE: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function extOf(p: string): string {
  const m = p.match(/\.[a-z0-9]+$/i);
  return m ? m[0].toLowerCase() : '';
}

function unauthorized(): Response {
  return new Response(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>認証が必要です</title></head><body style="font-family:sans-serif;padding:40px;text-align:center;">認証が必要です</body></html>',
    {
      status: 401,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'www-authenticate': 'Basic realm="Musubi Research", charset="UTF-8"'
      }
    }
  );
}

function authOk(req: Request, expectedUser: string, expectedPass: string): boolean {
  const header = req.headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith('basic ')) return false;
  try {
    const decoded = atob(header.slice(6).trim());
    const idx = decoded.indexOf(':');
    if (idx < 0) return false;
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    return user === expectedUser && pass === expectedPass;
  } catch {
    return false;
  }
}

export const GET: APIRoute = async ({ params, request }) => {
  const expectedUser = (import.meta.env.RESEARCH_USER || process.env.RESEARCH_USER || '').trim();
  const expectedPass = (import.meta.env.RESEARCH_PASSWORD || process.env.RESEARCH_PASSWORD || '').trim();

  if (!expectedUser || !expectedPass) {
    return new Response(
      'Server misconfigured: RESEARCH_USER / RESEARCH_PASSWORD must be set in environment variables',
      { status: 500 }
    );
  }

  if (!authOk(request, expectedUser, expectedPass)) return unauthorized();

  // URL-decode and normalize the requested path
  let sub = (params.path || '').replace(/^\/+/, '');
  try { sub = decodeURIComponent(sub); } catch {}

  // Trailing slash or empty → index.html
  if (sub === '' || sub.endsWith('/')) sub += 'index.html';
  // Path looks like a directory (no extension) → append /index.html
  if (!/\.[a-z0-9]+$/i.test(sub)) sub = sub.replace(/\/?$/, '/') + 'index.html';

  // Prevent path traversal
  if (sub.includes('..')) return new Response('Forbidden', { status: 403 });

  const content = FILES[sub];
  if (content === undefined) {
    return new Response('Not found: ' + sub, { status: 404 });
  }

  const ct = CONTENT_TYPE[extOf(sub)] || 'application/octet-stream';
  return new Response(content, {
    status: 200,
    headers: {
      'content-type': ct,
      'cache-control': 'private, no-cache'
    }
  });
};
