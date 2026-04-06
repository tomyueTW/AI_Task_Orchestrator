import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from '@app/observability';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.metrics.getMetrics();
  }
}
