// Privacy helper. Owner: Ammar (Search enforces privacy on every result).
// Removes fields the profile owner has hidden, unless the caller grants full access.

const { PRIVACY_FIELDS } = require('../../shared/constants');

// profile: a plain object from the database, including profile.userId
// hiddenFields: array of field names with is_visible = false, e.g. ['company', 'location']
// showHidden: whether the controller authorizes a full view for this endpoint
function applyPrivacy(profile, hiddenFields, showHidden = false) {
  const result = { ...profile };
  if (!showHidden) {
    for (const field of hiddenFields || []) {
      if (PRIVACY_FIELDS.includes(field)) {
        delete result[toCamel(field)];
      }
    }
  }
  delete result.userId; // internal id, never needed by the frontend
  return result;
}

function toCamel(field) {
  return field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

module.exports = { applyPrivacy };
