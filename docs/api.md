# AlumniLink API contract

Agreed endpoint list (proposal section 5.1). Do not change an endpoint without telling the team.

## Error format (Lab 4), used by every backend

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Readable explanation." } }
```

Common codes: `VALIDATION_ERROR` (400), `AUTH_REQUIRED` / `INVALID_TOKEN` / `SERVICE_KEY_INVALID` (401),
`FORBIDDEN` / `ACCOUNT_INACTIVE` (403), `ROUTE_NOT_FOUND` / `*_NOT_FOUND` (404), `*_ALREADY_*` (409),
`TOO_MANY_PENDING` (429), `INTERNAL_ERROR` (500), `NOT_IMPLEMENTED` (501, placeholders only),
`SERVICE_UNAVAILABLE` / `GEOCODING_UNAVAILABLE` (503).

## Login token

Protected routes need the header `Authorization: Bearer <token>`.
The Profile backend's login route creates the token with `signToken()` from `shared/auth.js`.
All three backends check it with the same `TOKEN_SECRET`.

## Profile and Privacy backend (Ahmed), local port 3001

| Method | Endpoint | Purpose | Success | Errors | Roles |
|---|---|---|---|---|---|
| POST | /api/auth/register | Create account + verification request (Turnstile) | 201 | 400, 403, 409 | Not logged in |
| POST | /api/auth/login | Sign in, returns token | 200 | 400, 401, 403 | Not logged in |
| POST | /api/profiles | Create own profile | 201 | 400, 401, 409 | Alumni |
| GET | /api/profiles/me | View own full profile | 200 | 401, 404 | Alumni |
| PATCH | /api/profiles/me | Update details and skills | 200 | 400, 401, 404 | Alumni |
| PATCH | /api/profiles/me/privacy | Update visibility settings | 200 | 400, 401 | Alumni |
| PATCH | /api/profiles/me/status | Deactivate own profile | 200 | 400, 401, 403, 404 | Alumni |

## Search, Locations and Contact backend (Ammar), local port 3002

Every `/api` route checks, in this order: the token (401), the role (403), the request limit of
60 per user per minute (429 `RATE_LIMITED`, with `Retry-After: 60`), then asks the Identity service
whether the account is still active (cached 60 seconds). Suspended or pending accounts get 403
`ACCOUNT_INACTIVE`; if Identity cannot be reached the answer is 503 `SERVICE_UNAVAILABLE`.
Bodies over 10 KB get 413 `PAYLOAD_TOO_LARGE`. On Floci or AWS the service runs as a Lambda
function behind API Gateway; the routes and answers are the same.

| Method | Endpoint | Purpose | Success | Errors | Roles |
|---|---|---|---|---|---|
| GET | /api/alumni | Search, filter, near-me, sort, paginate. Cards respect field visibility for everyone except admins. | 200 | 400, 401, 403, 429, 503 | Alumni, Student, Admin |
| GET | /api/alumni/filters | Filter options built from visible data only | 200 | 400, 401, 403, 429, 503 | Alumni, Student, Admin |
| GET | /api/alumni/:id | Visible fields of one profile (owner and admin also see hidden ones) | 200 | 401, 403, 404, 429, 503 | Alumni, Student, Admin |
| POST | /api/contact-requests | Ask an alum for contact details (never your own profile: 400 `CANNOT_CONTACT_SELF`) | 201 | 400, 401, 403, 404, 409, 413, 429, 503 | Student, Alumni |
| GET | /api/contact-requests | Student: `requests` = sent. Alum: `requests` = received, `sent` = sent to other alumni | 200 | 401, 403, 429, 503 | Student, Alumni |
| PATCH | /api/contact-requests/:id | Accept or decline (own requests only) | 200 | 400, 401, 403, 404, 409, 429, 503 | Alumni |

Query parameters for `GET /api/alumni` (any other parameter answers 400):

| Parameter | Rule |
|---|---|
| q | Name or skill, 2 to 50 characters |
| location | 2 to 100 characters, partial match |
| industry | One of `INDUSTRIES` in `shared/constants.js` |
| gradYear | Four digits, 1950 to the current year |
| near | Place name, 2 to 100 characters, looked up with Open-Meteo Geocoding |
| radiusKm | 1 to 500, default 50. Only with `near` |
| sort | `name` (default), `newest`, `oldest`, `distance` (default when `near` is given; needs `near`) |
| page | 1 to 500 (default 1); 10 results per page |

Response: `{ "page": 1, "pageSize": 10, "total": 21, "results": [ ... ] }`, plus
`"near": { "name", "country", "radiusKm" }` and a `distanceKm` on each result for near-me searches.
Hidden fields are removed from each result, and filters (including near-me distance) never match a hidden field.

`GET /api/alumni/filters` takes one optional parameter, `industry` (one of `INDUSTRIES`); anything else
answers 400. With `industry`, the year range, skills and locations are counted inside that industry.

```json
{
  "industry": null,
  "industries": [{ "name": "Software", "count": 4 }],
  "graduationYears": { "min": 2009, "max": 2025 },
  "skills": [{ "name": "python", "count": 5 }],
  "locations": [{ "name": "Cairo", "count": 4 }],
  "sorts": ["name", "newest", "oldest", "distance"],
  "maxRadiusKm": 500
}
```

Every industry is listed (count 0 if none). Skills and locations are the 20 most common. Only active
alumni are counted, and only fields their owners left visible, so a count can never reveal a hidden value.
Near-me errors: unknown place 400 `LOCATION_NOT_FOUND`; Open-Meteo down 503 `GEOCODING_UNAVAILABLE`
(places already in the `locations` table still work, and searches without `near` are not affected).

Contact request body rules:

- `POST`: `{ "alumniId": "<profile id>", "message": "10 to 500 characters" }`. No other fields.
  One open request per student and alum (409). At most 5 pending per student (429).
- `PATCH`: `{ "status": "accepted" | "declined" }`. A request addressed to another alum answers 404.
  An already answered request answers 409.
- The alum's email is never stored by Search. When a student lists their requests, Search asks the
  Profile service for the email of each accepted one. If Profile is down, the list still loads and
  the item has `"contactUnavailable": true`.

## Internal service-to-service calls

Internal routes live under `/internal`, never under `/api`, and are never called by the browser.
The caller sends `X-Service-Key: <SERVICE_KEY>`; the same `SERVICE_KEY` is set in all three backends.
Missing or wrong key: 401 `SERVICE_KEY_INVALID`. Every call times out after 3 seconds.

| Caller -> Callee | Method | Endpoint | Answer |
|---|---|---|---|
| Profile -> Search | POST | /internal/locations/resolve `{ "location": "Cairo" }` | 200 `{ "location": { "name", "country", "latitude", "longitude" }, "cached": true }`, 400, 404 `LOCATION_NOT_FOUND`, 503 `GEOCODING_UNAVAILABLE` |
| Search or Profile -> Identity | GET | /internal/users/:id/status | 200 `{ "id", "role", "accountStatus" }`, 404 if the user does not exist |
| Search -> Profile | GET | /internal/profiles/:id/contact?requestId=:requestId with X-User-Token | 200 `{ "profileId", "contactEmail" }` (email may be null), 401 missing credentials, 403 if the request does not grant access |

Search sends the original sender's token (Student or Alumni) in X-User-Token and the accepted request ID in the query. Profile checks the sender, the target profile and the current accepted status before returning contact details. The standalone Search demo can use `search-api/scripts/mock-services.js`.

## Administration backend (Daniel), local port 3003

| Method | Endpoint | Purpose | Success | Errors | Roles |
|---|---|---|---|---|---|
| GET | /api/admin/verifications | List verification requests | 200 | 401, 403 | Admin |
| PATCH | /api/admin/verifications/:id | Approve or reject | 200 | 400, 401, 403, 404 | Admin |
| PATCH | /api/admin/users/:id/status | Suspend or reactivate | 200 | 400, 401, 403, 404 | Admin |
| GET | /api/admin/logs | Filtered audit events | 200 | 401, 403 | Admin |
