const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;

// Upload a file
const uploadFile = async (req, res) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = uuidv4();
    const db = getDb();
    const client = await db.connect();

    try {
      // Create storage directory if it doesn't exist
      const storageDir = path.join(__dirname, '../../storage/uploads');
      await fsp.mkdir(storageDir, { recursive: true });

      // Move file to permanent storage
      const filename = req.file.originalname;
      const filePath = path.join(storageDir, `${fileId}_${filename}`);
      
      // Copy from temporary multer location to our storage
      await fsp.copyFile(req.file.path, filePath);
      
      // Delete the temporary file
      await fsp.unlink(req.file.path);

      // Insert file info into database
      await client.query(
        `INSERT INTO upload_files (id, filename, content_type, file_path, size, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [fileId, filename, req.file.mimetype, filePath, req.file.size]
      );

      client.release();
      
      // Return file information
      res.status(201).json({
        file_id: fileId,
        filename: filename,
        size: req.file.size,
        url: `/api/files/${fileId}`
      });
    } catch (error) {
      client.release();
      throw error;
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
};

// Get uploaded file
const getFile = async (req, res) => {
  const { fileId } = req.params;
  const db = getDb();
  const client = await db.connect();

  try {
    const result = await client.query(
      'SELECT filename, content_type, file_path FROM upload_files WHERE id = $1',
      [fileId]
    );

    if (result.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];
    
    // Check if file exists
    try {
      await fsp.access(file.file_path);
    } catch (err) {
      client.release();
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Set headers and send file
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Type', file.content_type || 'application/octet-stream');
    
    // Stream the file
    const fileStream = fs.createReadStream(file.file_path);
    fileStream.pipe(res);
    
    fileStream.on('error', (err) => {
      console.error('Error streaming file:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream file' });
      }
    });

    // Handle client disconnection
    res.on('close', () => {
      fileStream.destroy();
    });

    client.release();
  } catch (error) {
    client.release();
    console.error('Error getting file:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to get file' });
    }
  }
};

module.exports = {
  uploadFile,
  getFile
}; 