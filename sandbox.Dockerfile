FROM python:3.11-alpine

# Install basic system dependencies
RUN apk add --no-cache curl ca-certificates

# Install build dependencies for Python packages
RUN apk add --no-cache build-base gcc g++ freetype-dev libpng-dev openblas-dev

# Create non-root user
RUN addgroup -S pythonuser && adduser -S pythonuser -G pythonuser

# Create necessary directories with proper permissions
RUN mkdir -p /workspace /tmp /var/tmp /usr/tmp /data && \
    chown -R pythonuser:pythonuser /workspace /tmp /var/tmp /usr/tmp /data && \
    chmod -R 777 /workspace /tmp /var/tmp /usr/tmp /data

# Create pip cache directory with proper permissions
RUN mkdir -p /home/pythonuser/.cache/pip && \
    chown -R pythonuser:pythonuser /home/pythonuser/.cache && \
    chmod -R 777 /home/pythonuser/.cache

# Install common Python packages
RUN pip install --no-cache-dir \
    numpy \
    pandas \
    matplotlib \
    scikit-learn \
    requests \
    beautifulsoup4 \
    pillow

# Setup working directory
WORKDIR /workspace

# Switch to non-root user
USER pythonuser

# Command will be provided at runtime
CMD ["python", "-c", "print('Container is ready')"] 