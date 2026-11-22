import fs from 'fs';
import path from 'path';

export const DEFAULT_SITE_URL = 'https://opencardai.com';
const scope = 'https://www.googleapis.com/auth/webmasters.readonly';

// Inject the Google factory so tests never construct or contact a live client.
export function loadGscAuth(google: any, env = process.env, cwd = process.cwd()) {
  try {
    if (typeof env.GSC_SERVICE_ACCOUNT_JSON === 'string' && env.GSC_SERVICE_ACCOUNT_JSON.trim() !== '') {
      const doc = JSON.parse(env.GSC_SERVICE_ACCOUNT_JSON);
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error();
      if (doc.private_key && doc.client_email) {
        return { auth: new google.auth.GoogleAuth({ credentials: doc, scopes: [scope] }), siteUrl: DEFAULT_SITE_URL };
      }
      if (doc.client_id && doc.refresh_token) {
        const auth = new google.auth.OAuth2({
          clientId: doc.client_id, clientSecret: doc.client_secret,
          redirectUri: doc.redirect_uri,
          ...(doc.token_uri ? { endpoints: { oauth2TokenUrl: doc.token_uri } } : {}),
        });
        auth.setCredentials({ refresh_token: doc.refresh_token });
        return { auth, siteUrl: doc.site_url || DEFAULT_SITE_URL };
      }
      throw new Error();
    }
    const auth = new google.auth.OAuth2(env.GSC_CLIENT_ID, env.GSC_CLIENT_SECRET,
      env.GSC_REDIRECT_URI || 'http://localhost:8080/oauth/callback');
    auth.setCredentials(JSON.parse(fs.readFileSync(path.join(cwd, '.gsc-token.json'), 'utf8')));
    return { auth, siteUrl: DEFAULT_SITE_URL };
  } catch {
    // Parser and client exceptions may contain credential values. Never propagate them.
    throw new Error('GSC authentication configuration unavailable or invalid');
  }
}
