import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  app.enableShutdownHooks();

  process.on('SIGTERM', async () => {
    await app.close();
  });
}
bootstrap();
