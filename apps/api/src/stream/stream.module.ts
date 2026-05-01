import { Module } from '@nestjs/common';
import { QueueModule } from '@app/queue';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';

@Module({
  imports: [QueueModule],
  controllers: [StreamController],
  providers: [StreamService],
})
export class StreamModule {}
