const pool = require('../config/db');
const ApiResponse = require('../utils/response');
const Joi = require('joi');

/**
 * Students Controller
 * Manages students, enrollment, and related operations
 * Handles all edge cases and validations
 */
class StudentsController {
  constructor() {
    // Bind all methods to preserve 'this' context
    this.create = this.create.bind(this);
    this.list = this.list.bind(this);
    this.getById = this.getById.bind(this);
    this.update = this.update.bind(this);
    this.enroll = this.enroll.bind(this);
    this.withdraw = this.withdraw.bind(this);
    this.deactivate = this.deactivate.bind(this);
    this.activate = this.activate.bind(this);
    this.expel = this.expel.bind(this);
    this.clearExpulsion = this.clearExpulsion.bind(this);
    this.addGuardian = this.addGuardian.bind(this);
    this.removeGuardian = this.removeGuardian.bind(this);
    this.transfer = this.transfer.bind(this);
    this.promote = this.promote.bind(this);
    this.bulkCreate = this.bulkCreate.bind(this);
    this.bulkDeactivate = this.bulkDeactivate.bind(this);
  }

  /**
   * Create new student with guardians and enrollment
   * POST /api/students
   */
  async create(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const {
        name, roll_no, phone, address, date_of_birth,
        bay_form, caste, previous_school,
        guardians,
        enrollment // { class_id, section_id, start_date }
      } = req.body;

      // Validate input
      const schema = Joi.object({
        name: Joi.string().required(),
        roll_no: Joi.string().optional().allow('', null),
        phone: Joi.string().optional().allow('', null),
        address: Joi.string().optional().allow('', null),
        date_of_birth: Joi.date().optional().allow(null),
        bay_form: Joi.string().optional().allow('', null),
        caste: Joi.string().optional().allow('', null),
        previous_school: Joi.string().optional().allow('', null),
        guardians: Joi.array().items(
          Joi.object({
            guardian_id: Joi.number().optional(),
            name: Joi.string().optional(),
            cnic: Joi.string().pattern(/^[0-9]{13}$/).optional().allow(''),
            phone: Joi.string().optional().allow(''),
            occupation: Joi.string().optional().allow(''),
            relation: Joi.string().required()
          })
        ).optional(),
        enrollment: Joi.object({
          class_id: Joi.number().integer().required(),
          section_id: Joi.number().integer().required(),
          start_date: Joi.date().optional()
        }).optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if roll_no is unique (if provided)
      if (roll_no) {
        const rollNoCheck = await client.query(
          'SELECT id FROM students WHERE roll_no = $1',
          [roll_no]
        );
        if (rollNoCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          return ApiResponse.error(res, 'Roll number already exists', 409);
        }
      }

      // Validate enrollment if provided
      if (enrollment) {
        const classCheck = await client.query(
          'SELECT id, is_active FROM classes WHERE id = $1',
          [enrollment.class_id]
        );
        if (classCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return ApiResponse.error(res, 'Class not found', 404);
        }
        if (!classCheck.rows[0].is_active) {
          await client.query('ROLLBACK');
          return ApiResponse.error(res, 'Cannot enroll in inactive class', 400);
        }

        const sectionCheck = await client.query(
          'SELECT id FROM sections WHERE id = $1 AND class_id = $2',
          [enrollment.section_id, enrollment.class_id]
        );
        if (sectionCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          return ApiResponse.error(res, 'Section not found or does not belong to the specified class', 404);
        }
      }

      // Insert student
      const studentResult = await client.query(
        `INSERT INTO students 
         (name, roll_no, phone, address, date_of_birth, bay_form, caste, previous_school) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         RETURNING *`,
        [
          name,
          roll_no || null,
          phone || null,
          address || null,
          date_of_birth || null,
          bay_form || null,
          caste || null,
          previous_school || null
        ]
      );

      const student = studentResult.rows[0];

      // Handle guardians
      if (guardians && guardians.length > 0) {
        for (const guardian of guardians) {
          let guardianId = guardian.guardian_id;

          // If guardian_id not provided, check if guardian exists by CNIC or create new
          if (!guardianId) {
            if (guardian.cnic) {
              const existingGuardian = await client.query(
                'SELECT id FROM guardians WHERE cnic = $1',
                [guardian.cnic]
              );
              if (existingGuardian.rows.length > 0) {
                guardianId = existingGuardian.rows[0].id;
              }
            }

            // Create new guardian if not found
            if (!guardianId) {
              if (!guardian.name) {
                await client.query('ROLLBACK');
                return ApiResponse.error(
                  res,
                  'Guardian name is required when creating new guardian',
                  400
                );
              }

              const guardianResult = await client.query(
                `INSERT INTO guardians (name, cnic, phone, occupation) 
                 VALUES ($1, $2, $3, $4) 
                 RETURNING id`,
                [
                  guardian.name,
                  guardian.cnic || null,
                  guardian.phone || null,
                  guardian.occupation || null
                ]
              );
              guardianId = guardianResult.rows[0].id;
            }
          } else {
            // Verify guardian_id exists
            const guardianCheck = await client.query(
              'SELECT id FROM guardians WHERE id = $1',
              [guardianId]
            );
            if (guardianCheck.rows.length === 0) {
              await client.query('ROLLBACK');
              return ApiResponse.error(res, `Guardian with ID ${guardianId} not found`, 404);
            }
          }

          // Check if relationship already exists
          const relationCheck = await client.query(
            'SELECT * FROM student_guardians WHERE student_id = $1 AND guardian_id = $2',
            [student.id, guardianId]
          );

          if (relationCheck.rows.length === 0) {
            // Link guardian to student
            await client.query(
              `INSERT INTO student_guardians (student_id, guardian_id, relation) 
               VALUES ($1, $2, $3)`,
              [student.id, guardianId, guardian.relation]
            );
          }
        }
      }

      // Handle enrollment if provided
      if (enrollment) {
        await client.query(
          `INSERT INTO student_class_history 
           (student_id, class_id, section_id, start_date) 
           VALUES ($1, $2, $3, $4)`,
          [
            student.id,
            enrollment.class_id,
            enrollment.section_id,
            enrollment.start_date || new Date()
          ]
        );
      }

      await client.query('COMMIT');

      // Return the created student data
      return ApiResponse.created(res, student, 'Student created successfully');
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
       WHERE sg.student_id = $1
       ORDER BY g.name`,
      [studentId]
    );

    // Get current enrollment
    const enrollmentResult = await client.query(
      `SELECT sch.*, 
              c.name as class_name, 
              c.class_type, 
              s.name as section_name
       FROM student_class_history sch
       JOIN classes c ON sch.class_id = c.id
       JOIN sections s ON sch.section_id = s.id
       WHERE sch.student_id = $1 AND sch.end_date IS NULL`,
      [studentId]
    );

    // Get enrollment history
    const historyResult = await client.query(
      `SELECT sch.*, 
              c.name as class_name, 
              c.class_type, 
              s.name as section_name
       FROM student_class_history sch
       JOIN classes c ON sch.class_id = c.id
       JOIN sections s ON sch.section_id = s.id
       WHERE sch.student_id = $1
       ORDER BY sch.start_date DESC`,
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
      current_enrollment: enrollmentResult.rows[0] || null,
      enrollment_history: historyResult.rows,
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
   * List students with advanced filtering
   * GET /api/students
   */
  async list(req, res, next) {
    const client = await pool.connect();
    try {
      const {
        is_active,
        is_expelled,
        class_id,
        section_id,
        search,
        page = 1,
        limit = 50
      } = req.query;

      let query = `
        SELECT s.id, s.name, s.roll_no, s.phone, s.address, s.date_of_birth, 
               s.bay_form, s.caste, s.previous_school, s.is_expelled, s.is_active, s.created_at,
               c.name as current_class_name,
               c.class_type,
               sec.name as current_section_name
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

      if (is_expelled !== undefined) {
        query += ` AND s.is_expelled = $${paramCount}`;
        params.push(is_expelled === 'true');
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
        query += ` AND (s.name ILIKE $${paramCount} OR s.roll_no ILIKE $${paramCount} OR s.phone ILIKE $${paramCount})`;
        params.push(`%${search}%`);
        paramCount++;
      }

      query += ` GROUP BY s.id, c.name, c.class_type, sec.name`;

      // Count total records
      const countQuery = `
        SELECT COUNT(DISTINCT s.id)
        FROM students s
        LEFT JOIN student_class_history sch ON s.id = sch.student_id AND sch.end_date IS NULL
        WHERE 1=1
      ` + (is_active !== undefined ? ` AND s.is_active = $${params.indexOf(is_active === 'true') + 1}` : '')
        + (is_expelled !== undefined ? ` AND s.is_expelled = $${params.findIndex(p => p === (is_expelled === 'true')) + 1}` : '')
        + (class_id ? ` AND sch.class_id = $${params.indexOf(class_id) + 1}` : '')
        + (section_id ? ` AND sch.section_id = $${params.indexOf(section_id) + 1}` : '')
        + (search ? ` AND (s.name ILIKE $${params.indexOf(`%${search}%`) + 1} OR s.roll_no ILIKE $${params.indexOf(`%${search}%`) + 1} OR s.phone ILIKE $${params.indexOf(`%${search}%`) + 1})` : '');

      const countResult = await client.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // Add pagination
      query += ` ORDER BY s.name`;
      query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, (page - 1) * limit);

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
      const {
        name, roll_no, phone, address, date_of_birth,
        bay_form, caste, previous_school
      } = req.body;

      // Validate input
      const schema = Joi.object({
        name: Joi.string().optional(),
        roll_no: Joi.string().optional().allow('', null),
        phone: Joi.string().optional().allow('', null),
        address: Joi.string().optional().allow('', null),
        date_of_birth: Joi.date().optional().allow(null),
        bay_form: Joi.string().optional().allow('', null),
        caste: Joi.string().optional().allow('', null),
        previous_school: Joi.string().optional().allow('', null)
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if roll_no is unique (if being updated)
      if (roll_no !== undefined && roll_no) {
        const rollNoCheck = await client.query(
          'SELECT id FROM students WHERE roll_no = $1 AND id != $2',
          [roll_no, id]
        );
        if (rollNoCheck.rows.length > 0) {
          return ApiResponse.error(res, 'Roll number already exists', 409);
        }
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount}`);
        values.push(name);
        paramCount++;
      }

      if (roll_no !== undefined) {
        updates.push(`roll_no = $${paramCount}`);
        values.push(roll_no || null);
        paramCount++;
      }

      if (phone !== undefined) {
        updates.push(`phone = $${paramCount}`);
        values.push(phone || null);
        paramCount++;
      }

      if (address !== undefined) {
        updates.push(`address = $${paramCount}`);
        values.push(address || null);
        paramCount++;
      }

      if (date_of_birth !== undefined) {
        updates.push(`date_of_birth = $${paramCount}`);
        values.push(date_of_birth || null);
        paramCount++;
      }

      if (bay_form !== undefined) {
        updates.push(`bay_form = $${paramCount}`);
        values.push(bay_form || null);
        paramCount++;
      }

      if (caste !== undefined) {
        updates.push(`caste = $${paramCount}`);
        values.push(caste || null);
        paramCount++;
      }

      if (previous_school !== undefined) {
        updates.push(`previous_school = $${paramCount}`);
        values.push(previous_school || null);
        paramCount++;
      }

      if (updates.length === 0) {
        return ApiResponse.error(res, 'No fields to update', 400);
      }

      values.push(id);
      const result = await client.query(
        `UPDATE students SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      const updatedStudent = await this.getStudentById(client, id);

      return ApiResponse.success(res, updatedStudent, 'Student updated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Enroll student in class/section
   * POST /api/students/:id/enroll
   */
  async enroll(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { class_id, section_id, start_date } = req.body;

      // Validate input
      const schema = Joi.object({
        class_id: Joi.number().integer().required(),
        section_id: Joi.number().integer().required(),
        start_date: Joi.date().optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if student exists and is active
      const studentCheck = await client.query(
        'SELECT id, is_active, is_expelled FROM students WHERE id = $1',
        [id]
      );

      if (studentCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Student not found', 404);
      }

      if (!studentCheck.rows[0].is_active) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Cannot enroll inactive student', 400);
      }

      if (studentCheck.rows[0].is_expelled) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Cannot enroll expelled student', 400);
      }

      // Check if student already has active enrollment
      const activeEnrollment = await client.query(
        'SELECT * FROM student_class_history WHERE student_id = $1 AND end_date IS NULL',
        [id]
      );

      if (activeEnrollment.rows.length > 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Student already has an active enrollment. Please withdraw from current class first.',
          400
        );
      }

      // Validate class and section
      const classCheck = await client.query(
        'SELECT id, is_active FROM classes WHERE id = $1',
        [class_id]
      );

      if (classCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Class not found', 404);
      }

      if (!classCheck.rows[0].is_active) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Cannot enroll in inactive class', 400);
      }

      const sectionCheck = await client.query(
        'SELECT id FROM sections WHERE id = $1 AND class_id = $2',
        [section_id, class_id]
      );

      if (sectionCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Section not found or does not belong to the specified class',
          404
        );
      }

      // Create enrollment
      await client.query(
        `INSERT INTO student_class_history 
         (student_id, class_id, section_id, start_date) 
         VALUES ($1, $2, $3, $4)`,
        [id, class_id, section_id, start_date || new Date()]
      );

      await client.query('COMMIT');

      const updatedStudent = await this.getStudentById(client, id);

      return ApiResponse.success(res, updatedStudent, 'Student enrolled successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Withdraw student from current class
   * POST /api/students/:id/withdraw
   */
  async withdraw(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { end_date } = req.body;

      // Validate input
      const schema = Joi.object({
        end_date: Joi.date().optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if student has active enrollment
      const activeEnrollment = await client.query(
        'SELECT * FROM student_class_history WHERE student_id = $1 AND end_date IS NULL',
        [id]
      );

      if (activeEnrollment.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Student has no active enrollment', 400);
      }

      // Update enrollment with end date
      await client.query(
        'UPDATE student_class_history SET end_date = $1 WHERE id = $2',
        [end_date || new Date(), activeEnrollment.rows[0].id]
      );

      await client.query('COMMIT');

      const updatedStudent = await this.getStudentById(client, id);

      return ApiResponse.success(res, updatedStudent, 'Student withdrawn successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Deactivate student
   * POST /api/students/:id/deactivate
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
   * POST /api/students/:id/activate
   */
  async activate(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      // Check if student is expelled
      const studentCheck = await client.query(
        'SELECT is_expelled FROM students WHERE id = $1',
        [id]
      );

      if (studentCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      if (studentCheck.rows[0].is_expelled) {
        return ApiResponse.error(
          res,
          'Cannot activate expelled student. Please clear expulsion first.',
          400
        );
      }

      const result = await client.query(
        'UPDATE students SET is_active = true WHERE id = $1 RETURNING *',
        [id]
      );

      return ApiResponse.success(res, result.rows[0], 'Student activated successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Mark student as expelled
   * POST /api/students/:id/expel
   */
  async expel(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;

      // Withdraw from current class if enrolled
      const activeEnrollment = await client.query(
        'SELECT id FROM student_class_history WHERE student_id = $1 AND end_date IS NULL',
        [id]
      );

      if (activeEnrollment.rows.length > 0) {
        await client.query(
          'UPDATE student_class_history SET end_date = CURRENT_DATE WHERE id = $1',
          [activeEnrollment.rows[0].id]
        );
      }

      // Mark as expelled and inactive
      const result = await client.query(
        'UPDATE students SET is_expelled = true, is_active = false WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Student not found', 404);
      }

      await client.query('COMMIT');

      return ApiResponse.success(res, result.rows[0], 'Student marked as expelled');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Clear expulsion status
   * POST /api/students/:id/clear-expulsion
   */
  async clearExpulsion(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        'UPDATE students SET is_expelled = false WHERE id = $1 RETURNING *',
        [id]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      return ApiResponse.success(
        res,
        result.rows[0],
        'Expulsion cleared. Student can now be activated.'
      );
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Add guardian to student
   * POST /api/students/:id/guardians
   */
  async addGuardian(req, res, next) {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { guardian_id, relation } = req.body;

      // Validate input
      const schema = Joi.object({
        guardian_id: Joi.number().integer().required(),
        relation: Joi.string().required()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check if student exists
      const studentCheck = await client.query(
        'SELECT id FROM students WHERE id = $1',
        [id]
      );

      if (studentCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Student not found', 404);
      }

      // Check if guardian exists
      const guardianCheck = await client.query(
        'SELECT id FROM guardians WHERE id = $1',
        [guardian_id]
      );

      if (guardianCheck.rows.length === 0) {
        return ApiResponse.error(res, 'Guardian not found', 404);
      }

      // Check if relationship already exists
      const relationCheck = await client.query(
        'SELECT * FROM student_guardians WHERE student_id = $1 AND guardian_id = $2',
        [id, guardian_id]
      );

      if (relationCheck.rows.length > 0) {
        return ApiResponse.error(res, 'Guardian already linked to this student', 409);
      }

      // Create relationship
      await client.query(
        'INSERT INTO student_guardians (student_id, guardian_id, relation) VALUES ($1, $2, $3)',
        [id, guardian_id, relation]
      );

      const updatedStudent = await this.getStudentById(client, id);

      return ApiResponse.success(res, updatedStudent, 'Guardian added successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Remove guardian from student
   * DELETE /api/students/:id/guardians/:guardianId
   */
  async removeGuardian(req, res, next) {
    const client = await pool.connect();
    try {
      const { id, guardianId } = req.params;

      const result = await client.query(
        'DELETE FROM student_guardians WHERE student_id = $1 AND guardian_id = $2 RETURNING *',
        [id, guardianId]
      );

      if (result.rows.length === 0) {
        return ApiResponse.error(res, 'Guardian relationship not found', 404);
      }

      const updatedStudent = await this.getStudentById(client, id);

      return ApiResponse.success(res, updatedStudent, 'Guardian removed successfully');
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Transfer student to another class/section
   * POST /api/students/:id/transfer
   */
  async transfer(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { class_id, section_id, transfer_date } = req.body;

      // Validate input
      const schema = Joi.object({
        class_id: Joi.number().integer().required(),
        section_id: Joi.number().integer().required(),
        transfer_date: Joi.date().optional()
      });

      const { error } = schema.validate(req.body);
      if (error) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // End current enrollment
      const activeEnrollment = await client.query(
        'SELECT * FROM student_class_history WHERE student_id = $1 AND end_date IS NULL',
        [id]
      );

      if (activeEnrollment.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Student has no active enrollment to transfer from', 400);
      }

      const transferDateValue = transfer_date ? new Date(transfer_date) : new Date();

      await client.query(
        'UPDATE student_class_history SET end_date = $1 WHERE id = $2',
        [transferDateValue, activeEnrollment.rows[0].id]
      );

      // Validate new class and section
      const classCheck = await client.query(
        'SELECT id, is_active FROM classes WHERE id = $1',
        [class_id]
      );

      if (classCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Class not found', 404);
      }

      if (!classCheck.rows[0].is_active) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Cannot transfer to inactive class', 400);
      }

      const sectionCheck = await client.query(
        'SELECT id FROM sections WHERE id = $1 AND class_id = $2',
        [section_id, class_id]
      );

      if (sectionCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Section not found or does not belong to the specified class',
          404
        );
      }

      // Create new enrollment
      await client.query(
        `INSERT INTO student_class_history 
         (student_id, class_id, section_id, start_date) 
         VALUES ($1, $2, $3, $4)`,
        [id, class_id, section_id, transferDateValue]
      );

      await client.query('COMMIT');

      const updatedStudent = await this.getStudentById(client, id);

      return ApiResponse.success(res, updatedStudent, 'Student transferred successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Promote student to next class (handles fee structure change)
   * POST /api/students/:id/promote
   */
  async promote(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { class_id, section_id, promotion_date, reset_discount, force = false } = req.body;

      // Validate input
      const schema = Joi.object({
        class_id: Joi.number().integer().required(),
        section_id: Joi.number().integer().required(),
        promotion_date: Joi.date().optional(),
        reset_discount: Joi.boolean().default(true),
        force: Joi.boolean().default(false)
      });

      const { error } = schema.validate(req.body);
      if (error) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, error.details[0].message, 400);
      }

      // Check for arrears (unless forced)
      if (!force) {
        const arrearsResult = await client.query(
          `SELECT SUM(vi.amount) - COALESCE(SUM(p.amount), 0) as total_due
           FROM fee_vouchers v
           JOIN fee_voucher_items vi ON v.id = vi.voucher_id
           LEFT JOIN (
             SELECT voucher_id, SUM(amount) as amount FROM fee_payments GROUP BY voucher_id
           ) p ON v.id = p.voucher_id
           JOIN student_class_history sch ON v.student_class_history_id = sch.id
           WHERE sch.student_id = $1`,
          [id]
        );

        const totalDue = parseFloat(arrearsResult.rows[0].total_due) || 0;
        if (totalDue > 0) {
          await client.query('ROLLBACK');
          return ApiResponse.error(
            res,
            `Cannot promote student with outstanding dues of ${totalDue}. Use force=true to override.`,
            400,
            { due_amount: totalDue }
          );
        }
      }

      // Get current enrollment
      const activeEnrollment = await client.query(
        `SELECT sch.*, c.id as current_class_id 
         FROM student_class_history sch
         JOIN classes c ON sch.class_id = c.id
         WHERE sch.student_id = $1 AND sch.end_date IS NULL`,
        [id]
      );

      if (activeEnrollment.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Student has no active enrollment to promote from', 400);
      }

      const currentClassId = activeEnrollment.rows[0].current_class_id;
      const promotionDateValue = promotion_date ? new Date(promotion_date) : new Date();

      // Close current class session
      await client.query(
        'UPDATE student_class_history SET end_date = $1 WHERE id = $2',
        [promotionDateValue, activeEnrollment.rows[0].id]
      );

      // Validate new class and section
      const classCheck = await client.query(
        'SELECT id, is_active FROM classes WHERE id = $1',
        [class_id]
      );

      if (classCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Class not found', 404);
      }

      if (!classCheck.rows[0].is_active) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Cannot promote to inactive class', 400);
      }

      const sectionCheck = await client.query(
        'SELECT id FROM sections WHERE id = $1 AND class_id = $2',
        [section_id, class_id]
      );

      if (sectionCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(
          res,
          'Section not found or does not belong to the specified class',
          404
        );
      }

      // Create new enrollment
      await client.query(
        `INSERT INTO student_class_history 
         (student_id, class_id, section_id, start_date) 
         VALUES ($1, $2, $3, $4)`,
        [id, class_id, section_id, promotionDateValue]
      );

      // Handle discount reset if requested
      if (reset_discount) {
        await client.query(
          'DELETE FROM student_discounts WHERE student_id = $1 AND class_id = $2',
          [id, currentClassId]
        );
      }

      await client.query('COMMIT');

      const updatedStudent = await this.getStudentById(client, id);

      return ApiResponse.success(res, updatedStudent, 'Student promoted successfully. Note: Generate the first voucher for the new class to apply promotion/admission fees.');
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Bulk create students with flexible field support
   * POST /api/students/bulk
   * 
   * Accepts CSV with 3 header rows (automatically skipped by frontend)
   * Core Required fields: Name, Father Name
   * Optional fields: Sr No, Contact No, Fee, and any other custom fields
   */
  async bulkCreate(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      console.log('📥 Received bulk create request:', {
        body: req.body,
        keys: Object.keys(req.body),
        bodyType: typeof req.body
      })

      // Handle both formats: {students: [...]} and direct array [...]
      let students = req.body;
      if (req.body && req.body.students && Array.isArray(req.body.students)) {
        students = req.body.students;
      }

      console.log('📊 Processing students:', {
        isArray: Array.isArray(students),
        count: Array.isArray(students) ? students.length : 0,
        firstStudent: Array.isArray(students) && students.length > 0 ? students[0] : null
      })

      // Validate input
      if (!Array.isArray(students) || students.length === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Invalid input: expected array of students', 400);
      }

      if (students.length > 1000) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Too many students: maximum 1000 allowed per batch', 400);
      }

      // Flexible validation - accept CSV format with new core fields
      const schema = Joi.object({
        // Core fields from CSV
        srNo: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow('', null),
        name: Joi.string().required(), // Required
        fatherName: Joi.string().required(), // Required
        contactNo: Joi.string().optional().allow('', null),
        fee: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow('', null),
        
        // System fields
        classId: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow('', null),
        sectionId: Joi.alternatives().try(Joi.number(), Joi.string()).optional().allow('', null),
        
        // Legacy/optional fields for compatibility
        firstName: Joi.string().optional().allow('', null),
        lastName: Joi.string().optional().allow('', null),
        email: Joi.string().optional().allow('', null),
        phone: Joi.string().optional().allow('', null),
        rollNumber: Joi.string().optional().allow('', null),
        address: Joi.string().optional().allow('', null),
        dateOfBirth: Joi.alternatives().try(Joi.date(), Joi.string()).optional().allow('', null),
        
        // Raw data and other fields
        otherFields: Joi.string().optional().allow('', null),
        _rawData: Joi.object().optional().unknown(true),
        id: Joi.number().optional(), // Internal ID for grid
        
        // Allow any additional fields without validation
      }).unknown(true);

      const validatedStudents = [];
      const errors = [];
      const warnings = [];

      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        const { error, value } = schema.validate(student, { stripUnknown: false });
        
        if (error) {
          errors.push({
            row: i + 1,
            errors: error.details.map(d => d.message)
          });
          continue;
        }

        // Build student name - REQUIRED
        let studentName = value.name || '';
        if (!studentName && (value.firstName || value.lastName)) {
          studentName = `${value.firstName || ''} ${value.lastName || ''}`.trim();
        }
        
        if (!studentName) {
          errors.push({
            row: i + 1,
            errors: ['Name is required']
          });
          continue;
        }

        // Father name - REQUIRED
        const fatherName = value.fatherName || '';
        if (!fatherName) {
          errors.push({
            row: i + 1,
            errors: ['Father Name is required']
          });
          continue;
        }

        // Use provided class/section or defaults
        const classId = parseInt(value.classId) || 1; // Default class
        const sectionId = parseInt(value.sectionId) || 1; // Default section

        // Generate roll number from Sr No or auto-generate
        let rollNo = value.rollNumber || value.srNo || null;
        if (!rollNo) {
          rollNo = `STD-${Date.now()}-${i}`; // Auto-generation
          warnings.push({
            row: i + 1,
            message: 'Roll number auto-generated from Sr No'
          });
        }

        // Extract phone from contactNo or phone field
        const phone = value.contactNo || value.phone || null;

        // Parse raw data for additional fields
        let additionalFields = {};
        if (value._rawData) {
          additionalFields = { ...value._rawData };
        }
        if (value.otherFields) {
          try {
            const parsed = JSON.parse(value.otherFields);
            additionalFields = { ...additionalFields, ...parsed };
          } catch (e) {
            // Ignore parse errors
          }
        }

        validatedStudents.push({
          name: studentName,
          father_name: fatherName,
          roll_no: String(rollNo),
          phone: phone,
          email: value.email || null,
          address: value.address || null,
          class_id: classId,
          section_id: sectionId,
          date_of_birth: value.dateOfBirth || null,
          fee: value.fee || null,
          admission_date: value.admissionDate || new Date(),
          // Store any additional fields as JSON
          additional_info: Object.keys(additionalFields).length > 0 
            ? JSON.stringify(additionalFields) 
            : null
        });
      }

      if (errors.length > 0) {
        await client.query('ROLLBACK');
        return ApiResponse.error(res, 'Validation failed', 400, { 
          validationErrors: errors,
          warnings: warnings
        });
      }

      // Skip all duplicate checks and validations - just proceed
      console.log('📝 Proceeding with validation-free import of', validatedStudents.length, 'students');
      
      // Use first student's class/section or defaults
      const targetClassId = validatedStudents[0].class_id || 1;
      const targetSectionId = validatedStudents[0].section_id || 1;

      // Auto-generate unique roll numbers for all students
      // Insert all students without validation - duplicates allowed
      const insertedStudents = [];

      for (let i = 0; i < validatedStudents.length; i++) {
        const student = validatedStudents[i];
        
        // Auto-generate roll_no if not provided
        if (!student.roll_no) {
          student.roll_no = `AUTO-${Date.now()}-${i}`;
        }

        const insertResult = await client.query(
          `INSERT INTO students (
            name, roll_no, phone, address, email, father_name,
            date_of_birth, bay_form, caste, previous_school, is_bulk_imported
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
          RETURNING id, name, roll_no, email, father_name`,
          [
            student.name,
            student.roll_no,
            student.phone,
            student.address,
            student.email,
            student.father_name,
            student.date_of_birth,
            student.bay_form,
            student.caste,
            student.previous_school
          ]
        );

        const newStudent = insertResult.rows[0];
        insertedStudents.push(newStudent);

        // Enroll in the target class
        await client.query(
          `INSERT INTO student_class_history (student_id, class_id, section_id, start_date)
           VALUES ($1, $2, $3, $4)`,
          [newStudent.id, targetClassId, targetSectionId, student.admission_date || new Date()]
        );
      }

      await client.query('COMMIT');
      
      return ApiResponse.success(res, {
        successCount: insertedStudents.length,
        students: insertedStudents,
        classId: targetClassId,
        sectionId: targetSectionId,
        warnings: warnings.length > 0 ? warnings : undefined
      }, `Successfully imported ${insertedStudents.length} student(s)`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Bulk import error:', error);
      next(error);
    } finally {
      client.release();
    }
  }

  /**
   * Bulk deactivate all students (clear admission list)
   * POST /api/students/bulk-deactivate
   */
  async bulkDeactivate(req, res, next) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get count of currently active students
      const countResult = await client.query(
        'SELECT COUNT(*) as count FROM students WHERE is_active = true'
      );
      const activeCount = parseInt(countResult.rows[0].count);

      if (activeCount === 0) {
        await client.query('ROLLBACK');
        return ApiResponse.success(res, {
          deactivatedCount: 0,
          message: 'No active students found to deactivate'
        }, 'No students were deactivated');
      }

      // Deactivate all active students
      const result = await client.query(
        `UPDATE students 
         SET is_active = false
         WHERE is_active = true 
         RETURNING id, name`
      );

      await client.query('COMMIT');

      return ApiResponse.success(res, {
        deactivatedCount: result.rows.length,
        deactivatedStudents: result.rows
      }, `Successfully deactivated ${result.rows.length} student(s) from admission list`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Bulk deactivate error:', error);
      next(error);
    } finally {
      client.release();
    }
  }
}

module.exports = new StudentsController();
