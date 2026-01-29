# School Management System Backend - API Testing Guide

## Server Status

Server is running at: **http://localhost:3000**

## Test Credentials

- **Email**: `admin@school.com`
- **Password**: `admin123` (Please change after first login)
- **Role**: `ADMIN`

---

## API Endpoints Testing

### 1. Health Check

```bash
curl http://localhost:3000/health
```

Expected Response:
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2026-01-29T..."
}
```

---

### 2. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@school.com",
    "password": "admin123"
  }'
```

Expected Response:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "email": "admin@school.com",
      "role": "ADMIN"
    }
  },
  "timestamp": "2026-01-29T..."
}
```

**Save the token for authenticated requests!**

---

### 3. Get Profile (Authenticated)

```bash
curl http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

### 4. Register New User (Admin Only)

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "email": "accountant@school.com",
    "password": "password123",
    "role": "ACCOUNTANT"
  }'
```

---

### 5. Change Password

```bash
curl -X PUT http://localhost:3000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "currentPassword": "admin123",
    "newPassword": "newpassword123"
  }'
```

---

### 6. List All Users (Admin Only)

```bash
curl http://localhost:3000/api/auth/users \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Quick Test Script

Save this as `test-api.sh`:

```bash
#!/bin/bash

API_URL="http://localhost:3000"

echo "🧪 Testing School Management System API"
echo "========================================\n"

# Test 1: Health Check
echo "1️⃣  Testing Health Check..."
curl -s $API_URL/health | jq
echo "\n"

# Test 2: Login
echo "2️⃣  Testing Login..."
LOGIN_RESPONSE=$(curl -s -X POST $API_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@school.com",
    "password": "admin123"
  }')

echo $LOGIN_RESPONSE | jq
TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.token')
echo "\n✅ Token acquired: ${TOKEN:0:50}...\n"

# Test 3: Get Profile
echo "3️⃣  Testing Get Profile..."
curl -s $API_URL/api/auth/profile \
  -H "Authorization: Bearer $TOKEN" | jq
echo "\n"

# Test 4: List Users
echo "4️⃣  Testing List Users..."
curl -s $API_URL/api/auth/users \
  -H "Authorization: Bearer $TOKEN" | jq
echo "\n"

echo "✅ All tests completed!"
```

Make it executable:
```bash
chmod +x test-api.sh
./test-api.sh
```

---

## Next Steps

The following modules are ready for implementation:
- ✅ Configuration & Utilities
- ✅ Middleware (Auth, Roles, Validation, Error Handling)
- ✅ Authentication Module
- ⏳ Students Management
- ⏳ Guardians Management
- ⏳ Classes & Sections
- ⏳ Fee Management
- ⏳ Faculty & Salary Management
- ⏳ Expenses Management
- ⏳ Reports & Analytics
- ⏳ File Upload (R2)
- ⏳ PDF Generation

---

## Development Commands

```bash
# Start development server
npm run dev

# Start production server
npm start

# Create admin user
node scripts/seed-admin.js
```

---

## Environment Variables

Check `.env` file for configuration:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `JWT_EXPIRES_IN` - Token expiration time
- `PORT` - Server port (default: 3000)
