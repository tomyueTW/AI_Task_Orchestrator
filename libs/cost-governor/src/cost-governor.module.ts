import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './llm.service';
import { CostTrackerService } from './cost-tracker.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [LlmService, CostTrackerService],
  exports: [LlmService, CostTrackerService],
})
export class CostGovernorModule {}
