const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Fees Controller
 * Handles fee payments, defaulters, and fee-related operations
 */
class FeesController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.recordPayment = this.recordPayment.bind(this);
    this.listPayments = this.listPayments.bind(this);
    this.getVoucherPayments = this.getVoucherPayments.bind(this);
    this.deletePayment = this.deletePayment.bind(this);
    this.getDefaulters = this.getDefaulters.bind(this);
    this.getStudentFeeHistory = this.getStudentFeeHistory.bind(this);
    this.getStudentDue = this.getStudentDue.bind(this);
    this.getStats = this.getStats.bind(this);
    this.downloadReceipt = this.downloadReceipt.bind(this);
  }

  /**
   * Record a fee payment
   * POST /api/fees/payment
   */
  async recordPayment(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { voucher_id, amount, payment_date } = req.body;

      // Validate input
      const schema = Joi.object({
        voucher_id: Joi.number().integer().required(),
        amount: Joi.number().positive().required(),
        payment_date: Joi.date().optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if voucher exists
      const voucherCheck = await client.query(
        `WITH VoucherTotals AS (
           SELECT voucher_id, SUM(amount) as total_fee
           FROM fee_voucher_items
           WHERE voucher_id = $1
           GROUP BY voucher_id
         ),
         PaymentTotals AS (
           SELECT voucher_id, SUM(amount) as paid_amount
           FROM fee_payments
           WHERE voucher_id = $1
           GROUP BY voucher_id
         )
         SELECT v.id, 
                COALESCE(vt.total_fee, 0) as total_fee,
                COALESCE(pt.paid_amount, 0) as paid_amount
         FROM fee_vouchers v
         LEFT JOIN VoucherTotals vt ON v.id = vt.voucher_id
         LEFT JOIN PaymentTotals pt ON v.id = pt.voucher_id
         WHERE v.id = $1`,
        [voucher_id]
      );

      if (voucherCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Fee voucher not found', 404);
      }

      const voucher = voucherCheck.rows[0];
      const dueAmount = parseFloat(voucher.total_fee) - parseFloat(voucher.paid_amount);

      // Validate payment amount
      if (amount > dueAmount) {
        return ApiResponse.error(
          res,
          `Payment amount (${amount}) exceeds due amount (${dueAmount})`,
          400
        );
      }

      // Record payment
      const result = await client.query(
        `INSERT INTO fee_payments (voucher_id, amount, payment_date)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [voucher_id, amount, payment_date || new Date()]
      );

      await client.query('COMMIT');

      // Get updated voucher status
      const updatedVoucher = await this.getVoucherStatus(client, voucher_id);

      return ApiResponse.created(res, {
        payment: result.rows[0],
        voucher_status: updatedVoucher
      }, 'Payment recorded successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Helper: Get voucher payment status
   */
  async getVoucherStatus(client, voucherId) {
    const result = await client.query(
      `WITH VoucherTotals AS (
         SELECT voucher_id, SUM(amount) as total_fee
         FROM fee_voucher_items
         WHERE voucher_id = $1
         GROUP BY voucher_id
       ),
       PaymentTotals AS (
         SELECT voucher_id, SUM(amount) as paid_amount
         FROM fee_payments
         WHERE voucher_id = $1
         GROUP BY voucher_id
       )
       SELECT v.id,
              v.month,
              s.id as student_id,
              s.name as student_name,
              c.name as class_name,
              sec.name as section_name,
              COALESCE(vt.total_fee, 0) as total_fee,
              COALESCE(pt.paid_amount, 0) as paid_amount,
              COALESCE(vt.total_fee, 0) - COALESCE(pt.paid_amount, 0) as due_amount,
              CASE 
                WHEN COALESCE(vt.total_fee, 0) <= COALESCE(pt.paid_amount, 0) THEN 'PAID'
                WHEN COALESCE(pt.paid_amount, 0) > 0 THEN 'PARTIAL'
                ELSE 'UNPAID'
              END as status
       FROM fee_vouchers v
       JOIN student_class_history sch ON v.student_class_history_id = sch.id
       JOIN students s ON sch.student_id = s.id
       JOIN classes c ON sch.class_id = c.id
       JOIN sections sec ON sch.section_id = sec.id
       LEFT JOIN VoucherTotals vt ON v.id = vt.voucher_id
       LEFT JOIN PaymentTotals pt ON v.id = pt.voucher_id
       WHERE v.id = $1`,
      [voucherId]
    );

    return result.rows[0];
  }

  /**
   * Get payment history for a voucher
   * GET /api/fees/voucher/:id/payments
   */
  async getVoucherPayments(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        `SELECT * FROM fee_payments 
         WHERE voucher_id = $1 
         ORDER BY payment_date DESC`,
        [id]
      );

      const status = await this.getVoucherStatus(client, id);

      return ApiResponse.success(res, {
        voucher: status,
        payments: result.rows
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get all payments with filters
   * GET /api/fees/payments
   */
  async listPayments(req, res, next) {
    const client = await pool.connect();
    try {
      const {
        student_id,
        class_id,
        section_id,
        from_date,
        to_date,
        page = 1,
        limit = 50
      } = req.query;

      let query = `
        SELECT p.*,
               s.name as student_name,
               s.roll_no,
               c.name as class_name,
               sec.name as section_name,
               v.month,
               SUM(vi.amount) as total_fee
        FROM fee_payments p
        JOIN fee_vouchers v ON p.voucher_id = v.id
        JOIN student_class_history sch ON v.student_class_history_id = sch.id
        JOIN students s ON sch.student_id = s.id
        JOIN classes c ON sch.class_id = c.id
        JOIN sections sec ON sch.section_id = sec.id
        JOIN fee_voucher_items vi ON v.id = vi.voucher_id
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

      if (from_date) {
        query += ` AND p.payment_date >= $${paramCount}`;
        params.push(from_date);
        paramCount++;
      }

      if (to_date) {
        query += ` AND p.payment_date <= $${paramCount}`;
        params.push(to_date);
        paramCount++;
      }

      query += ` GROUP BY p.id, s.name, s.roll_no, c.name, sec.name, v.month`;

      // Count total
      const countQuery = `
        SELECT COUNT(DISTINCT p.id) as count
        FROM fee_payments p
        JOIN fee_vouchers v ON p.voucher_id = v.id
        JOIN student_class_history sch ON v.student_class_history_id = sch.id
        JOIN students s ON sch.student_id = s.id
        JOIN classes c ON sch.class_id = c.id
        JOIN sections sec ON sch.section_id = sec.id
        WHERE 1=1
        ${student_id ? ` AND s.id = ${student_id}` : ''}
        ${class_id ? ` AND c.id = ${class_id}` : ''}
        ${section_id ? ` AND sec.id = ${section_id}` : ''}
        ${from_date ? ` AND p.payment_date >= '${from_date}'` : ''}
        ${to_date ? ` AND p.payment_date <= '${to_date}'` : ''}
      `;

      const countResult = await client.query(countQuery);
      const total = parseInt(countResult.rows[0].count);

      // Add pagination
      query += ` ORDER BY p.payment_date DESC, p.created_at DESC`;
      query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, (page - 1) * limit);

      const result = await client.query(query, params);

      return ApiResponse.paginated(
        res,
        result.rows,
        { page: parseInt(page), limit: parseInt(limit), total },
        'Payments retrieved successfully'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get defaulters list
   * GET /api/fees/defaulters
   */
  async getDefaulters(req, res, next) {
    const client = await pool.connect();
    try {
      const { class_id, section_id, min_due_amount = 0, overdue_only = 'false' } = req.query;

      let query = `
        WITH voucher_amounts AS (
          SELECT 
            v.id as voucher_id,
            v.student_class_history_id,
            v.due_date,
            (SELECT COALESCE(SUM(vi.amount), 0) FROM fee_voucher_items vi WHERE vi.voucher_id = v.id) as voucher_total,
            (SELECT COALESCE(SUM(p.amount), 0) FROM fee_payments p WHERE p.voucher_id = v.id) as voucher_paid
          FROM fee_vouchers v
        )
        SELECT 
          s.id as student_id,
          s.name as student_name,
          s.roll_no,
          s.phone,
          s.father_name,
          c.id as class_id,
          c.name as class_name,
          sec.id as section_id,
          sec.name as section_name,
          COUNT(va.voucher_id) as total_vouchers,
          COALESCE(SUM(va.voucher_total), 0) as total_fee,
          COALESCE(SUM(va.voucher_paid), 0) as paid_amount,
          COALESCE(SUM(va.voucher_total - va.voucher_paid), 0) as due_amount
        FROM students s
        JOIN student_class_history sch_curr ON s.id = sch_curr.student_id AND sch_curr.end_date IS NULL
        JOIN classes c ON sch_curr.class_id = c.id
        JOIN sections sec ON sch_curr.section_id = sec.id
        JOIN student_class_history sch_all ON s.id = sch_all.student_id
        JOIN voucher_amounts va ON sch_all.id = va.student_class_history_id AND va.voucher_total > va.voucher_paid
        WHERE s.is_active = true
      `;

      const params = [];
      let paramCount = 1;

      if (class_id) {
        query += ` AND sch_curr.class_id = $${paramCount}`;
        params.push(class_id);
        paramCount++;
      }

      if (section_id) {
        query += ` AND sch_curr.section_id = $${paramCount}`;
        params.push(section_id);
        paramCount++;
      }

      // Filter by overdue vouchers only
      if (overdue_only === 'true') {
        query += ` AND va.due_date < CURRENT_DATE`;
      }

      query += ` 
        GROUP BY s.id, s.name, s.roll_no, s.phone, s.father_name, c.id, c.name, sec.id, sec.name
      `;

      if (min_due_amount > 0) {
        query += ` HAVING SUM(va.voucher_total - va.voucher_paid) >= $${paramCount}`;
        params.push(min_due_amount);
        paramCount++;
      }

      query += ` ORDER BY due_amount DESC, s.name`;

      const result = await client.query(query, params);

      // Get guardian info for each defaulter
      const defaultersWithGuardians = await Promise.all(
        result.rows.map(async (defaulter) => {
          const guardians = await client.query(
            `SELECT g.name, g.phone, sg.relation 
             FROM guardians g
             JOIN student_guardians sg ON g.id = sg.guardian_id
             WHERE sg.student_id = $1`,
            [defaulter.student_id]
          );
          return {
            ...defaulter,
            guardians: guardians.rows
          };
        })
      );

      // Calculate summary
      const summary = {
        total_defaulters: defaultersWithGuardians.length,
        total_due_amount: defaultersWithGuardians.reduce((sum, d) => sum + parseFloat(d.due_amount), 0)
      };

      return ApiResponse.success(res, {
        summary,
        defaulters: defaultersWithGuardians
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get student fee history
   * GET /api/fees/student/:id
   */
  async getStudentFeeHistory(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      // Get all vouchers with payment status
      const result = await client.query(
        `SELECT v.id as voucher_id,
                v.month,
                v.created_at,
                c.name as class_name,
                sec.name as section_name,
                (SELECT COALESCE(SUM(vi.amount), 0) FROM fee_voucher_items vi WHERE vi.voucher_id = v.id) as total_fee,
                (SELECT COALESCE(SUM(fp.amount), 0) FROM fee_payments fp WHERE fp.voucher_id = v.id) as paid_amount,
                (SELECT COALESCE(SUM(vi.amount), 0) FROM fee_voucher_items vi WHERE vi.voucher_id = v.id) -
                (SELECT COALESCE(SUM(fp.amount), 0) FROM fee_payments fp WHERE fp.voucher_id = v.id) as due_amount,
                CASE 
                  WHEN (SELECT COALESCE(SUM(vi.amount), 0) FROM fee_voucher_items vi WHERE vi.voucher_id = v.id) <= 
                       (SELECT COALESCE(SUM(fp.amount), 0) FROM fee_payments fp WHERE fp.voucher_id = v.id) THEN 'PAID'
                  WHEN (SELECT COALESCE(SUM(fp.amount), 0) FROM fee_payments fp WHERE fp.voucher_id = v.id) > 0 THEN 'PARTIAL'
                  ELSE 'UNPAID'
                END as status,
                (SELECT json_agg(json_build_object(
                  'item_type', vi.item_type,
                  'amount', vi.amount
                ))
                FROM fee_voucher_items vi
                WHERE vi.voucher_id = v.id) as items,
                (SELECT json_agg(json_build_object(
                  'amount', fp.amount,
                  'payment_date', fp.payment_date,
                  'created_at', fp.created_at
                ))
                FROM fee_payments fp
                WHERE fp.voucher_id = v.id) as payments
         FROM fee_vouchers v
         JOIN student_class_history sch ON v.student_class_history_id = sch.id
         JOIN classes c ON sch.class_id = c.id
         JOIN sections sec ON sch.section_id = sec.id
         WHERE sch.student_id = $1
         ORDER BY v.month DESC`,
        [id]
      );

      // Calculate summary
      const summary = {
        total_vouchers: result.rows.length,
        paid_vouchers: result.rows.filter(v => v.status === 'PAID').length,
        unpaid_vouchers: result.rows.filter(v => v.status === 'UNPAID').length,
        partial_vouchers: result.rows.filter(v => v.status === 'PARTIAL').length,
        total_fee: result.rows.reduce((sum, v) => sum + parseFloat(v.total_fee), 0),
        total_paid: result.rows.reduce((sum, v) => sum + parseFloat(v.paid_amount), 0),
        total_due: result.rows.reduce((sum, v) => sum + parseFloat(v.due_amount), 0)
      };

      return ApiResponse.success(res, {
        summary,
        vouchers: result.rows
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get student current due amount
   * GET /api/fees/student/:id/due
   */
  async getStudentDue(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        `WITH VouchersDue AS (
           SELECT 
             v.id as voucher_id,
             (SELECT COALESCE(SUM(vi.amount), 0) FROM fee_voucher_items vi WHERE vi.voucher_id = v.id) as voucher_total,
             (SELECT COALESCE(SUM(p.amount), 0) FROM fee_payments p WHERE p.voucher_id = v.id) as voucher_paid
           FROM students s
           JOIN student_class_history sch ON s.id = sch.student_id
           JOIN fee_vouchers v ON sch.id = v.student_class_history_id
           WHERE s.id = $1
         )
         SELECT 
           s.id as student_id,
           s.name as student_name,
           s.roll_no,
           COUNT(CASE WHEN vd.voucher_total > vd.voucher_paid THEN 1 END) as unpaid_vouchers,
           COALESCE(SUM(CASE WHEN vd.voucher_total > vd.voucher_paid THEN vd.voucher_total - vd.voucher_paid ELSE 0 END), 0) as total_due
         FROM students s
         LEFT JOIN VouchersDue vd ON true
         WHERE s.id = $1
         GROUP BY s.id, s.name, s.roll_no`,
        [id]
      );

      if (result.rows.length === 0 || result.rows[0].total_due == 0) {
        return ApiResponse.success(res, {
          student_id: parseInt(id),
          total_due: 0,
          unpaid_vouchers: 0,
          message: 'No pending dues'
        });
      }

      return ApiResponse.success(res, result.rows[0]);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get fee collection statistics
   * GET /api/fees/stats
   */
  async getStats(req, res, next) {
    const client = await pool.connect();
    try {
      const { from_date, to_date, class_id } = req.query;

      let dateFilter = '';
      const params = [];
      let paramCount = 1;

      if (from_date) {
        dateFilter += ` AND p.payment_date >= $${paramCount}`;
        params.push(from_date);
        paramCount++;
      }

      if (to_date) {
        dateFilter += ` AND p.payment_date <= $${paramCount}`;
        params.push(to_date);
        paramCount++;
      }

      let classFilter = '';
      if (class_id) {
        classFilter = ` AND c.id = $${paramCount}`;
        params.push(class_id);
        paramCount++;
      }

      const stats = await client.query(`
        WITH voucher_totals AS (
          SELECT 
            v.id as voucher_id,
            sch.student_id,
            c.id as class_id,
            SUM(vi.amount) as voucher_total,
            COALESCE((
              SELECT SUM(p.amount) 
              FROM fee_payments p 
              WHERE p.voucher_id = v.id ${dateFilter}
            ), 0) as paid_total,
            CASE 
              WHEN SUM(vi.amount) <= COALESCE((
                SELECT SUM(p2.amount) 
                FROM fee_payments p2 
                WHERE p2.voucher_id = v.id
              ), 0) THEN 'PAID'
              WHEN COALESCE((
                SELECT SUM(p3.amount) 
                FROM fee_payments p3 
                WHERE p3.voucher_id = v.id
              ), 0) > 0 THEN 'PARTIAL'
              ELSE 'UNPAID'
            END as status
          FROM fee_vouchers v
          JOIN student_class_history sch ON v.student_class_history_id = sch.id
          JOIN classes c ON sch.class_id = c.id
          JOIN fee_voucher_items vi ON v.id = vi.voucher_id
          WHERE 1=1 ${classFilter}
          GROUP BY v.id, sch.student_id, c.id
        ),
        payment_counts AS (
          SELECT COUNT(DISTINCT p.id) as total_payments
          FROM fee_payments p
          WHERE 1=1 ${dateFilter.replace(/p\./g, 'p.')}
        )
        SELECT 
          COUNT(DISTINCT voucher_id) as total_vouchers,
          COUNT(DISTINCT CASE WHEN status = 'PAID' THEN voucher_id END) as paid_vouchers,
          COUNT(DISTINCT CASE WHEN status = 'UNPAID' THEN voucher_id END) as unpaid_vouchers,
          COUNT(DISTINCT CASE WHEN status = 'PARTIAL' THEN voucher_id END) as partial_vouchers,
          COALESCE(SUM(voucher_total), 0) as total_fee_generated,
          COALESCE(SUM(paid_total), 0) as total_collected,
          COALESCE(SUM(voucher_total) - SUM(paid_total), 0) as total_pending,
          (SELECT total_payments FROM payment_counts) as total_payments,
          COUNT(DISTINCT student_id) as total_students
        FROM voucher_totals
      `, params);

      return ApiResponse.success(res, stats.rows[0]);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete a payment (Admin only - for corrections)
   * DELETE /api/fees/payment/:id
   */
  async deletePayment(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        'DELETE FROM fee_payments WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Payment not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Payment deleted successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Download payment receipt as PDF
   * GET /api/fees/payment/:id/receipt
   */
  async downloadReceipt(req, res, next) {
    try {
      const { id } = req.params;
      const pdfService = require('../services/pdf.service');

      const { filepath, filename } = await pdfService.generatePaymentReceipt(id, 'fee');

      res.download(filepath, filename, (err) => {
        // Clean up the file after sending
        const fs = require('fs');
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
        }

        if (err) {
          next(error);
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FeesController();
