// Security tests for the Search API (ST-01 to ST-27, listed in the report).
// Runs against a running Search API, locally or through API Gateway on Floci:
//   npm run test:security                                   http://localhost:3002
//   set BASE_URL=http://<api-id>.execute-api.localhost.floci.io:4566 first to test Floci
// Needs: the seed data (docs/seed.sql), .env with DATABASE_URL, TOKEN_SECRET, SERVICE_KEY,
// and the Identity/Profile endpoints running (or npm run mock-services).
// It sends requests as the seed students and alumni and deletes the contact
// requests those seed accounts made when it finishes.
require('dotenv').config();

const crypto = require('crypto');
const { getSql } = require('../services/db');
const { signToken } = require('../../shared/auth');

const BASE = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3002}`).replace(/\/$/, '');
const STUDENT_ID = '00000000-0000-4000-8000-000000000010';
const STUDENT2_ID = '00000000-0000-4000-8000-000000000011';
const ALUM_ID = '00000000-0000-4000-8000-000000000100';
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';

let passed = 0;
let failed = 0;

function check(id, name, ok, got) {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${id}  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${id}  ${name}`);
    console.log(`        got: ${JSON.stringify(got).slice(0, 300)}`);
  }
}

async function call(method, path, { token, body, headers = {} } = {}) {
  const sendHeaders = { ...headers };
  if (token) sendHeaders.Authorization = `Bearer ${token}`;
  if (body !== undefined) sendHeaders['Content-Type'] = 'application/json';
  const response = await fetch(BASE + path, {
    method,
    headers: sendHeaders,
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  });
  return { status: response.status, headers: response.headers, data: await response.json().catch(() => null) };
}

// A token signed with a key that is not TOKEN_SECRET.
function foreignToken(sub, role) {
  const body = Buffer.from(JSON.stringify({ sub, role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const signature = crypto.createHmac('sha256', 'not-the-real-secret-not-the-real-secret').update(body).digest('base64url');
  return `${body}.${signature}`;
}

const FIELD_NAMES = { graduation_year: 'graduationYear', company: 'company', location: 'location', industry: 'industry', bio: 'bio', skills: 'skills' };

async function main() {
  const sql = getSql();
  console.log(`Testing ${BASE}\n`);

  // ---- Seed accounts used by the tests
  const alumProfile = (await sql`SELECT id FROM alumni_profiles WHERE user_id = ${ALUM_ID}`)[0];
  const otherAlum = (await sql`
    SELECT p.id AS "profileId", u.id AS "userId" FROM alumni_profiles p JOIN users u ON u.id = p.user_id
    WHERE u.role = 'alumni' AND u.account_status = 'active' AND p.is_active AND u.id <> ${ALUM_ID}
    ORDER BY u.name LIMIT 1`)[0];
  const suspended = (await sql`SELECT id, role FROM users WHERE account_status = 'suspended' LIMIT 1`)[0];
  const alumHidden = (await sql`
    SELECT field_name FROM privacy_settings WHERE profile_id = ${alumProfile.id} AND is_visible = FALSE`).map((r) => r.field_name);
  if (!alumProfile || !otherAlum || !suspended || alumHidden.length === 0) {
    throw new Error('Seed data not found. Run docs/schema.sql and docs/seed.sql first.');
  }
  await sql`DELETE FROM contact_requests WHERE student_user_id IN (${STUDENT_ID}, ${STUDENT2_ID}, ${otherAlum.userId})`;

  const T = {
    student: signToken({ sub: STUDENT_ID, role: 'student' }),
    student2: signToken({ sub: STUDENT2_ID, role: 'student' }),
    alum: signToken({ sub: ALUM_ID, role: 'alumni' }),
    otherAlum: signToken({ sub: otherAlum.userId, role: 'alumni' }),
    admin: signToken({ sub: ADMIN_ID, role: 'admin' })
  };
  let r;

  console.log('Authentication');
  r = await call('GET', '/api/alumni');
  check('ST-01', 'no token -> 401 AUTH_REQUIRED', r.status === 401 && r.data.error.code === 'AUTH_REQUIRED', r);
  const [body] = T.student.split('.');
  const raised = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), role: 'admin' })).toString('base64url');
  r = await call('GET', '/api/alumni', { token: `${raised}.${T.student.split('.')[1]}` });
  check('ST-02', 'token edited to role admin -> 401 INVALID_TOKEN', r.status === 401 && r.data.error.code === 'INVALID_TOKEN', r);
  r = await call('GET', '/api/alumni', { token: signToken({ sub: STUDENT_ID, role: 'student' }, -60) });
  check('ST-03', 'expired token -> 401', r.status === 401, r);
  r = await call('GET', '/api/alumni', { token: foreignToken(STUDENT_ID, 'student') });
  check('ST-04', 'token signed with another key -> 401', r.status === 401, r);

  console.log('\nAuthorization and roles');
  r = await call('GET', '/api/alumni', { token: signToken({ sub: STUDENT_ID, role: 'alumni' }) });
  check('ST-05', 'token role differs from the real account role -> 403', r.status === 403, r);
  r = await call('GET', '/api/alumni', { token: signToken({ sub: suspended.id, role: suspended.role }) });
  check('ST-06', 'suspended account -> 403 ACCOUNT_INACTIVE', r.status === 403 && r.data.error.code === 'ACCOUNT_INACTIVE', r);
  const message = 'Hello, I am a CS student interested in your field.';
  // Students and alumni may send; an admin may not, and nobody may ask their own profile.
  const byAdmin = await call('POST', '/api/contact-requests', { token: T.admin, body: { alumniId: alumProfile.id, message } });
  const toSelf = await call('POST', '/api/contact-requests', { token: T.alum, body: { alumniId: alumProfile.id, message } });
  const alumToAlum = await call('POST', '/api/contact-requests', { token: T.otherAlum, body: { alumniId: alumProfile.id, message } });
  check('ST-07', 'admin sends -> 403; alum asks own profile -> 400; alum asks another alum -> 201',
    byAdmin.status === 403 && toSelf.status === 400 && toSelf.data.error.code === 'CANNOT_CONTACT_SELF' && alumToAlum.status === 201,
    { byAdmin: byAdmin.status, toSelf: toSelf.status, alumToAlum: alumToAlum.status });
  r = await call('POST', '/api/contact-requests', { token: T.student, body: { alumniId: alumProfile.id, message } });
  const requestId = r.data && r.data.id;
  r = await call('PATCH', `/api/contact-requests/${requestId}`, { token: T.student, body: { status: 'accepted' } });
  check('ST-08', 'student answers a contact request -> 403', r.status === 403, r);
  r = await call('GET', '/api/contact-requests', { token: T.admin });
  check('ST-09', 'admin lists contact requests -> 403', r.status === 403, r);

  console.log('\nOwnership and ID swapping');
  r = await call('PATCH', `/api/contact-requests/${requestId}`, { token: T.otherAlum, body: { status: 'accepted' } });
  check('ST-10', 'alum answers a request sent to another alum -> 404', r.status === 404 && r.data.error.code === 'REQUEST_NOT_FOUND', r);
  r = await call('GET', '/api/contact-requests', { token: T.otherAlum });
  check('ST-11', 'other alum cannot list it (received or sent)',
    r.status === 200 && !r.data.requests.some((x) => x.id === requestId) && !r.data.sent.some((x) => x.id === requestId), r);
  r = await call('GET', `/api/alumni/${alumProfile.id}`, { token: T.student });
  const leaked = alumHidden.filter((f) => r.data && FIELD_NAMES[f] in r.data);
  check('ST-12', `another user's profile hides ${alumHidden.join(', ')}`, r.status === 200 && leaked.length === 0, { leaked });
  r = await call('GET', `/api/alumni/${alumProfile.id}`, { token: T.alum });
  check('ST-13', 'owner sees own hidden fields', r.status === 200 && alumHidden.every((f) => FIELD_NAMES[f] in r.data), r.data);
  const random = await call('GET', `/api/alumni/${crypto.randomUUID()}`, { token: T.student });
  r = await call('GET', `/api/alumni/${encodeURIComponent('1 OR 1=1')}`, { token: T.student });
  check('ST-14', 'unknown id and non-UUID id -> 404', random.status === 404 && r.status === 404, { random: random.status, r: r.status });

  console.log('\nPrivacy');
  const hiddenRows = await sql`SELECT profile_id::text AS id, field_name FROM privacy_settings WHERE is_visible = FALSE`;
  const hiddenByProfile = new Map();
  for (const row of hiddenRows) {
    hiddenByProfile.set(row.id, [...(hiddenByProfile.get(row.id) || []), row.field_name]);
  }
  let leaks = [];
  for (let page = 1; page <= 5; page += 1) {
    r = await call('GET', `/api/alumni?page=${page}`, { token: T.student });
    for (const result of r.data.results) {
      for (const field of hiddenByProfile.get(result.id) || []) {
        if (FIELD_NAMES[field] in result) leaks.push(`${result.name}: ${field}`);
      }
    }
    if (r.data.results.length < r.data.pageSize) break;
  }
  check('ST-15', 'no hidden field in any search result', leaks.length === 0, leaks);
  const alumRow = (await sql`SELECT location FROM alumni_profiles WHERE id = ${alumProfile.id}`)[0];
  if (alumHidden.includes('location') && alumRow.location) {
    r = await call('GET', `/api/alumni?location=${encodeURIComponent(alumRow.location)}`, { token: T.student });
    check('ST-16', `filter by hidden location "${alumRow.location}" does not find its owner`, r.status === 200 && !r.data.results.some((x) => x.id === alumProfile.id), r.data);
  }
  r = await call('GET', '/api/alumni/filters', { token: T.student });
  const expected = await sql`
    SELECT MIN(trim(p.location)) AS name, COUNT(*)::int AS count
    FROM alumni_profiles p JOIN users u ON u.id = p.user_id
    WHERE u.role = 'alumni' AND u.account_status = 'active' AND p.is_active AND p.location IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM privacy_settings ps
                      WHERE ps.profile_id = p.id AND ps.field_name = 'location' AND ps.is_visible = FALSE)
    GROUP BY lower(trim(p.location))`;
  const expectedCounts = Object.fromEntries(expected.map((x) => [x.name, x.count]));
  const wrong = (r.data ? r.data.locations : []).filter((x) => expectedCounts[x.name] !== x.count);
  check('ST-17', 'filter counts include only visible values', r.status === 200 && wrong.length === 0, wrong);

  console.log('\nInput validation and injection');
  r = await call('GET', `/api/alumni?q=${encodeURIComponent("x' OR '1'='1")}`, { token: T.student });
  const usersLeft = (await sql`SELECT COUNT(*)::int AS n FROM users`)[0].n;
  check('ST-18', 'SQL injection text in q is plain text (200, no rows leak, tables intact)', r.status === 200 && r.data.total === 0 && usersLeft > 0, r.data);
  r = await call('GET', '/api/alumni?role=admin', { token: T.student });
  const r2 = await call('GET', '/api/alumni/filters?limit=1000', { token: T.student });
  check('ST-19', 'unknown query parameter -> 400 (search and filters)', r.status === 400 && r2.status === 400, { search: r.status, filters: r2.status });
  r = await call('GET', '/api/alumni/filters?industry=Hacking', { token: T.student });
  const r3 = await call('GET', `/api/alumni?industry=${encodeURIComponent("Software' --")}`, { token: T.student });
  check('ST-20', 'industry outside the allowed list -> 400', r.status === 400 && r3.status === 400, { filters: r.status, search: r3.status });
  r = await call('GET', '/api/alumni/filters?industry=Software&industry=Banking%20and%20Finance', { token: T.student });
  check('ST-21', 'parameter sent twice -> 400', r.status === 400, r);
  const ranges = await Promise.all(['gradYear=1800', 'page=0', 'page=abc', 'near=Cairo&radiusKm=100000']
    .map((q) => call('GET', `/api/alumni?${q}`, { token: T.student })));
  check('ST-22', 'out-of-range gradYear, page, radiusKm -> 400', ranges.every((x) => x.status === 400), ranges.map((x) => x.status));
  r = await call('POST', '/api/contact-requests', { token: T.student2, body: { alumniId: alumProfile.id, message, status: 'accepted' } });
  check('ST-23', 'extra field (status) in a new request -> 400', r.status === 400, r);
  r = await call('POST', '/api/contact-requests', { token: T.student2, body: { alumniId: alumProfile.id, message: 'x'.repeat(20000) } });
  check('ST-24', 'body over 10 KB -> 413', r.status === 413, r);

  console.log('\nService-to-service');
  const noKey = await call('POST', '/internal/locations/resolve', { body: { location: 'Cairo' } });
  const userToken = await call('POST', '/internal/locations/resolve', { token: T.admin, body: { location: 'Cairo' } });
  const wrongKey = await call('POST', '/internal/locations/resolve', { headers: { 'X-Service-Key': 'wrong' }, body: { location: 'Cairo' } });
  const goodKey = await call('POST', '/internal/locations/resolve', { headers: { 'X-Service-Key': process.env.SERVICE_KEY }, body: { location: 'Cairo' } });
  check('ST-25', 'internal route: no key, user token, wrong key -> 401; right key -> 200',
    noKey.status === 401 && userToken.status === 401 && wrongKey.status === 401 && goodKey.status === 200,
    [noKey.status, userToken.status, wrongKey.status, goodKey.status]);

  console.log('\nAudit logging');
  const since = new Date(Date.now() - 2000);
  await call('GET', `/api/alumni/${otherAlum.profileId}`, { token: T.student });
  await call('GET', '/api/contact-requests', { token: T.admin });
  await call('GET', '/api/alumni');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const rows = await sql`
    SELECT action, outcome, actor_user_id::text AS actor FROM audit_logs
    WHERE service_name = 'search' AND created_at >= ${since.toISOString()}`;
  const viewed = rows.some((x) => x.action === 'VIEW_PROFILE' && x.actor === STUDENT_ID);
  const denied = rows.some((x) => x.action === 'DENIED GET' && x.outcome === 'forbidden' && x.actor === ADMIN_ID);
  const anonymous = rows.some((x) => x.actor === null);
  check('ST-26', 'profile view and 403 saved to audit_logs; anonymous 401 not saved (log line only)', viewed && denied && !anonymous, rows);

  console.log('\nRate limit');
  const limit = Number(process.env.RATE_LIMIT_PER_MINUTE) || 60;
  const statuses = [];
  for (let i = 0; i <= limit + 1; i += 1) {
    statuses.push((await call('GET', '/api/alumni/filters', { token: T.student2 })).status);
  }
  const last = await call('GET', '/api/alumni/filters', { token: T.student2 });
  check('ST-27', `more than ${limit} requests in a minute -> 429 with Retry-After`,
    statuses.includes(429) && last.status === 429 && last.headers.get('retry-after') === '60', { statuses: statuses.slice(-4), last: last.status });

  await sql`DELETE FROM contact_requests WHERE student_user_id IN (${STUDENT_ID}, ${STUDENT2_ID}, ${otherAlum.userId})`;
}

main()
  .catch((error) => {
    failed += 1;
    console.log(`\nStopped early: ${error.message}`);
  })
  .finally(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
  });
