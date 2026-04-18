import { Module } from '@nestjs/common';
import { QueueModule } from '@app/queue';
import { AdminService } from './admin.service';

@Module({
  imports: [QueueModule],
  providers: [AdminService],
})
export class AdminModule {}
