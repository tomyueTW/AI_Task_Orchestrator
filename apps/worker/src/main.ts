import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const logger = new Logger('WorkerMain');
  const app = await NestFactory.createApplicationContext(WorkerModule);

  // NestJS shutdown hooks trigger OnModuleDestroy lifecycle
  // which calls worker.close() — waits for active jobs to finish
  app.enableShutdownHooks();

  logger.log('Worker bootstrap complete');
}
bootstrap();
