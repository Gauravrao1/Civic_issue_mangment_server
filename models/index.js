const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');

// User Model
const User = sequelize.define('User', {
  id: {
    type: DataTypes.STRING,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'staff',
    validate: {
      isIn: [['admin', 'department_head', 'staff', 'contractor']]
    }
  },
  departmentId: {
    type: DataTypes.STRING,
    allowNull: true,
    references: {
      model: 'departments',
      key: 'id'
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'users'
});

// Department Model
const Department = sequelize.define('Department', {
  id: {
    type: DataTypes.STRING,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  contactEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  contactPhone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'departments'
});

// Issue Category Model
const IssueCategory = sequelize.define('IssueCategory', {
  id: {
    type: DataTypes.STRING,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  departmentId: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'departments',
      key: 'id'
    }
  },
  priority: {
    type: DataTypes.STRING,
    defaultValue: 'medium',
    validate: {
      isIn: [['low', 'medium', 'high', 'critical']]
    }
  },
  estimatedResolutionDays: {
    type: DataTypes.INTEGER,
    defaultValue: 7
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'issue_categories'
});

// Issue Model
const Issue = sequelize.define('Issue', {
  id: {
    type: DataTypes.STRING,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  categoryId: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'issue_categories',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'new',
    validate: {
      isIn: [['new', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected']]
    }
  },
  priority: {
    type: DataTypes.STRING,
    defaultValue: 'medium',
    validate: {
      isIn: [['low', 'medium', 'high', 'critical']]
    }
  },
  citizenName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  citizenEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  citizenPhone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  location: {
    type: DataTypes.TEXT,
    allowNull: false,
    get() {
      const rawValue = this.getDataValue('location');
      return rawValue ? JSON.parse(rawValue) : null;
    },
    set(value) {
      this.setDataValue('location', JSON.stringify(value));
    }
  },
  images: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() {
      const rawValue = this.getDataValue('images');
      return rawValue ? JSON.parse(rawValue) : [];
    },
    set(value) {
      this.setDataValue('images', JSON.stringify(value || []));
    }
  },
  assignedTo: {
    type: DataTypes.STRING,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  assignedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  resolvedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  resolutionNotes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  resolutionImages: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() {
      const rawValue = this.getDataValue('resolutionImages');
      return rawValue ? JSON.parse(rawValue) : [];
    },
    set(value) {
      this.setDataValue('resolutionImages', JSON.stringify(value || []));
    }
  },
  estimatedResolutionDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  source: {
    type: DataTypes.STRING,
    defaultValue: 'web',
    validate: {
      isIn: [['web', 'mobile', 'sms', 'voice', 'api']]
    }
  },
  externalId: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'issues'
});

// Issue Comment Model
const IssueComment = sequelize.define('IssueComment', {
  id: {
    type: DataTypes.STRING,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  issueId: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'issues',
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  isInternal: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  attachments: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() {
      const rawValue = this.getDataValue('attachments');
      return rawValue ? JSON.parse(rawValue) : [];
    },
    set(value) {
      this.setDataValue('attachments', JSON.stringify(value || []));
    }
  }
}, {
  tableName: 'issue_comments'
});

// Issue Status History Model
const IssueStatusHistory = sequelize.define('IssueStatusHistory', {
  id: {
    type: DataTypes.STRING,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  issueId: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: 'issues',
      key: 'id'
    }
  },
  fromStatus: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isIn: [['new', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected']]
    }
  },
  toStatus: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['new', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected']]
    }
  },
  changedBy: {
    type: DataTypes.STRING,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'issue_status_history'
});

// Notification Model
const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.STRING,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  issueId: {
    type: DataTypes.STRING,
    allowNull: true,
    references: {
      model: 'issues',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['issue_created', 'issue_assigned', 'issue_updated', 'issue_resolved', 'system']]
    }
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  sentVia: {
    type: DataTypes.TEXT,
    defaultValue: '["in_app"]',
    get() {
      const rawValue = this.getDataValue('sentVia');
      return rawValue ? JSON.parse(rawValue) : ['in_app'];
    },
    set(value) {
      this.setDataValue('sentVia', JSON.stringify(value || ['in_app']));
    }
  },
  metadata: {
    type: DataTypes.TEXT,
    defaultValue: '{}',
    get() {
      const rawValue = this.getDataValue('metadata');
      return rawValue ? JSON.parse(rawValue) : {};
    },
    set(value) {
      this.setDataValue('metadata', JSON.stringify(value || {}));
    }
  }
}, {
  tableName: 'notifications'
});

// Define associations
User.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });
Department.hasMany(User, { foreignKey: 'departmentId', as: 'users' });
Department.hasMany(IssueCategory, { foreignKey: 'departmentId', as: 'categories' });
IssueCategory.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });

Issue.belongsTo(IssueCategory, { foreignKey: 'categoryId', as: 'category' });
Issue.belongsTo(User, { foreignKey: 'assignedTo', as: 'assignedUser' });
Issue.hasMany(IssueComment, { foreignKey: 'issueId', as: 'comments' });
Issue.hasMany(IssueStatusHistory, { foreignKey: 'issueId', as: 'statusHistory' });
Issue.hasMany(Notification, { foreignKey: 'issueId', as: 'notifications' });

IssueComment.belongsTo(Issue, { foreignKey: 'issueId', as: 'issue' });
IssueComment.belongsTo(User, { foreignKey: 'userId', as: 'user' });

IssueStatusHistory.belongsTo(Issue, { foreignKey: 'issueId', as: 'issue' });
IssueStatusHistory.belongsTo(User, { foreignKey: 'changedBy', as: 'changedByUser' });

Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Notification.belongsTo(Issue, { foreignKey: 'issueId', as: 'issue' });

module.exports = {
  sequelize,
  User,
  Department,
  IssueCategory,
  Issue,
  IssueComment,
  IssueStatusHistory,
  Notification
};