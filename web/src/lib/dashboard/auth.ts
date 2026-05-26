export function dashboardAuthOk(req: Request): boolean {
  const expectedUser = (import.meta.env.DASHBOARD_USER || process.env.DASHBOARD_USER || '').trim();
  const expectedPass = (import.meta.env.DASHBOARD_PASSWORD || process.env.DASHBOARD_PASSWORD || '').trim();
  if (!expectedUser || !expectedPass) return false;
  const header = req.headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith('basic ')) return false;
  try {
    const decoded = atob(header.slice(6).trim());
    const idx = decoded.indexOf(':');
    if (idx < 0) return false;
    return decoded.slice(0, idx) === expectedUser && decoded.slice(idx + 1) === expectedPass;
  } catch {
    return false;
  }
}

export function dashboardUnauthorized(): Response {
  return new Response(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>認証が必要です</title></head><body style="font-family:sans-serif;padding:40px;text-align:center;">認証が必要です</body></html>',
    {
      status: 401,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'www-authenticate': 'Basic realm="Musubi Dashboard", charset="UTF-8"'
      }
    }
  );
}

export function dashboardConfigError(): Response {
  return new Response(
    'Server misconfigured: DASHBOARD_USER / DASHBOARD_PASSWORD must be set',
    { status: 500 }
  );
}
