import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from '@app/observability';
import { CostSummary, CostSummaryService } from './cost-summary.service';

@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly costSummary: CostSummaryService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.metrics.getMetrics();
  }

  @Get('summary')
  async getSummary(): Promise<CostSummary> {
    return this.costSummary.fetchSummary();
  }
}
