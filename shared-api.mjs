import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 10000);
const STORAGE_URL = process.env.STORAGE_URL
  || 'https://api.npoint.io/feb52e70b8f2f877abed';
const ALLOWED_PREFECTURES = new Set(['愛知', '三重', '岐阜']);

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Cache-Control', 'no-store');
}

function sendJson(response, status, value) {
  setCorsHeaders(response);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

function normalizeContacts(value) {
  if (!Array.isArray(value)) throw new Error('contacts must be an array');
  if (value.length > 3000) throw new Error('too many contacts');

  return value.map((contact) => {
    const id = String(contact?.id || '').trim();
    const name = String(contact?.name || '').trim();
    const phone = String(contact?.phone || '').trim();
    const prefecture = String(contact?.prefecture || '').trim();

    if (!id || !name || !phone || !ALLOWED_PREFECTURES.has(prefecture)) {
      throw new Error('invalid contact');
    }

    return {
      id: id.slice(0, 100),
      name: name.slice(0, 150),
      phone: phone.slice(0, 50),
      prefecture,
    };
  });
}

async function readStore() {
  const response = await fetch(`${STORAGE_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`storage read failed: ${response.status}`);
  const data = await response.json();
  return {
    contacts: normalizeContacts(data.contacts),
    revision: Number(data.revision || 0),
  };
}

async function writeStore(contacts) {
  const current = await readStore();
  const payload = {
    contacts: normalizeContacts(contacts),
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  const response = await fetch(`${STORAGE_URL}?t=${Date.now()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`storage write failed: ${response.status}`);
  return payload;
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error('request too large');
  }
  return JSON.parse(body || '{}');
}

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.url === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.url !== '/api/contacts') {
    sendJson(response, 404, { error: 'not found' });
    return;
  }

  try {
    if (request.method === 'GET') {
      sendJson(response, 200, await readStore());
      return;
    }

    if (request.method === 'PUT') {
      const body = await readBody(request);
      sendJson(response, 200, await writeStore(body.contacts));
      return;
    }

    sendJson(response, 405, { error: 'method not allowed' });
  } catch (error) {
    console.error(error);
    sendJson(response, 400, { error: error.message || 'request failed' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Himawari shared API listening on ${PORT}`);
});
