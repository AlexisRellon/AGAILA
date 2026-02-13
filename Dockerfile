# GAIA Backend - root Dockerfile for PaaS auto-detection
# DigitalOcean App Platform and similar services look for "Dockerfile" at repo root.
# This file is identical to Dockerfile.backend; keep them in sync.
# Build context: repo root. Run: uvicorn backend.python.main:app --host 0.0.0.0 --port ${PORT:-8000}

# Multi-stage build for GAIA Backend (Python AI/ML Pipeline)
FROM python:3.11-slim AS builder

# Set working directory
WORKDIR /app

# Upgrade pip
RUN pip install --upgrade pip

# Install system dependencies for building Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    build-essential \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    libffi-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file
COPY backend/python/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --user -r requirements.txt

# Download spaCy language model
RUN python -m spacy download en_core_web_sm

# Production stage
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy Python dependencies from builder
COPY --from=builder /root/.local /root/.local

# Copy application code
COPY backend/python/ ./backend/python/
COPY tests/ ./tests/

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app
ENV PATH=/root/.local/bin:$PATH

# Expose port
EXPOSE 8000

# Health check for PaaS (App Platform, Railway, etc.)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health')" || exit 1

# Override with run command in App Platform: uvicorn backend.python.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1