import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import * as http from 'http';
import { WorkerModule } from './worker.module';
import { MetricsService } from '@app/observability';

const METRICS_PORT = 9091;

async function bootstrap() {
  const logger = new Logger('WorkerMain');
  const app = await NestFactory.createApplicationContext(WorkerModule);

  app.enableShutdownHooks();

  // Expose worker metrics on a separate port for Prometheus
  const metrics = app.get(MetricsService);
  const server = http.createServer(async (_req, res) => {
    res.setHeader('Content-Type', metrics.getContentType());
    res.end(await metrics.getMetrics());
  });
  server.listen(METRICS_PORT, () => {
    logger.log(`Worker metrics available on :${METRICS_PORT}/metrics`);
  });

  logger.log('Worker bootstrap complete');
}
bootstrap();
