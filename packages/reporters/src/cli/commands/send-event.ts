/**
 * Send event command implementation
 * T041: Send events via CLI
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { bufferService, eventCollector, serverClient, logger } from '../../services';
import { EventType, IEvent } from '../../types';
import { Event } from '../../models';

/**
 * Parse event type from string
 */
function parseEventType(type: string): EventType {
  const normalized = type.toLowerCase();
  switch (normalized) {
    case 'notification':
      return EventType.NOTIFICATION;
    case 'message':
      return EventType.MESSAGE;
    case 'calendar':
      return EventType.CALENDAR;
    case 'todo':
      return EventType.TODO;
    default:
      return EventType.OTHER;
  }
}

/**
 * Parse JSON payload
 */
function parsePayload(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch (error) {
    // If it's not valid JSON, treat it as a simple string
    return { message: payload };
  }
}

/**
 * Load events from file
 */
function loadEventsFromFile(filePath: string): IEvent[] {
  try {
    const absolutePath = resolve(process.cwd(), filePath);
    const content = readFileSync(absolutePath, 'utf-8');
    const data = JSON.parse(content);

    // Handle both single event and array of events
    const eventsData = Array.isArray(data) ? data : [data];

    return eventsData.map((eventData) => {
      const event = new Event(
        parseEventType(eventData.type || 'other'),
        eventData.sourceId || 'cli',
        eventData.payload || {}
      );

      // Override ID if provided
      if (eventData.id) {
        (event as any).id = eventData.id;
      }

      return event;
    });
  } catch (error) {
    throw new Error(`Failed to load events from file: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Format output based on format option
 */
function formatOutput(data: any, format: string): string {
  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }

  // Default human-readable format
  if (data.success) {
    return `✓ Event sent successfully
  Event ID: ${data.eventId}
  Type: ${data.type}
  Source: ${data.sourceId}
  Status: ${data.status}`;
  } else {
    return `✗ Failed to send event
  Error: ${data.error}
  Buffered: ${data.buffered ? 'Yes' : 'No'}`;
  }
}

/**
 * Create send-event command
 */
export function createSendEventCommand(): Command {
  const command = new Command('send-event');

  command
    .description('Send an event to sebas-chan server')
    .option('-t, --type <type>', 'Event type (notification, message, calendar, todo, other)', 'notification')
    .option('-s, --source-id <id>', 'Source identifier', 'cli')
    .option('-p, --payload <json>', 'Event payload as JSON string')
    .option('-f, --file <path>', 'Load event(s) from JSON file')
    .option('--format <format>', 'Output format (text, json)', 'text')
    .option('--no-buffer', 'Do not buffer on failure')
    .option('--timeout <ms>', 'Request timeout in milliseconds', '30000')
    .action(async (options) => {
      try {
        let events: IEvent[];

        if (options.file) {
          // Load events from file
          events = loadEventsFromFile(options.file);
          logger.info(`Loaded ${events.length} event(s) from file: ${options.file}`);
        } else {
          // Create single event from command line options
          const payload = options.payload ? parsePayload(options.payload) : {};
          const event = new Event(
            parseEventType(options.type),
            options.sourceId,
            payload
          );
          events = [event];
        }

        // Try to send events
        const results = [];
        for (const event of events) {
          try {
            // Set timeout for server client
            const originalTimeout = serverClient['config'].timeout;
            serverClient['config'].timeout = parseInt(options.timeout, 10);

            // Try to send to server
            const response = await serverClient.sendEvent(event);

            results.push({
              success: true,
              eventId: event.id,
              type: event.type,
              sourceId: event.sourceId,
              status: 'sent',
              response,
            });

            // Restore original timeout
            serverClient['config'].timeout = originalTimeout;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.warn(`Failed to send event ${event.id}: ${errorMessage}`);

            // Buffer the event if enabled
            let buffered = false;
            if (options.buffer !== false) {
              try {
                await bufferService.addEvent(event);
                buffered = true;
                logger.info(`Event ${event.id} buffered for retry`);
              } catch (bufferError) {
                logger.error(`Failed to buffer event ${event.id}:`, bufferError);
              }
            }

            results.push({
              success: false,
              eventId: event.id,
              type: event.type,
              sourceId: event.sourceId,
              error: errorMessage,
              buffered,
            });
          }
        }

        // Output results
        if (events.length === 1) {
          console.log(formatOutput(results[0], options.format));
        } else {
          if (options.format === 'json') {
            console.log(JSON.stringify(results, null, 2));
          } else {
            // Summary for multiple events
            const successful = results.filter(r => r.success).length;
            const buffered = results.filter(r => !r.success && r.buffered).length;
            const failed = results.filter(r => !r.success && !r.buffered).length;

            console.log(`Events processed: ${events.length}`);
            console.log(`  ✓ Sent: ${successful}`);
            if (buffered > 0) console.log(`  ⏸ Buffered: ${buffered}`);
            if (failed > 0) console.log(`  ✗ Failed: ${failed}`);
          }
        }

        // Exit with appropriate code
        const hasFailures = results.some(r => !r.success && !r.buffered);
        process.exit(hasFailures ? 1 : 0);
      } catch (error) {
        logger.error('Send event command failed:', error);

        if (options.format === 'json') {
          console.error(JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
          }, null, 2));
        } else {
          console.error(`Error: ${error instanceof Error ? error.message : error}`);
        }

        process.exit(1);
      }
    });

  return command;
}