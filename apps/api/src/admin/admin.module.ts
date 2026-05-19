import { Module } from '@nestjs/common';
import { QueueModule } from '@app/queue';
import { AdminService } from './admin.service';
import { ChaosService } from './chaos.service';
import { ChaosController } from './chaos.controller';
import { AdminTokenGuard } from './admin-token.guard';

@Module({
  imports: [QueueModule],
  controllers: [ChaosController],
  providers: [AdminService, ChaosService, AdminTokenGuard],
})
export class AdminModule {}
