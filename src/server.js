const app = require('./app');
const config = require('./config/env');
const pool = require('./config/db');

const PORT = config.port;

// Start server - bind to all interfaces for hotspot compatibility
const server = app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let localIP = 'localhost';
  
  // Find the first non-internal IPv4 address
  for (const interfaceName in networkInterfaces) {
    const networkInterface = networkInterfaces[interfaceName];
    for (const connection of networkInterface) {
      if (connection.family === 'IPv4' && !connection.internal) {
        localIP = connection.address;
        break;
      }
    }
    if (localIP !== 'localhost') break;
  }
  
  console.log(`
  ╔════════════════════════════════════════════════════╗
  ║                                                    ║
  ║   🎓 School Management System API Server           ║
  ║                                                    ║
  ║   Environment: ${config.nodeEnv.padEnd(35)}║
  ║   Port: ${PORT.toString().padEnd(42)}║
  ║   Database: Connected ✅                           ║
  ║                                                    ║
  ║   Local: http://localhost:${PORT}/api              ║
  ║   Network: http://${localIP}:${PORT}/api           ║
  ║   Health: http://localhost:${PORT}/health          ║
  ║                                                    ║
  ║   📱 Hotspot Ready - Use Network URL above         ║
  ║                                                    ║
  ╚════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    console.log('🛑 HTTP server closed');
    await pool.end();
    console.log('🛑 Database pool closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT signal received: closing HTTP server');
  server.close(async () => {
    console.log('🛑 HTTP server closed');
    await pool.end();
    console.log('🛑 Database pool closed');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  server.close(async () => {
    await pool.end();
    process.exit(1);
  });
});
