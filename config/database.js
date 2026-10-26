const { Sequelize } = require('sequelize');
require('dotenv').config();

const databaseUrl = [
  process.env.DATABASE_URL,
  process.env.POSTGRES_URL,
  process.env.POSTGRES_PRISMA_URL,
  process.env.POSTGRES_URL_NON_POOLING
]
  .map(value => value?.trim())
  .find(Boolean);

const databaseConfigurationError = process.env.VERCEL && !databaseUrl
  ? new Error(
      'A hosted PostgreSQL connection string is required on Vercel. Set DATABASE_URL (or POSTGRES_URL) in the Vercel project settings.'
    )
  : null;

let sequelize;

if (databaseUrl) {
  sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    }
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'civic_portal',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'postgres',
    {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      define: {
        timestamps: true,
        underscored: true,
        freezeTableName: true
      }
    }
  );
}

// Test database connection
const testConnection = async () => {
  try {
    if (databaseConfigurationError) {
      throw databaseConfigurationError;
    }

    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    console.log(`📁 Using PostgreSQL database`);
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
  }
};

module.exports = { sequelize, testConnection };