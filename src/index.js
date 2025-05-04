require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./db/init');
const path = require('path');
const fs = require('fs');
const jobsRouter = require('./routes/jobs');
const filesRouter = require('./routes/files');

const app = express();
const port = process.env.PORT || 3003;

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
const storageDir = path.join(__dirname, '../storage');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

// Create uploads directory
const uploadsDir = path.join(storageDir, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
initDatabase()
  .then(() => {
    console.log('Database initialized successfully');
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

// Routes
app.use('/api/jobs', jobsRouter);
app.use('/api/files', filesRouter);

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 