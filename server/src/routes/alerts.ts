import type { FastifyInstance } from 'fastify';
import { scanForAlerts, type AlertDeps } from '../lib/alerts.js';
import { listNotifications, markAllRead } from '../lib/notifications.js';

export async function alertRoutes(app: FastifyInstance, deps: AlertDeps): Promise<void> {
  app.addHook('onRequest', app.authenticate);

  // SCRUM-33: the user's alerts (emails are simulated in the email_outbox table)
  app.get('/notifications', async (request) => {
    const notifications = await listNotifications(app.pg.pool, request.user.id);
    return { notifications, unread: notifications.filter((n) => !n.read).length };
  });

  app.post('/notifications/read-all', async (request) => ({
    updated: await markAllRead(app.pg.pool, request.user.id),
  }));

  // Checks the user's upcoming trips now; repeated scans do not repeat alerts.
  app.post('/alerts/scan', async (request) => ({
    created: await scanForAlerts(app.pg.pool, deps, request.user.id),
  }));
}
