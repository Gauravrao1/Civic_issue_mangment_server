const { Sequelize } = require('sequelize');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL?.trim();

if (process.env.VERCEL && !databaseUrl) {
  throw new Error(
    'DATABASE_URL is required when running on Vercel. Configure a hosted PostgreSQL connection string in the Vercel project settings.'
  );
}

const databaseOptions = databaseUrl
  ? {
      dialect: 'postgres',
      url: databaseUrl,
      dialectOptions: process.env.NODE_ENV === 'production' || process.env.VERCEL
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : {}
    }
  : {
      dialect: 'sqlite',
      storage: './civic_portal.db'
    };

const sequelize = new Sequelize({
  ...databaseOptions,
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
});

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    console.log(`📁 Using ${databaseUrl ? 'PostgreSQL' : 'SQLite'} database`);
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
  }
};

module.exports = { sequelize, testConnection };