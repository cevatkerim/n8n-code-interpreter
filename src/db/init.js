const { Pool } = require('pg');
const path = require('path');

// Create a new pool using the connection string from environment variables
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Helper function to get database connection
const getDb = () => pool;

// Initialize database
const initDatabase = async () => {
  try {
    const client = await pool.connect();
    
    // Create jobs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        code TEXT NOT NULL,
        data_urls TEXT,
        packages TEXT,
        created_at TIMESTAMP NOT NULL,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        stdout TEXT,
        stderr TEXT,
        execution_time INTEGER,
        resource_usage TEXT
      );
    `);

    // Create files table
    await client.query(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        size INTEGER NOT NULL,
        created_at TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      );
    `);
    
    // Add created_at column to files table if it doesn't exist
    await client.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'files' AND column_name = 'created_at'
        ) THEN 
          ALTER TABLE files ADD COLUMN created_at TIMESTAMP;
        END IF;
      END $$;
    `);
    
    // Create upload_files table for file uploads
    await client.query(`
      CREATE TABLE IF NOT EXISTS upload_files (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        size INTEGER NOT NULL,
        uploaded_at TIMESTAMP NOT NULL
      );
    `);

    client.release();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

module.exports = {
  getDb,
  initDatabase
}; 