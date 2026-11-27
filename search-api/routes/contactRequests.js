const express = require('express');
const controller = require('../controllers/contactRequests');
const { requireLogin, requireRole } = require('../../shared/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { requireActiveAccount } = require('../middleware/activeAccount');

const router = express.Router();

// Role check first (no network call), then the request limit, then ask Identity
// if the account is still active.
router.post('/', requireLogin, requireRole('student', 'alumni'), rateLimit, requireActiveAccount, controller.createContactRequest);
router.get('/', requireLogin, requireRole('student', 'alumni'), rateLimit, requireActiveAccount, controller.listContactRequests);
router.patch('/:id', requireLogin, requireRole('alumni'), rateLimit, requireActiveAccount, controller.answerContactRequest);

module.exports = router;
