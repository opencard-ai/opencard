import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadGscAuth, DEFAULT_SITE_URL } from './gsc-auth';

class OAuth2 {
  credentials: unknown;
  constructor(public options: unknown, public secret?: unknown, public redirect?: unknown) {}
  setCredentials(value: unknown) { this.credentials = value; }
}
class GoogleAuth { constructor(public options: unknown) {} }
const google = { auth: { OAuth2, GoogleAuth } };

test('service account and OAuth shapes bypass local token file', () => {
  // Opaque placeholders, no private key material or usable tokens.
  const service = { private_key: 'synthetic', client_email: 'fixture@example.test' };
  const sa = loadGscAuth(google, { GSC_SERVICE_ACCOUNT_JSON: JSON.stringify(service) }, '/absent');
  assert.ok(sa.auth instanceof GoogleAuth);
  assert.deepEqual(sa.auth.options, { credentials: service, scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] });
  assert.equal(sa.siteUrl, DEFAULT_SITE_URL);
  const oauth = { client_id: 'synthetic', refresh_token: 'synthetic', client_secret: 'synthetic', redirect_uri: 'https://example.test/callback', token_uri: 'https://example.test/token', site_url: 'https://example.test' };
  const result = loadGscAuth(google, { GSC_SERVICE_ACCOUNT_JSON: JSON.stringify(oauth) }, '/absent');
  assert.ok(result.auth instanceof OAuth2);
  assert.equal(result.siteUrl, oauth.site_url);
  assert.deepEqual(result.auth.credentials, { refresh_token: oauth.refresh_token });
  assert.deepEqual(result.auth.options, { clientId: oauth.client_id, clientSecret: oauth.client_secret, redirectUri: oauth.redirect_uri, endpoints: { oauth2TokenUrl: oauth.token_uri } });
});
test('local OAuth fallback uses env and cwd token file only when cloud env is absent', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsc-auth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, '.gsc-token.json'), '{}');
  const { auth } = loadGscAuth(google, { GSC_CLIENT_ID: 'synthetic', GSC_CLIENT_SECRET: 'synthetic' }, dir);
  assert.equal(auth.options, 'synthetic');
  assert.deepEqual(auth.credentials, {});
  const empty = loadGscAuth(google, { GSC_SERVICE_ACCOUNT_JSON: '', GSC_CLIENT_ID: 'synthetic', GSC_CLIENT_SECRET: 'synthetic' }, dir);
  assert.equal(empty.auth.options, 'synthetic');
  for (const raw of ['{synthetic', '{}', 'null', '[]', '{"client_id":"synthetic"}']) {
    assert.throws(() => loadGscAuth(google, { GSC_SERVICE_ACCOUNT_JSON: raw }, dir), { message: 'GSC authentication configuration unavailable or invalid' });
  }
});
