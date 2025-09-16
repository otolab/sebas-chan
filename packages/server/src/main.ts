#!/usr/bin/env node

import { createApp } from './app.js';
import { CLI } from './cli/index.js';
import { logger } from './utils/logger.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--cli') || args.includes('-c')) {
    const cli = new CLI();
    await cli.start();
  } else {
    const app = await createApp();
    const port = process.env.PORT || 3000;

    app.listen(port, () => {
      logger.info(`sebas-chan server started on port ${port}`);
    });
  }
}

main().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
