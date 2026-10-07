/**
 * Netlify adapter for the project's existing Vercel-style /api handlers.
 *
 * The application already contains route modules under /api/*.js that use the
 * Vercel (req, res) interface. This single Netlify Function adapts those
 * handlers without changing their business logic.
 */

const ROUTES = {
  academic: () => import('../../api/academic.js'),
  attendance: () => import('../../api/attendance.js'),
  audit: () => import('../../api/audit.js'),
  auth: () => import('../../api/auth.js'),
  communication: () => import('../../api/communication.js'),
  curriculum: () => import('../../api/curriculum.js'),
  dashboard: () => import('../../api/dashboard.js'),
  'db-wake': () => import('../../api/db-wake.js'),
  finance: () => import('../../api/finance.js'),
  health: () => import('../../api/health.js'),
  import: () => import('../../api/import.js'),
  learners: () => import('../../api/learners.js'),
  operations: () => import('../../api/operations.js'),
  parents: () => import('../../api/parents.js'),
  'phase3-dashboard': () => import('../../api/phase3-dashboard.js'),
  roles: () => import('../../api/roles.js'),
  schools: () => import('../../api/schools.js'),
  search: () => import('../../api/search.js'),
  teachers: () => import('../../api/teachers.js'),
  timetable: () => import('../../api/timetable.js'),
  upload: () => import('../../api/upload.js'),
  users: () => import('../../api/users.js'),
};

function getRouteName(event) {
  const path = event.path || '';
  const match = path.match(/\/\.netlify\/functions\/api\/?(.*)$/);
  if (match?.[1]) return match[1].split('/')[0];

  const apiMatch = path.match(/\/api\/?(.*)$/);
  if (apiMatch?.[1]) return apiMatch[1].split('/')[0];

  const paramsPath = event.pathParameters?.splat;
  if (paramsPath) return String(paramsPath).split('/')[0];

  return '';
}

function getQuery(event) {
  const query = {};
  const raw = event.rawQuery || '';
  if (raw) {
    for (const [key, value] of new URLSearchParams(raw)) query[key] = value;
  }
  for (const [key, value] of Object.entries(event.queryStringParameters || {})) {
    if (value != null) query[key] = value;
  }
  return query;
}

function parseBody(event) {
  if (event.body == null || event.body === '') return undefined;
  if (typeof event.body !== 'string') return event.body;
  const body = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  const contentType = Object.entries(event.headers || {})
    .find(([key]) => key.toLowerCase() === 'content-type')?.[1] || '';
  if (contentType.includes('application/json')) {
    try { return JSON.parse(body); } catch { return body; }
  }
  return body;
}

function makeRequest(event) {
  const headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    method: event.httpMethod || 'GET',
    headers,
    body: parseBody(event),
    query: getQuery(event),
    path: event.path,
    url: event.rawUrl,
  };
}

function makeResponse() {
  let statusCode = 200;
  let body = '';
  const headers = {};

  return {
    setHeader(name, value) { headers[name] = value; },
    getHeader(name) { return headers[name]; },
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = JSON.stringify(value);
      if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json; charset=utf-8';
      }
      return this;
    },
    send(value) {
      body = typeof value === 'string' ? value : JSON.stringify(value);
      return this;
    },
    end(value = '') {
      body = value;
      return this;
    },
    toNetlifyResponse() {
      return {
        statusCode,
        headers,
        body,
      };
    },
  };
}

export async function handler(event) {
  const routeName = getRouteName(event);
  const loader = ROUTES[routeName];

  if (!loader) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: `API route not found: ${routeName || 'unknown'}` }),
    };
  }

  try {
    const module = await loader();
    const routeHandler = module.default;
    if (typeof routeHandler !== 'function') {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ error: `Invalid API handler: ${routeName}` }),
      };
    }

    const req = makeRequest(event);
    const res = makeResponse();
    await routeHandler(req, res);
    return res.toNetlifyResponse();
  } catch (error) {
    console.error(`Netlify API route ${routeName} failed:`, error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ error: error?.message || 'Internal server error', code: 'FUNCTION_ERROR' }),
    };
  }
}
