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
