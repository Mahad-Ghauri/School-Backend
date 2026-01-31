const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Classes Controller
 * Manages classes and their fee structures
 */
class ClassesController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.create = this.create.bind(this);
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.update = this.update.bind(this);
    this.delete = this.delete.bind(this);
    this.updateFeeStructure = this.updateFeeStructure.bind(this);
    this.getFeeHistory = this.getFeeHistory.bind(this);
  }

  /**
   * Create a new class
   * POST /api/classes
   */
  async create(req, res, next) {
    const client = await pool.connect();
    try {
      const { class_type, name, fee_structure } = req.body;

      // Validate input
      const schema = Joi.object({
        class_type: Joi.string().valid('SCHOOL', 'COLLEGE').required(),
        name: Joi.string().required(),
        fee_structure: Joi.object({
          admission_fee: Joi.number().min(0).default(0),
          monthly_fee: Joi.number().min(0).default(0),
          paper_fund: Joi.number().min(0).default(0)
        }).optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      await client.query('BEGIN');

      // Create class
      const classResult = await client.query(
        `INSERT INTO classes (class_type, name) 
         VALUES ($1, $2) 
         RETURNING *`,
        [class_type, name]
      );

      const newClass = classResult.rows[0];

      // Create fee structure if provided
      if (fee_structure) {
        await client.query(
          `INSERT INTO class_fee_structure 
           (class_id, effective_from, admission_fee, monthly_fee, paper_fund) 
           VALUES ($1, CURRENT_DATE, $2, $3, $4)`,
          [
            newClass.id,
            fee_structure.admission_fee || 0,
            fee_structure.monthly_fee || 0,
            fee_structure.paper_fund || 0
          ]
        );
      }

      await client.query('COMMIT');

      // Fetch complete class data with fee structure
      const completeClass = await this.getClassById(client, newClass.id);

      return ApiResponse.created(res, completeClass, 'Class created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get class by ID with fee structure
   */
  async getClassById(client, classId) {
    const classResult = await client.query(
      'SELECT * FROM classes WHERE id = $1',
      [classId]
    );

    if (classResult.rows.length === 0) {
      return null;
    }

    const classData = classResult.rows[0];

    // Get current fee structure
    const feeResult = await client.query(
      `SELECT * FROM class_fee_structure 
       WHERE class_id = $1 
       ORDER BY effective_from DESC 
       LIMIT 1`,
      [classId]
    );

    // Get sections count
    const sectionsResult = await client.query(
      'SELECT COUNT(*) as section_count FROM sections WHERE class_id = $1',
      [classId]
    );

    // Get students count
    const studentsResult = await client.query(
      `SELECT COUNT(DISTINCT sch.student_id) as student_count 
       FROM student_class_history sch 
       WHERE sch.class_id = $1 AND sch.end_date IS NULL`,
      [classId]
    );

    return {
      ...classData,
      current_fee_structure: feeResult.rows[0] || null,
      section_count: parseInt(sectionsResult.rows[0].section_count),
      student_count: parseInt(studentsResult.rows[0].student_count)
    };
  }

  /**
   * Get class by ID
   * GET /api/classes/:id
   */
  async getById(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const classData = await this.getClassById(client, id);

      if (!classData) {
        return ApiResponse.error(res, 'Class not found', 404);
      }

      return ApiResponse.success(res, classData);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * List all classes
   * GET /api/classes
   */
  async list(req, res, next) {
    const client = await pool.connect();
    try {
      const { 
        class_type, 
        is_active = true,
        page = 1, 
        limit = 50 
      } = req.query;

      let query = `
        SELECT c.*,
               (SELECT COUNT(*) FROM sections WHERE class_id = c.id) as section_count,
               (SELECT COUNT(DISTINCT student_id) 
                FROM student_class_history 
                WHERE class_id = c.id AND end_date IS NULL) as student_count
        FROM classes c
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 1;

      if (class_type) {
        query += ` AND c.class_type = $${paramCount}`;
        params.push(class_type);
        paramCount++;
      }

      if (is_active !== undefined) {
        query += ` AND c.is_active = $${paramCount}`;
        params.push(is_active);
        paramCount++;
      }

      // Count total records
      const countResult = await client.query(
        query.replace('SELECT c.*', 'SELECT COUNT(*)'),
        params
      );
      const total = parseInt(countResult.rows[0].count);

      // Add pagination
      query += ` ORDER BY c.class_type, c.name`;
      query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, (page - 1) * limit);

      const result = await client.query(query, params);

      // Get fee structure for each class
      const classesWithFees = await Promise.all(
        result.rows.map(async (classData) => {
          const feeResult = await client.query(
            `SELECT * FROM class_fee_structure 
             WHERE class_id = $1 
             ORDER BY effective_from DESC 
             LIMIT 1`,
            [classData.id]
          );
          return {
            ...classData,
            current_fee_structure: feeResult.rows[0] || null
          };
        })
      );

      return ApiResponse.paginated(
        res,
        classesWithFees,
        { page: parseInt(page), limit: parseInt(limit), total },
        'Classes retrieved successfully'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Update class
   * PUT /api/classes/:id
   */
  async update(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { name, is_active } = req.body;

      // Validate input
      const schema = Joi.object({
        name: Joi.string().optional(),
        is_active: Joi.boolean().optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount}`);
        values.push(name);
        paramCount++;
      }

      if (is_active !== undefined) {
        updates.push(`is_active = $${paramCount}`);
        values.push(is_active);
        paramCount++;
      }

      if (updates.length === 0) {
        return ApiResponse.error(res, 'No fields to update', 400);
      }

      values.push(id);
      const result = await client.query(
        `UPDATE classes SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Class not found', 404);
      }

      const updatedClass = await this.getClassById(client, id);

      return ApiResponse.success(res, updatedClass, 'Class updated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Update fee structure for a class
   * PUT /api/classes/:id/fee-structure
   */
  async updateFeeStructure(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { admission_fee, monthly_fee, paper_fund, effective_from } = req.body;

      // Validate input
      const schema = Joi.object({
        admission_fee: Joi.number().min(0).required(),
        monthly_fee: Joi.number().min(0).required(),
        paper_fund: Joi.number().min(0).required(),
        effective_from: Joi.date().optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if class exists
      const classCheck = await client.query(
        'SELECT id FROM classes WHERE id = $1',
        [id]
      );

      if (classCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Class not found', 404);
      }

      // Insert new fee structure
      const result = await client.query(
        `INSERT INTO class_fee_structure 
         (class_id, effective_from, admission_fee, monthly_fee, paper_fund) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [id, effective_from || new Date(), admission_fee, monthly_fee, paper_fund]
      );

      return ApiResponse.success(
        res,
        result.rows[0],
        'Fee structure updated successfully'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Get fee structure history for a class
   * GET /api/classes/:id/fee-history
   */
  async getFeeHistory(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        `SELECT * FROM class_fee_structure 
         WHERE class_id = $1 
         ORDER BY effective_from DESC`,
        [id]
      );

      return ApiResponse.success(res, result.rows);
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Delete class (soft delete by deactivating)
   * DELETE /api/classes/:id
   */
  async delete(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      // Check if class has students
      const studentsCheck = await client.query(
        `SELECT COUNT(*) as count 
         FROM student_class_history 
         WHERE class_id = $1 AND end_date IS NULL`,
        [id]
      );

      if (parseInt(studentsCheck.rows[0].count) > 0) {
        return ApiResponse.error(
          res,
          'Cannot delete class with active students. Please deactivate instead.',
          400
        );
      }

      // Soft delete by deactivating
      const result = await client.query(
        'UPDATE classes SET is_active = false WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Class not found', 404);
      }

      return ApiResponse.success(res, result.rows[0], 'Class deactivated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new ClassesController();
