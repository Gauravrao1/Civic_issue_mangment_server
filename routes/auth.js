const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Import your models and middleware
const { User } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// AUTH ROUTES
// Login route
router.post('/login', async (req, res) => {
  try {
    console.log('Login attempt received');
    
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and password are required' 
      });
    }

    // Find user by email (including password for verification)
    const user = await User.findOne({
      where: { email: email.toLowerCase().trim() },
      include: ['department']
    });

    if (!user) {
      console.log('User not found:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      console.log('Inactive user attempted login:', email);
      return res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact administrator.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      console.log('Invalid password for user:', email);
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        role: user.role,
        departmentId: user.departmentId
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Update last login
    await user.update({ lastLoginAt: new Date() });

    // Prepare user response (exclude password)
    const userResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      departmentId: user.departmentId,
      department: user.department ? {
        id: user.department.id,
        name: user.department.name
      } : null,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt
    };

    console.log('Login successful for:', email);
    
    res.json({
      success: true,
      token: token,
      user: userResponse,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Token verification route (using your middleware)
router.get('/verify', authenticateToken, (req, res) => {
  try {
    // req.user is set by your authenticateToken middleware
    const userResponse = {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      departmentId: req.user.departmentId,
      department: req.user.department ? {
        id: req.user.department.id,
        name: req.user.department.name
      } : null,
      isActive: req.user.isActive
    };

    res.json({
      success: true,
      user: userResponse
    });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({
      success: false,
      message: 'Token verification failed'
    });
  }
});

// Logout route (optional - mainly for clearing server-side sessions if you have them)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // You could blacklist tokens here or update last logout time
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

// Profile route (example of protected route)
router.get('/profile', authenticateToken, (req, res) => {
  const userResponse = {
    id: req.user.id,
    email: req.user.email,
    firstName: req.user.firstName,
    lastName: req.user.lastName,
    role: req.user.role,
    departmentId: req.user.departmentId,
    department: req.user.department,
    isActive: req.user.isActive,
    createdAt: req.user.createdAt,
    updatedAt: req.user.updatedAt
  };

  res.json({
    success: true,
    user: userResponse
  });
});

// Health check route
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Test route to check database connection
router.get('/test-db', async (req, res) => {
  try {
    const userCount = await User.count();
    res.json({
      success: true,
      message: 'Database connected',
      userCount: userCount
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// Error handling and 404 are handled in the main app

module.exports = router;