import { describe, expect, it } from 'vitest';
import { paidDevice, trialDevice } from '../../../../test/support/device-fakes.js';
import {
  toPaidDevice,
  toPaidDeviceDocument,
  toTrialDevice,
  toTrialDeviceDocument,
} from './device.document.js';

describe('device documents', () => {
  it('stores a trial device under _id and reads it back unchanged', () => {
    const device = trialDevice({
      legacy: { id: '64f0c0ffee', brand: 'ibo', device_model: 'UE55' },
    });

    const doc = toTrialDeviceDocument(device);

    expect(doc._id).toBe(device.id);
    expect(toTrialDevice(doc)).toEqual(device);
  });

  it('stores a paid device with its switch and recovery records', () => {
    const device = paidDevice({
      switch: {
        from: '00:1a:2b:3c:4d:5f',
        to: '00:1a:2b:3c:4d:60',
        at: new Date('2026-10-25T12:00:00Z'),
        originMac: null,
        count: 1,
      },
      recovery: {
        code: '481516',
        expiresAt: new Date('2026-10-25T12:30:00Z'),
        enabled: true,
        recoveredFrom: null,
        recoveredAt: null,
      },
    });

    expect(toPaidDevice(toPaidDeviceDocument(device))).toEqual(device);
  });

  it('reads a switch record saved before the count existed as one switch', () => {
    const old = {
      ...toPaidDeviceDocument(paidDevice()),
      switch: {
        from: '00:1a:2b:3c:4d:5f',
        to: '00:1a:2b:3c:4d:60',
        at: new Date(),
        originMac: null,
      },
    };

    expect(toPaidDevice(old).switch?.count).toBe(1);
  });

  it('keeps the device key as 6 digits but does not need it to be unique', () => {
    expect(() => toTrialDeviceDocument(trialDevice({ deviceKey: '000001' }))).not.toThrow();
  });

  it.each([
    [{ macAddress: '00-1A-2B-3C-4D-5E' }],
    [{ deviceKey: '12345' }],
    [{ platform: 'Samsung' }],
    [{ apiVersion: 'v3' }],
    [{ playlistCount: -1 }],
    [{ trialEndsAt: '2026-11-01' }],
  ])('refuses a trial device in an invalid shape: %j', (change) => {
    expect(() => toTrialDevice({ ...toTrialDeviceDocument(trialDevice()), ...change })).toThrow();
  });

  it('refuses a paid device without its current license', () => {
    const doc = { ...toPaidDeviceDocument(paidDevice()), currentLicenseId: '' };

    expect(() => toPaidDevice(doc)).toThrow();
  });
});
