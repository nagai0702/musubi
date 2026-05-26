import { defineMiddleware } from 'astro:middleware';
import { dashboardAuthOk, dashboardUnauthorized, dashboardConfigError } from './lib/dashboard/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  if (url.pathname === '/dashboard' || url.pathname.startsWith('/dashboard/')) {
    const expectedUser = (import.meta.env.DASHBOARD_USER || process.env.DASHBOARD_USER || '').trim();
    const expectedPass = (import.meta.env.DASHBOARD_PASSWORD || process.env.DASHBOARD_PASSWORD || '').trim();
    if (!expectedUser || !expectedPass) return dashboardConfigError();
    if (!dashboardAuthOk(context.request)) return dashboardUnauthorized();
  }
  return next();
});
