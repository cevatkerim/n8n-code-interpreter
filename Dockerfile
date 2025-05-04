FROM node:20-slim

# Install Python and other dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Clean install dependencies
RUN npm ci

# Copy application code
COPY . .

# Create necessary directories and .env file
RUN mkdir -p data storage && \
    chmod -R 777 /app/data /app/storage && \
    echo "NODE_ENV=development\nPORT=3003\nDATABASE_URL=postgres://postgres:postgres@postgres:5432/sandbox" > .env

# Expose port
EXPOSE 3003

# Start both the API server and worker
CMD ["sh", "-c", "npm run worker & npm start"] 