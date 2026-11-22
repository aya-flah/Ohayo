import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from './app';

/**
 * Vercel entry: one serverless function serves the whole API under /api/*.
 * The Fastify app is built once per warm instance and handed each Node request.
 */
const ready = buildApp().then(async (app) => {
  await app.ready();
  return app;
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await ready;
  const url = new URL(req.url ?? '/', 'http://x');
  // Rewrites send /api/<route> here; Fastify's routes have no /api prefix.
  const path = url.pathname.replace(/^\/api(\/index(\.mjs)?)?(?=\/|$)/, '') || '/';
  req.url = path + url.search;
  app.server.emit('request', req, res);
}
