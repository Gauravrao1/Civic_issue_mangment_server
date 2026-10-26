const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const uploadDirectory = process.env.VERCEL
  ? path.join('/tmp', 'civic-portal-uploads')
  : process.env.UPLOAD_PATH
    ? path.resolve(process.env.UPLOAD_PATH)
    : path.join(__dirname, 'uploads');

const app = express();
const PORT = process.env.PORT || 5000;

// Import routes
const authRoutes = require('./routes/auth');
const issueRoutes = require('./routes/issues');
const userRoutes = require('./routes/users');
const departmentRoutes = require('./routes/departments');
const analyticsRoutes = require('./routes/analytics');
const notificationRoutes = require('./routes/notifications');

// Import database initialization
const { initializeDatabase } = require('./scripts/initDatabase');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const { authenticateToken } = require('./middleware/auth');

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// CORS configuration
const corsOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:3000'];
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined'));

// Static files
app.use('/uploads', express.static(uploadDirectory));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/departments', authenticateToken, departmentRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);
app.use('/api/notifications', authenticateToken, notificationRoutes);

// Serve static files from React build in production
if (process.env.SERVE_CLIENT === 'true') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

let databaseInitialization;

const ensureDatabaseInitialized = () => {
  if (!databaseInitialization) {
    databaseInitialization = initializeDatabase();
  }
  return databaseInitialization;
};

const isHealthCheckRequest = (req) => {
  const requestPath = (req.url || '').split('?')[0];
  return req.method === 'GET' && requestPath === '/api/health';
};

const isApiRequest = (req) => (req.url || '').split('?')[0].startsWith('/api/');

// Initialize database and start server
const startServer = async () => {
  try {
    // Initialize database on startup
    await ensureDatabaseInitialized();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = async (req, res) => {
  try {
    // Keep the health endpoint available so missing deployment configuration
    // is reported by the application instead of as a Vercel invocation error.
    if (isApiRequest(req) && !isHealthCheckRequest(req)) {
      await ensureDatabaseInitialized();
    }
    return app(req, res);
  } catch (error) {
    console.error('❌ Serverless request initialization failed:', error);
    return res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable'
    });
  }
};
