// netlify/functions/ebird.js — Serverless proxy to the eBird API.
//
// Why this exists: the eBird API key must be sent on every request. If it
// lived in browser JS, anyone could scrape it from DevTools. Instead, the
// browser calls /.netlify/functions/ebird, and this function (running on
// Netlify's servers) attaches the X-eBirdApiToken header using
// EBIRD_API_KEY from the site's environment variables — never leaving
// the server.
//
// Call shape: /.netlify/functions/ebird?path=<eBird path>&<other params>
// The `path` query param is stripped and appended to the eBird base URL;
// everything else is forwarded as eBird query params.

exports.handler = async (event) => {
  const apiKey = process.env.EBIRD_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'EBIRD_API_KEY not configured on server' })
    };
  }

  const params = { ...(event.queryStringParameters || {}) };
  const path = params.path;
  delete params.path;
  if (!path) {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing path param' }) };
  }

  const qs = new URLSearchParams(params).toString();
  const url = `https://api.ebird.org/v2/${path}${qs ? '?' + qs : ''}`;

  try {
    const res = await fetch(url, { headers: { 'X-eBirdApiToken': apiKey } });
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
      body
    };
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) };
  }
};
