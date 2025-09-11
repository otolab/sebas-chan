# @sebas-chan/reporter-sdk

Reporter SDK for sebas-chan system - Tools for submitting information to the sebas-chan information management system.

## Overview

This package provides:
- **Reporter SDK**: A TypeScript SDK for building custom reporters
- **Manual Reporter CLI**: A command-line tool for manually submitting inputs

## Installation

```bash
# Install globally
npm install -g @sebas-chan/reporter-sdk

# Or run with npx
npx @sebas-chan/reporter-sdk manual-reporter --help
```

## Manual Reporter CLI

The Manual Reporter is a command-line tool for submitting inputs to the sebas-chan system.

### Commands

#### `submit` - Submit a single input

Submit content directly or from a file to the sebas-chan system.

```bash
# Submit content directly
manual-reporter submit -c "Your input content here"

# Submit from a file
manual-reporter submit -f ./notes.txt

# Specify a custom source identifier
manual-reporter submit -c "Meeting notes" -s "meeting"

# Use a different API endpoint
manual-reporter submit -c "Test" --url http://localhost:8080
```

**Options:**
- `-c, --content <content>` - Input content as a string
- `-f, --file <file>` - Path to file containing the input content
- `-s, --source <source>` - Source identifier for tracking (default: "manual")
- `-u, --url <url>` - API endpoint URL (default: http://localhost:3001)

**Note:** Either `--content` or `--file` must be provided.

#### `watch` - Watch files for changes

Monitor files or directories and automatically submit new or modified content.

```bash
# Watch a single file
manual-reporter watch -f inbox.txt

# Watch a directory for .md files
manual-reporter watch -d ./notes -p "*.md"

# Custom polling interval (5 seconds)
manual-reporter watch -f todo.txt --interval 5000

# Watch with custom source
manual-reporter watch -d ./tasks -s "task-files"
```

**Options:**
- `-f, --file <file>` - Path to a specific file to watch
- `-d, --dir <dir>` - Path to a directory to watch
- `-p, --pattern <pattern>` - Glob pattern for files in directory mode (default: "*.txt")
- `-s, --source <source>` - Source identifier (default: "manual")
- `-i, --interval <ms>` - Polling interval in milliseconds (default: 1000)
- `-u, --url <url>` - API endpoint URL (default: http://localhost:3001)

**Notes:**
- Either `--file` or `--dir` must be provided
- Press `Ctrl+C` to stop watching
- Each file change creates a new input in the system

#### `health` - Check API health

Verify that the sebas-chan API server is running and accessible.

```bash
# Check default endpoint
manual-reporter health

# Check custom endpoint
manual-reporter health --url http://localhost:8080
```

**Options:**
- `-u, --url <url>` - API endpoint URL to check (default: http://localhost:3001)

**Exit codes:**
- `0` - API is healthy
- `1` - API is not responding or unhealthy

### Examples

#### Daily workflow example

```bash
# Check if server is running
manual-reporter health

# Submit morning tasks
manual-reporter submit -f ~/tasks/today.md -s "daily-planning"

# Watch inbox file for new inputs throughout the day
manual-reporter watch -f ~/inbox.txt -s "inbox"
```

#### Batch processing example

```bash
# Submit multiple files from a directory
for file in ./inputs/*.txt; do
  manual-reporter submit -f "$file" -s "batch"
done
```

#### Integration with other tools

```bash
# Pipe output from another command
echo "System status: All green" | manual-reporter submit -c "$(cat)" -s "monitoring"

# Use in scripts with health check
if manual-reporter health; then
  manual-reporter submit -c "Deployment successful" -s "deployment"
fi
```

## Reporter SDK API

For building custom reporters programmatically:

### Basic Usage

```typescript
import { ReporterClient } from '@sebas-chan/reporter-sdk';

const client = new ReporterClient({
  apiUrl: 'http://localhost:3001',
  retryOptions: {
    maxRetries: 3,
    retryDelay: 1000,
  },
});

// Submit a single input
const result = await client.submitInput({
  source: 'my-reporter',
  content: 'Input content here',
});

if (result.success) {
  console.log('Input submitted:', result.inputId);
}
```

### Creating a Custom Reporter

```typescript
import { BaseReporter } from '@sebas-chan/reporter-sdk';

class MyCustomReporter extends BaseReporter {
  protected async onStart(): Promise<void> {
    // Setup your reporter
    console.log('Starting custom reporter...');
    
    // Example: Poll an external service
    this.setupPolling(5000, async () => {
      const data = await fetchDataFromSource();
      await this.submitInput(data.content);
    });
  }

  protected async onStop(): Promise<void> {
    // Cleanup
    console.log('Stopping custom reporter...');
  }
}

// Use the reporter
const reporter = new MyCustomReporter({
  name: 'my-custom-reporter',
  source: 'custom',
  apiUrl: 'http://localhost:3001',
});

await reporter.start();
```

## Configuration

### API Endpoint

The default API endpoint is `http://localhost:3001`. You can change this:

1. Using command-line options: `--url http://your-server:port`
2. In SDK: Pass `apiUrl` in the configuration

### Source Identifiers

The `source` field helps track where information originated:
- `"manual"` - Default for manual input
- `"meeting"` - Meeting notes
- `"tasks"` - Task lists
- `"inbox"` - General inbox
- Custom identifiers for your use case

## Troubleshooting

### API Connection Issues

```bash
# Check if the server is running
manual-reporter health

# Verify the correct URL
manual-reporter health --url http://your-server:3001
```

### File Encoding

Files are read as UTF-8. Ensure your text files are properly encoded.

### Watch Mode Issues

- Ensure you have read permissions for watched files/directories
- The polling interval affects how quickly changes are detected
- Very large files may take time to process

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Development mode (watch for changes)
npm run dev
```

## License

MIT

## See Also

- [sebas-chan documentation](https://github.com/otolab/sebas-chan)
- [API Reference](https://github.com/otolab/sebas-chan/blob/main/docs/INTERFACES.md)