import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ObservabilityModule } from '@app/observability';
import { TasksModule } from './tasks/tasks.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { AdminModule } from './admin/admin.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ObservabilityModule,
    TasksModule,
    WorkflowsModule,
    AdminModule,
    MetricsModule,
  ],
})
export class AppModule {}
