import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './llm.service';
import { CostTrackerService } from './cost-tracker.service';
import { RateLimiterService } from './rate-limiter.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RateLimiterService, LlmService, CostTrackerService],
  exports: [LlmService, CostTrackerService, RateLimiterService],
})
export class CostGovernorModule {}
