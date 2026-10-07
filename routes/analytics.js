const express = require('express');
const { query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Issue, IssueCategory, Department, User } = require('../models');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/analytics/overview
// @desc    Get analytics overview dashboard
// @access  Private
router.get('/overview', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter[Op.gte] = new Date(startDate);
    if (endDate) dateFilter[Op.lte] = new Date(endDate);

    const whereClause = {};
    if (Object.keys(dateFilter).length > 0) {
      whereClause.createdAt = dateFilter;
    }

    // Filter by department if user is department head
    let departmentFilter = {};
    if (req.user.role === 'department_head' && req.user.departmentId) {
      departmentFilter = {
        model: IssueCategory,
        as: 'category',
        where: { departmentId: req.user.departmentId }
      };
    }

    // Total issues
    const totalIssues = await Issue.count({
      where: whereClause,
      include: departmentFilter
    });

    // Issues by status
    const issuesByStatus = await Issue.findAll({
      where: whereClause,
      include: departmentFilter,
      attributes: [
        'status',
        [require('sequelize').fn('COUNT', require('sequelize').col('Issue.id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // Issues by priority
    const issuesByPriority = await Issue.findAll({
      where: whereClause,
      include: departmentFilter,
      attributes: [
        'priority',
        [require('sequelize').fn('COUNT', require('sequelize').col('Issue.id')), 'count']
      ],
      group: ['priority'],
      raw: true
    });

    // Issues by category
    const issuesByCategory = await Issue.findAll({
      where: whereClause,
      include: [{
        model: IssueCategory,
        as: 'category',
        attributes: ['name'],
        ...(req.user.role === 'department_head' && req.user.departmentId ? 
          { where: { departmentId: req.user.departmentId } } : {})
      }],
      attributes: [
        [require('sequelize').fn('COUNT', require('sequelize').col('Issue.id')), 'count']
      ],
      group: ['category.name'],
      raw: true
    });

    // Recent issues
    const recentIssues = await Issue.findAll({
      where: whereClause,
      include: [
        {
          model: IssueCategory,
          as: 'category',
          include: ['department'],
          ...(req.user.role === 'department_head' && req.user.departmentId ? 
            { where: { departmentId: req.user.departmentId } } : {})
        },
        {
          model: User,
          as: 'assignedUser',
          attributes: ['firstName', 'lastName']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    // Resolution time statistics
    const resolvedIssues = await Issue.findAll({
      where: {
        ...whereClause,
        status: 'resolved',
        resolvedAt: { [Op.ne]: null }
      },
      include: departmentFilter,
      attributes: [
        [require('sequelize').fn('AVG', 
          require('sequelize').fn('EXTRACT', 'EPOCH', 
            require('sequelize').fn('AGE', 
              require('sequelize').col('resolvedAt'), 
              require('sequelize').col('createdAt')
            )
          )
        ), 'avgResolutionTime']
      ],
      raw: true
    });

    const avgResolutionTime = resolvedIssues[0]?.avgResolutionTime || 0;

    res.json({
      success: true,
      data: {
        totalIssues,
        issuesByStatus,
        issuesByPriority,
        issuesByCategory,
        recentIssues,
        avgResolutionTime: Math.round(avgResolutionTime / 3600) // Convert to hours
      }
    });
  } catch (error) {
    console.error('Get analytics overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics overview'
    });
  }
});

// @route   GET /api/analytics/trends
// @desc    Get issue trends over time
// @access  Private
router.get('/trends', [
  query('period').optional().isIn(['day', 'week', 'month']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
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

    const { period = 'day', startDate, endDate } = req.query;

    // Default date range (last 30 days)
    const defaultEndDate = new Date();
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);

    const start = startDate ? new Date(startDate) : defaultStartDate;
    const end = endDate ? new Date(endDate) : defaultEndDate;

    // Build department filter
    let departmentFilter = {};
    if (req.user.role === 'department_head' && req.user.departmentId) {
      departmentFilter = {
        model: IssueCategory,
        as: 'category',
        where: { departmentId: req.user.departmentId }
      };
    }

    // Determine date grouping based on period
    let dateFormat;
    switch (period) {
      case 'day':
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'week':
        dateFormat = 'YYYY-"W"WW';
        break;
      case 'month':
        dateFormat = 'YYYY-MM';
        break;
      default:
        dateFormat = 'YYYY-MM-DD';
    }

    // Issues created over time
    const issuesCreated = await Issue.findAll({
      where: {
        createdAt: {
          [Op.between]: [start, end]
        }
      },
      include: departmentFilter,
      attributes: [
        [require('sequelize').fn('DATE_TRUNC', period, require('sequelize').col('createdAt')), 'date'],
        [require('sequelize').fn('COUNT', require('sequelize').col('Issue.id')), 'count']
      ],
      group: [require('sequelize').fn('DATE_TRUNC', period, require('sequelize').col('createdAt'))],
      order: [[require('sequelize').fn('DATE_TRUNC', period, require('sequelize').col('createdAt')), 'ASC']],
      raw: true
    });

    // Issues resolved over time
    const issuesResolved = await Issue.findAll({
      where: {
        resolvedAt: {
          [Op.between]: [start, end]
        }
      },
      include: departmentFilter,
      attributes: [
        [require('sequelize').fn('DATE_TRUNC', period, require('sequelize').col('resolvedAt')), 'date'],
        [require('sequelize').fn('COUNT', require('sequelize').col('Issue.id')), 'count']
      ],
      group: [require('sequelize').fn('DATE_TRUNC', period, require('sequelize').col('resolvedAt'))],
      order: [[require('sequelize').fn('DATE_TRUNC', period, require('sequelize').col('resolvedAt')), 'ASC']],
      raw: true
    });

    res.json({
      success: true,
      data: {
        period,
        startDate: start,
        endDate: end,
        issuesCreated,
        issuesResolved
      }
    });
  } catch (error) {
    console.error('Get trends error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trends data'
    });
  }
});

// @route   GET /api/analytics/heatmap
// @desc    Get issue heatmap data by location
// @access  Private
router.get('/heatmap', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('categoryId').optional().isUUID()
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

    const { startDate, endDate, categoryId } = req.query;

    // Build where clause
    const whereClause = {};
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) whereClause.createdAt[Op.gte] = new Date(startDate);
      if (endDate) whereClause.createdAt[Op.lte] = new Date(endDate);
    }

    // Build include clause
    const includeClause = [{
      model: IssueCategory,
      as: 'category',
      include: ['department']
    }];

    // Filter by department if user is department head
    if (req.user.role === 'department_head' && req.user.departmentId) {
      includeClause[0].where = { departmentId: req.user.departmentId };
    }

    // Filter by category if specified
    if (categoryId) {
      whereClause.categoryId = categoryId;
    }

    const issues = await Issue.findAll({
      where: whereClause,
      include: includeClause,
      attributes: ['id', 'title', 'location', 'priority', 'status', 'createdAt']
    });

    // Process location data for heatmap
    const heatmapData = issues.map(issue => ({
      id: issue.id,
      title: issue.title,
      latitude: issue.location.latitude,
      longitude: issue.location.longitude,
      address: issue.location.address,
      priority: issue.priority,
      status: issue.status,
      category: issue.category.name,
      department: issue.category.department.name,
      createdAt: issue.createdAt
    }));

    res.json({
      success: true,
      data: {
        heatmapData,
        totalIssues: issues.length
      }
    });
  } catch (error) {
    console.error('Get heatmap error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch heatmap data'
    });
  }
});

// @route   GET /api/analytics/performance
// @desc    Get performance metrics
// @access  Private
router.get('/performance', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
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

    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter[Op.gte] = new Date(startDate);
    if (endDate) dateFilter[Op.lte] = new Date(endDate);

    const whereClause = {};
    if (Object.keys(dateFilter).length > 0) {
      whereClause.createdAt = dateFilter;
    }

    // Build department filter
    let departmentFilter = {};
    if (req.user.role === 'department_head' && req.user.departmentId) {
      departmentFilter = {
        model: IssueCategory,
        as: 'category',
        where: { departmentId: req.user.departmentId }
      };
    }

    // Resolution time by category
    const resolutionTimeByCategory = await Issue.findAll({
      where: {
        ...whereClause,
        status: 'resolved',
        resolvedAt: { [Op.ne]: null }
      },
      include: [{
        model: IssueCategory,
        as: 'category',
        attributes: ['name'],
        ...(req.user.role === 'department_head' && req.user.departmentId ? 
          { where: { departmentId: req.user.departmentId } } : {})
      }],
      attributes: [
        [require('sequelize').fn('AVG', 
          require('sequelize').fn('EXTRACT', 'EPOCH', 
            require('sequelize').fn('AGE', 
              require('sequelize').col('resolvedAt'), 
              require('sequelize').col('createdAt')
            )
          )
        ), 'avgResolutionTime'],
        [require('sequelize').fn('COUNT', require('sequelize').col('Issue.id')), 'totalResolved']
      ],
      group: ['category.name'],
      raw: true
    });

    // Performance by assigned user
    const performanceByUser = await Issue.findAll({
      where: {
        ...whereClause,
        assignedTo: { [Op.ne]: null }
      },
      include: [
        {
          model: User,
          as: 'assignedUser',
          attributes: ['firstName', 'lastName']
        },
        departmentFilter
      ],
      attributes: [
        'assignedTo',
        [require('sequelize').fn('COUNT', require('sequelize').col('Issue.id')), 'totalAssigned'],
        [require('sequelize').fn('COUNT', 
          require('sequelize').fn('CASE', 
            { when: { status: 'resolved' }, then: 1 }
          )
        ), 'totalResolved'],
        [require('sequelize').fn('AVG', 
          require('sequelize').fn('EXTRACT', 'EPOCH', 
            require('sequelize').fn('AGE', 
              require('sequelize').col('resolvedAt'), 
              require('sequelize').col('createdAt')
            )
          )
        ), 'avgResolutionTime']
      ],
      group: ['assignedTo', 'assignedUser.firstName', 'assignedUser.lastName'],
      raw: true
    });

    // SLA compliance
    const slaCompliance = await Issue.findAll({
      where: {
        ...whereClause,
        status: 'resolved',
        resolvedAt: { [Op.ne]: null }
      },
      include: [
        {
          model: IssueCategory,
          as: 'category',
          ...(req.user.role === 'department_head' && req.user.departmentId ? 
            { where: { departmentId: req.user.departmentId } } : {})
        }
      ],
      attributes: [
        [require('sequelize').fn('COUNT', 
          require('sequelize').fn('CASE', 
            { 
              when: { 
                [Op.and]: [
                  require('sequelize').fn('EXTRACT', 'EPOCH', 
                    require('sequelize').fn('AGE', 
                      require('sequelize').col('resolvedAt'), 
                      require('sequelize').col('createdAt')
                    )
                  ),
                  { [Op.lte]: require('sequelize').col('category.estimatedResolutionDays') * 24 * 60 * 60 }
                ]
              }, 
              then: 1 
            }
          )
        ), 'onTimeResolved'],
        [require('sequelize').fn('COUNT', require('sequelize').col('Issue.id')), 'totalResolved']
      ],
      raw: true
    });

    const onTimeResolved = slaCompliance[0]?.onTimeResolved || 0;
    const totalResolved = slaCompliance[0]?.totalResolved || 0;
    const slaComplianceRate = totalResolved > 0 ? (onTimeResolved / totalResolved) * 100 : 0;

    res.json({
      success: true,
      data: {
        resolutionTimeByCategory: resolutionTimeByCategory.map(item => ({
          ...item,
          avgResolutionTime: Math.round(item.avgResolutionTime / 3600) // Convert to hours
        })),
        performanceByUser: performanceByUser.map(item => ({
          ...item,
          avgResolutionTime: item.avgResolutionTime ? Math.round(item.avgResolutionTime / 3600) : null,
          resolutionRate: item.totalAssigned > 0 ? (item.totalResolved / item.totalAssigned) * 100 : 0
        })),
        slaComplianceRate: Math.round(slaComplianceRate * 100) / 100
      }
    });
  } catch (error) {
    console.error('Get performance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch performance data'
    });
  }
});

// @route   GET /api/analytics/reports
// @desc    Generate reports
// @access  Private
router.get('/reports', [
  query('type').isIn(['summary', 'detailed', 'department', 'category']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('departmentId').optional().isUUID(),
  query('categoryId').optional().isUUID()
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

    const { type, startDate, endDate, departmentId, categoryId } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter[Op.gte] = new Date(startDate);
    if (endDate) dateFilter[Op.lte] = new Date(endDate);

    const whereClause = {};
    if (Object.keys(dateFilter).length > 0) {
      whereClause.createdAt = dateFilter;
    }

    // Build include clause
    const includeClause = [{
      model: IssueCategory,
      as: 'category',
      include: ['department']
    }];

    // Apply filters
    if (departmentId) {
      includeClause[0].where = { departmentId };
    }
    if (categoryId) {
      whereClause.categoryId = categoryId;
    }

    // Filter by department if user is department head
    if (req.user.role === 'department_head' && req.user.departmentId) {
      includeClause[0].where = { 
        ...includeClause[0].where,
        departmentId: req.user.departmentId 
      };
    }

    const issues = await Issue.findAll({
      where: whereClause,
      include: [
        ...includeClause,
        {
          model: User,
          as: 'assignedUser',
          attributes: ['firstName', 'lastName', 'email']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Generate report based on type
    let reportData;
    switch (type) {
      case 'summary':
        reportData = generateSummaryReport(issues);
        break;
      case 'detailed':
        reportData = generateDetailedReport(issues);
        break;
      case 'department':
        reportData = generateDepartmentReport(issues);
        break;
      case 'category':
        reportData = generateCategoryReport(issues);
        break;
      default:
        reportData = generateSummaryReport(issues);
    }

    res.json({
      success: true,
      data: {
        type,
        generatedAt: new Date(),
        dateRange: { startDate, endDate },
        filters: { departmentId, categoryId },
        report: reportData
      }
    });
  } catch (error) {
    console.error('Generate report error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate report'
    });
  }
});

// Helper functions for report generation
const generateSummaryReport = (issues) => {
  const total = issues.length;
  const byStatus = issues.reduce((acc, issue) => {
    acc[issue.status] = (acc[issue.status] || 0) + 1;
    return acc;
  }, {});
  
  const byPriority = issues.reduce((acc, issue) => {
    acc[issue.priority] = (acc[issue.priority] || 0) + 1;
    return acc;
  }, {});

  const resolved = issues.filter(issue => issue.status === 'resolved');
  const avgResolutionTime = resolved.length > 0 
    ? resolved.reduce((sum, issue) => {
        const resolutionTime = new Date(issue.resolvedAt) - new Date(issue.createdAt);
        return sum + resolutionTime;
      }, 0) / resolved.length / (1000 * 60 * 60 * 24) // Convert to days
    : 0;

  return {
    total,
    byStatus,
    byPriority,
    avgResolutionTime: Math.round(avgResolutionTime * 100) / 100
  };
};

const generateDetailedReport = (issues) => {
  return issues.map(issue => ({
    id: issue.id,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    category: issue.category.name,
    department: issue.category.department.name,
    assignedTo: issue.assignedUser ? 
      `${issue.assignedUser.firstName} ${issue.assignedUser.lastName}` : 
      'Unassigned',
    createdAt: issue.createdAt,
    resolvedAt: issue.resolvedAt,
    resolutionTime: issue.resolvedAt ? 
      Math.round((new Date(issue.resolvedAt) - new Date(issue.createdAt)) / (1000 * 60 * 60 * 24) * 100) / 100 : 
      null
  }));
};

const generateDepartmentReport = (issues) => {
  const byDepartment = issues.reduce((acc, issue) => {
    const deptName = issue.category.department.name;
    if (!acc[deptName]) {
      acc[deptName] = {
        total: 0,
        byStatus: {},
        byPriority: {},
        avgResolutionTime: 0
      };
    }
    acc[deptName].total++;
    acc[deptName].byStatus[issue.status] = (acc[deptName].byStatus[issue.status] || 0) + 1;
    acc[deptName].byPriority[issue.priority] = (acc[deptName].byPriority[issue.priority] || 0) + 1;
    return acc;
  }, {});

  // Calculate average resolution time per department
  Object.keys(byDepartment).forEach(deptName => {
    const deptIssues = issues.filter(issue => issue.category.department.name === deptName);
    const resolved = deptIssues.filter(issue => issue.status === 'resolved');
    if (resolved.length > 0) {
      const totalTime = resolved.reduce((sum, issue) => {
        return sum + (new Date(issue.resolvedAt) - new Date(issue.createdAt));
      }, 0);
      byDepartment[deptName].avgResolutionTime = Math.round(totalTime / resolved.length / (1000 * 60 * 60 * 24) * 100) / 100;
    }
  });

  return byDepartment;
};

const generateCategoryReport = (issues) => {
  const byCategory = issues.reduce((acc, issue) => {
    const catName = issue.category.name;
    if (!acc[catName]) {
      acc[catName] = {
        total: 0,
        byStatus: {},
        byPriority: {},
        avgResolutionTime: 0
      };
    }
    acc[catName].total++;
    acc[catName].byStatus[issue.status] = (acc[catName].byStatus[issue.status] || 0) + 1;
    acc[catName].byPriority[issue.priority] = (acc[catName].byPriority[issue.priority] || 0) + 1;
    return acc;
  }, {});

  // Calculate average resolution time per category
  Object.keys(byCategory).forEach(catName => {
    const catIssues = issues.filter(issue => issue.category.name === catName);
    const resolved = catIssues.filter(issue => issue.status === 'resolved');
    if (resolved.length > 0) {
      const totalTime = resolved.reduce((sum, issue) => {
        return sum + (new Date(issue.resolvedAt) - new Date(issue.createdAt));
      }, 0);
      byCategory[catName].avgResolutionTime = Math.round(totalTime / resolved.length / (1000 * 60 * 60 * 24) * 100) / 100;
    }
  });

  return byCategory;
};

module.exports = router;
