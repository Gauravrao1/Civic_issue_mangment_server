module.exports = async (req, res) => {
  if (req.method === 'GET' && (req.url || '').split('?')[0] === '/api/health') {
    return res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  }

  try {
    const handler = require('../index');
    return handler(req, res);
  } catch (error) {
    console.error('❌ Failed to load application handler:', error);
    return res.status(500).json({
      success: false,
      message: 'Application failed to load',
      error: error.message
    });
  }
};
