const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { staffOnly } = require('../middleware/role.middleware');

// All routes require authentication
router.use(authenticate);
router.use(staffOnly);

// TODO: Implement students routes
router.get('/', (req, res) => {
  res.json({ success: true, message: 'Students routes - Coming soon' });
});

module.exports = router;
