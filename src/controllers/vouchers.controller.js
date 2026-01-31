const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Vouchers Controller
 * Handles fee voucher generation and management
 */
class VouchersController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.generate = this.generate.bind(this);
    this.generateBulk = this.generateBulk.bind(this);
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.updateItems = this.updateItems.bind(this);
    this.delete = this.delete.bind(this);
    this.downloadPDF = this.downloadPDF.bind(this);
  }

  /**
   * Generate fee voucher for a student
   * POST /api/vouchers/generate
   */
  async generate(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { student_id, month, custom_items = [] } = req.body;

      // Validate input
      const schema = Joi.object({
        student_id: Joi.number().integer().required(),
        month: Joi.date().required(),
        custom_items: Joi.array().items(
          Joi.object({
            item_type: Joi.string().required(),
            amount: Joi.number().required()
          })
        ).optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if student is currently enrolled
      const enrollmentCheck = await client.query(
        `SELECT sch.id, sch.class_id, s.name as student_name, s.is_active
         FROM student_class_history sch
         JOIN students s ON sch.student_id = s.id
         WHERE sch.student_id = $1 AND sch.end_date IS NULL`,
        [student_id]
      );

      if (enrollmentCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Student is not currently enrolled in any class', 404);
      }

      if (!enrollmentCheck.rows[0].is_active) {
        return ApiResponse.error(res, 'Student is not active', 400);
      }

      const enrollment = enrollmentCheck.rows[0];

      // Check for duplicate voucher for the same month
      const duplicateCheck = await client.query(
        `SELECT id FROM fee_vouchers 
         WHERE student_class_history_id = $1 
         AND DATE_TRUNC('month', month) = DATE_TRUNC('month', $2::date)`,
        [enrollment.id, month]
      );

      if (duplicateCheck.rows.length > 0) {
        return ApiResponse.error(
          res,
          `Voucher already exists for ${enrollment.student_name} for the specified month`,
          400
        );
      }

      // Get current fee structure for the class
      const feeStructure = await client.query(
        `SELECT admission_fee, monthly_fee, paper_fund
         FROM class_fee_structure 
         WHERE class_id = $1
         ORDER BY effective_from DESC
         LIMIT 1`,
        [enrollment.class_id]
      );

      if (feeStructure.rows.length === 0) {
        return ApiResponse.error(res, 'Fee structure not defined for this class', 400);
      }

      const fees = feeStructure.rows[0];

      // Create voucher
      const voucherResult = await client.query(
        `INSERT INTO fee_vouchers (student_class_history_id, month)
         VALUES ($1, $2)
         RETURNING *`,
        [enrollment.id, month]
      );

      const voucher = voucherResult.rows[0];

      // Insert fee structure items
      const feeItems = [
        { item_type: 'ADMISSION', amount: parseFloat(fees.admission_fee) || 0 },
        { item_type: 'MONTHLY', amount: parseFloat(fees.monthly_fee) || 0 },
        { item_type: 'PAPER_FUND', amount: parseFloat(fees.paper_fund) || 0 }
      ];
      
      for (const item of feeItems) {
        if (item.amount > 0) {
          await client.query(
            `INSERT INTO fee_voucher_items (voucher_id, item_type, amount)
             VALUES ($1, $2, $3)`,
            [voucher.id, item.item_type, item.amount]
          );
        }
      }

      // Insert custom items (arrears, transport, discounts, etc.)
      for (const item of custom_items) {
        await client.query(
          `INSERT INTO fee_voucher_items (voucher_id, item_type, amount)
           VALUES ($1, $2, $3)`,
          [voucher.id, item.item_type, item.amount]
        );
      }

      await client.query('COMMIT');

      // Fetch complete voucher details
      const complete = await this.getVoucherById(client, voucher.id);

      return ApiResponse.created(res, complete, 'Voucher generated successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Generate vouchers in bulk (for class/section)
   * POST /api/vouchers/generate-bulk
   */
  async generateBulk(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { class_id, section_id, month } = req.body;

      // Validate input
      const schema = Joi.object({
        class_id: Joi.number().integer().required(),
        section_id: Joi.number().integer().optional(),
        month: Joi.date().required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Get fee structure for the class
      const feeStructure = await client.query(
        `SELECT admission_fee, monthly_fee, paper_fund
         FROM class_fee_structure
         WHERE class_id = $1
         ORDER BY effective_from DESC
         LIMIT 1`,
        [class_id]
      );

      if (feeStructure.rows.length === 0) {
        return ApiResponse.error(res, 'Fee structure not defined for this class', 400);
      }

      const fees = feeStructure.rows[0];

      // Get all enrolled students in class/section
      let query = `
        SELECT sch.id as enrollment_id, s.id as student_id, s.name as student_name
        FROM student_class_history sch
        JOIN students s ON sch.student_id = s.id
        WHERE sch.class_id = $1 
        AND sch.end_date IS NULL
        AND s.is_active = true
      `;

      const params = [class_id];
      if (section_id) {
        query += ` AND sch.section_id = $2`;
        params.push(section_id);
      }

      const students = await client.query(query, params);

      if (students.rows.length === 0) {
        return ApiResponse.error(res, 'No active students found in this class/section', 404);
      }

      const results = {
        generated: [],
        skipped: [],
        failed: []
      };

      const feeItems = [
        { item_type: 'ADMISSION', amount: parseFloat(fees.admission_fee) || 0 },
        { item_type: 'MONTHLY', amount: parseFloat(fees.monthly_fee) || 0 },
        { item_type: 'PAPER_FUND', amount: parseFloat(fees.paper_fund) || 0 }
      ];

      // Generate voucher for each student
      for (const student of students.rows) {
        try {
          // Check for duplicate
          const duplicateCheck = await client.query(
            `SELECT id FROM fee_vouchers 
             WHERE student_class_history_id = $1 
             AND DATE_TRUNC('month', month) = DATE_TRUNC('month', $2::date)`,
            [student.enrollment_id, month]
          );

          if (duplicateCheck.rows.length > 0) {
            results.skipped.push({
              student_id: student.student_id,
              student_name: student.student_name,
              reason: 'Voucher already exists for this month'
            });
            continue;
          }

          // Create voucher
          const voucherResult = await client.query(
            `INSERT INTO fee_vouchers (student_class_history_id, month)
             VALUES ($1, $2)
             RETURNING *`,
            [student.enrollment_id, month]
          );

          const voucher = voucherResult.rows[0];

          // Insert fee items
          for (const item of feeItems) {
            if (item.amount > 0) {
              await client.query(
                `INSERT INTO fee_voucher_items (voucher_id, item_type, amount)
                 VALUES ($1, $2, $3)`,
                [voucher.id, item.item_type, item.amount]
              );
            }
          }

          results.generated.push({
            student_id: student.student_id,
            student_name: student.student_name,
            voucher_id: voucher.id
          });
        } catch (itemError) {
          results.failed.push({
            student_id: student.student_id,
            student_name: student.student_name,
            error: itemError.message
          });
        }
      }

      await client.query('COMMIT');

      return ApiResponse.success(res, {
        summary: {
          total: students.rows.length,
          generated: results.generated.length,
          skipped: results.skipped.length,
          failed: results.failed.length
        },
        details: results
      }, 'Bulk voucher generation completed');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * List vouchers with filters
   * GET /api/vouchers
   */
  async list(req, res, next) {
    const client = await pool.connect();
    try {
      const {
        student_id,
        class_id,
        section_id,
        month,
        status,
        from_date,
        to_date,
        page = 1,
        limit = 50
      } = req.query;

      let query = `
        SELECT v.id as voucher_id,
               v.month,
               v.created_at,
               s.id as student_id,
               s.name as student_name,
               s.roll_no,
               c.id as class_id,
               c.name as class_name,
               sec.id as section_id,
               sec.name as section_name,
               SUM(vi.amount) as total_fee,
               COALESCE(SUM(p.amount), 0) as paid_amount,
               SUM(vi.amount) - COALESCE(SUM(p.amount), 0) as due_amount,
               CASE 
                 WHEN SUM(vi.amount) <= COALESCE(SUM(p.amount), 0) THEN 'PAID'
                 WHEN COALESCE(SUM(p.amount), 0) > 0 THEN 'PARTIAL'
                 ELSE 'UNPAID'
               END as status
        FROM fee_vouchers v
        JOIN student_class_history sch ON v.student_class_history_id = sch.id
        JOIN students s ON sch.student_id = s.id
        JOIN classes c ON sch.class_id = c.id
        JOIN sections sec ON sch.section_id = sec.id
        JOIN fee_voucher_items vi ON v.id = vi.voucher_id
        LEFT JOIN fee_payments p ON v.id = p.voucher_id
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (student_id) {
        query += ` AND s.id = $${paramCount}`;
        params.push(student_id);
        paramCount++;
      }

      if (class_id) {
        query += ` AND c.id = $${paramCount}`;
        params.push(class_id);
        paramCount++;
      }

      if (section_id) {
        query += ` AND sec.id = $${paramCount}`;
        params.push(section_id);
        paramCount++;
      }

      if (month) {
        query += ` AND DATE_TRUNC('month', v.month) = DATE_TRUNC('month', $${paramCount}::date)`;
        params.push(month);
        paramCount++;
      }

      if (from_date) {
        query += ` AND v.month >= $${paramCount}`;
        params.push(from_date);
        paramCount++;
      }

      if (to_date) {
        query += ` AND v.month <= $${paramCount}`;
        params.push(to_date);
        paramCount++;
      }

      query += ` GROUP BY v.id, v.month, v.created_at, s.id, s.name, s.roll_no, c.id, c.name, sec.id, sec.name`;

      // Apply status filter after grouping
      if (status) {
        const statusMap = {
          'PAID': 'SUM(vi.amount) <= COALESCE(SUM(p.amount), 0)',
          'UNPAID': 'COALESCE(SUM(p.amount), 0) = 0',
          'PARTIAL': 'COALESCE(SUM(p.amount), 0) > 0 AND SUM(vi.amount) > COALESCE(SUM(p.amount), 0)'
        };
        if (statusMap[status.toUpperCase()]) {
          query += ` HAVING ${statusMap[status.toUpperCase()]}`;
        }
      }

      // Count total
      const countQuery = `
        SELECT COUNT(*) FROM (
          ${query}
        ) as counted
      `;
      const countResult = await client.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // Add pagination
      query += ` ORDER BY v.month DESC, s.name`;
      query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, (page - 1) * limit);

      const result = await client.query(query, params);

      return ApiResponse.paginated(
        res,
        result.rows,
        { page: parseInt(page), limit: parseInt(limit), total },
        'Vouchers retrieved successfully'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get voucher by ID with complete details
   * GET /api/vouchers/:id
   */
  async getById(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const voucher = await this.getVoucherById(client, id);

      if (!voucher) {
        return ApiResponse.error(res, 'Voucher not found', 404);
      }

      return ApiResponse.success(res, voucher);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Get complete voucher details
   */
  async getVoucherById(client, voucherId) {
    const result = await client.query(
      `SELECT v.id as voucher_id,
              v.month,
              v.created_at,
              s.id as student_id,
              s.name as student_name,
              s.roll_no,
              s.phone as student_phone,
              c.id as class_id,
              c.name as class_name,
              sec.id as section_id,
              sec.name as section_name,
              json_agg(json_build_object(
                'item_type', vi.item_type,
                'amount', vi.amount
              )) as items,
              (SELECT json_agg(json_build_object(
                'id', p.id,
                'amount', p.amount,
                'payment_date', p.payment_date,
                'created_at', p.created_at
              ))
              FROM fee_payments p
              WHERE p.voucher_id = v.id) as payments,
              SUM(vi.amount) as total_fee,
              COALESCE(SUM(p.amount), 0) as paid_amount,
              SUM(vi.amount) - COALESCE(SUM(p.amount), 0) as due_amount,
              CASE 
                WHEN SUM(vi.amount) <= COALESCE(SUM(p.amount), 0) THEN 'PAID'
                WHEN COALESCE(SUM(p.amount), 0) > 0 THEN 'PARTIAL'
                ELSE 'UNPAID'
              END as status
       FROM fee_vouchers v
       JOIN student_class_history sch ON v.student_class_history_id = sch.id
       JOIN students s ON sch.student_id = s.id
       JOIN classes c ON sch.class_id = c.id
       JOIN sections sec ON sch.section_id = sec.id
       JOIN fee_voucher_items vi ON v.id = vi.voucher_id
       LEFT JOIN fee_payments p ON v.id = p.voucher_id
       WHERE v.id = $1
       GROUP BY v.id, v.month, v.created_at, s.id, s.name, s.roll_no, s.phone, 
                c.id, c.name, sec.id, sec.name`,
      [voucherId]
    );

    return result.rows[0];
  }

  /**
   * Update voucher items (add custom items like arrears, discount)
   * PUT /api/vouchers/:id/items
   */
  async updateItems(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { items } = req.body;

      // Validate input
      const schema = Joi.object({
        items: Joi.array().items(
          Joi.object({
            item_type: Joi.string().required(),
            amount: Joi.number().required()
          })
        ).required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if voucher exists and is unpaid
      const voucherCheck = await client.query(
        `SELECT v.id,
                COALESCE(SUM(p.amount), 0) as paid_amount
         FROM fee_vouchers v
         LEFT JOIN fee_payments p ON v.id = p.voucher_id
         WHERE v.id = $1
         GROUP BY v.id`,
        [id]
      );

      if (voucherCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Voucher not found', 404);
      }

      if (parseFloat(voucherCheck.rows[0].paid_amount) > 0) {
        return ApiResponse.error(
          res,
          'Cannot modify items for a voucher that has payments',
          400
        );
      }

      // Add new items
      for (const item of items) {
        await client.query(
          `INSERT INTO fee_voucher_items (voucher_id, item_type, amount)
           VALUES ($1, $2, $3)`,
          [id, item.item_type, item.amount]
        );
      }

      await client.query('COMMIT');

      // Fetch updated voucher
      const updated = await this.getVoucherById(client, id);

      return ApiResponse.success(res, updated, 'Voucher items updated successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete voucher (only if unpaid)
   * DELETE /api/vouchers/:id
   */
  async delete(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;

      // Check if voucher has any payments
      const paymentCheck = await client.query(
        `SELECT COUNT(*) as payment_count
         FROM fee_payments
         WHERE voucher_id = $1`,
        [id]
      );

      if (parseInt(paymentCheck.rows[0].payment_count) > 0) {
        return ApiResponse.error(
          res,
          'Cannot delete voucher with existing payments. Delete payments first.',
          400
        );
      }

      // Delete voucher items first
      await client.query(
        'DELETE FROM fee_voucher_items WHERE voucher_id = $1',
        [id]
      );

      // Delete voucher
      const result = await client.query(
        'DELETE FROM fee_vouchers WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Voucher not found', 404);
      }

      await client.query('COMMIT');

      return ApiResponse.success(res, result.rows[0], 'Voucher deleted successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }
  
  /**
   * Download fee voucher as PDF
   * GET /api/vouchers/:id/pdf
   */
  async downloadPDF(req, res, next) {
    try {
      const { id } = req.params;
      const pdfService = require('../services/pdf.service');
      
      const { filepath, filename } = await pdfService.generateFeeVoucher(id);
      
      res.download(filepath, filename, (err) => {
        // Clean up the file after sending
        const fs = require('fs');
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }
        
        if (err) {
          next(err);
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new VouchersController();
