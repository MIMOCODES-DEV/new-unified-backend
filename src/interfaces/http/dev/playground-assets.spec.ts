import { describe, expect, it } from 'vitest';
import { decodeRequest, encodeResponse } from '../legacy/ibo-envelope.js';
import { PLAYGROUND_HTML } from './playground.page.js';
import { PLAYGROUND_RUNNER_JS } from './playground-runner.js';
import { PLAYGROUND_SCENARIOS_JS } from './playground-scenarios.js';
import { PLAYGROUND_TESTS_JS } from './playground-tests.js';

interface Snapshot {
  rows: Record<string, number>;
  created: Record<string, number>;
  changed: Record<string, number>;
}
interface Change {
  key: string;
  added: number;
  removed: number;
  updated: number;
}

interface Registry {
  suites: { id: string; expected: number }[];
  scenarios: { id: string; steps: unknown[] }[];
  diff(before: Snapshot, after: Snapshot): Change[];
  encryptRequest(value: unknown): string;
  decryptResponse(reply: { data: string }): unknown;
}

/** Runs the playground scripts the way the browser loads them, with just enough of a window. */
function loadPlayground(): Registry {
  const win: { PG?: Registry; addEventListener: () => void } = {
    addEventListener: () => undefined,
  };
  const location = { port: '3000', protocol: 'http:' };
  for (const script of [PLAYGROUND_RUNNER_JS, PLAYGROUND_TESTS_JS, PLAYGROUND_SCENARIOS_JS]) {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const run = new Function('window', 'location', 'document', script) as (
      ...args: unknown[]
    ) => void;
    run(win, location, {});
  }
  return win.PG!;
}

describe('device playground', () => {
  const html = inlineScripts();

  it('ships scripts the browser can parse', () => {
    for (const script of [
      PLAYGROUND_RUNNER_JS,
      PLAYGROUND_TESTS_JS,
      PLAYGROUND_SCENARIOS_JS,
      ...html,
    ]) {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      expect(() => new Function(script)).not.toThrow();
    }
  });

  it('loads the runner, the test cases and the scenarios', () => {
    for (const src of ['runner.js', 'tests.js', 'scenarios.js']) {
      expect(PLAYGROUND_HTML).toContain('<script src="/dev/playground/' + src + '"></script>');
    }
  });

  it('has the 142 checks of the five e2e scripts, and the E2E scenarios', () => {
    const pg = loadPlayground();

    expect(pg.suites.map((s) => s.id)).toEqual(['devices', 'playlists', 'licenses', 'v4', 'moves']);
    expect(pg.suites.reduce((n, s) => n + s.expected, 0)).toBe(142);
    expect(pg.scenarios.map((s) => s.id)).toEqual([
      'D1',
      'D2',
      'D3',
      'D4',
      'L1',
      'L2',
      'L3',
      'L4',
      'P1',
      'P2',
      'P3',
      'S1',
      'R1',
      'M1',
      'C1',
      'X1',
    ]);
    for (const s of pg.scenarios) expect(s.steps.length, s.id).toBeGreaterThan(0);
  });

  it('speaks the V4 apps’ envelope both ways, like the server', () => {
    const pg = loadPlayground();
    const value = { mac_address: 'ad:00:00:00:00:01', u_id: 'QW12ER', version: '4.1.0' };

    for (let i = 0; i < 20; i++) {
      expect(decodeRequest(pg.encryptRequest(value))?.json).toEqual(value);
      expect(pg.decryptResponse({ data: encodeResponse({ name: 'قناة Café' }) })).toEqual({
        name: 'قناة Café',
      });
    }
  });

  it('reports the rows a step added, removed and updated, per database and collection', () => {
    const pg = loadPlayground();
    const keys = ['ibo.trialDevices', 'ibo.devices', 'ibo.playlists', 'central.domainMigrations'];
    const at = (...n: number[]) => Object.fromEntries(keys.map((k, i) => [k, n[i]!]));
    const before = { rows: at(5, 4, 9, 3), created: at(0, 0, 0, 0), changed: at(0, 0, 0, 0) };
    // A MAC switch: the new TV's trial is absorbed (removed), an ended trial is created on the old
    // MAC, the paid device and the moved playlist are updated; nothing central.
    const after = { rows: at(5, 4, 9, 3), created: at(1, 0, 0, 0), changed: at(0, 1, 1, 0) };

    expect(pg.diff(before, after)).toEqual([
      { key: 'ibo.trialDevices', added: 1, removed: 1, updated: 0 },
      { key: 'ibo.devices', added: 0, removed: 0, updated: 1 },
      { key: 'ibo.playlists', added: 0, removed: 0, updated: 1 },
    ]);
    // A trial device pays: it moves from trialDevices to devices and keeps its createdAt.
    const paid = { rows: at(4, 5, 9, 3), created: at(0, 0, 0, 0), changed: at(0, 1, 0, 0) };
    expect(pg.diff(before, paid)).toEqual([
      { key: 'ibo.trialDevices', added: 0, removed: 1, updated: 0 },
      { key: 'ibo.devices', added: 1, removed: 0, updated: 0 },
    ]);
  });

  it('opens only views that exist', () => {
    const views = [...PLAYGROUND_HTML.matchAll(/data-view="([a-z]+)[":]/g)].map((m) => m[1]);
    for (const view of new Set(views))
      expect(PLAYGROUND_HTML, view).toContain('id="tab-' + view + '"');
  });
});

/** The inline scripts of the page. */
function inlineScripts(): string[] {
  return [...PLAYGROUND_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);
}
