export interface GuardMeta {
  requiresAuth?: boolean;
  guestOnly?: boolean;
}

export interface Session {
  isAuthenticated: boolean;
}

export type GuardResult = true | { name: 'login'; query: { redirect: string } } | { name: 'home' };

/** Decides whether a navigation may proceed; pure so it can be tested without a router. */
export function resolveGuard(meta: GuardMeta, fullPath: string, session: Session): GuardResult {
  if (meta.requiresAuth && !session.isAuthenticated) {
    return { name: 'login', query: { redirect: fullPath } };
  }
  if (meta.guestOnly && session.isAuthenticated) return { name: 'home' };
  return true;
}

/** Only follow same-site relative redirects after login (never an external URL). */
export function safeRedirect(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}
