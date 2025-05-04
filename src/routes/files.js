const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadFile, getFile } = require('../controllers/files');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, '/tmp/uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Create temporary directory for uploads
const fs = require('fs');
if (!fs.existsSync('/tmp/uploads')) {
  fs.mkdirSync('/tmp/uploads', { recursive: true });
}

// Upload a file
router.post('/', upload.single('file'), uploadFile);

// Get uploaded file
router.get('/:fileId', getFile);

module.exports = router; 