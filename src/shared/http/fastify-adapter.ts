import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { FastifyAdapter } from '@nestjs/platform-fastify';

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;
const BODY_LIMIT_BYTES = 1_048_576;

/** The caller's request id when it is safe to log and echo, otherwise a new one. */
export function requestIdOf(req: IncomingMessage): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

/**
 * The Fastify adapter of the HTTP process; tests that build the app use it too, so they run what
 * production runs. Fastify gives every request its id (the logger reuses it) and every reply
 * carries it back in `x-request-id`, including replies a middleware ends early (unknown host).
 */
export function createFastifyAdapter(): FastifyAdapter {
  const adapter = new FastifyAdapter({ bodyLimit: BODY_LIMIT_BYTES, genReqId: requestIdOf });
  adapter.getInstance().addHook('onRequest', (request, reply, done) => {
    reply.raw.setHeader(REQUEST_ID_HEADER, request.id);
    done();
  });
  return adapter;
}
