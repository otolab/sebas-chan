# Reporters Package API Documentation

## Overview

The Reporters package provides a REST API for event collection and reporting. The API server can be started using the CLI or programmatically.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Start the API server
npm run dev:api

# Or use the CLI
npm run cli server start
```

## API Endpoints

Base URL: `http://localhost:3000/api/v1`

### Events (T032-T034)

#### POST /events
Queue an event for processing.

**Request Body:**
```json
{
  "type": "notification",
  "sourceId": "my-source",
  "timestamp": "2024-01-01T00:00:00Z",  // Optional
  "payload": {
    "title": "Event Title",
    "message": "Event message"
  }
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "type": "notification",
  "sourceId": "my-source",
  "timestamp": "2024-01-01T00:00:00Z",
  "payload": {...},
  "metadata": {
    "collectedAt": "2024-01-01T00:00:00Z",
    "attempts": 0
  }
}
```

#### GET /events
List queued events.

**Query Parameters:**
- `status` (optional): Filter by status (queued, buffered, sending, failed)
- `limit` (optional): Maximum number of events to return (default: 100, max: 1000)

**Response (200):**
```json
{
  "events": [...],
  "total": 42
}
```

#### POST /events/send
Send buffered events to the server.

**Request Body (optional):**
```json
{
  "force": false  // Force send even if server is unavailable
}
```

**Response (200):**
```json
{
  "sent": 10,
  "failed": 2,
  "buffered": 30
}
```

### Sources (T035-T038)

#### GET /sources
List all event sources.

**Response (200):**
```json
[
  {
    "id": "source-1",
    "name": "My Source",
    "type": "webhook",
    "status": "active",
    "config": {...},
    "lastConnectedAt": "2024-01-01T00:00:00Z"
  }
]
```

#### POST /sources
Add a new event source.

**Request Body:**
```json
{
  "name": "New Source",
  "type": "webhook",
  "config": {
    "endpoint": "https://example.com/webhook",
    "interval": 5000,
    "filters": ["filter1", "filter2"]
  }
}
```

**Response (201):**
```json
{
  "id": "generated-id",
  "name": "New Source",
  "type": "webhook",
  "status": "inactive",
  "config": {...}
}
```

#### PUT /sources/{sourceId}
Update an existing event source.

**Request Body:**
```json
{
  "name": "Updated Source",
  "type": "polling",
  "config": {...}
}
```

**Response (200):**
Updated source object.

#### DELETE /sources/{sourceId}
Delete an event source.

**Response (204):**
No content on success.

### Status (T039)

#### GET /status
Get system status including server connection, sources, and buffer.

**Response (200):**
```json
{
  "server": {
    "targetId": "main-server",
    "targetType": "server",
    "isConnected": true,
    "lastSuccessAt": "2024-01-01T00:00:00Z",
    "errorCount": 0
  },
  "sources": [...],
  "buffer": {
    "size": 1024000,
    "maxSize": 10485760,
    "eventCount": 42
  }
}
```

#### GET /status/server
Get server connection status only.

#### GET /status/sources
Get source statuses only.

#### GET /status/buffer
Get buffer status only.

### Health (T040)

#### GET /health
Comprehensive health check.

**Query Parameters:**
- `details` (optional): Include detailed information

**Response (200/503):**
```json
{
  "status": "healthy",  // or "degraded", "unhealthy"
  "checks": {
    "server": true,
    "buffer": true,
    "sources": true
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

#### GET /health/live
Kubernetes liveness probe endpoint.

**Response (200/503):**
```json
{
  "status": "ok"  // or "error"
}
```

#### GET /health/ready
Kubernetes readiness probe endpoint.

**Response (200/503):**
```json
{
  "status": "ready"  // or "not_ready"
}
```

## Error Responses

All error responses follow this format:

```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {}  // Optional additional information
}
```

Common error codes:
- `BAD_REQUEST`: Invalid request parameters
- `NOT_FOUND`: Resource not found
- `CONFLICT`: Resource already exists
- `VALIDATION_ERROR`: Request validation failed
- `SERVICE_UNAVAILABLE`: Service temporarily unavailable
- `INTERNAL_ERROR`: Internal server error

## Authentication

Currently, the API does not require authentication. This can be configured through environment variables.

## Rate Limiting

The API implements rate limiting:
- Default: 100 requests per minute
- Can be configured via environment variables
- Localhost requests are excluded from rate limiting

## CORS

CORS is enabled by default in development mode. Configure allowed origins in the `.env` file.

## CLI Commands

```bash
# Start server
npm run cli server start --port 3000 --host 0.0.0.0

# Check server status
npm run cli server status --url http://localhost:3000

# Stop server
npm run cli server stop
```

## Testing

```bash
# Run API test suite
npm run test:api

# Test specific endpoints
tsx src/api/test-setup.ts
```

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `API_PORT`: Server port (default: 3000)
- `API_HOST`: Server host (default: 0.0.0.0)
- `LOG_LEVEL`: Logging level (error, warn, info, debug)
- `NODE_ENV`: Environment (development, production)