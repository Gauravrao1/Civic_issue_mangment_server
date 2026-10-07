const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Department, IssueCategory, User, Issue } = require('../models');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/departments
// @desc    Get all departments
// @access  Private
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().trim().isLength({ max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const {
      page = 1,
      limit = 20,
      search,
      sortBy = 'name',
      sortOrder = 'ASC'
    } = req.query;

    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = { isActive: true };
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: departments } = await Department.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: IssueCategory,
          as: 'categories',
          where: { isActive: true },
          required: false,
          attributes: ['id', 'name', 'priority']
        },
        {
          model: User,
          as: 'users',
          where: { isActive: true },
          required: false,
          attributes: ['id', 'firstName', 'lastName', 'role']
        }
      ],
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        departments,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(count / limit),
          totalItems: count,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch departments'
    });
  }
});

// @route   GET /api/departments/:id
// @desc    Get single department by ID
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const department = await Department.findByPk(req.params.id, {
      include: [
        {
          model: IssueCategory,
          as: 'categories',
          where: { isActive: true },
          required: false
        },
        {
          model: User,
          as: 'users',
          where: { isActive: true },
          required: false,
          attributes: { exclude: ['password'] }
        }
      ]
    });

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    res.json({
      success: true,
      data: { department }
    });
  } catch (error) {
    console.error('Get department error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch department'
    });
  }
});

// @route   POST /api/departments
// @desc    Create new department
// @access  Private (admin only)
router.post('/', requireRole(['admin']), [
  body('name').trim().notEmpty().isLength({ min: 2, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('contactEmail').optional().isEmail().normalizeEmail(),
  body('contactPhone').optional().trim().isLength({ max: 20 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { name, description, contactEmail, contactPhone } = req.body;

    // Check if department already exists
    const existingDepartment = await Department.findOne({ where: { name } });
    if (existingDepartment) {
      return res.status(400).json({
        success: false,
        message: 'Department with this name already exists'
      });
    }

    const department = await Department.create({
      name,
      description,
      contactEmail,
      contactPhone
    });

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: { department }
    });
  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create department'
    });
  }
});

// @route   PUT /api/departments/:id
// @desc    Update department
// @access  Private (admin only)
router.put('/:id', requireRole(['admin']), [
  body('name').optional().trim().notEmpty().isLength({ min: 2, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('contactEmail').optional().isEmail().normalizeEmail(),
  body('contactPhone').optional().trim().isLength({ max: 20 }),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const department = await Department.findByPk(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    const updateData = req.body;

    // Check if name is already taken by another department
    if (updateData.name) {
      const existingDepartment = await Department.findOne({
        where: {
          name: updateData.name,
          id: { [Op.ne]: department.id }
        }
      });
      if (existingDepartment) {
        return res.status(400).json({
          success: false,
          message: 'Department with this name already exists'
        });
      }
    }

    await department.update(updateData);

    res.json({
      success: true,
      message: 'Department updated successfully',
      data: { department }
    });
  } catch (error) {
    console.error('Update department error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update department'
    });
  }
});

// @route   DELETE /api/departments/:id
// @desc    Deactivate department (soft delete)
// @access  Private (admin only)
router.delete('/:id', requireRole(['admin']), async (req, res) => {
  try {
    const department = await Department.findByPk(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    // Check if department has active users
    const activeUsers = await User.count({
      where: {
        departmentId: department.id,
        isActive: true
      }
    });

    if (activeUsers > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate department with active users'
      });
    }

    // Check if department has active categories
    const activeCategories = await IssueCategory.count({
      where: {
        departmentId: department.id,
        isActive: true
      }
    });

    if (activeCategories > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate department with active categories'
      });
    }

    await department.update({ isActive: false });

    res.json({
      success: true,
      message: 'Department deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate department error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate department'
    });
  }
});

// @route   GET /api/departments/:id/categories
// @desc    Get categories for a department
// @access  Private
router.get('/:id/categories', async (req, res) => {
  try {
    const department = await Department.findByPk(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    const categories = await IssueCategory.findAll({
      where: {
        departmentId: department.id,
        isActive: true
      },
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: { categories }
    });
  } catch (error) {
    console.error('Get department categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch department categories'
    });
  }
});

// @route   POST /api/departments/:id/categories
// @desc    Create category for a department
// @access  Private (admin and department heads)
router.post('/:id/categories', requireRole(['admin', 'department_head']), [
  body('name').trim().notEmpty().isLength({ min: 2, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
  body('estimatedResolutionDays').optional().isInt({ min: 1, max: 365 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const department = await Department.findByPk(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    // Check permissions for department heads
    if (req.user.role === 'department_head' && req.user.departmentId !== department.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const { name, description, priority = 'medium', estimatedResolutionDays = 7 } = req.body;

    // Check if category already exists in this department
    const existingCategory = await IssueCategory.findOne({
      where: { name, departmentId: department.id }
    });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category with this name already exists in this department'
      });
    }

    const category = await IssueCategory.create({
      name,
      description,
      departmentId: department.id,
      priority,
      estimatedResolutionDays
    });

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: { category }
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create category'
    });
  }
});

// @route   GET /api/departments/:id/stats
// @desc    Get department statistics
// @access  Private
router.get('/:id/stats', async (req, res) => {
  try {
    const department = await Department.findByPk(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    // Check permissions
    const canViewStats = req.user.role === 'admin' ||
                        (req.user.role === 'department_head' && req.user.departmentId === department.id);

    if (!canViewStats) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const totalUsers = await User.count({
      where: {
        departmentId: department.id,
        isActive: true
      }
    });

    const totalCategories = await IssueCategory.count({
      where: {
        departmentId: department.id,
        isActive: true
      }
    });

    const totalIssues = await Issue.count({
      include: [{
        model: IssueCategory,
        as: 'category',
        where: { departmentId: department.id }
      }]
    });

    const issuesByStatus = await Issue.findAll({
      include: [{
        model: IssueCategory,
        as: 'category',
        where: { departmentId: department.id },
        attributes: []
      }],
      attributes: [
        'status',
        [require('sequelize').fn('COUNT', require('sequelize').col('Issue.id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    const recentIssues = await Issue.findAll({
      include: [{
        model: IssueCategory,
        as: 'category',
        where: { departmentId: department.id }
      }],
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    res.json({
      success: true,
      data: {
        totalUsers,
        totalCategories,
        totalIssues,
        issuesByStatus,
        recentIssues
      }
    });
  } catch (error) {
    console.error('Get department stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch department statistics'
    });
  }
});

module.exports = router;
