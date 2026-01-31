const express = require('express');
const router = express.Router();
const vouchersController = require('../controllers/vouchers.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly, staffOnly } = require('../middleware/role.middleware');

// All routes require authentication
router.use(authenticate);

/**
 * Voucher Generation Routes
 */
// Generate single voucher (admin only)
router.post('/generate', adminOnly, vouchersController.generate);

// Generate bulk vouchers for class/section (admin only)
router.post('/generate-bulk', adminOnly, vouchersController.generateBulk);

/**
 * Voucher Management Routes
 */
// List vouchers with filters (staff can view)
router.get('/', staffOnly, vouchersController.list);

// Get voucher by ID with complete details (staff can view)
router.get('/:id', staffOnly, vouchersController.getById);

// Update voucher items (admin only)
router.put('/:id/items', adminOnly, vouchersController.updateItems);

// Delete voucher (admin only - only if unpaid)
router.delete('/:id', adminOnly, vouchersController.delete);

module.exports = router;
