// Database queries for contact requests (student or alum -> alum).
// The column student_user_id holds the sender, who can be a student or an alum.
const { getSql } = require('./db');

// The alum someone wants to contact. Only active alumni with an active profile.
async function findContactableAlumnus(profileId) {
  const sql = getSql();
  const rows = await sql`
    SELECT p.id, p.user_id AS "userId", u.name
    FROM alumni_profiles p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ${profileId}
      AND u.role = 'alumni'
      AND u.account_status = 'active'
      AND p.is_active = TRUE`;
  return rows[0] || null;
}

async function countPendingFromSender(senderUserId) {
  const sql = getSql();
  const rows = await sql`
    SELECT COUNT(*)::int AS count FROM contact_requests
    WHERE student_user_id = ${senderUserId} AND status = 'pending'`;
  return rows[0].count;
}

// Returns the new row, or null if this sender already has an open request to this alum.
async function createRequest({ senderUserId, alumniProfileId, message }) {
  const sql = getSql();
  try {
    const rows = await sql`
      INSERT INTO contact_requests (student_user_id, alumni_profile_id, message)
      VALUES (${senderUserId}, ${alumniProfileId}, ${message})
      RETURNING id, alumni_profile_id AS "alumniId", status, message, created_at AS "createdAt"`;
    return rows[0];
  } catch (error) {
    // 23505 = unique violation on uq_contact_requests_pending
    if (error.code === '23505') return null;
    throw error;
  }
}

// Requests a user (student or alum) has sent, newest first.
async function listSentBy(senderUserId) {
  const sql = getSql();
  return sql`
    SELECT cr.id, cr.alumni_profile_id AS "alumniId", u.name AS "alumniName",
           cr.status, cr.message, cr.created_at AS "createdAt", cr.responded_at AS "respondedAt"
    FROM contact_requests cr
    JOIN alumni_profiles p ON p.id = cr.alumni_profile_id
    JOIN users u ON u.id = p.user_id
    WHERE cr.student_user_id = ${senderUserId}
    ORDER BY cr.created_at DESC
    LIMIT 100`;
}

// Requests an alum has received, newest first. The sender's email is never shown.
async function listReceivedByAlumnus(alumniUserId) {
  const sql = getSql();
  return sql`
    SELECT cr.id, s.name AS "studentName", s.role AS "senderRole",
           cr.status, cr.message, cr.created_at AS "createdAt", cr.responded_at AS "respondedAt"
    FROM contact_requests cr
    JOIN alumni_profiles p ON p.id = cr.alumni_profile_id
    JOIN users s ON s.id = cr.student_user_id
    WHERE p.user_id = ${alumniUserId}
    ORDER BY cr.created_at DESC
    LIMIT 100`;
}

// Accept or decline. The WHERE clause does the ownership check: the request must be
// addressed to this alum's own profile and still be pending.
// Returns the updated row, or { problem: 'NOT_FOUND' | 'ALREADY_ANSWERED' }.
async function answerRequest({ requestId, alumniUserId, status }) {
  const sql = getSql();
  const rows = await sql`
    UPDATE contact_requests cr
    SET status = ${status}, responded_at = now()
    FROM alumni_profiles p
    WHERE cr.id = ${requestId}
      AND p.id = cr.alumni_profile_id
      AND p.user_id = ${alumniUserId}
      AND cr.status = 'pending'
    RETURNING cr.id, cr.status, cr.responded_at AS "respondedAt"`;
  if (rows[0]) return rows[0];

  // Nothing updated: find out why, without revealing other alumni's requests.
  const existing = await sql`
    SELECT cr.status FROM contact_requests cr
    JOIN alumni_profiles p ON p.id = cr.alumni_profile_id
    WHERE cr.id = ${requestId} AND p.user_id = ${alumniUserId}`;
  return { problem: existing[0] ? 'ALREADY_ANSWERED' : 'NOT_FOUND' };
}

module.exports = {
  findContactableAlumnus,
  countPendingFromSender,
  createRequest,
  listSentBy,
  listReceivedByAlumnus,
  answerRequest
};
