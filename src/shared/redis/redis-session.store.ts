import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { type SessionSubject, SessionStore } from '../auth/session-store.js';
import { REDIS } from './redis.connection.js';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const sessionKey = (tokenHash: string) => `session:${tokenHash}`;
const subjectKey = (s: SessionSubject) => `sessions:${s.kind}:${s.tenantId ?? '-'}:${s.id}`;

/**
 * Sessions in Redis, shared by every server. Fails closed: with Redis down nobody is logged in,
 * unlike the rate limits (a session check must never let a caller through by default).
 */
@Injectable()
export class RedisSessionStore extends SessionStore {
  constructor(@Inject(REDIS) private readonly redis: Redis) {
    super();
  }

  async create(subject: SessionSubject, ttlMs: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hash(token);
    const value = JSON.stringify({
      kind: subject.kind,
      id: subject.id,
      tenantId: subject.tenantId,
    });
    await this.redis
      .multi()
      .set(sessionKey(tokenHash), value, 'PX', ttlMs)
      .sadd(subjectKey(subject), tokenHash)
      // The index lives as long as the newest session; ended ones are skipped when read.
      .pexpire(subjectKey(subject), ttlMs)
      .exec();
    return token;
  }

  async find(token: string): Promise<SessionSubject | null> {
    if (!token) return null;
    const raw = await this.redis.get(sessionKey(hash(token)));
    return raw ? (JSON.parse(raw) as SessionSubject) : null;
  }

  async revoke(token: string): Promise<void> {
    const tokenHash = hash(token);
    const raw = await this.redis.get(sessionKey(tokenHash));
    const pipeline = this.redis.multi().del(sessionKey(tokenHash));
    if (raw) pipeline.srem(subjectKey(JSON.parse(raw) as SessionSubject), tokenHash);
    await pipeline.exec();
  }

  async revokeAll(subject: SessionSubject): Promise<number> {
    const hashes = await this.redis.smembers(subjectKey(subject));
    if (hashes.length === 0) return 0;
    const deleted = await this.redis.del(...hashes.map(sessionKey));
    await this.redis.del(subjectKey(subject));
    return deleted;
  }
}
