import { describe, expect, it } from 'vitest';
import { cachedCloudUser, cloudConfig, cloudSessionKey } from './client';

function legacyKey(role: string) {
  return `fixture.${btoa(JSON.stringify({ role })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.fixture`;
}

describe('public Supabase configuration', () => {
  it('allows local-only practice when both configuration values are absent', () => {
    expect(cloudConfig()).toBeNull();
    expect(cloudConfig('', '')).toBeNull();
  });

  it('accepts a publishable key or a legacy anonymous key with an HTTPS project URL', () => {
    const url = 'https://project.supabase.co';
    expect(cloudConfig(url + '/', 'sb_publishable_fixture')).toEqual({ url, key: 'sb_publishable_fixture' });
    const key = legacyKey('anon');
    expect(cloudConfig(url, key)).toEqual({ url, key });
  });

  it('rejects partial configuration and untrusted URL components', () => {
    expect(() => cloudConfig('https://project.supabase.co')).toThrow();
    expect(() => cloudConfig(undefined, 'sb_publishable_fixture')).toThrow();
    for (const url of ['http://project.supabase.co', 'https://name:password@project.supabase.co',
      'https://project.supabase.co?query=1', 'https://project.supabase.co#fragment', 'not-a-url']) {
      expect(() => cloudConfig(url, 'sb_publishable_fixture')).toThrow();
    }
  });

  it('rejects secret, service-role and malformed keys without reflecting their values in errors', () => {
    for (const key of ['sb_secret_fixture-never-publish', legacyKey('service_role'), 'malformed-fixture', legacyKey('authenticated')]) {
      let error: unknown;
      try { cloudConfig('https://project.supabase.co', key); } catch (caught) { error = caught; }
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(key);
      expect((error as Error).message).toMatch(/publishable/i);
    }
  });
});


describe('offline account identity', () => {
  it('keeps the production SDK session key for the configured project', () => {
    expect(cloudSessionKey('https://project.supabase.co')).toBe('sb-project-auth-token');
  });

  it('routes only to the configured project session, even when expired, without returning tokens', () => {
    const storage = { getItem: (key: string) => key === 'sb-project-auth-token'
      ? JSON.stringify({ user: { id: 'account-a', email: 'a@example.test' }, expires_at: 0, access_token: 'private-token' }) : null };
    expect(cachedCloudUser('https://project.supabase.co', storage)).toEqual({ id: 'account-a', email: 'a@example.test' });
    expect(cachedCloudUser('https://other.supabase.co', storage)).toBeNull();
  });

  it('does not restore a removed, corrupt or unavailable session', () => {
    for (const value of [null, 'invalid', '{}', '{"user":{"id":""}}']) {
      expect(cachedCloudUser('https://project.supabase.co', { getItem: () => value })).toBeNull();
    }
    expect(cachedCloudUser('https://project.supabase.co', { getItem: () => { throw new Error('Unavailable'); } })).toBeNull();
  });
});
