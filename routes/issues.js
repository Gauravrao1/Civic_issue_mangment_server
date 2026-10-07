const express = require('express');
const multer = require('multer');
const path = require('path');
const { body, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const fs = require('fs');
const { 
  Issue, 
  IssueCategory, 
  Department, 
  User, 
  IssueComment, 
  IssueStatusHistory,
  Notification 
} = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDirectory = process.env.UPLOAD_PATH
      ? path.resolve(process.env.UPLOAD_PATH)
      : process.env.VERCEL
        ? path.join('/tmp', 'civic-portal-uploads')
        : path.join(__dirname, '../uploads');
    const issueUploadDirectory = path.join(uploadDirectory, 'issues');
    fs.mkdirSync(issueUploadDirectory, { recursive: true });
    cb(null, issueUploadDirectory);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Helper function to create status history
const createStatusHistory = async (issueId, fromStatus, toStatus, changedBy, notes = null) => {
  await IssueStatusHistory.create({
    issueId,
    fromStatus,
    toStatus,
    changedBy,
    notes
  });
};

// Helper function to send notifications
const sendNotification = async (type, title, message, userId, issueId, metadata = {}) => {
  await Notification.create({
    type,
    title,
    message,
    userId,
    issueId,
    sentVia: ['in_app'],
    metadata
  });
};

// @route   POST /api/issues
// @desc    Create a new issue (citizen submission)
// @access  Public
router.post('/', [
  body('title').trim().notEmpty().isLength({ min: 5, max: 200 }),
  body('description').trim().notEmpty().isLength({ min: 10, max: 2000 }),
  body('categoryId').isUUID(),
  body('citizenName').optional().trim().isLength({ max: 100 }),
  body('citizenEmail').optional().isEmail().normalizeEmail(),
  body('citizenPhone').optional().trim().isLength({ max: 20 }),
  body('location').isObject(),
  body('location.latitude').isFloat({ min: -90, max: 90 }),
  body('location.longitude').isFloat({ min: -180, max: 180 }),
  body('location.address').optional().trim().isLength({ max: 500 }),
  body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
  body('source').optional().isIn(['web', 'mobile', 'sms', 'voice', 'api'])
], upload.array('images', 5), async (req, res) => {
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
      title,
      description,
      categoryId,
      citizenName,
      citizenEmail,
      citizenPhone,
      location,
      priority = 'medium',
      source = 'web',
      externalId
    } = req.body;

    // Verify category exists
    const category = await IssueCategory.findByPk(categoryId, {
      include: ['department']
    });

    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category'
      });
    }

    // Process uploaded images
    const images = req.files ? req.files.map(file => file.filename) : [];

    // Create issue
    const issue = await Issue.create({
      title,
      description,
      categoryId,
      citizenName,
      citizenEmail,
      citizenPhone,
      location,
      images,
      priority,
      source,
      externalId,
      estimatedResolutionDate: new Date(Date.now() + category.estimatedResolutionDays * 24 * 60 * 60 * 1000)
    });

    // Create initial status history
    await createStatusHistory(issue.id, null, 'new', null, 'Issue created');

    // Send notification to department head
    if (category.department) {
      const departmentHead = await User.findOne({
        where: {
          departmentId: category.departmentId,
          role: 'department_head',
          isActive: true
        }
      });

      if (departmentHead) {
        await sendNotification(
          'issue_created',
          'New Issue Reported',
          `A new ${category.name} issue has been reported in your department.`,
          departmentHead.id,
          issue.id,
          { categoryName: category.name, priority }
        );
      }
    }

    // Get full issue data with relations
    const fullIssue = await Issue.findByPk(issue.id, {
      include: [
        {
          model: IssueCategory,
          as: 'category',
          include: ['department']
        }
      ]
    });

    res.status(201).json({
      success: true,
      message: 'Issue reported successfully',
      data: { issue: fullIssue }
    });
  } catch (error) {
    console.error('Create issue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create issue'
    });
  }
});

// @route   GET /api/issues
// @desc    Get all issues with filtering and pagination
// @access  Private
router.get('/', authenticateToken, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['new', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected']),
  query('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
  query('categoryId').optional().isUUID(),
  query('departmentId').optional().isUUID(),
  query('assignedTo').optional().isUUID(),
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
      status,
      priority,
      categoryId,
      departmentId,
      assignedTo,
      search,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;

    // Build where clause
    const whereClause = {};
    if (status) whereClause.status = status;
    if (priority) whereClause.priority = priority;
    if (categoryId) whereClause.categoryId = categoryId;
    if (assignedTo) whereClause.assignedTo = assignedTo;

    // Add search functionality
    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { citizenName: { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Build include clause
    const includeClause = [
      {
        model: IssueCategory,
        as: 'category',
        include: [{
          model: Department,
          as: 'department'
        }]
      },
      {
        model: User,
        as: 'assignedUser',
        attributes: ['id', 'firstName', 'lastName', 'email', 'role']
      }
    ];

    // Filter by department if user is not admin
    if (req.user.role !== 'admin' && req.user.departmentId) {
      includeClause[0].where = { departmentId: req.user.departmentId };
    }

    if (departmentId) {
      includeClause[0].where = { departmentId };
    }

    const { count, rows: issues } = await Issue.findAndCountAll({
      where: whereClause,
      include: includeClause,
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        issues,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(count / limit),
          totalItems: count,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get issues error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch issues'
    });
  }
});

// @route   GET /api/issues/:id
// @desc    Get single issue by ID
// @access  Private
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const issue = await Issue.findByPk(req.params.id, {
      include: [
        {
          model: IssueCategory,
          as: 'category',
          include: ['department']
        },
        {
          model: User,
          as: 'assignedUser',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role']
        },
        {
          model: IssueComment,
          as: 'comments',
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'firstName', 'lastName', 'role']
          }],
          order: [['createdAt', 'ASC']]
        },
        {
          model: IssueStatusHistory,
          as: 'statusHistory',
          include: [{
            model: User,
            as: 'changedByUser',
            attributes: ['id', 'firstName', 'lastName', 'role']
          }],
          order: [['createdAt', 'ASC']]
        }
      ]
    });

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }

    // Check if user has access to this issue
    if (req.user.role !== 'admin' && 
        req.user.departmentId !== issue.category.departmentId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: { issue }
    });
  } catch (error) {
    console.error('Get issue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch issue'
    });
  }
});

// @route   PUT /api/issues/:id/assign
// @desc    Assign issue to a user
// @access  Private (staff and above)
router.put('/:id/assign', authenticateToken, requireRole(['admin', 'department_head', 'staff']), [
  body('assignedTo').isUUID(),
  body('notes').optional().trim().isLength({ max: 500 })
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

    const { assignedTo, notes } = req.body;

    const issue = await Issue.findByPk(req.params.id, {
      include: ['category']
    });

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }

    // Check if user has permission to assign this issue
    if (req.user.role !== 'admin' && 
        req.user.departmentId !== issue.category.departmentId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Verify assigned user exists and is active
    const assignedUser = await User.findByPk(assignedTo);
    if (!assignedUser || !assignedUser.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user assignment'
      });
    }

    const previousStatus = issue.status;
    const newStatus = 'assigned';

    // Update issue
    await issue.update({
      assignedTo,
      status: newStatus,
      assignedAt: new Date()
    });

    // Create status history
    await createStatusHistory(issue.id, previousStatus, newStatus, req.user.id, notes);

    // Send notification to assigned user
    await sendNotification(
      'issue_assigned',
      'Issue Assigned to You',
      `You have been assigned a new issue: ${issue.title}`,
      assignedTo,
      issue.id,
      { assignedBy: req.user.firstName + ' ' + req.user.lastName }
    );

    res.json({
      success: true,
      message: 'Issue assigned successfully'
    });
  } catch (error) {
    console.error('Assign issue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign issue'
    });
  }
});

// @route   PUT /api/issues/:id/status
// @desc    Update issue status
// @access  Private
router.put('/:id/status', authenticateToken, [
  body('status').isIn(['new', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected']),
  body('notes').optional().trim().isLength({ max: 500 })
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

    const { status, notes } = req.body;

    const issue = await Issue.findByPk(req.params.id, {
      include: ['category']
    });

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }

    // Check permissions
    const canUpdateStatus = req.user.role === 'admin' || 
                           req.user.id === issue.assignedTo ||
                           (req.user.role === 'department_head' && 
                            req.user.departmentId === issue.category.departmentId);

    if (!canUpdateStatus) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const previousStatus = issue.status;
    const updateData = { status };

    // Set resolved date if status is resolved
    if (status === 'resolved' && previousStatus !== 'resolved') {
      updateData.resolvedAt = new Date();
    }

    // Update issue
    await issue.update(updateData);

    // Create status history
    await createStatusHistory(issue.id, previousStatus, status, req.user.id, notes);

    // Send notifications
    if (status === 'resolved' && issue.citizenEmail) {
      await sendNotification(
        'issue_resolved',
        'Issue Resolved',
        `Your reported issue "${issue.title}" has been resolved.`,
        null, // No specific user, will be sent via email
        issue.id,
        { citizenEmail: issue.citizenEmail }
      );
    }

    res.json({
      success: true,
      message: 'Issue status updated successfully'
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update issue status'
    });
  }
});

// @route   POST /api/issues/:id/comments
// @desc    Add comment to issue
// @access  Private
router.post('/:id/comments', authenticateToken, [
  body('comment').trim().notEmpty().isLength({ max: 1000 }),
  body('isInternal').optional().isBoolean()
], upload.array('attachments', 3), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { comment, isInternal = false } = req.body;

    const issue = await Issue.findByPk(req.params.id, {
      include: ['category']
    });

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }

    // Check permissions
    const canComment = req.user.role === 'admin' || 
                      req.user.id === issue.assignedTo ||
                      (req.user.role === 'department_head' && 
                       req.user.departmentId === issue.category.departmentId);

    if (!canComment) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Process uploaded attachments
    const attachments = req.files ? req.files.map(file => file.filename) : [];

    // Create comment
    const issueComment = await IssueComment.create({
      issueId: issue.id,
      userId: req.user.id,
      comment,
      isInternal,
      attachments
    });

    // Get comment with user info
    const fullComment = await IssueComment.findByPk(issueComment.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName', 'role']
      }]
    });

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: { comment: fullComment }
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add comment'
    });
  }
});

// @route   PUT /api/issues/:id/resolution
// @desc    Add resolution details to issue
// @access  Private
router.put('/:id/resolution', authenticateToken, [
  body('resolutionNotes').trim().notEmpty().isLength({ max: 1000 })
], upload.array('resolutionImages', 5), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { resolutionNotes } = req.body;

    const issue = await Issue.findByPk(req.params.id);

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }

    // Check permissions
    const canResolve = req.user.role === 'admin' || 
                      req.user.id === issue.assignedTo ||
                      req.user.role === 'department_head';

    if (!canResolve) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Process uploaded resolution images
    const resolutionImages = req.files ? req.files.map(file => file.filename) : [];

    // Update issue
    await issue.update({
      resolutionNotes,
      resolutionImages,
      status: 'resolved',
      resolvedAt: new Date()
    });

    // Create status history
    await createStatusHistory(issue.id, issue.status, 'resolved', req.user.id, 'Issue resolved');

    res.json({
      success: true,
      message: 'Resolution details added successfully'
    });
  } catch (error) {
    console.error('Add resolution error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add resolution details'
    });
  }
});

module.exports = router;
