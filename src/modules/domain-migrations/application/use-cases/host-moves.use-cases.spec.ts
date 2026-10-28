import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeMoveDevices,
  InMemoryDomainMigrationRepository,
} from '../../../../../test/support/domain-migration-fakes.js';
import { Clock } from '../../../../shared/kernel/clock.js';
import { ApprovedMovesCache } from '../approved-moves-cache.js';
import { ApprovedHostMovesUseCase } from './approved-host-moves.use-case.js';
import { DecideHostMoveUseCase } from './decide-host-move.use-case.js';
import { ListHostMovesUseCase } from './list-host-moves.use-case.js';
import { ReportHostMoveUseCase } from './report-host-move.use-case.js';

const OLD = 'http://line.old.example:8080/get.php?username=a&password=b&type=m3u';
const NEW = 'http://line.new.example:8080/get.php?username=a&password=b&type=m3u';

class MovableClock extends Clock {
  at = new Date('2026-10-27T10:00:00Z');
  now() {
    return new Date(this.at);
  }
}

describe('provider domain moves (DOM-1, DOM-2)', () => {
  let moves: InMemoryDomainMigrationRepository;
  let devices: FakeMoveDevices;
  let clock: MovableClock;
  let report: ReportHostMoveUseCase;
  let list: ListHostMovesUseCase;
  let decide: DecideHostMoveUseCase;
  let approved: ApprovedHostMovesUseCase;

  beforeEach(() => {
    moves = new InMemoryDomainMigrationRepository();
    devices = new FakeMoveDevices();
    clock = new MovableClock();
    report = new ReportHostMoveUseCase(moves, devices, clock);
    list = new ListHostMovesUseCase(moves);
    const cache = new ApprovedMovesCache();
    decide = new DecideHostMoveUseCase(moves, cache, clock);
    approved = new ApprovedHostMovesUseCase(moves, cache, clock);
    for (let i = 1; i <= 5; i++) devices.paid.add(`paid-${i}`);
  });

  /** One paid device on its own IP reports OLD → NEW. */
  const reportFrom = (n: number, ip = `203.0.113.${n}`, tenantId = 'brand-a') =>
    report.execute({ tenantId, deviceId: `paid-${n}`, ip, before: OLD, after: NEW });
  const theMove = () => [...moves.items.values()][0]!;

  describe('DOM-1 learn from paid devices', () => {
    it('the first report creates a pending move; later ones add confirmations', async () => {
      const first = await reportFrom(1);
      expect(first).toMatchObject({ recorded: true, result: 'created', awaitsApproval: false });
      expect(theMove()).toMatchObject({
        kind: 'migration',
        fromHost: 'line.old.example:8080',
        toHost: 'line.new.example:8080',
        source: 'user',
        status: 'pending',
        decidedBy: null,
      });

      expect(await reportFrom(2)).toMatchObject({ result: 'confirmed' });
      expect(theMove().confirmations.map((c) => c.deviceId)).toEqual(['paid-1', 'paid-2']);
    });

    it('stores a hash of the IP, never the IP', async () => {
      await reportFrom(1, '198.51.100.9');
      const stored = theMove().confirmations[0]!;
      expect(stored.ipHash).toBe(createHash('sha256').update('198.51.100.9').digest('hex'));
      expect(JSON.stringify(theMove())).not.toContain('198.51.100.9');
    });

    it('ignores trial devices', async () => {
      const result = await report.execute({
        tenantId: 'brand-a',
        deviceId: 'trial-1',
        ip: '203.0.113.1',
        before: OLD,
        after: NEW,
      });
      expect(result).toEqual({ recorded: false, reason: 'not_paid' });
      expect(moves.items.size).toBe(0);
    });

    it('ignores an edit that is not a move', async () => {
      const result = await report.execute({
        tenantId: 'brand-a',
        deviceId: 'paid-1',
        ip: '203.0.113.1',
        before: OLD,
        after: 'http://line.new.example:8080/other.php',
      });
      expect(result).toEqual({ recorded: false, reason: 'not_a_move' });
    });

    it('counts one confirmation per IP, and one per device', async () => {
      await reportFrom(1, '203.0.113.1');
      expect(await reportFrom(2, '203.0.113.1')).toMatchObject({ result: 'already' });
      expect(await reportFrom(1, '203.0.113.99')).toMatchObject({ result: 'already' });
      expect(theMove().confirmations).toHaveLength(1);
    });

    it('after 3 confirmations from different IPs it shows up for approval, not served yet', async () => {
      await reportFrom(1);
      await reportFrom(2);
      expect((await list.execute('awaiting')).length).toBe(0);
      expect(await reportFrom(3, undefined, 'brand-b')).toMatchObject({ awaitsApproval: true });

      expect(await list.execute('awaiting')).toEqual([
        expect.objectContaining({ confirmations: 3, brands: 2, status: 'pending' }),
      ]);
      expect(await approved.execute()).toEqual([]);
    });

    it('reports at the same time all count', async () => {
      await Promise.all([1, 2, 3, 4, 5].map((n) => reportFrom(n)));
      expect(moves.items.size).toBe(1);
      expect(theMove().confirmations).toHaveLength(5);
    });
  });

  describe('DOM-2 approve before it is served', () => {
    beforeEach(async () => {
      await reportFrom(1);
      await reportFrom(2);
      await reportFrom(3);
    });

    it('approving records who and when, and the move is served', async () => {
      const decided = await decide.execute({ id: theMove().id, decision: 'approve', by: 'ali' });

      expect(decided.ok && decided.value).toMatchObject({
        status: 'approved',
        decidedBy: 'ali',
        decidedAt: clock.now(),
      });
      expect(await approved.execute()).toEqual([
        { fromHost: 'line.old.example:8080', toHost: 'line.new.example:8080', toScheme: 'http' },
      ]);
      expect(await list.execute('awaiting')).toEqual([]);
    });

    it('a blocked move is never served, however many confirmations it gets', async () => {
      await decide.execute({ id: theMove().id, decision: 'block', by: 'omar' });
      await reportFrom(4);
      await reportFrom(5);

      expect(theMove()).toMatchObject({ status: 'blocked', decidedBy: 'omar' });
      expect(theMove().confirmations).toHaveLength(5);
      expect(await approved.execute()).toEqual([]);
      expect(await list.execute('awaiting')).toEqual([]);
    });

    it('refuses an unknown move and a decision without a name', async () => {
      const unknown = await decide.execute({ id: 'nope', decision: 'approve', by: 'ali' });
      expect(!unknown.ok && unknown.error.code).toBe('domain_migrations.not_found');
      const nobody = await decide.execute({ id: theMove().id, decision: 'approve', by: '  ' });
      expect(!nobody.ok && nobody.error.code).toBe('domain_migrations.invalid_decider');
    });

    it('a decision here is served at once; one made on another server within a minute', async () => {
      expect(await approved.execute()).toEqual([]);
      await decide.execute({ id: theMove().id, decision: 'approve', by: 'ali' });
      expect(await approved.execute()).toHaveLength(1);

      // Another server blocks it: this one still serves its list until the minute is up.
      const elsewhere = new DecideHostMoveUseCase(moves, new ApprovedMovesCache(), clock);
      await elsewhere.execute({ id: theMove().id, decision: 'block', by: 'omar' });
      expect(await approved.execute()).toHaveLength(1);
      clock.at = new Date(clock.at.getTime() + 60_000);
      expect(await approved.execute()).toEqual([]);
    });
  });
});
