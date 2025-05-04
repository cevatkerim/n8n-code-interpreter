const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const path = require('path');
const axios = require('axios');
const fs = require('fs').promises;

// Submit a new job
const submitJob = async (req, res) => {
  try {
    const { code, data_urls, packages, timeout, resource_limits } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Code is required' });
    }

    const jobId = uuidv4();
    const db = getDb();
    const client = await db.connect();

    try {
      // Insert job into database
      await client.query(
        `INSERT INTO jobs (id, status, code, data_urls, packages, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [jobId, 'queued', code, JSON.stringify(data_urls || []), JSON.stringify(packages || [])]
      );

      // Download and save data files if provided
      if (data_urls && data_urls.length > 0) {
        for (const url of data_urls) {
          try {
            // Check if this is a reference to an uploaded file
            if (url.startsWith('/api/files/')) {
              const fileId = url.split('/').pop();
              
              // Get file info from database
              const fileResult = await client.query(
                'SELECT filename, content_type, file_path, size FROM upload_files WHERE id = $1',
                [fileId]
              );
              
              if (fileResult.rows.length === 0) {
                console.error(`Uploaded file not found: ${fileId}`);
                continue;
              }
              
              const uploadedFile = fileResult.rows[0];
              const filename = uploadedFile.filename;
              
              // Copy the file to the job's directory
              const jobFilePath = path.join(__dirname, '../../storage', `${jobId}_${filename}`);
              await fs.copyFile(uploadedFile.file_path, jobFilePath);
              
              // Add file entry for the job
              await client.query(
                `INSERT INTO files (id, job_id, filename, content_type, file_path, size, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                [uuidv4(), jobId, filename, uploadedFile.content_type, jobFilePath, uploadedFile.size]
              );
            } else {
              // Download from external URL
              const response = await axios.get(url, { responseType: 'arraybuffer' });
              const filename = path.basename(url);
              const filePath = path.join(__dirname, '../../storage', `${jobId}_${filename}`);
              
              await fs.writeFile(filePath, response.data);
              
              await client.query(
                `INSERT INTO files (id, job_id, filename, content_type, file_path, size, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                [uuidv4(), jobId, filename, response.headers['content-type'], filePath, response.data.length]
              );
            }
          } catch (error) {
            console.error(`Failed to process file from ${url}:`, error);
            // Continue with other files even if one fails
          }
        }
      }

      client.release();
      res.json({
        job_id: jobId,
        status: 'queued',
        message: 'Job queued successfully'
      });
    } catch (error) {
      client.release();
      throw error;
    }
  } catch (error) {
    console.error('Error submitting job:', error);
    res.status(500).json({ error: 'Failed to submit job' });
  }
};

// Get job status
const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const db = getDb();
    const client = await db.connect();

    try {
      const result = await client.query(
        `SELECT status, created_at, started_at, completed_at
         FROM jobs WHERE id = $1`,
        [jobId]
      );

      if (result.rows.length === 0) {
        client.release();
        return res.status(404).json({ error: 'Job not found' });
      }

      const job = result.rows[0];
      client.release();

      res.json({
        job_id: jobId,
        status: job.status,
        created_at: job.created_at,
        started_at: job.started_at,
        completed_at: job.completed_at
      });
    } catch (error) {
      client.release();
      throw error;
    }
  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({ error: 'Failed to get job status' });
  }
};

// Get job results
const getJobResults = async (req, res) => {
  try {
    const { jobId } = req.params;
    console.log(`Getting results for job ${jobId}`);
    const db = getDb();
    const client = await db.connect();

    try {
      const result = await client.query(
        `SELECT status, stdout, stderr, execution_time, resource_usage
         FROM jobs WHERE id = $1`,
        [jobId]
      );

      if (result.rows.length === 0) {
        console.log(`Job ${jobId} not found`);
        client.release();
        return res.status(404).json({ error: 'Job not found' });
      }

      const job = result.rows[0];

      if (job.status !== 'completed') {
        console.log(`Job ${jobId} is not completed yet: ${job.status}`);
        client.release();
        return res.status(400).json({ error: 'Job has not completed yet' });
      }

      // Debug: List all subdirectories in the storage root
      const storageRoot = '/app/storage';
      console.log(`Listing contents of storage root directory: ${storageRoot}`);
      try {
        const rootContents = await fs.readdir(storageRoot);
        console.log('Storage root contents:', rootContents);
      } catch (rootErr) {
        console.error('Error reading storage root:', rootErr);
      }

      // For now, return only the stdout result without any files
      // This is a temporary solution to avoid showing unrelated files
      client.release();

      res.json({
        job_id: jobId,
        status: job.status,
        stdout: job.stdout,
        stderr: job.stderr,
        execution_time: job.execution_time,
        resource_usage: job.resource_usage,
        files: [] // Return empty array temporarily
      });
    } catch (error) {
      client.release();
      throw error;
    }
  } catch (error) {
    console.error('Error getting job results:', error);
    res.status(500).json({ error: 'Failed to get job results' });
  }
};

// Download a generated file
const downloadFile = async (req, res) => {
    const { jobId, fileId } = req.params;
    const db = getDb();
    const client = await db.connect();

    try {
        const result = await client.query('SELECT filename, content_type, file_path FROM files WHERE id = $1 AND job_id = $2', [fileId, jobId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }

        const file = result.rows[0];
        // Construct the absolute path within the container's filesystem
        // file.file_path is stored as relative path e.g., "jobId/filename.txt"
        const absoluteFilePath = path.resolve('/app/storage', file.file_path);

        console.log(`Attempting to send file from path: ${absoluteFilePath}`);

        // Check if file exists before sending
        await fs.access(absoluteFilePath);

        // Set headers and send file
        res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
        res.setHeader('Content-Type', file.content_type || 'application/octet-stream');
        
        res.sendFile(absoluteFilePath, (err) => {
            if (err) {
                console.error('Error sending file:', err);
                // Avoid sending another response if headers already sent
                if (!res.headersSent) {
                   res.status(500).json({ error: 'Failed to send file' });
                }
            }
        });

    } catch (error) {
        if (error.code === 'ENOENT') {
             console.error('File not found on filesystem:', absoluteFilePath);
             res.status(404).json({ error: 'File not found on server storage' });
        } else {
            console.error('Error downloading file:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to download file' });
            }
        }
    } finally {
        client.release();
    }
};

module.exports = {
  submitJob,
  getJobStatus,
  getJobResults,
  downloadFile
}; 