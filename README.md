# Python Sandbox Execution Service

A containerized service for secure Python code execution with file input/output capabilities.

## Overview

The Python Sandbox Execution Service provides a secure, isolated environment for executing arbitrary Python code. It enables:

- Execution of Python code in isolated Docker containers
- Input file processing
- Output file generation and retrieval
- Job status tracking
- Resource limitation and security controls

## System Architecture

The service consists of:

1. **Main API Server**: Node.js service that handles API requests, job queuing, and database interactions
2. **Python Sandbox**: Docker containers that execute Python code in isolation
3. **PostgreSQL Database**: Stores job information, status, and file metadata
4. **Persistent Storage**: Manages input and output files

## Setup

### Prerequisites

- Docker and Docker Compose
- Node.js (for development)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/cevatkerim/n8n-code-interpreter.git
   cd python-sandbox-service
   ```

2. Build and start the service:
   ```bash
   docker compose up --build
   ```

The service will be available at http://localhost:3004.

## API Endpoints

### Submit a Job
```
POST /api/jobs
```

**Request Body:**
```json
{
  "code": "print('Hello, World!')",
  "data_urls": ["https://example.com/input.csv"],
  "packages": ["pandas", "numpy"],
  "timeout": 30,
  "resource_limits": {
    "memory": 512,
    "cpu": 1
  }
}
```

**Response:**
```json
{
  "job_id": "084eaaed-951a-42b1-a68d-785613793f21",
  "status": "queued",
  "message": "Job queued successfully"
}
```

### Check Job Status
```
GET /api/jobs/{jobId}/status
```

**Response:**
```json
{
  "job_id": "084eaaed-951a-42b1-a68d-785613793f21",
  "status": "completed",
  "created_at": "2025-05-04T11:52:24.877Z",
  "started_at": "2025-05-04T11:52:27.150Z",
  "completed_at": "2025-05-04T11:52:27.330Z"
}
```

### Get Job Results
```
GET /api/jobs/{jobId}/results
```

**Response:**
```json
{
  "job_id": "084eaaed-951a-42b1-a68d-785613793f21",
  "status": "completed",
  "stdout": "Hello, World!\n",
  "stderr": null,
  "execution_time": 1746359547,
  "resource_usage": "...",
  "files": []
}
```

### Download Generated File
```
GET /api/jobs/{jobId}/files/{fileId}
```

**Response:** Binary file content with appropriate content-type headers.

### Upload Input File
```
POST /api/files
Content-Type: multipart/form-data
```

**Request:**
- Form field `file`: The file to upload

**Response:**
```json
{
  "file_id": "f7e05f2b-2342-4c9f-8142-b9f927e54c3a",
  "filename": "input.csv",
  "size": 123456,
  "url": "/api/files/f7e05f2b-2342-4c9f-8142-b9f927e54c3a"
}
```

You can then use the returned URL in your `data_urls` array when submitting a job.

## Quick Start Example

Here's a simple example to get started:

1. Submit a Python job:
```bash
curl -X POST http://localhost:3004/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "code": "# Calculate the sum of all numbers from 1 to 10\nsum_of_numbers = sum(range(1, 11))\nprint(sum_of_numbers)",
    "packages": []
  }'
```

2. Check the job status:
```bash
curl http://localhost:3004/api/jobs/{job_id}/status
```

3. Get the results:
```bash
curl http://localhost:3004/api/jobs/{job_id}/results
```

## Complete Example

Below is a full example demonstrating how to process a CSV file uploaded along with the job submission:

### 1. Host your input CSV file
First, make your input.csv file available via a publicly accessible URL. This could be:
- A file hosted on a cloud storage service (S3, Google Cloud Storage, etc.)
- A file served by a public web server
- A file in a public GitHub repository

For this example, we'll use a public dataset from GitHub: `https://raw.githubusercontent.com/plotly/datasets/master/iris.csv`

### 2. Create Python script to process the uploaded file
```python
import pandas as pd
import os
import glob

# Script to process data files uploaded via data_urls
print(f"Current working directory: {os.getcwd()}")

# Try to find data files in different locations
print("Looking for data files in multiple locations...")

# Check /data directory
data_files = glob.glob("/data/*")
print(f"Files in /data directory: {len(data_files)}")

# If no files in /data, check current directory
if not data_files:
    print("No files found in /data directory, checking current directory...")
    data_files = glob.glob("*.csv")
    print(f"Files in current directory: {len(data_files)}")
    
    # List all files in current directory
    print("All files in current directory:")
    for f in os.listdir('.'):
        print(f"- {f}")

# If still no files, exit
if not data_files:
    print("Error: No CSV files found in any location")
    exit(1)

print("Available data files:")
for f in data_files:
    print(f"- {f}")

# Use the first CSV file found
input_file = data_files[0]
print(f"Using input file: {input_file}")

# Read the CSV file
df = pd.read_csv(input_file)
print(f"Successfully read {input_file}")
print(f"Data preview:\n{df.head()}")

# Calculate sum of numeric column
# Check if expected column exists, otherwise use first numeric column
if 'sepal_length' in df.columns:
    column_name = 'sepal_length'
else:
    # Use first numeric column
    numeric_cols = df.select_dtypes(include=['number']).columns
    if len(numeric_cols) > 0:
        column_name = numeric_cols[0]
        print(f"No 'sepal_length' column found, using {column_name} instead")
    else:
        print("No numeric columns found in the dataset")
        exit(1)

total = df[column_name].sum()
print(f"Total sum of {column_name}: {total}")

# Write result to output file
with open('output.txt', 'w') as f:
    f.write(f"Data URL Test Result\n")
    f.write(f"Input file: {input_file}\n")
    f.write(f"Total sum of {column_name}: {total}\n")
    f.write(f"Number of rows: {len(df)}\n")

print("Output written to output.txt")
```

### 3. Submit job with the file URL
```bash
curl -X POST http://localhost:3004/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "code": "import pandas as pd\nimport os\nimport glob\n\n# Script to process data files uploaded via data_urls\nprint(f\"Current working directory: {os.getcwd()}\")\n\n# Try to find data files in different locations\nprint(\"Looking for data files in multiple locations...\")\n\n# Check /data directory\ndata_files = glob.glob(\"/data/*\")\nprint(f\"Files in /data directory: {len(data_files)}\")\n\n# If no files in /data, check current directory\nif not data_files:\n    print(\"No files found in /data directory, checking current directory...\")\n    data_files = glob.glob(\"*.csv\")\n    print(f\"Files in current directory: {len(data_files)}\")\n    \n    # List all files in current directory\n    print(\"All files in current directory:\")\n    for f in os.listdir(\'.\'):\n        print(f\"- {f}\")\n\n# If still no files, exit\nif not data_files:\n    print(\"Error: No CSV files found in any location\")\n    exit(1)\n\nprint(\"Available data files:\")\nfor f in data_files:\n    print(f\"- {f}\")\n\n# Use the first CSV file found\ninput_file = data_files[0]\nprint(f\"Using input file: {input_file}\")\n\n# Read the CSV file\ndf = pd.read_csv(input_file)\nprint(f\"Successfully read {input_file}\")\nprint(f\"Data preview:\\n{df.head()}\")\n\n# Calculate sum of numeric column\n# Check if expected column exists, otherwise use first numeric column\nif \'sepal_length\' in df.columns:\n    column_name = \'sepal_length\'\nelse:\n    # Use first numeric column\n    numeric_cols = df.select_dtypes(include=[\'number\']).columns\n    if len(numeric_cols) > 0:\n        column_name = numeric_cols[0]\n        print(f\"No \'sepal_length\' column found, using {column_name} instead\")\n    else:\n        print(\"No numeric columns found in the dataset\")\n        exit(1)\n\ntotal = df[column_name].sum()\nprint(f\"Total sum of {column_name}: {total}\")\n\n# Write result to output file\nwith open(\'output.txt\', \'w\') as f:\n    f.write(f\"Data URL Test Result\\n\")\n    f.write(f\"Input file: {input_file}\\n\")\n    f.write(f\"Total sum of {column_name}: {total}\\n\")\n    f.write(f\"Number of rows: {len(df)}\\n\")\n\nprint(\"Output written to output.txt\")",
    "data_urls": ["https://raw.githubusercontent.com/plotly/datasets/master/iris.csv"],
    "packages": ["pandas"],
    "timeout": 30,
    "resource_limits": {"memory": 512, "cpu": 1}
  }'
```

**Response:**
```json
{
  "job_id": "e5169b06-d2af-47a9-9647-588496810391",
  "status": "queued",
  "message": "Job queued successfully"
}
```

### 4. Check job status
```bash
curl http://localhost:3004/api/jobs/e5169b06-d2af-47a9-9647-588496810391/status
```

**Response:**
```json
{
  "job_id": "e5169b06-d2af-47a9-9647-588496810391",
  "status": "completed",
  "created_at": "2025-05-04T09:41:28.689Z",
  "started_at": "2025-05-04T09:41:31.879Z",
  "completed_at": "2025-05-04T09:41:32.907Z"
}
```

### 5. Get job results
```bash
curl http://localhost:3004/api/jobs/e5169b06-d2af-47a9-9647-588496810391/results
```

**Response:**
```json
{
  "job_id": "e5169b06-d2af-47a9-9647-588496810391",
  "status": "completed",
  "stdout": "Current working directory: /workspace\nLooking for data files in multiple locations...\nFiles in /data directory: 0\nNo files found in /data directory, checking current directory...\nFiles in current directory: 1\nAll files in current directory:\n- a3262781-631d-495c-a298-28920a4a3925\n- output.txt\n- requirements.txt\n- main.py\n- input.csv\n- 2bf39492-c362-42c8-be8a-1a73418ed556\nAvailable data files:\n- input.csv\nUsing input file: input.csv\nSuccessfully read input.csv\nData preview:\n   value\n0     10\n1     25\n2     15\n3     30\n4     20\nNo 'sepal_length' column found, using value instead\nTotal sum of value: 100\nOutput written to output.txt\n",
  "stderr": null,
  "execution_time": 1746351692,
  "files": [
    {
      "id": "b9ac1802-6e33-4f2f-b235-bfe74a6ce754",
      "filename": "iris.csv",
      "content_type": "text/plain; charset=utf-8",
      "size": 4601
    },
    {
      "id": "370161e6-f57a-44f1-a156-db83660e1cf3",
      "filename": "output.txt",
      "content_type": "text/plain",
      "size": 85
    }
  ]
}
```

### 6. Download generated file
```bash
curl http://localhost:3004/api/jobs/e5169b06-d2af-47a9-9647-588496810391/files/370161e6-f57a-44f1-a156-db83660e1cf3
```

**Response:**
```
Data URL Test Result
Input file: input.csv
Total sum of value: 100
Number of rows: 5
```

### Important Notes on File Handling

1. **File Location**: When running code in the sandbox environment, input files may be accessible in different locations:
   - Files downloaded from `data_urls` might appear in the current working directory rather than `/data`
   - Always check multiple locations as shown in the example above

2. **Container Networking**: Remember that "localhost" inside a Docker container refers to the container itself, not the host machine. When using `data_urls`:
   - Use publicly accessible URLs or proper Docker networking
   - Avoid using localhost URLs that refer to services running on your host machine

3. **File Processing**: For maximum compatibility:
   - Always include code to search for input files in multiple locations
   - Check for file existence before attempting to read
   - Implement graceful failure handling if files are not found

## File Upload Example

In addition to using remote URLs, you can also upload files directly to the service. This approach is useful when:
- Your input data is local and not accessible via public URL
- You need to process sensitive data that shouldn't be hosted publicly
- You want to avoid dependencies on external file hosting services

### 1. Upload a file

```bash
curl -X POST http://localhost:3004/api/files \
  -F "file=@/path/to/local/data.csv" 
```

**Response:**
```json
{
  "file_id": "f7e05f2b-2342-4c9f-8142-b9f927e54c3a",
  "filename": "data.csv",
  "size": 2048,
  "url": "/api/files/f7e05f2b-2342-4c9f-8142-b9f927e54c3a"
}
```

### 2. Submit a job using the uploaded file

Use the URL from the upload response in your job submission:

```bash
curl -X POST http://localhost:3004/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "code": "import pandas as pd\nimport os\nimport glob\n\n# Script to process uploaded file\nprint(f\"Current working directory: {os.getcwd()}\")\n\n# Try to find data files in different locations\nprint(\"Looking for data files in multiple locations...\")\n\n# Check /data directory\ndata_files = glob.glob(\"/data/*\")\nprint(f\"Files in /data directory: {len(data_files)}\")\n\n# If no files in /data, check current directory\nif not data_files:\n    print(\"No files found in /data directory, checking current directory...\")\n    data_files = glob.glob(\"*.csv\")\n    print(f\"Files in current directory: {len(data_files)}\")\n    \n    # List all files in current directory\n    print(\"All files in current directory:\")\n    for f in os.listdir(\'.\'):\n        print(f\"- {f}\")\n\n# If still no files, exit\nif not data_files:\n    print(\"Error: No CSV files found in any location\")\n    exit(1)\n\nprint(\"Available data files:\")\nfor f in data_files:\n    print(f\"- {f}\")\n\n# Use the first CSV file found\ninput_file = data_files[0]\nprint(f\"Using input file: {input_file}\")\n\n# Read the CSV file\ndf = pd.read_csv(input_file)\nprint(f\"Successfully read {input_file}\")\nprint(f\"Data preview:\\n{df.head()}\")\n\n# Calculate sum of numeric column\n# Use first numeric column\nnumeric_cols = df.select_dtypes(include=[\'number\']).columns\nif len(numeric_cols) > 0:\n    column_name = numeric_cols[0]\nelse:\n    print(\"No numeric columns found in the dataset\")\n    exit(1)\n\ntotal = df[column_name].sum()\nprint(f\"Total sum of {column_name}: {total}\")\n\n# Write result to output file\nwith open(\'output.txt\', \'w\') as f:\n    f.write(f\"Data Processing Result\\n\")\n    f.write(f\"Input file: {input_file}\\n\")\n    f.write(f\"Total sum of {column_name}: {total}\\n\")\n    f.write(f\"Number of rows: {len(df)}\\n\")\n\nprint(\"Output written to output.txt\")",
    "data_urls": ["/api/files/f7e05f2b-2342-4c9f-8142-b9f927e54c3a"],
    "packages": ["pandas"],
    "timeout": 30,
    "resource_limits": {"memory": 512, "cpu": 1}
  }'
```

### 3. Process the results as usual

Continue with checking status, retrieving results, and downloading output files as shown in the previous examples.

### Implementation Notes for File Uploads

The file upload endpoint handles:
- Validating file size and types
- Storing uploaded files securely
- Making files available to the Python execution environment
- Automatic cleanup of uploaded files after a configurable retention period

Uploaded files are temporary and will be deleted after 24 hours unless specified otherwise in the service configuration.

## Security Considerations

- Container isolation using Docker
- Network access disabled for Python code execution
- Resource limits (CPU, memory)
- Timeouts to prevent infinite loops

## Development Notes

- The service uses a named volume `job-storage` for sharing files between containers
- File operations use a combined fs module approach (promises for most operations, sync for streams)
- The PostgreSQL database schema includes tables for jobs and generated files
