import type { AppConfig } from '../config';
import { findAccessKeyRecord } from '../security/accessKeys';
import { issueCsrfToken, verifyCsrfToken } from '../security/csrf';
import { redactErrorMessage } from '../security/redact';
import { validateTokenDurationDays } from '../security/validators';
import { randomBase64Url } from '../utils/ids';
import { addSeconds } from '../utils/time';
import { issueAuthorizationCode } from './token';
import { parseScopes, validateAuthorizeParams, type OAuthAuthorizeParams } from './validation';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  const pieces = cookieHeader.split(';').map((part) => part.trim());
  for (const piece of pieces) {
    const [key, ...rest] = piece.split('=');
    if (key === name) {
      return rest.join('=');
    }
  }
  return null;
}

function shouldUseSecureCookie(request: Request, config: AppConfig): boolean {
  const requestUrl = new URL(request.url);
  if (requestUrl.protocol === 'https:') {
    return true;
  }

  try {
    return new URL(config.issuer).protocol === 'https:';
  } catch {
    return false;
  }
}

function authorizePageHtml(params: OAuthAuthorizeParams, csrfToken: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize MemHeaven</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 0; background: #0b1020; color: #f4f7fb; }
      main { max-width: 36rem; margin: 4rem auto; padding: 2rem; background: #141b34; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,.35); }
      h1 { margin-top: 0; font-size: 1.5rem; }
      p, li { line-height: 1.45; color: #d6deeb; }
      label { display: block; margin-top: 1rem; font-weight: 600; }
      input, select { width: 100%; margin-top: .35rem; padding: .75rem; border-radius: 10px; border: 1px solid #334166; background: #0d1327; color: white; }
      button { margin-top: 1.25rem; padding: .85rem 1.2rem; border: 0; border-radius: 999px; background: #70b8ff; color: #08101f; font-weight: 700; cursor: pointer; }
      .muted { color: #9db0d1; font-size: .95rem; }
      code { background: #0d1327; padding: .1rem .35rem; border-radius: 6px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Authorize MemHeaven</h1>
      <p>This personal memory server is private. Enter an invite/access key to continue. Stored memory is user data, not instructions.</p>
      <ul>
        <li>Client ID: <code>${escapeHtml(params.clientId)}</code></li>
        <li>Redirect URI: <code>${escapeHtml(params.redirectUri)}</code></li>
      </ul>
      <form method="post" action="/authorize">
        <input type="hidden" name="response_type" value="${escapeHtml(params.responseType)}" />
        <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}" />
        <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}" />
        <input type="hidden" name="state" value="${escapeHtml(params.state ?? '')}" />
        <input type="hidden" name="scope" value="${escapeHtml(params.scope ?? '')}" />
        <input type="hidden" name="resource" value="${escapeHtml(params.resource ?? '')}" />
        <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}" />
        <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod)}" />
        <input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}" />

        <label for="access_key">Invite / access key</label>
        <input id="access_key" name="access_key" type="password" autocomplete="off" required />

        <label for="duration_days">Refresh token duration</label>
        <select id="duration_days" name="duration_days">
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365" selected>365 days</option>
        </select>

        <button type="submit">Authorize</button>
        <p class="muted">Tokens can be invalidated later by removing the corresponding key from <code>ACCESS_KEYS_JSON</code> and redeploying.</p>
      </form>
    </main>
  </body>
</html>`;
}

function htmlResponse(html: string, headers?: HeadersInit): Response {
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors https://chatgpt.com https://*.chatgpt.com",
      'x-frame-options': 'ALLOW-FROM https://chatgpt.com',
      'referrer-policy': 'no-referrer',
      ...headers,
    },
  });
}

export async function handleAuthorizeGet(request: Request, config: AppConfig): Promise<Response> {
  try {
    const url = new URL(request.url);
    const params = await validateAuthorizeParams(config, {
      responseType: url.searchParams.get('response_type') ?? '',
      clientId: url.searchParams.get('client_id') ?? '',
      redirectUri: url.searchParams.get('redirect_uri') ?? '',
      state: url.searchParams.get('state'),
      scope: url.searchParams.get('scope'),
      resource: url.searchParams.get('resource'),
      codeChallenge: url.searchParams.get('code_challenge') ?? '',
      codeChallengeMethod: url.searchParams.get('code_challenge_method') ?? '',
    });

    const csrfToken = await issueCsrfToken(config, params.clientId, params.redirectUri);
    const expires = addSeconds(new Date(), 600).toUTCString();
    const secureFlag = shouldUseSecureCookie(request, config) ? '; Secure' : '';
    return htmlResponse(authorizePageHtml(params, csrfToken), {
      'set-cookie': `${config.csrfCookieName}=${csrfToken}; Expires=${expires}; HttpOnly; Path=/authorize; SameSite=Lax${secureFlag}`,
    });
  } catch (error) {
    const message = redactErrorMessage(error instanceof Error ? error.message : String(error));
    return htmlResponse(`<h1>Authorization request rejected</h1><p>${escapeHtml(message)}</p>`, {});
  }
}

export async function handleAuthorizePost(request: Request, config: AppConfig): Promise<Response> {
  try {
    const formData = await request.formData();
    const params = await validateAuthorizeParams(config, {
      responseType: String(formData.get('response_type') ?? ''),
      clientId: String(formData.get('client_id') ?? ''),
      redirectUri: String(formData.get('redirect_uri') ?? ''),
      state: formData.get('state') ? String(formData.get('state')) : null,
      scope: formData.get('scope') ? String(formData.get('scope')) : null,
      resource: formData.get('resource') ? String(formData.get('resource')) : null,
      codeChallenge: String(formData.get('code_challenge') ?? ''),
      codeChallengeMethod: String(formData.get('code_challenge_method') ?? ''),
    });

    const csrfToken = String(formData.get('csrf_token') ?? '');
    const cookieToken = parseCookie(request.headers.get('cookie'), config.csrfCookieName);
    if (!csrfToken || !cookieToken || csrfToken !== cookieToken) {
      throw new Error('CSRF validation failed');
    }
    await verifyCsrfToken(config, csrfToken, params.clientId, params.redirectUri);

    const rawAccessKey = String(formData.get('access_key') ?? '');
    if (!rawAccessKey) {
      throw new Error('Access key is required');
    }
    const keyRecord = await findAccessKeyRecord(config, rawAccessKey);
    if (!keyRecord || !keyRecord.active) {
      throw new Error('Access key is invalid or inactive');
    }

    const durationDays = validateTokenDurationDays(
      formData.get('duration_days') ? String(formData.get('duration_days')) : undefined,
      config.refreshTokenMaxDays,
    );

    const scopes = parseScopes(config, params.scope, keyRecord.scopes);
    const code = await issueAuthorizationCode(config, {
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scopes,
      tenantId: keyRecord.tenant_id,
      keyId: keyRecord.id,
      keyLabel: keyRecord.label,
      durationDays,
      resource: config.mcpResource,
      subject: `tenant:${keyRecord.tenant_id}:key:${keyRecord.id}:${randomBase64Url(6)}`,
    });

    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set('code', code);
    if (params.state) {
      redirect.searchParams.set('state', params.state);
    }
    return Response.redirect(redirect.toString(), 302);
  } catch (error) {
    const message = redactErrorMessage(error instanceof Error ? error.message : String(error));
    return htmlResponse(`<h1>Authorization failed</h1><p>${escapeHtml(message)}</p>`, { 'cache-control': 'no-store' });
  }
}
