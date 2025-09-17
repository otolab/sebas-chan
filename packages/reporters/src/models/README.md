# Data Models

This directory contains the core data models for the reporters package, implementing the specifications from `/specs/002-packages-reporters-sebas/data-model.md`.

## Models Overview

### Event (T021)
- **File**: `Event.ts`
- **Purpose**: Represents collected event data
- **Features**:
  - UUID v4 validation for ID
  - Timestamp validation (no future dates)
  - JSON Lines format support
  - Attempt tracking for retries
  - Zod schema validation

### EventSource (T022)
- **File**: `EventSource.ts`
- **Purpose**: Manages external system configurations
- **Features**:
  - Source type validation (webhook, polling, stream)
  - Status management (active, inactive, error)
  - Configuration validation including endpoint URLs and intervals
  - State transitions support

### FileBuffer (T023)
- **File**: `FileBuffer.ts`
- **Purpose**: File-based buffer management with JSON Lines support
- **Features**:
  - JSON Lines format for event storage
  - Size constraints (1MB min, 1GB max)
  - File rotation support
  - Lock file mechanism for concurrent access
  - Memory-limited event caching (max 1000 events)

### ConnectionStatus (T024)
- **File**: `ConnectionStatus.ts`
- **Purpose**: Tracks connection states with servers and sources
- **Features**:
  - Connection health monitoring
  - Error tracking and counting
  - Exponential backoff calculation
  - Success/failure recording
  - Reconnection decision logic

### Types (T025)
- **File**: `../types/index.ts`
- **Purpose**: Shared type definitions and enums
- **Features**:
  - Enum definitions for all states and types
  - Interface definitions for all models
  - Configuration constants
  - File path constants

## Usage Examples

```typescript
import { Event, EventType, EventSource, SourceType } from '@sebas-chan/reporters/models';

// Create an event
const event = Event.create({
  type: EventType.NOTIFICATION,
  sourceId: 'slack',
  timestamp: new Date(),
  payload: { message: 'New notification' }
});

// Create an event source
const source = EventSource.create({
  id: 'slack-webhook',
  name: 'Slack Notifications',
  type: SourceType.WEBHOOK,
  config: {
    endpoint: 'https://api.slack.com/webhook'
  }
});

// Activate the source
const activeSource = source.activate();
```

## Validation

All models use Zod for runtime validation:

```typescript
import { Event } from '@sebas-chan/reporters/models';

const result = Event.validate(unknownData);
if (result.success) {
  console.log('Valid event:', result.data);
} else {
  console.error('Validation errors:', result.error);
}
```

## File Storage

Events are stored in JSON Lines format:

```json
{"id":"uuid","type":"notification","sourceId":"slack","timestamp":"2025-09-17T10:00:00Z","payload":{...}}
{"id":"uuid","type":"calendar","sourceId":"google","timestamp":"2025-09-17T10:01:00Z","payload":{...}}
```

## Testing

Unit tests are available in `/tests/unit/models.test.ts`

Run tests with:
```bash
npm run test:unit -- models.test.ts
```