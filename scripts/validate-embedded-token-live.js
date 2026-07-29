'use strict';

const fs = require('fs');

const OWNER = '1337816143';
const REPO = 'soil-type-mapping-inventory';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

function embeddedToken() {
  const config = fs.readFileSync('upload-config.js', 'utf8');
  const match = config.match(/var tokenCodes = \[([0-9,\s]+)\]/);
  if (!match) throw new Error('未找到内置 Token 编码数组');
  const codes = match[1]
    .split(',')
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite);
  const token = String.fromCharCode(...codes).trim();
  if (!token.startsWith('github_pat_')) throw new Error('内置 Token 格式不完整');
  return token;
}

async function request(path, token, scheme, options = {}) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      Authorization: `${scheme} ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let message = '';
  try {
    const parsed = text ? JSON.parse(text) : {};
    message = String(parsed.message || '');
  } catch (error) {}
  return {status: response.status, ok: response.ok, message};
}

(async () => {
  const token = embeddedToken();
  let scheme = 'Bearer';
  let ref = await request('/git/ref/heads/main', token, scheme, {cache: 'no-store'});

  if (!ref.ok && ref.status === 401) {
    const legacy = await request('/git/ref/heads/main', token, 'token', {cache: 'no-store'});
    if (legacy.ok) {
      scheme = 'token';
      ref = legacy;
    }
  }

  console.log(`embedded token ref check: HTTP ${ref.status}, scheme=${scheme}`);
  if (!ref.ok) {
    throw new Error(`内置 Token 无法读取 main：HTTP ${ref.status}${ref.message ? `，${ref.message}` : ''}`);
  }

  const blob = await request('/git/blobs', token, scheme, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      content: `soil-admin-upload-live-check-${Date.now()}`,
      encoding: 'utf-8'
    })
  });

  console.log(`embedded token blob check: HTTP ${blob.status}, scheme=${scheme}`);
  if (!blob.ok) {
    throw new Error(`内置 Token 无法创建 Git Blob：HTTP ${blob.status}${blob.message ? `，${blob.message}` : ''}`);
  }

  console.log('embedded token live Git Data API validation passed');
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
