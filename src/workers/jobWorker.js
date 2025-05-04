const { getDb } = require('../db/init');
const Docker = require('dockerode');
const path = require('path');
const fs = require('fs').promises;   // Promises-based fs for async/await
const fsSync = require('fs');        // Regular fs for createWriteStream
const os = require('os');
const tar = require('tar-fs');
const tarStream = require('tar-stream');

const docker = new Docker();
const POLL_INTERVAL = 5000; // 5 seconds

// Helper function to sanitize logs
function sanitizeLogs(logs) {
  if (!logs) return '';
  // Convert Buffer to string and remove null bytes
  return logs.toString('utf8').replace(/\0/g, '');
}

async function processJob(job) {
  console.log(`Processing job ${job.id}`);
  const db = getDb();
  const client = await db.connect();

  const hostJobDir = path.join(os.tmpdir(), `python-sandbox-${job.id}`);
  const persistentStorageDir = path.resolve('/app/storage', job.id);
  let container;

  try {
    // Update job status to running
    await client.query(
      'UPDATE jobs SET status = $1, started_at = NOW() WHERE id = $2',
      ['running', job.id]
    );

    console.log('Creating job directory on host:', hostJobDir);
    await fs.mkdir(hostJobDir, { recursive: true });
    // Also ensure persistent storage directory exists in the main container
    console.log('Ensuring persistent storage directory exists:', persistentStorageDir);
    await fs.mkdir(persistentStorageDir, { recursive: true });

    // Write the code to a file
    const codePath = path.join(hostJobDir, 'main.py');
    console.log('Writing Python code to:', codePath);
    await fs.writeFile(codePath, job.code);
    console.log('Verifying main.py exists:', await fs.access(codePath).then(() => 'yes').catch(() => 'no'));

    // --- Handle input files for the job ---
    // Create a data directory within the job directory
    const dataDir = path.join(hostJobDir, 'data');
    console.log('Creating data directory:', dataDir);
    await fs.mkdir(dataDir, { recursive: true });
    
    // Check if this job has any data files (uploaded via data_urls)
    const filesResult = await client.query(
      'SELECT id, filename, file_path FROM files WHERE job_id = $1',
      [job.id]
    );
    
    if (filesResult.rows.length > 0) {
      console.log(`Found ${filesResult.rows.length} input files for job ${job.id}`);
      
      // Copy each file to the job's data directory
      for (const file of filesResult.rows) {
        try {
          const sourcePath = file.file_path; // Stored in DB during job submission
          const destPath = path.join(dataDir, file.filename);
          
          console.log(`Copying file ${file.filename} to ${destPath}`);
          await fs.copyFile(sourcePath, destPath);
          console.log(`Successfully copied ${file.filename}`);
        } catch (copyError) {
          console.error(`Error copying file ${file.filename}:`, copyError);
          // Continue with other files even if one fails
        }
      }
    } else {
      console.log('No input files found for this job');
    }
    // --------------------------------------

    // Create requirements.txt if packages are specified
    let installCmd = '';
    if (job.packages) {
      const packages = JSON.parse(job.packages);
      if (packages.length > 0) {
        const requirementsPath = path.join(hostJobDir, 'requirements.txt');
        console.log('Writing requirements to:', requirementsPath);
        await fs.writeFile(requirementsPath, packages.join('\n'));
        console.log('Verifying requirements.txt exists:', await fs.access(requirementsPath).then(() => 'yes').catch(() => 'no'));
        console.log('Requirements.txt contents:', await fs.readFile(requirementsPath, 'utf8'));
        // Set TMPDIR and redirect pip output
        installCmd = `mkdir -p /workspace/.tmp && TMPDIR=/workspace/.tmp pip install --no-cache-dir --user -r /workspace/requirements.txt > /dev/null 2>&1 && rm -rf /workspace/.tmp && `;
      }
    }

    // Create Docker container
    console.log('Creating container with volume mount');
    container = await docker.createContainer({
      Image: 'python-sandbox:latest',
      User: 'root',
      Cmd: ['sh', '-c', `cd /workspace && ${installCmd}python main.py`],
      HostConfig: {
        Memory: 512 * 1024 * 1024, // 512MB
        MemorySwap: 512 * 1024 * 1024,
        CpuPeriod: 100000,
        CpuQuota: 100000, // 1 CPU
        NetworkMode: 'none',
        Binds: [`job-storage:/workspace`]
      }
    });

    // Copy code and requirements to the container
    console.log('Copying files to container /workspace...');
    const archiveStream = tar.pack(hostJobDir);
    await container.putArchive(archiveStream, { path: '/workspace' });
    
    // Copy data files to the /data directory in the container
    if (await fsSync.existsSync(path.join(hostJobDir, 'data'))) {
      console.log('Copying data files to container /data directory...');
      const dataArchiveStream = tar.pack(path.join(hostJobDir, 'data'));
      await container.putArchive(dataArchiveStream, { path: '/data' });
    }

    // Start the container
    console.log('Starting container...');
    await container.start();

    // Wait for the container to finish
    console.log('Waiting for container to finish...');
    const result = await container.wait();
    console.log('Container finished with status code:', result.StatusCode);

    // Get container logs
    console.log('Fetching container logs...');
    const logs = await container.logs({
      follow: false,
      stdout: true,
      stderr: true
    });

    // Get container stats
    console.log('Fetching container stats...');
    const stats = await container.stats({ stream: false });

    // Sanitize logs and stats
    const sanitizedLogs = sanitizeLogs(logs);
    const sanitizedStats = JSON.stringify(stats).replace(/\0/g, '');

    console.log('Container output:', sanitizedLogs);
    if (result.StatusCode !== 0) {
      console.error('Container exited with non-zero status code.');
    }

    // --- Retrieve and store generated files --- 
    const generatedFiles = [];
    
    try {
        console.log('Searching for generated files in the workspace...');
        
        // First, get a list of all files in the workspace
        const archiveStream = await container.getArchive({ path: '/workspace' });
        const extract = tarStream.extract();
        
        // Set to track files we've seen to avoid duplicates
        const processedFiles = new Set();
        // Extensions we consider interesting for output
        const interestingExtensions = ['.txt', '.csv', '.json', '.png', '.jpg', '.jpeg', '.pdf', '.svg', '.xlsx', '.html'];
        
        await new Promise((resolve, reject) => {
            extract.on('entry', (header, stream, next) => {
                if (header.type === 'file') {
                    const fileName = path.basename(header.name);
                    
                    // Skip common files we don't want to capture
                    if (fileName === 'main.py' || 
                        fileName === 'requirements.txt' || 
                        fileName.startsWith('.') || 
                        processedFiles.has(fileName)) {
                        stream.resume();
                        return next();
                    }
                    
                    // Determine if we want to capture this file based on extension or specific names
                    const fileExt = path.extname(fileName).toLowerCase();
                    const isInteresting = interestingExtensions.includes(fileExt) || 
                                          fileName === 'output.txt' ||
                                          fileName.includes('report') ||
                                          fileName.includes('chart') ||
                                          fileName.includes('result');
                                          
                    if (isInteresting) {
                        processedFiles.add(fileName);
                        console.log(`Found interesting output file: ${fileName}`);
                        
                        // Determine content type based on extension
                        let contentType = 'application/octet-stream'; // Default binary
                        if (fileExt === '.txt') contentType = 'text/plain';
                        else if (fileExt === '.csv') contentType = 'text/csv';
                        else if (fileExt === '.json') contentType = 'application/json';
                        else if (['.png', '.jpg', '.jpeg'].includes(fileExt)) contentType = `image/${fileExt.substring(1)}`;
                        else if (fileExt === '.pdf') contentType = 'application/pdf';
                        else if (fileExt === '.svg') contentType = 'image/svg+xml';
                        else if (fileExt === '.xlsx') contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                        else if (fileExt === '.html') contentType = 'text/html';
                        
                        // Save the file to persistent storage
                        const persistentOutputPath = path.join(persistentStorageDir, fileName);
                        const writeStream = fsSync.createWriteStream(persistentOutputPath);
                        let fileSize = 0;
                        
                        stream.on('data', (chunk) => {
                            fileSize += chunk.length;
                        });
                        
                        stream.pipe(writeStream);
                        
                        stream.on('end', () => {
                            console.log(`Saved ${fileName}, size: ${fileSize} bytes`);
                            
                            // Add to our list of generated files
                            generatedFiles.push({
                                filename: fileName,
                                contentType: contentType,
                                filePath: `${job.id}/${fileName}`,
                                size: fileSize
                            });
                            
                            next();
                        });
                        
                        stream.on('error', (err) => {
                            console.error(`Error extracting ${fileName}:`, err);
                            next();
                        });
                    } else {
                        stream.resume();
                        next();
                    }
                } else {
                    stream.resume();
                    next();
                }
            });
            
            extract.on('finish', resolve);
            extract.on('error', reject);
            
            archiveStream.pipe(extract);
        });
        
        console.log(`Found and processed ${generatedFiles.length} output files.`);
        
    } catch (error) {
        console.error(`Error retrieving output files:`, error);
    }
    // ----------------------------------------

    // Update job status and results
    console.log('Updating job status and results in database...');
    const updateResult = await client.query(
      `UPDATE jobs 
       SET status = $1, 
           completed_at = NOW(),
           stdout = $2,
           stderr = $3,
           execution_time = $4,
           resource_usage = $5
       WHERE id = $6`,
      [
        result.StatusCode === 0 ? 'completed' : 'failed',
        sanitizedLogs,
        result.Error ? sanitizeLogs(result.Error.Message) : null,
        Math.floor((Date.now() - new Date(job.started_at).getTime()) / 1000),
        sanitizedStats,
        job.id
      ]
    );

    // Insert generated file metadata into DB
    if (generatedFiles.length > 0) {
        console.log(`Inserting ${generatedFiles.length} generated file metadata into database for job ${job.id}...`);
        for (const file of generatedFiles) {
            console.log(`Inserting file ${file.filename} for job ${job.id}`);
            await client.query(
                `INSERT INTO files (id, job_id, filename, content_type, file_path, size, created_at)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())`,
                [job.id, file.filename, file.contentType, file.filePath, file.size]
            );
            console.log(`File ${file.filename} inserted successfully`);
        }
    }

  } catch (error) {
    console.error(`Error processing job ${job.id}:`, error);
    console.error('Error stack trace:', error.stack);
    await client.query(
      'UPDATE jobs SET status = $1, stderr = $2, completed_at = NOW() WHERE id = $3',
      ['failed', error.message, job.id]
    );
  } finally {
      // Remove the container if it exists
      if (container) {
          try {
              console.log('Removing container...');
              await container.remove({ force: true });
          } catch (removeError) {
              console.error('Error removing container:', removeError);
          }
      }
      // Clean up the temporary host directory
      try {
          console.log('Cleaning up temporary host directory:', hostJobDir);
          await fs.rm(hostJobDir, { recursive: true, force: true });
      } catch (cleanupError) {
          console.error('Error cleaning up host directory:', cleanupError);
      }
      // Release DB client
      if (client) {
          client.release();
      }
  }
}

async function startWorker() {
  console.log('Starting job worker...');
  const db = getDb();

  while (true) {
    try {
      const client = await db.connect();
      const result = await client.query(
        `SELECT * FROM jobs 
         WHERE status = 'queued' 
         ORDER BY created_at ASC 
         LIMIT 1`
      );

      if (result.rows.length > 0) {
        const job = result.rows[0];
        client.release();
        await processJob(job);
      } else {
        client.release();
        console.log('No jobs to process');
      }
    } catch (error) {
      console.error('Error in worker loop:', error);
      console.error('Error stack trace:', error.stack);
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}

startWorker().catch(error => {
  console.error('Worker failed:', error);
  console.error('Error stack trace:', error.stack);
  process.exit(1);
}); 