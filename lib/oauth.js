// lib/oauth.js
// OAuth helpers. The interactive flow (chrome.identity) lives in the service
// worker; the pure mapping below is kept here so it's unit-testable.

/**
 * Map a LinkedIn OpenID Connect `userinfo` payload to our profile fields.
 * LinkedIn's `locale` may be a string ("en-US") or an object
 * ({ country: "US", language: "en" }) — handle both.
 *
 * @param {object} userinfo
 * @returns {{full_name:string, email:string, locale:string, picture:string}}
 */
export function mapLinkedInProfileToFields(userinfo = {}) {
  const fullName = String(
    userinfo.name || [userinfo.given_name, userinfo.family_name].filter(Boolean).join(' ')
  ).trim();

  let locale = '';
  if (typeof userinfo.locale === 'string') {
    locale = userinfo.locale;
  } else if (userinfo.locale && typeof userinfo.locale === 'object') {
    locale = [userinfo.locale.language, userinfo.locale.country].filter(Boolean).join('-');
  }

  return {
    full_name: fullName,
    email: String(userinfo.email || '').trim(),
    locale,
    picture: String(userinfo.picture || '').trim(),
  };
}

export const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
export const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
export const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
export const LINKEDIN_SCOPES = 'openid profile email';

/**
 * Build the LinkedIn OIDC authorization URL.
 * @param {{clientId:string, redirectUri:string, state:string}} params
 */
export function buildLinkedInAuthUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: LINKEDIN_SCOPES,
  });
  return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
}
