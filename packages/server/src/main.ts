#!/usr/bin/env node

import { createApp } from './app';
import { CLI } from './cli';
import { logger } from './utils/logger';

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