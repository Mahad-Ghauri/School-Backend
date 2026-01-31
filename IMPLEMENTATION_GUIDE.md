# School Management System - Backend Implementation Guide

## 🎯 Project Overview

This is a comprehensive School/College Management System backend built with Node.js, Express, and PostgreSQL (Neon). The system handles student management, fee collection, faculty salaries, expenses, and financial reporting.

---

## 📁 Project Structure

```
school-backend/
│
├── src/
│   ├── app.js                     # Main Express app initialization
│   ├── server.js                  # Starts the server & connects to Neon
│   │
│   ├── config/
│   │   ├── db.js                  # Supabase PostgreSQL pool/connection
│   │   ├── r2.js                  # Cloudflare R2 client
│   │   └── env.js                 # Load environment variables
│   │
│   ├── routes/                    # API routes
│   │   ├── auth.routes.js
│   │   ├── students.routes.js
│   │   ├── guardians.routes.js
│   │   ├── classes.routes.js
│   │   ├── sections.routes.js
│   │   ├── fees.routes.js
│   │   ├── vouchers.routes.js
│   │   ├── faculty.routes.js
│   │   ├── salaries.routes.js
│   │   ├── expenses.routes.js
│   │   ├── reports.routes.js
│   │   └── analytics.routes.js
│   │
│   ├── controllers/               # Business logic per module
│   │   ├── auth.controller.js
│   │   ├── students.controller.js
│   │   ├── guardians.controller.js
│   │   ├── classes.controller.js
│   │   ├── sections.controller.js
│   │   ├── fees.controller.js
│   │   ├── vouchers.controller.js
│   │   ├── faculty.controller.js
│   │   ├── salaries.controller.js
│   │   ├── expenses.controller.js
│   │   ├── reports.controller.js
│   │   └── analytics.controller.js
│   │
│   ├── services/                  # External services / helpers
│   │   ├── r2.service.js          # File upload/download logic for Cloudflare R2
│   │   ├── pdf.service.js         # PDF generation for vouchers/salary slips
│   │   └── email.service.js       # Optional: notifications
│   │
│   ├── middleware/                # Express middleware
│   │   ├── auth.middleware.js     # JWT authentication
│   │   ├── role.middleware.js     # ADMIN vs ACCOUNTANT access control
│   │   ├── error.middleware.js    # Central error handler
│   │   └── validate.middleware.js # Request validation
│   │
│   ├── models/                    # Optional: SQL query helpers
│   │   ├── users.model.js
│   │   ├── students.model.js
│   │   ├── classes.model.js
│   │   ├── sections.model.js
│   │   ├── fee_vouchers.model.js
│   │   ├── fee_payments.model.js
│   │   ├── faculty.model.js
│   │   ├── salary_vouchers.model.js
│   │   └── expenses.model.js
│   │
│   └── utils/
│       ├── response.js            # Standard API responses
│       ├── date.js                # Date helpers for reports
│       └── crypto.js              # Password hashing, JWT, etc.
│
├── migrations/                    # SQL migration scripts
│   └──-- 001_init_schema.sql
|   |---- 002_viwes.sql
|   |---- 003_indexes.sql           # Full database schema
│
├── .env                           # Environment variables
├── .gitignore
├── package.json
└── README.md
```

---

## 🚀 Phase 1: Project Setup & Dependencies

### Step 1: Initialize Project

```bash
mkdir school-backend && cd school-backend
npm init -y
```

### Step 2: Install Dependencies

```bash
# Core
npm install express dotenv cors helmet

# Database
npm install pg

# Authentication & Security
npm install bcryptjs jsonwebtoken express-rate-limit

# Validation
npm install joi

# File Upload
npm install multer @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner

# PDF Generation
npm install pdfkit

# Date handling
npm install date-fns

# Logging
npm install winston morgan

# Development
npm install --save-dev nodemon
```

### Step 3: Update package.json Scripts

```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```

### Step 4: Create .env File

```env
# Server
NODE_ENV=development
PORT=5000

# Supabase PostgreSQL
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.shblslbinibfgfdaeedm.supabase.co:5432/postgres

# JWT
JWT_SECRET=your-super-secret-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Cloudflare R2
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=school-documents
R2_PUBLIC_URL=https://your-bucket.r2.dev

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Step 5: Create .gitignore

```
node_modules/
.env
.env.local
.env.production
*.log
.DS_Store
uploads/
dist/
build/
```

---

## 🔧 Phase 2: Core Configuration Files

### src/config/env.js

```javascript
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    publicUrl: process.env.R2_PUBLIC_URL
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
};
```

### src/config/db.js

```javascript
const { Pool } = require('pg');
const config = require('./env');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('✅ Connected to Supabase PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection test failed:', err);
  } else {
    console.log('✅ Database connection test successful');
  }
});

module.exports = pool;
```

### src/config/r2.js

```javascript
const { S3Client } = require('@aws-sdk/client-s3');
const config = require('./env');

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey
  }
});

module.exports = r2Client;
```

---

## 🛠️ Phase 3: Utility Functions

### src/utils/response.js

```javascript
/**
 * Standardized API response utility
 */
class ApiResponse {
  static success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  static error(res, message = 'Error', statusCode = 500, errors = null) {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
      timestamp: new Date().toISOString()
    });
  }

  static created(res, data, message = 'Created successfully') {
    return this.success(res, data, message, 201);
  }

  static noContent(res, message = 'No content') {
    return res.status(204).json({
      success: true,
      message,
      timestamp: new Date().toISOString()
    });
  }

  static paginated(res, data, pagination, message = 'Success') {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit)
      },
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = ApiResponse;
```

### src/utils/crypto.js

```javascript
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Cryptography and JWT utilities
 */
class CryptoUtil {
  /**
   * Hash password using bcrypt
   */
  static async hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  }

  /**
   * Compare password with hash
   */
  static async comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token
   */
  static generateToken(payload) {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn
    });
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token) {
    try {
      return jwt.verify(token, config.jwt.secret);
    } catch (error) {
      return null;
    }
  }

  /**
   * Decode JWT token without verification
   */
  static decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      return null;
    }
  }
}

module.exports = CryptoUtil;
```

### src/utils/date.js

```javascript
const { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfDay,
  endOfDay,
  parseISO,
  isValid,
  addMonths,
  subMonths
} = require('date-fns');

/**
 * Date manipulation utilities
 */
class DateUtil {
  /**
   * Format date to string
   */
  static formatDate(date, pattern = 'yyyy-MM-dd') {
    const d = new Date(date);
    if (!isValid(d)) return null;
    return format(d, pattern);
  }

  /**
   * Format date to datetime string
   */
  static formatDateTime(date, pattern = 'yyyy-MM-dd HH:mm:ss') {
    const d = new Date(date);
    if (!isValid(d)) return null;
    return format(d, pattern);
  }

  /**
   * Get start of month
   */
  static getMonthStart(date = new Date()) {
    return startOfMonth(new Date(date));
  }

  /**
   * Get end of month
   */
  static getMonthEnd(date = new Date()) {
    return endOfMonth(new Date(date));
  }

  /**
   * Get start of day
   */
  static getDayStart(date = new Date()) {
    return startOfDay(new Date(date));
  }

  /**
   * Get end of day
   */
  static getDayEnd(date = new Date()) {
    return endOfDay(new Date(date));
  }

  /**
   * Parse ISO date string
   */
  static parseDate(dateString) {
    try {
      return parseISO(dateString);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get current month in YYYY-MM-DD format (first day of month)
   */
  static getCurrentMonth() {
    return format(startOfMonth(new Date()), 'yyyy-MM-dd');
  }

  /**
   * Get previous month
   */
  static getPreviousMonth(date = new Date()) {
    return subMonths(new Date(date), 1);
  }

  /**
   * Get next month
   */
  static getNextMonth(date = new Date()) {
    return addMonths(new Date(date), 1);
  }

  /**
   * Check if date is valid
   */
  static isValidDate(date) {
    return isValid(new Date(date));
  }
}

module.exports = DateUtil;
```

---

## 🔐 Phase 4: Middleware

### src/middleware/auth.middleware.js

```javascript
const CryptoUtil = require('../utils/crypto');
const ApiResponse = require('../utils/response');

/**
 * JWT Authentication Middleware
 */
const authenticate = (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ApiResponse.error(res, 'Access token required', 401);
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = CryptoUtil.verifyToken(token);
    
    if (!decoded) {
      return ApiResponse.error(res, 'Invalid or expired token', 401);
    }

    // Attach user info to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    return ApiResponse.error(res, 'Authentication failed', 401);
  }
};

/**
 * Optional authentication (doesn't fail if no token)
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = CryptoUtil.verifyToken(token);
      
      if (decoded) {
        req.user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role
        };
      }
    }
    
    next();
  } catch (error) {
    next();
  }
};

module.exports = { authenticate, optionalAuth };
```

### src/middleware/role.middleware.js

```javascript
const ApiResponse = require('../utils/response');

/**
 * Role-based authorization middleware
 * Usage: authorize('ADMIN') or authorize('ADMIN', 'ACCOUNTANT')
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthorized - Please login first', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return ApiResponse.error(
        res, 
        'Insufficient permissions - You do not have access to this resource', 
        403
      );
    }

    next();
  };
};

/**
 * Admin-only middleware
 */
const adminOnly = authorize('ADMIN');

/**
 * Admin or Accountant middleware
 */
const staffOnly = authorize('ADMIN', 'ACCOUNTANT');

module.exports = { authorize, adminOnly, staffOnly };
```

### src/middleware/validate.middleware.js

```javascript
const Joi = require('joi');
const ApiResponse = require('../utils/response');

/**
 * Request validation middleware using Joi schemas
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, '')
      }));
      
      return ApiResponse.error(res, 'Validation failed', 400, errors);
    }

    // Replace request body with validated and sanitized data
    req.body = value;
    next();
  };
};

/**
 * Validate query parameters
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, '')
      }));
      
      return ApiResponse.error(res, 'Query validation failed', 400, errors);
    }

    req.query = value;
    next();
  };
};

/**
 * Validate URL parameters
 */
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, '')
      }));
      
      return ApiResponse.error(res, 'Parameter validation failed', 400, errors);
    }

    req.params = value;
    next();
  };
};

module.exports = { validate, validateQuery, validateParams };
```

### src/middleware/error.middleware.js

```javascript
const ApiResponse = require('../utils/response');

/**
 * Global error handling middleware
 * Must be the last middleware in the chain
 */
const errorHandler = (err, req, res, next) => {
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    code: err.code,
    path: req.path,
    method: req.method
  });

  // PostgreSQL unique constraint violation
  if (err.code === '23505') {
    return ApiResponse.error(res, 'Duplicate entry - This record already exists', 409, {
      detail: err.detail,
      constraint: err.constraint
    });
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return ApiResponse.error(res, 'Related record not found or cannot be deleted', 400, {
      detail: err.detail,
      constraint: err.constraint
    });
  }

  // PostgreSQL check constraint violation
  if (err.code === '23514') {
    return ApiResponse.error(res, 'Invalid data - Check constraint violation', 400, {
      detail: err.detail,
      constraint: err.constraint
    });
  }

  // PostgreSQL not-null constraint violation
  if (err.code === '23502') {
    return ApiResponse.error(res, 'Required field is missing', 400, {
      detail: err.detail,
      column: err.column
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return ApiResponse.error(res, 'Invalid token', 401);
  }

  if (err.name === 'TokenExpiredError') {
    return ApiResponse.error(res, 'Token expired', 401);
  }

  // Multer file upload errors
  if (err.name === 'MulterError') {
    return ApiResponse.error(res, `File upload error: ${err.message}`, 400);
  }

  // Default error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  return ApiResponse.error(res, message, statusCode);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  return ApiResponse.error(
    res, 
    `Route not found: ${req.method} ${req.path}`, 
    404
  );
};

module.exports = { errorHandler, notFoundHandler };
```

---

## 🔑 Phase 5: Authentication Module

### src/controllers/auth.controller.js

```javascript
const pool = require('../config/db');
const CryptoUtil = require('../utils/crypto');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Authentication Controller
 * Handles user registration, login, and profile management
 */
class AuthController {
  /**
   * Register new user (Admin only)
   * POST /api/auth/register
   */
  async register(req, res, next) {
    const client = await pool.connect();
    try {
      const { email, password, role } = req.body;

      // Validate input
      const schema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        role: Joi.string().valid('ADMIN', 'ACCOUNTANT').required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if user already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        return ApiResponse.error(res, 'User with this email already exists', 409);
      }

      // Hash password
      const passwordHash = await CryptoUtil.hashPassword(password);

      // Create user
      const result = await client.query(
        `INSERT INTO users (email, password_hash, role) 
         VALUES ($1, $2, $3) 
         RETURNING id, email, role, created_at`,
        [email.toLowerCase(), passwordHash, role]
      );

      const user = result.rows[0];

      return ApiResponse.created(res, user, 'User registered successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Login
   * POST /api/auth/login
   */
  async login(req, res, next) {
    const client = await pool.connect();
    try {
      const { email, password } = req.body;

      // Validate input
      const schema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Find user
      const result = await client.query(
        'SELECT id, email, password_hash, role FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Invalid email or password', 401);
      }

      const user = result.rows[0];

      // Verify password
      const isValidPassword = await CryptoUtil.comparePassword(password, user.password_hash);

      if (!isValidPassword) {
        return ApiResponse.error(res, 'Invalid email or password', 401);
      }

      // Generate JWT token
      const token = CryptoUtil.generateToken({
        id: user.id,
        email: user.email,
        role: user.role
      });

      return ApiResponse.success(res, {
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      }, 'Login successful');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get current user profile
   * GET /api/auth/profile
   */
  async getProfile(req, res, next) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, email, role, created_at FROM users WHERE id = $1',
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      return ApiResponse.success(res, result.rows[0]);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Change password
   * PUT /api/auth/change-password
   */
  async changePassword(req, res, next) {
    const client = await pool.connect();
    try {
      const { currentPassword, newPassword } = req.body;

      // Validate input
      const schema = Joi.object({
        currentPassword: Joi.string().required(),
        newPassword: Joi.string().min(6).required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Get user's current password hash
      const result = await client.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      // Verify current password
      const isValid = await CryptoUtil.comparePassword(
        currentPassword, 
        result.rows[0].password_hash
      );

      if (!isValid) {
        return ApiResponse.error(res, 'Current password is incorrect', 401);
      }

      // Hash new password
      const newPasswordHash = await CryptoUtil.hashPassword(newPassword);

      // Update password
      await client.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [newPasswordHash, req.user.id]
      );

      return ApiResponse.success(res, null, 'Password changed successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * List all users (Admin only)
   * GET /api/auth/users
   */
  async listUsers(req, res, next) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, email, role, created_at FROM users ORDER BY created_at DESC'
      );

      return ApiResponse.success(res, result.rows);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete user (Admin only)
   * DELETE /api/auth/users/:id
   */
  async deleteUser(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      // Prevent self-deletion
      if (parseInt(id) === req.user.id) {
        return ApiResponse.error(res, 'Cannot delete your own account', 400);
      }

      const result = await client.query(
        'DELETE FROM users WHERE id = $1 RETURNING id, email',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'User deleted successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new AuthController();
```

### src/routes/auth.routes.js

```javascript
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { adminOnly } = require('../middleware/role.middleware');

// Public routes
router.post('/login', authController.login);

// Protected routes (require authentication)
router.get('/profile', authenticate, authController.getProfile);
router.put('/change-password', authenticate, authController.changePassword);

// Admin-only routes
router.post('/register', authenticate, adminOnly, authController.register);
router.get('/users', authenticate, adminOnly, authController.listUsers);
router.delete('/users/:id', authenticate, adminOnly, authController.deleteUser);

module.exports = router;
```

---

## 👨‍🎓 Phase 6: Student Management Module

### src/controllers/students.controller.js

```javascript
const pool = require('../config/db');
const ApiResponse = require('../utils/response');

class StudentsController {
  /**
   * Create new student with guardians
   * POST /api/students
   */
  async create(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        name, roll_no, phone, address, date_of_birth,
        bay_form, caste, previous_school, guardians
      } = req.body;

      // Insert student
      const studentResult = await client.query(
        `INSERT INTO students 
         (name, roll_no, phone, address, date_of_birth, bay_form, caste, previous_school) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         RETURNING *`,
        [name, roll_no, phone, address, date_of_birth, bay_form, caste, previous_school]
      );

      const student = studentResult.rows[0];

      // Insert guardians if provided
      if (guardians && guardians.length > 0) {
        for (const guardian of guardians) {
          let guardianId;
          
          // Check if guardian exists by CNIC
          if (guardian.cnic) {
            const existingGuardian = await client.query(
              'SELECT id FROM guardians WHERE cnic = $1',
              [guardian.cnic]
            );

            if (existingGuardian.rows.length > 0) {
              guardianId = existingGuardian.rows[0].id;
            }
          }

          // Create guardian if doesn't exist
          if (!guardianId) {
            const guardianResult = await client.query(
              `INSERT INTO guardians (name, cnic, phone, occupation) 
               VALUES ($1, $2, $3, $4) 
               RETURNING id`,
              [guardian.name, guardian.cnic, guardian.phone, guardian.occupation]
            );
            guardianId = guardianResult.rows[0].id;
          }

          // Link guardian to student
          await client.query(
            `INSERT INTO student_guardians (student_id, guardian_id, relation) 
             VALUES ($1, $2, $3)`,
            [student.id, guardianId, guardian.relation]
          );
        }
      }

      await client.query('COMMIT');
      
      // Fetch complete student data with guardians
      const completeStudent = await this.getStudentById(client, student.id);
      
      return ApiResponse.created(res, completeStudent, 'Student created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Get complete student data
   */
  async getStudentById(client, studentId) {
    // Get student
    const studentResult = await client.query(
      'SELECT * FROM students WHERE id = $1',
      [studentId]
    );

    if (studentResult.rows.length === 0) {
      return null;
    }

    const student = studentResult.rows[0];

    // Get guardians
    const guardiansResult = await client.query(
      `SELECT g.*, sg.relation 
       FROM guardians g
       JOIN student_guardians sg ON g.id = sg.guardian_id
       WHERE sg.student_id = $1`,
      [studentId]
    );

    // Get current class
    const classResult = await client.query(
      `SELECT sch.*, c.name as class_name, c.class_type, s.name as section_name
       FROM student_class_history sch
       JOIN classes c ON sch.class_id = c.id
       JOIN sections s ON sch.section_id = s.id
       WHERE sch.student_id = $1 AND sch.end_date IS NULL`,
      [studentId]
    );

    // Get documents
    const documentsResult = await client.query(
      'SELECT * FROM student_documents WHERE student_id = $1 ORDER BY uploaded_at DESC',
      [studentId]
    );

    return {
      ...student,
      guardians: guardiansResult.rows,
      current_class: classResult.rows[0] || null,
      documents: documentsResult.rows
    };
  }

  /**
   * Get student by ID
   * GET /api/students/:id
   */
  async getById(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const student = await this.getStudentById(client, id);

      if (!student) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      return ApiResponse.success(res, student);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * List students with filters
   * GET /api/students
   */
  async list(req, res, next) {
    const client = await pool.connect();
    try {
      const { 
        is_active, 
        class_id, 
        section_id, 
        search,
        page = 1,
        limit = 50
      } = req.query;

      let query = `
        SELECT DISTINCT s.*, 
               c.name as current_class,
               c.class_type,
               sec.name as current_section,
               sch.id as class_history_id
        FROM students s
        LEFT JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
        LEFT JOIN classes c ON sch.class_id = c.id
        LEFT JOIN sections sec ON sch.section_id = sec.id
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (is_active !== undefined) {
        query += ` AND s.is_active = $${paramCount}`;
        params.push(is_active === 'true');
        paramCount++;
      }

      if (class_id) {
        query += ` AND sch.class_id = $${paramCount}`;
        params.push(class_id);
        paramCount++;
      }

      if (section_id) {
        query += ` AND sch.section_id = $${paramCount}`;
        params.push(section_id);
        paramCount++;
      }

      if (search) {
        query += ` AND (s.name ILIKE $${paramCount} OR s.roll_no ILIKE $${paramCount})`;
        params.push(`%${search}%`);
        paramCount++;
      }

      // Count total records
      const countResult = await client.query(
        query.replace('SELECT DISTINCT s.*', 'SELECT COUNT(DISTINCT s.id)'),
        params
      );
      const total = parseInt(countResult.rows[0].count);

      // Add pagination
      const offset = (page - 1) * limit;
      query += ` ORDER BY s.name LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);

      const result = await client.query(query, params);

      return ApiResponse.paginated(
        res, 
        result.rows,
        { page: parseInt(page), limit: parseInt(limit), total },
        'Students retrieved successfully'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Update student
   * PUT /api/students/:id
   */
  async update(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const updates = req.body;

      // Remove fields that shouldn't be updated this way
      delete updates.id;
      delete updates.created_at;

      const fields = Object.keys(updates);
      const values = Object.values(updates);

      if (fields.length === 0) {
        return ApiResponse.error(res, 'No fields to update', 400);
      }

      const setClause = fields.map((field, index) => 
        `${field} = $${index + 1}`
      ).join(', ');

      values.push(id);

      const result = await client.query(
        `UPDATE students SET ${setClause} WHERE id = $${values.length} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Student updated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Deactivate student
   * PUT /api/students/:id/deactivate
   */
  async deactivate(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        'UPDATE students SET is_active = false WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Student deactivated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Activate student
   * PUT /api/students/:id/activate
   */
  async activate(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        'UPDATE students SET is_active = true WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Student activated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Mark student as expelled
   * PUT /api/students/:id/expel
   */
  async expel(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        'UPDATE students SET is_expelled = true, is_active = false WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Student marked as expelled');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get student's academic history
   * GET /api/students/:id/history
   */
  async getHistory(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        `SELECT sch.*, 
                c.name as class_name, 
                c.class_type,
                s.name as section_name
         FROM student_class_history sch
         JOIN classes c ON sch.class_id = c.id
         JOIN sections s ON sch.section_id = s.id
         WHERE sch.student_id = $1
         ORDER BY sch.start_date DESC`,
        [id]
      );

      return ApiResponse.success(res, result.rows);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new StudentsController();
```

### src/routes/students.routes.js

```javascript
const express = require('express');
const router = express.Router();
const studentsController = require('../controllers/students.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { staffOnly } = require('../middleware/role.middleware');

// All routes require authentication
router.use(authenticate);
router.use(staffOnly);

// CRUD operations
router.post('/', studentsController.create);
router.get('/', studentsController.list);
router.get('/:id', studentsController.getById);
router.put('/:id', studentsController.update);

// Status changes
router.put('/:id/activate', studentsController.activate);
router.put('/:id/deactivate', studentsController.deactivate);
router.put('/:id/expel', studentsController.expel);

// History
router.get('/:id/history', studentsController.getHistory);

module.exports = router;
```

---

## 📚 REMAINING MODULES TO IMPLEMENT

Follow the same pattern for these controllers:

### 1. **Classes Controller** (`src/controllers/classes.controller.js`)
- Create class
- Update class
- List classes
- Activate/deactivate class
- Get fee structure for class

### 2. **Sections Controller** (`src/controllers/sections.controller.js`)
- Create section
- Update section
- List sections by class
- Delete section (if no students assigned)

### 3. **Guardians Controller** (`src/controllers/guardians.controller.js`)
- Create guardian
- Update guardian
- Link to student
- View guardian with all students

### 4. **Fees Controller** (`src/controllers/fees.controller.js`)
- Create fee structure for class
- Update fee structure
- Get current fee structure
- Get fee history

### 5. **Vouchers Controller** (`src/controllers/vouchers.controller.js`)
- Generate fee voucher
- Get voucher details
- Add voucher items
- List vouchers (by student, class, month)
- Get defaulters list

### 6. **Payments Controller** (in fees or separate)
- Record fee payment
- Get payment history
- Calculate outstanding balance

### 7. **Faculty Controller** (`src/controllers/faculty.controller.js`)
- Create faculty
- Update faculty
- List faculty
- Activate/deactivate faculty
- Get salary history

### 8. **Salaries Controller** (`src/controllers/salaries.controller.js`)
- Create salary structure
- Generate salary voucher
- Add adjustments (bonus/advance)
- Record salary payment
- Get unpaid salaries

### 9. **Expenses Controller** (`src/controllers/expenses.controller.js`)
- Create expense
- Update expense
- Delete expense (admin only)
- List expenses with filters

### 10. **Reports Controller** (`src/controllers/reports.controller.js`)
- Daily closing report
- Monthly profit/loss
- Fee collection report
- Salary payment report
- Defaulters report
- Custom date range reports

### 11. **Analytics Controller** (`src/controllers/analytics.controller.js`)
- Dashboard statistics
- Revenue trends
- Student enrollment trends
- Class-wise collection
- Faculty count and salary stats

---

## 📦 Phase 7: Services

### src/services/r2.service.js

```javascript
const { 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand 
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const r2Client = require('../config/r2');
const config = require('../config/env');
const { v4: uuidv4 } = require('uuid');

class R2Service {
  /**
   * Upload file to R2
   */
  async uploadFile(file, folder = 'documents') {
    try {
      const key = `${folder}/${uuidv4()}-${file.originalname}`;
      
      const command = new PutObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype
      });

      await r2Client.send(command);

      return {
        key,
        url: `${config.r2.publicUrl}/${key}`
      };
    } catch (error) {
      throw new Error(`R2 upload failed: ${error.message}`);
    }
  }

  /**
   * Get signed URL for file access
   */
  async getSignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key
      });

      return await getSignedUrl(r2Client, command, { expiresIn });
    } catch (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Delete file from R2
   */
  async deleteFile(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: config.r2.bucketName,
        Key: key
      });

      await r2Client.send(command);
      return true;
    } catch (error) {
      throw new Error(`R2 delete failed: ${error.message}`);
    }
  }
}

module.exports = new R2Service();
```

### src/services/pdf.service.js

```javascript
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PDFService {
  /**
   * Generate fee voucher PDF
   */
  async generateFeeVoucher(voucherData) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const filename = `voucher-${voucherData.id}-${Date.now()}.pdf`;
        const filepath = path.join('/tmp', filename);
        const stream = fs.createWriteStream(filepath);

        doc.pipe(stream);

        // Header
        doc.fontSize(20).text('FEE VOUCHER', { align: 'center' });
        doc.moveDown();

        // Student details
        doc.fontSize(12);
        doc.text(`Student Name: ${voucherData.student_name}`);
        doc.text(`Roll No: ${voucherData.roll_no}`);
        doc.text(`Class: ${voucherData.class_name}`);
        doc.text(`Section: ${voucherData.section_name}`);
        doc.text(`Month: ${voucherData.month}`);
        doc.moveDown();

        // Fee items table
        doc.fontSize(14).text('Fee Details:', { underline: true });
        doc.moveDown(0.5);

        voucherData.items.forEach(item => {
          doc.fontSize(11).text(`${item.item_type}: Rs. ${item.amount}`, {
            indent: 20
          });
        });

        doc.moveDown();
        doc.fontSize(14).text(`Total Amount: Rs. ${voucherData.total_amount}`, {
          bold: true
        });

        // Footer
        doc.moveDown(2);
        doc.fontSize(10).text('Pay before due date to avoid late fee', {
          align: 'center',
          italic: true
        });

        doc.end();

        stream.on('finish', () => {
          resolve(filepath);
        });

        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate salary slip PDF
   */
  async generateSalarySlip(salaryData) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const filename = `salary-${salaryData.id}-${Date.now()}.pdf`;
        const filepath = path.join('/tmp', filename);
        const stream = fs.createWriteStream(filepath);

        doc.pipe(stream);

        // Header
        doc.fontSize(20).text('SALARY SLIP', { align: 'center' });
        doc.moveDown();

        // Faculty details
        doc.fontSize(12);
        doc.text(`Name: ${salaryData.faculty_name}`);
        doc.text(`Role: ${salaryData.role}`);
        doc.text(`Month: ${salaryData.month}`);
        doc.moveDown();

        // Salary breakdown
        doc.fontSize(14).text('Salary Details:', { underline: true });
        doc.moveDown(0.5);

        doc.fontSize(11);
        doc.text(`Base Salary: Rs. ${salaryData.base_salary}`, { indent: 20 });
        
        if (salaryData.adjustments && salaryData.adjustments.length > 0) {
          salaryData.adjustments.forEach(adj => {
            doc.text(`${adj.type}: Rs. ${adj.amount}`, { indent: 20 });
          });
        }

        doc.moveDown();
        doc.fontSize(14).text(`Net Salary: Rs. ${salaryData.net_salary}`, {
          bold: true
        });

        doc.end();

        stream.on('finish', () => {
          resolve(filepath);
        });

        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = new PDFService();
```

---

## 🚀 Phase 8: Main Application Files

### src/app.js

```javascript
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import middleware
const { errorHandler, notFoundHandler } = require('./middleware/error.middleware');

// Import routes
const authRoutes = require('./routes/auth.routes');
const studentsRoutes = require('./routes/students.routes');
// Import other routes as they're created

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/students', studentsRoutes);
// Add other routes as they're created

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
```

### src/server.js

```javascript
const app = require('./app');
const config = require('./config/env');
const pool = require('./config/db');

const PORT = config.port;

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  try {
    await pool.end();
    console.log('✅ Database connections closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  🚀 School Management System API      ║
║  📡 Server running on port ${PORT}       ║
║  🌍 Environment: ${config.nodeEnv}        ║
║  ⏰ Started at: ${new Date().toISOString()} ║
╚════════════════════════════════════════╝
  `);
});
```

---

## 📝 IMPLEMENTATION CHECKLIST

Use this checklist to track your progress:

### ✅ Phase 1: Setup
- [ ] Initialize npm project
- [ ] Install dependencies
- [ ] Create .env file
- [ ] Create .gitignore
- [ ] Setup project structure

### ✅ Phase 2: Configuration
- [ ] Create env.js
- [ ] Create db.js
- [ ] Create r2.js
- [ ] Test database connection

### ✅ Phase 3: Utilities
- [ ] Create response.js
- [ ] Create crypto.js
- [ ] Create date.js

### ✅ Phase 4: Middleware
- [ ] Create auth.middleware.js
- [ ] Create role.middleware.js
- [ ] Create validate.middleware.js
- [ ] Create error.middleware.js

### ✅ Phase 5: Authentication
- [ ] Create auth.controller.js
- [ ] Create auth.routes.js
- [ ] Test login/register

### ✅ Phase 6: Students Module
- [ ] Create students.controller.js
- [ ] Create students.routes.js
- [ ] Test CRUD operations

### ✅ Phase 7: Classes Module
- [ ] Create classes.controller.js
- [ ] Create classes.routes.js
- [ ] Create sections.controller.js
- [ ] Create sections.routes.js

### ✅ Phase 8: Guardians Module
- [ ] Create guardians.controller.js
- [ ] Create guardians.routes.js

### ✅ Phase 9: Fee Management
- [ ] Create fees.controller.js
- [ ] Create fees.routes.js
- [ ] Create vouchers.controller.js
- [ ] Create vouchers.routes.js

### ✅ Phase 10: Faculty & Salaries
- [ ] Create faculty.controller.js
- [ ] Create faculty.routes.js
- [ ] Create salaries.controller.js
- [ ] Create salaries.routes.js

### ✅ Phase 11: Expenses
- [ ] Create expenses.controller.js
- [ ] Create expenses.routes.js

### ✅ Phase 12: Reports & Analytics
- [ ] Create reports.controller.js
- [ ] Create reports.routes.js
- [ ] Create analytics.controller.js
- [ ] Create analytics.routes.js

### ✅ Phase 13: File Management
- [ ] Implement R2 service
- [ ] Add file upload endpoints
- [ ] Test document upload/download

### ✅ Phase 14: PDF Generation
- [ ] Implement PDF service
- [ ] Generate fee vouchers
- [ ] Generate salary slips

### ✅ Phase 15: Testing & Deployment
- [ ] Test all endpoints
- [ ] Add error handling
- [ ] Optimize queries
- [ ] Deploy to production

---

## 🔑 KEY IMPLEMENTATION PATTERNS

### Pattern 1: Controller Structure
```javascript
class XController {
  async create(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Your logic here
      await client.query('COMMIT');
      return ApiResponse.created(res, data);
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
}
```

### Pattern 2: Route Protection
```javascript
router.post('/', authenticate, staffOnly, validate(schema), controller.create);
```

### Pattern 3: Pagination
```javascript
const page = parseInt(req.query.page) || 1;
const limit = parseInt(req.query.limit) || 50;
const offset = (page - 1) * limit;

// Count total
const countResult = await client.query(countQuery, params);
const total = parseInt(countResult.rows[0].count);

// Get paginated data
query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
params.push(limit, offset);

return ApiResponse.paginated(res, data, { page, limit, total });
```

### Pattern 4: Search & Filters
```javascript
let query = 'SELECT * FROM table WHERE 1=1';
const params = [];
let paramCount = 1;

if (filter1) {
  query += ` AND column1 = $${paramCount}`;
  params.push(filter1);
  paramCount++;
}

if (search) {
  query += ` AND column2 ILIKE $${paramCount}`;
  params.push(`%${search}%`);
  paramCount++;
}
```

---

## 🎯 IMPORTANT NOTES FOR COPILOT

1. **Always use transactions** for operations that modify multiple tables
2. **Always release database clients** in the `finally` block
3. **Use parameterized queries** to prevent SQL injection
4. **Follow the ApiResponse pattern** for consistent responses
5. **Add proper error handling** in every controller method
6. **Use middleware** for authentication, authorization, and validation
7. **Keep controllers thin** - complex logic should go in services
8. **Add JSDoc comments** to all functions
9. **Follow naming conventions**: camelCase for variables, PascalCase for classes
10. **Test each module** before moving to the next

---

## 📚 DATABASE SCHEMA REFERENCE

Refer to the schema in `migrations/init_schema.sql` for:
- Table structures
- Column types
- Constraints
- Relationships
- Indexes

Key tables:
- `users` - Authentication
- `students`, `guardians`, `student_guardians` - Student management
- `classes`, `sections`, `student_class_history` - Academic structure
- `class_fee_structure`, `fee_vouchers`, `fee_voucher_items`, `fee_payments` - Fee management
- `faculty`, `salary_structure`, `salary_vouchers`, `salary_adjustments`, `salary_payments` - Salary management
- `expenses` - Expense tracking

---

## 🚀 GETTING STARTED

1. Follow Phase 1 to set up the project
2. Implement utilities and middleware (Phase 2-4)
3. Start with authentication module (Phase 5)
4. Build each module incrementally
5. Test thoroughly at each step
6. Deploy when all features are complete

**Good luck with the implementation! 🎉**
