const express = require('express');
const router = express.Router();
const studentsController = require('../controllers/students.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { staffOnly, adminOnly } = require('../middleware/role.middleware');

// All routes require authentication
router.use(authenticate);
router.use(staffOnly);

// CRUD operations
router.post('/', adminOnly, studentsController.create);
router.get('/', studentsController.list);
router.get('/:id', studentsController.getById);
router.put('/:id', adminOnly, studentsController.update);

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
