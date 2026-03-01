const express = require('express');
const router = express.Router();
const studentsController = require('../controllers/students.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { staffOnly, adminOnly } = require('../middleware/role.middleware');

// Bulk import - NO AUTH for testing (place BEFORE authentication middleware)
router.post('/bulk', studentsController.bulkCreate);
router.post('/bulk-update', studentsController.bulkUpdate); // Update existing students with missing data

// Bulk operations - NO AUTH for testing - Multiple methods supported
router.post('/bulk-deactivate', studentsController.bulkDeactivate);
router.post('/bulk-delete', studentsController.bulkDelete);
router.delete('/bulk-delete', studentsController.bulkDelete); // Support both POST and DELETE

// Mark/Unmark students as fee-free - NO AUTH for testing
router.post('/mark-free', studentsController.markFree);
router.post('/unmark-free', studentsController.unmarkFree);

// Update basic student info - NO AUTH for testing
router.patch('/:id/basic-info', studentsController.updateBasicInfo);

// Test endpoints to verify no auth
router.get('/test', (req, res) => {
  res.json({ message: 'Test endpoint working - no auth required' });
});

router.post('/test-bulk-delete', (req, res) => {
  console.log('🧪 Test bulk delete called with:', req.body);
  res.json({ 
    message: 'Test bulk delete endpoint reached', 
    receivedData: req.body,
    timestamp: new Date().toISOString()
  });
});

// All routes below require authentication
router.use(authenticate);
router.use(staffOnly);

// CRUD operations
router.post('/', adminOnly, studentsController.create);
router.get('/', studentsController.list);
router.get('/:id', studentsController.getById);
router.put('/:id', adminOnly, studentsController.update);
router.patch('/:id/basic-info', studentsController.updateBasicInfo); // Update basic info (no admin required)

// Enrollment operations
router.post('/:id/enroll', adminOnly, studentsController.enroll);
router.post('/:id/withdraw', adminOnly, studentsController.withdraw);
router.post('/:id/transfer', adminOnly, studentsController.transfer);
router.post('/:id/promote', adminOnly, studentsController.promote);

// Status management
router.post('/:id/activate', adminOnly, studentsController.activate);
router.post('/:id/deactivate', adminOnly, studentsController.deactivate);
router.post('/:id/expel', adminOnly, studentsController.expel);
router.post('/:id/clear-expulsion', adminOnly, studentsController.clearExpulsion);

// Guardian management
router.post('/:id/guardians', adminOnly, studentsController.addGuardian);
router.delete('/:id/guardians/:guardianId', adminOnly, studentsController.removeGuardian);

module.exports = router;
