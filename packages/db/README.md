# @sebas-chan/db

LanceDB integration package for sebas-chan system.

## Overview

This package provides database functionality using LanceDB for vector storage and search capabilities. It uses a Python worker process for LanceDB operations with TypeScript client interface.

## Setup

### Dependencies

This package uses `uv` for Python dependency management.

```bash
# Install Python dependencies
cd packages/db
uv sync
```

This will:
1. Create a virtual environment in `.venv`
2. Install all Python dependencies from `pyproject.toml`
3. Make the Python worker ready for use

### Required Python packages

- lancedb: Vector database
- pyarrow: Data serialization
- pandas: Data manipulation
- numpy: Numerical operations
- pydantic: Data validation

## Architecture

```
TypeScript Client (index.ts)
    ↓ JSON-RPC over stdio
Python Worker (lancedb_worker.py)
    ↓ LanceDB API
LanceDB Database
```

## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- src/db-client.test.ts    # CRUD operations
npm test -- test/python-integration.test.ts  # Python integration
```

### Test Coverage

1. **CRUD Operations**: Basic Create, Read, Update, Delete operations for Issues
2. **Schema Validation**: Ensures data integrity and schema compliance
3. **Vector Search**: Tests similarity search capabilities (when embeddings are implemented)
4. **Python Integration**: Validates TypeScript-Python communication via JSON-RPC
5. **Error Handling**: Tests graceful error recovery

## Usage

```typescript
import { DBClient } from '@sebas-chan/db';

const client = new DBClient();
await client.connect();

// Create an issue
const issueId = await client.addIssue({
  title: 'Test Issue',
  description: 'Description',
  status: 'open',
  labels: ['bug'],
  updates: [],
  relations: [],
  sourceInputIds: []
});

// Retrieve an issue
const issue = await client.getIssue(issueId);

// Search issues
const results = await client.searchIssues('bug');

// Disconnect when done
await client.disconnect();
```

## Development

### Python Worker

The Python worker (`src/python/lancedb_worker.py`) handles:
- LanceDB connections
- Table management
- Vector operations
- JSON-RPC communication

### TypeScript Client

The TypeScript client (`src/index.ts`) provides:
- Process management for Python worker
- Type-safe API
- Error handling
- Automatic reconnection

## Troubleshooting

### Python dependencies not found

If you see `ModuleNotFoundError: No module named 'lancedb'`:

```bash
cd packages/db
uv sync
```

### Python version issues

The package requires Python 3.11+. Check your Python version:

```bash
python3 --version
```

If using pyenv, ensure Python is available:

```bash
pyenv versions
pyenv global 3.11.13  # or your preferred version
```

## Future Improvements

- [ ] Real embedding model integration (currently using dummy vectors)
- [ ] Vector similarity search implementation
- [ ] Data persistence optimization
- [ ] Connection pooling for Python worker
- [ ] Better error recovery mechanisms