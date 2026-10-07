const { sequelize, testConnection } = require('../config/database');
const { 
  User, 
  Department, 
  IssueCategory, 
  Issue, 
  IssueComment, 
  IssueStatusHistory, 
  Notification 
} = require('../models');
const bcrypt = require('bcryptjs');

const initializeDatabase = async () => {
  try {
    console.log('🔄 Initializing database...');
    
    // Test connection
    await testConnection();
    
    // Sync database (create tables)
    await sequelize.sync({ force: false });
    console.log('✅ Database tables synchronized');
    
    // Create default departments
    const departments = await createDefaultDepartments();
    console.log('✅ Default departments created');
    
    // Create default categories
    await createDefaultCategories(departments);
    console.log('✅ Default categories created');
    
    // Create admin user
    await createAdminUser();
    console.log('✅ Admin user created');
    
    console.log('🎉 Database initialization completed successfully!');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

const createDefaultDepartments = async () => {
  const departments = [
    {
      name: 'Public Works',
      description: 'Responsible for road maintenance, infrastructure, and public facilities',
      contactEmail: 'publicworks@city.gov',
      contactPhone: '+1-555-0101'
    },
    {
      name: 'Sanitation',
      description: 'Handles waste management, garbage collection, and cleanliness',
      contactEmail: 'sanitation@city.gov',
      contactPhone: '+1-555-0102'
    },
    {
      name: 'Utilities',
      description: 'Manages water supply, electricity, and other utilities',
      contactEmail: 'utilities@city.gov',
      contactPhone: '+1-555-0103'
    },
    {
      name: 'Parks & Recreation',
      description: 'Maintains parks, playgrounds, and recreational facilities',
      contactEmail: 'parks@city.gov',
      contactPhone: '+1-555-0104'
    },
    {
      name: 'Traffic & Transportation',
      description: 'Manages traffic signals, road signs, and transportation infrastructure',
      contactEmail: 'traffic@city.gov',
      contactPhone: '+1-555-0105'
    }
  ];

  const createdDepartments = [];
  
  for (const deptData of departments) {
    const [department, created] = await Department.findOrCreate({
      where: { name: deptData.name },
      defaults: deptData
    });
    
    if (created) {
      createdDepartments.push(department);
    } else {
      createdDepartments.push(department);
    }
  }
  
  return createdDepartments;
};

const createDefaultCategories = async (departments) => {
  const categories = [
    // Public Works
    {
      name: 'Potholes',
      description: 'Road potholes and surface damage',
      departmentName: 'Public Works',
      priority: 'high',
      estimatedResolutionDays: 3
    },
    {
      name: 'Street Lighting',
      description: 'Broken or malfunctioning street lights',
      departmentName: 'Public Works',
      priority: 'medium',
      estimatedResolutionDays: 5
    },
    {
      name: 'Sidewalk Issues',
      description: 'Damaged or unsafe sidewalks',
      departmentName: 'Public Works',
      priority: 'medium',
      estimatedResolutionDays: 7
    },
    {
      name: 'Drainage Problems',
      description: 'Blocked drains and flooding issues',
      departmentName: 'Public Works',
      priority: 'high',
      estimatedResolutionDays: 2
    },
    
    // Sanitation
    {
      name: 'Garbage Collection',
      description: 'Missed garbage collection or overflowing bins',
      departmentName: 'Sanitation',
      priority: 'medium',
      estimatedResolutionDays: 1
    },
    {
      name: 'Illegal Dumping',
      description: 'Unauthorized waste disposal',
      departmentName: 'Sanitation',
      priority: 'high',
      estimatedResolutionDays: 2
    },
    {
      name: 'Street Cleaning',
      description: 'Dirty streets requiring cleaning',
      departmentName: 'Sanitation',
      priority: 'low',
      estimatedResolutionDays: 3
    },
    
    // Utilities
    {
      name: 'Water Supply',
      description: 'Water shortage, quality issues, or leaks',
      departmentName: 'Utilities',
      priority: 'critical',
      estimatedResolutionDays: 1
    },
    {
      name: 'Power Outages',
      description: 'Electrical power issues',
      departmentName: 'Utilities',
      priority: 'critical',
      estimatedResolutionDays: 1
    },
    {
      name: 'Sewer Problems',
      description: 'Sewer blockages or overflows',
      departmentName: 'Utilities',
      priority: 'high',
      estimatedResolutionDays: 2
    },
    
    // Parks & Recreation
    {
      name: 'Playground Equipment',
      description: 'Broken or unsafe playground equipment',
      departmentName: 'Parks & Recreation',
      priority: 'high',
      estimatedResolutionDays: 5
    },
    {
      name: 'Park Maintenance',
      description: 'General park maintenance and cleanliness',
      departmentName: 'Parks & Recreation',
      priority: 'medium',
      estimatedResolutionDays: 7
    },
    {
      name: 'Sports Facilities',
      description: 'Issues with sports courts, fields, or facilities',
      departmentName: 'Parks & Recreation',
      priority: 'medium',
      estimatedResolutionDays: 10
    },
    
    // Traffic & Transportation
    {
      name: 'Traffic Signals',
      description: 'Malfunctioning traffic lights',
      departmentName: 'Traffic & Transportation',
      priority: 'high',
      estimatedResolutionDays: 2
    },
    {
      name: 'Road Signs',
      description: 'Missing, damaged, or unclear road signs',
      departmentName: 'Traffic & Transportation',
      priority: 'medium',
      estimatedResolutionDays: 5
    },
    {
      name: 'Parking Issues',
      description: 'Parking violations or infrastructure problems',
      departmentName: 'Traffic & Transportation',
      priority: 'low',
      estimatedResolutionDays: 7
    }
  ];

  for (const catData of categories) {
    const department = departments.find(dept => dept.name === catData.departmentName);
    if (department) {
      await IssueCategory.findOrCreate({
        where: { 
          name: catData.name,
          departmentId: department.id
        },
        defaults: {
          name: catData.name,
          description: catData.description,
          departmentId: department.id,
          priority: catData.priority,
          estimatedResolutionDays: catData.estimatedResolutionDays
        }
      });
    }
  }
};

const createAdminUser = async () => {
  const adminEmail = 'admin@city.gov';
  
  const existingAdmin = await User.findOne({ where: { email: adminEmail } });
  
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('admin123', 12);
    
    await User.create({
      email: adminEmail,
      password: hashedPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'admin',
      isActive: true
    });
    
    console.log('📧 Admin user created:');
    console.log('   Email: admin@city.gov');
    console.log('   Password: admin123');
    console.log('   ⚠️  Please change the password after first login!');
  }
};

// Run initialization if this script is executed directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('✅ Database initialization completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Database initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
