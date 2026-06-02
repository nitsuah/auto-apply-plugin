import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mapLinkedInProfileToFields,
  buildLinkedInAuthUrl,
  LINKEDIN_AUTH_URL,
} from '../lib/oauth.js';

test('mapLinkedInProfileToFields reads name/email and a string locale', () => {
  const fields = mapLinkedInProfileToFields({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    locale: 'en-US',
    picture: 'https://cdn/pic.jpg',
  });
  assert.equal(fields.full_name, 'Ada Lovelace');
  assert.equal(fields.email, 'ada@example.com');
  assert.equal(fields.locale, 'en-US');
  assert.equal(fields.picture, 'https://cdn/pic.jpg');
});

test('mapLinkedInProfileToFields composes name parts and an object locale', () => {
  const fields = mapLinkedInProfileToFields({
    given_name: 'Grace',
    family_name: 'Hopper',
    email: 'grace@navy.mil',
    locale: { country: 'US', language: 'en' },
  });
  assert.equal(fields.full_name, 'Grace Hopper');
  assert.equal(fields.locale, 'en-US');
  assert.equal(fields.picture, '');
});

test('buildLinkedInAuthUrl includes OIDC params and encodes the redirect', () => {
  const url = buildLinkedInAuthUrl({
    clientId: 'abc123',
    redirectUri: 'https://ext-id.chromiumapp.org/',
    state: 'xyz',
  });
  assert.ok(url.startsWith(LINKEDIN_AUTH_URL + '?'));
  const params = new URL(url).searchParams;
  assert.equal(params.get('response_type'), 'code');
  assert.equal(params.get('client_id'), 'abc123');
  assert.equal(params.get('redirect_uri'), 'https://ext-id.chromiumapp.org/');
  assert.equal(params.get('state'), 'xyz');
  assert.equal(params.get('scope'), 'openid profile email');
});
