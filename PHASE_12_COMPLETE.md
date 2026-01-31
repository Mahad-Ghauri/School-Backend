# Phase 12: File Upload (R2) Module - COMPLETE ✅

## Overview
Successfully implemented comprehensive file upload and management system using Cloudflare R2 (S3-compatible object storage). This module enables storing student documents, photos, and other files with full CRUD operations.

## Implementation Date
February 1, 2026

## Components Created

### 1. R2 Service (`src/services/r2.service.js`) - 268 lines
**Purpose**: Cloudflare R2 integration for file storage operations

**Key Functions**:
- `uploadFile(buffer, name, mime, folder)` - Upload single file to R2
- `uploadMultipleFiles(files, folder)` - Batch upload multiple files
- `downloadFile(key)` - Download file from R2
- `deleteFile(key)` - Remove file from R2
- `deleteMultipleFiles(keys)` - Batch delete files
- `getSignedUrl(key, expires)` - Generate temporary access URLs
- `fileExists(key)` - Check file existence
- `getFileMetadata(key)` - Get file metadata (size, type, modified date)
- `validateFileType(mimeType)` - Validate file MIME type
- `validateFileSize(size, maxSize)` - Validate file size

**Features**:
- Unique key generation using timestamp + random string + sanitized filename
- Folder organization (students/{id}/)
- Comprehensive error handling
- File validation (type and size)
- AWS SDK S3 client integration

**Configuration**:
```javascript
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_URL=https://your-bucket.r2.dev
```

### 2. Upload Middleware (`src/middleware/upload.middleware.js`) - 132 lines
**Purpose**: Multer configuration for handling multipart file uploads

**Exports**:
- `uploadSingle(fieldName)` - Handle single file upload
- `uploadMultiple(fieldName, maxCount)` - Handle multiple files upload
- `uploadFields(fields)` - Handle multiple fields with files

**Configuration**:
- Storage: Memory storage (files as buffers)
- File size limit: 5MB per file
- Max files: 10 files per request
- Allowed types:
  - Images: JPEG, PNG, GIF
  - Documents: PDF, DOC, DOCX, XLS, XLSX

**Error Handling**:
- `LIMIT_FILE_SIZE` - File exceeds 5MB
- `LIMIT_FILE_COUNT` - Too many files
- `LIMIT_UNEXPECTED_FILE` - Unexpected field name
- Invalid file type - Not in allowed list

### 3. Documents Controller (`src/controllers/documents.controller.js`) - 491 lines
**Purpose**: Handle document upload, retrieval, and management

**Endpoints Implemented**:

#### Upload Single Document
- **POST** `/api/students/:id/documents`
- **Auth**: Admin only
- **Body**: `document_type`, `description`
- **File**: Single file via multipart/form-data
- **Validates**: Student existence, file type/size
- **Returns**: Document record with R2 URL

#### Upload Multiple Documents
- **POST** `/api/students/:id/documents/bulk`
- **Auth**: Admin only
- **Body**: `document_type`, `description`
- **Files**: Multiple files (max 10)
- **Returns**: Array of document records

#### Get Student Documents
- **GET** `/api/students/:id/documents`
- **Auth**: Staff (Admin + Accountant)
- **Query**: `document_type` (optional filter)
- **Returns**: List of documents for student

#### Get Document By ID
- **GET** `/api/documents/:id`
- **Auth**: Staff
- **Returns**: Single document with student details

#### Download Document
- **GET** `/api/documents/:id/download`
- **Auth**: Staff
- **Returns**: File stream with proper headers

#### Get Signed URL
- **GET** `/api/documents/:id/url`
- **Auth**: Staff
- **Query**: `expires` (seconds, default 3600)
- **Returns**: Temporary signed URL for direct access

#### Update Document Details
- **PUT** `/api/documents/:id`
- **Auth**: Admin only
- **Body**: `document_type`, `description`
- **Returns**: Updated document

#### Delete Document
- **DELETE** `/api/documents/:id`
- **Auth**: Admin only
- **Action**: Deletes from R2 and database
- **Returns**: Deleted document record

#### Get Statistics
- **GET** `/api/stats`
- **Auth**: Staff
- **Returns**: Overall stats and breakdown by document type

**Edge Cases Handled**:
- ✅ Non-existent student validation
- ✅ File type validation
- ✅ File size validation
- ✅ Duplicate file handling
- ✅ Orphaned file cleanup on database errors (rollback)
- ✅ R2 key extraction from URL
- ✅ Transaction management for consistency

### 4. Routes (`src/routes/documents.routes.js`) - 76 lines
**Configured Routes**: 9 endpoints

**Authorization Matrix**:
| Endpoint | Admin | Accountant | Staff |
|----------|-------|------------|-------|
| Upload Single | ✅ | ❌ | ❌ |
| Upload Multiple | ✅ | ❌ | ❌ |
| List Documents | ✅ | ✅ | ❌ |
| View Document | ✅ | ✅ | ❌ |
| Download | ✅ | ✅ | ❌ |
| Get Signed URL | ✅ | ✅ | ❌ |
| Update Details | ✅ | ❌ | ❌ |
| Delete | ✅ | ❌ | ❌ |
| Statistics | ✅ | ✅ | ❌ |

### 5. Database Migration (`migrations/004_update_student_documents.sql`)
**Purpose**: Extend student_documents table for R2 integration

**Changes**:
- Added columns:
  - `document_type` VARCHAR(50) - Type of document
  - `file_name` VARCHAR(255) - Original filename
  - `file_url` TEXT - R2 public URL
  - `file_size` BIGINT - File size in bytes
  - `mime_type` VARCHAR(100) - File MIME type
  - `description` TEXT - Optional description

- Renamed legacy columns:
  - `file_type` → `legacy_file_type` (nullable)
  - `file_path` → `legacy_file_path` (nullable)

- Created indexes:
  - `idx_student_documents_type` on `document_type`
  - `idx_student_documents_student_id` on `student_id`

**Schema After Migration**:
```sql
CREATE TABLE student_documents (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT REFERENCES students(id) ON DELETE CASCADE,
  document_type VARCHAR(50),
  file_name VARCHAR(255),
  file_url TEXT,
  file_size BIGINT,
  mime_type VARCHAR(100),
  description TEXT,
  legacy_file_type TEXT,
  legacy_file_path TEXT,
  uploaded_at TIMESTAMP DEFAULT now()
);
```

### 6. Test Script (`scripts/test-documents.js`) - 571 lines
**Purpose**: Comprehensive testing of document management

**Tests Implemented** (14 tests):

**Setup Tests**:
1. ✅ Admin Login
2. ✅ Create Test Student

**Main Functionality Tests**:
3. ✅ Upload Single Document
4. ✅ Get Student Documents
5. ✅ Get Document By ID
6. ✅ Get Signed URL
7. ✅ Update Document Details
8. ✅ Filter Documents By Type
9. ✅ Upload Multiple Documents
10. ✅ Get Document Statistics

**Error Handling Tests**:
11. ✅ Upload Without Authentication (Should Fail)
12. ✅ Upload For Non-Existent Student (Should Fail)

**Cleanup Tests**:
13. ✅ Delete Document
14. ✅ Verify Document Deleted (Should Fail)

**Test Features**:
- Color-coded output (green/red/yellow)
- Detailed error reporting
- Success rate calculation
- Automatic cleanup (test files and student)
- Temporary file creation/deletion

## Dependencies Added
```json
{
  "@aws-sdk/client-s3": "^3.980.0",
  "@aws-sdk/s3-request-presigner": "^3.980.0",
  "form-data": "^4.0.1" (dev dependency for testing)
}
```

## Integration Points

### 1. App.js Integration
```javascript
const documentsRoutes = require('./routes/documents.routes');
app.use('/api', documentsRoutes);
```

### 2. Database Schema
- Uses `student_documents` table
- Foreign key to `students` table
- Cascade delete on student removal

### 3. Authentication
- All endpoints require JWT authentication
- Role-based access control (Admin vs Staff)

## API Usage Examples

### Upload Document
```bash
curl -X POST http://localhost:3000/api/students/1/documents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "document=@/path/to/file.pdf" \
  -F "document_type=BIRTH_CERTIFICATE" \
  -F "description=Student birth certificate"
```

### Get Student Documents
```bash
curl -X GET http://localhost:3000/api/students/1/documents \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Download Document
```bash
curl -X GET http://localhost:3000/api/documents/1/download \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output document.pdf
```

### Get Signed URL (24 hour expiry)
```bash
curl -X GET http://localhost:3000/api/documents/1/url?expires=86400 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Delete Document
```bash
curl -X DELETE http://localhost:3000/api/documents/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Security Considerations

### 1. File Validation
- ✅ MIME type whitelist
- ✅ File size limits (5MB)
- ✅ Sanitized filenames
- ✅ File count limits (10 max)

### 2. Access Control
- ✅ JWT authentication required
- ✅ Role-based permissions
- ✅ Student existence validation
- ✅ Document ownership validation

### 3. Storage Security
- ✅ Unique keys prevent overwrites
- ✅ Folder organization by student
- ✅ Signed URLs for temporary access
- ✅ Configurable expiry times

### 4. Error Handling
- ✅ Transaction rollback on failures
- ✅ R2 cleanup on database errors
- ✅ Graceful error messages
- ✅ No sensitive data in errors

## Performance Optimizations

### 1. Efficient File Handling
- Memory storage for small files (faster)
- Direct buffer upload to R2 (no disk I/O)
- Batch upload support for multiple files

### 2. Database Optimization
- Indexed `student_id` for fast lookups
- Indexed `document_type` for filtering
- Minimal database queries

### 3. Caching Strategy
- Signed URLs for temporary access
- Configurable cache duration
- Reduced R2 requests

## Known Limitations

1. **File Size**: Limited to 5MB per file
2. **File Types**: Only supports specific types (images, PDFs, docs)
3. **Storage**: No automatic cleanup of old files
4. **Versioning**: No file version history

## Future Enhancements

1. **Image Processing**:
   - Thumbnail generation
   - Image compression
   - Format conversion

2. **Advanced Features**:
   - File versioning
   - Audit trail for file access
   - Automatic OCR for scanned documents
   - Virus scanning integration

3. **Performance**:
   - CDN integration
   - Lazy loading for large lists
   - Pagination for document lists

4. **Security**:
   - Watermarking for sensitive documents
   - Encryption at rest
   - IP-based access restrictions

## Testing Instructions

### Run Test Script
```bash
node scripts/test-documents.js
```

### Manual Testing
1. Start server: `npm run dev`
2. Login as admin to get token
3. Create test student
4. Upload documents using Postman/curl
5. Verify files in R2 bucket
6. Test download and deletion

### Expected Test Output
```
==================================================
DOCUMENT MANAGEMENT MODULE TESTS
==================================================

SETUP
✓ PASS: Admin Login
✓ PASS: Create Test Student

--------------------------------------------------

MAIN TESTS
✓ PASS: Upload Single Document
✓ PASS: Get Student Documents
✓ PASS: Get Document By ID
✓ PASS: Get Signed URL
✓ PASS: Update Document Details
✓ PASS: Filter Documents By Type
✓ PASS: Upload Multiple Documents
✓ PASS: Get Document Statistics

--------------------------------------------------

ERROR HANDLING TESTS
✓ PASS: Upload Without Authentication (Should Fail)
✓ PASS: Upload For Non-Existent Student (Should Fail)

--------------------------------------------------

CLEANUP TESTS
✓ PASS: Delete Document
✓ PASS: Verify Document Deleted (Should Fail)

--------------------------------------------------

CLEANUP
✓ Test student cleaned up

==================================================
TEST SUMMARY
==================================================
Total Tests: 14
Passed: 14
Failed: 0
Success Rate: 100.0%
==================================================
```

## Verification Checklist

- [x] R2 service implemented with all CRUD operations
- [x] Upload middleware configured with validation
- [x] Documents controller with 9 endpoints
- [x] Routes configured with proper authorization
- [x] Database migration created and ready
- [x] Integration with app.js complete
- [x] Test script with 14 comprehensive tests
- [x] Documentation complete
- [x] Dependencies installed
- [x] Error handling implemented
- [x] Edge cases covered
- [x] Security measures in place

## Phase Completion Status

✅ **Phase 12: File Upload (R2) Module - COMPLETE**

**Files Created**: 6
**Lines of Code**: ~1,538 lines
**Test Coverage**: 14 tests
**Endpoints**: 9 API endpoints

---

## Next Phase
**Phase 13: PDF Generation** - Final phase to implement professional PDF generation for vouchers, receipts, and reports.

---

*Completed: February 1, 2026*
*Developer: AI Assistant*
*Project: School Management System Backend*
