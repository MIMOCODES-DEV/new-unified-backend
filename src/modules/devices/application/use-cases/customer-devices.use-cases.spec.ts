import { describe, expect, it } from 'vitest';
import {
  InMemoryPaidDeviceRepository,
  InProcessDeviceLock,
  InMemoryTrialDeviceRepository,
  paidDevice,
  trialDevice,
} from '../../../../../test/support/device-fakes.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { DeviceIdentity } from '../device-identity.js';
import {
  LinkDeviceToCustomerUseCase,
  ListCustomerDevicesUseCase,
  UnlinkDeviceFromCustomerUseCase,
} from './customer-devices.use-cases.js';

function setup() {
  const trials = new InMemoryTrialDeviceRepository();
  const paid = new InMemoryPaidDeviceRepository();
  trials.items.set('trial-1', trialDevice());
  paid.items.set('paid-1', paidDevice());
  const clock = new FixedClock(new Date('2026-10-28T12:00:00Z'));
  const identity = new DeviceIdentity(trials, paid, new InProcessDeviceLock());
  return {
    paid,
    link: new LinkDeviceToCustomerUseCase(identity, paid, clock),
    unlink: new UnlinkDeviceFromCustomerUseCase(paid, clock),
    list: new ListCustomerDevicesUseCase(paid),
  };
}

const mac = (value: string) => {
  const parsed = MacAddress.parse(value);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};
const PAID = mac('00:1a:2b:3c:4d:5f');
const TRIAL = mac('00:1a:2b:3c:4d:5e');
const codeOf = <T>(r: { ok: true; value: T } | { ok: false; error: { code: string } }) =>
  r.ok ? 'ok' : r.error.code;

describe('CUS-3 customer devices', () => {
  it('links a paid device by MAC and device key, and lists it', async () => {
    const t = setup();
    expect(codeOf(await t.link.execute({ mac: PAID, key: '654321', customerId: 'c1' }))).toBe('ok');
    expect((await t.list.execute('c1')).map((d) => d.id)).toEqual(['paid-1']);
    // Again by the same customer: fine.
    expect(codeOf(await t.link.execute({ mac: PAID, key: '654321', customerId: 'c1' }))).toBe('ok');
  });

  it('a device belongs to one customer at most', async () => {
    const t = setup();
    await t.link.execute({ mac: PAID, key: '654321', customerId: 'c1' });
    expect(codeOf(await t.link.execute({ mac: PAID, key: '654321', customerId: 'c2' }))).toBe(
      'devices.linked_elsewhere',
    );
  });

  it('a wrong key and an unknown MAC give the same answer', async () => {
    const t = setup();
    const wrong = await t.link.execute({ mac: PAID, key: '000000', customerId: 'c1' });
    const unknown = await t.link.execute({
      mac: mac('aa:aa:aa:aa:aa:aa'),
      key: '654321',
      customerId: 'c1',
    });
    expect(codeOf(wrong)).toBe('devices.device_key_mismatch');
    expect(codeOf(unknown)).toBe('devices.device_key_mismatch');
  });

  it('a trial device cannot be linked', async () => {
    const t = setup();
    expect(codeOf(await t.link.execute({ mac: TRIAL, key: '123456', customerId: 'c1' }))).toBe(
      'devices.not_paid',
    );
  });

  it('only its own customer can unlink a device', async () => {
    const t = setup();
    await t.link.execute({ mac: PAID, key: '654321', customerId: 'c1' });
    expect(codeOf(await t.unlink.execute({ deviceId: 'paid-1', customerId: 'c2' }))).toBe(
      'devices.not_found',
    );
    expect(codeOf(await t.unlink.execute({ deviceId: 'paid-1', customerId: 'c1' }))).toBe('ok');
    expect(t.paid.items.get('paid-1')!.customerId).toBeNull();
    expect(await t.list.execute('c1')).toEqual([]);
  });
});
