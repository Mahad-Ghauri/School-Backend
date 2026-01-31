const express = require('express');
const router = express.Router();
const expensesController = require('../controllers/expenses.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly, authorize } = require('../middleware/role.middleware');

// All routes require authentication
router.use(authenticate);

// Summary and stats routes (before :id to avoid conflicts)
router.get('/summary', authorize(['admin', 'staff']), expensesController.getSummary);
router.get('/daily', authorize(['admin', 'staff']), expensesController.getDailyExpenses);
router.get('/top', authorize(['admin', 'staff']), expensesController.getTopExpenses);

// Bulk operations (admin only)
router.post('/bulk', adminOnly, expensesController.bulkCreate);

// CRUD operations
router.post('/', adminOnly, expensesController.create);
router.get('/', authorize(['admin', 'staff']), expensesController.list);
router.get('/:id', authorize(['admin', 'staff']), expensesController.getById);
router.put('/:id', adminOnly, expensesController.update);
router.delete('/:id', adminOnly, expensesController.delete);

module.exports = router;
