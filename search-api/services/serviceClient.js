// Calls from Search to the other two backends (service-to-service).
// Every call sends the shared SERVICE_KEY in the X-Service-Key header and gives up
// after 3 seconds. If the other service is down, slow, or rejects our key, the
// caller gets a ServiceUnavailableError and answers 503 instead of hanging.

const TIMEOUT_MS = 3000;

class ServiceUnavailableError extends Error {
  constructor(service, reason) {
    super(`${service} service unavailable: ${reason}`);
    this.service = service;
  }
}

function getServiceKey() {
  const key = process.env.SERVICE_KEY;
  // Fail closed: without a key no internal call can be trusted.
  if (!key || key.length < 32) {
    throw new Error('SERVICE_KEY is missing or shorter than 32 characters.');
  }
  return key;
}

// Returns { status, data } for any 2xx or 4xx answer.
// Throws ServiceUnavailableError for timeouts, network errors, 5xx and 401.
async function callService(service, baseUrl, path, headers = {}) {
  if (!baseUrl) {
    throw new ServiceUnavailableError(service, 'URL is not configured');
  }

  const serviceKey = getServiceKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetch(new URL(path, baseUrl), {
      headers: { ...headers, 'X-Service-Key': serviceKey },
      redirect: 'error',
      signal: controller.signal
    });
  } catch (error) {
    throw new ServiceUnavailableError(service, error.name === 'AbortError' ? 'timed out' : 'not reachable');
  } finally {
    clearTimeout(timer);
  }

  if (response.status >= 500) {
    throw new ServiceUnavailableError(service, `answered ${response.status}`);
  }
  if (response.status === 401) {
    // Our key was refused: a configuration problem, not the user's fault.
    console.error(`${service} service rejected the service key. Check SERVICE_KEY in both projects.`);
    throw new ServiceUnavailableError(service, 'rejected the service key');
  }

  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

// ---- Identity (Daniel): account status, cached for 60 seconds per user ----

const STATUS_CACHE_MS = 60 * 1000;
const statusCache = new Map();

// Returns { role, accountStatus } or null when the user does not exist.
async function getUserStatus(userId) {
  const cached = statusCache.get(userId);
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }

  const { status, data } = await callService(
    'Identity',
    process.env.IDENTITY_API_URL,
    `/internal/users/${encodeURIComponent(userId)}/status`
  );

  let value = null;
  if (status === 200 && data && data.accountStatus) {
    value = { role: data.role, accountStatus: data.accountStatus };
  } else if (status !== 404) {
    throw new ServiceUnavailableError('Identity', `answered ${status}`);
  }

  statusCache.set(userId, { value, expires: Date.now() + STATUS_CACHE_MS });
  return value;
}

// ---- Profile (Ahmed): contact email, only asked for after a request is accepted ----

// Returns the email text, or null when the profile has none.
async function getProfileContact(profileId, requestId, userToken) {
  const { status, data } = await callService(
    'Profile',
    process.env.PROFILE_API_URL,
    `/internal/profiles/${encodeURIComponent(profileId)}/contact?requestId=${encodeURIComponent(requestId)}`,
    { 'X-User-Token': userToken }
  );
  if (status === 200 && data?.profileId === profileId) {
    return data.contactEmail || null;
  }
  if (status === 404) {
    return null;
  }
  throw new ServiceUnavailableError('Profile', `answered ${status}`);
}

module.exports = { ServiceUnavailableError, getServiceKey, getUserStatus, getProfileContact };
