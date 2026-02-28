const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');

// Import routes
const authRoutes = require('./routes/auth.routes');
const studentsRoutes = require('./routes/students.routes');
const guardiansRoutes = require('./routes/guardians.routes');
const classesRoutes = require('./routes/classes.routes');
const sectionsRoutes = require('./routes/sections.routes');
const feesRoutes = require('./routes/fees.routes');
const vouchersRoutes = require('./routes/vouchers.routes');
const facultyRoutes = require('./routes/faculty.routes');
const salariesRoutes = require('./routes/salaries.routes');
const expensesRoutes = require('./routes/expenses.routes');
const reportsRoutes = require('./routes/reports.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const documentsRoutes = require('./routes/documents.routes');
const discountsRoutes = require('./routes/discounts.routes');
const studentFeeOverridesRoutes = require('./routes/student-fee-overrides.routes');
const testReportsRoutes = require('./routes/testReports.routes');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10000, // limit each IP to 10000 requests per windowMs (high for testing)
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check
app.get('/health', (req, res) => {
  console.log("Health endpoint hit");
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Bulk import - NO AUTH - placed before all route middleware
const studentsController = require('./controllers/students.controller');
app.post('/api/students/bulk-noauth', studentsController.bulkCreate);

// Test bulk delete endpoint directly in app.js - NO AUTH
app.post('/api/test-bulk-delete-direct', (req, res) => {
  console.log('🧪 Direct bulk delete test called with:', req.body);
  res.json({ 
    message: 'Direct bulk delete test endpoint reached', 
    receivedData: req.body,
    timestamp: new Date().toISOString()
  });
});

// Bulk delete endpoint - NO AUTH (completely separate from students router)
app.post('/api/bulk-delete-students', async (req, res, next) => {
  console.log('🗑️ NO-AUTH bulk delete called with:', req.body);
  try {
    await studentsController.bulkDelete(req, res, next);
  } catch (error) {
    console.error('❌ Direct bulk delete error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Bulk delete failed: ' + error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test actual bulk delete without auth
app.post('/api/students/bulk-delete-noauth', studentsController.bulkDelete);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/guardians', guardiansRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/sections', sectionsRoutes);
app.use('/api/fees', feesRoutes);
app.use('/api/vouchers', vouchersRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/salaries', salariesRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api', documentsRoutes);
app.use('/api/discounts', discountsRoutes);
app.use('/api/student-fee-overrides', studentFeeOverridesRoutes);
app.use('/api/test-reports', testReportsRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
