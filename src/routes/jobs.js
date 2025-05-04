const express = require('express');
const router = express.Router();
const {
  submitJob,
  getJobStatus,
  getJobResults,
  downloadFile
} = require('../controllers/jobs');

// Submit a new job
router.post('/', submitJob);

// Get job status
router.get('/:jobId/status', getJobStatus);

// Get job results
router.get('/:jobId/results', getJobResults);

// Download generated file
router.get('/:jobId/files/:fileId', downloadFile);

module.exports = router; 