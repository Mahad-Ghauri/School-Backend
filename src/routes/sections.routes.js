const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { staffOnly } = require('../middleware/role.middleware');

router.use(authenticate);
router.use(staffOnly);

router.get('/', (req, res) => {
  res.json({ success: true, message: 'Sections routes - Coming soon' });
});

module.exports = router;
