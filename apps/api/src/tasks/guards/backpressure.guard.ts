import {
  CanActivate,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { TASK_QUEUE } from '@app/queue';

@Injectable()
export class BackpressureGuard implements CanActivate {
  private readonly logger = new Logger(BackpressureGuard.name);
  private readonly threshold: number;

  constructor(
    @InjectQueue(TASK_QUEUE) private readonly taskQueue: Queue,
    config: ConfigService,
  ) {
    const explicit = config.get<string>('BACKPRESSURE_THRESHOLD');
    const concurrency = parseInt(config.get('WORKER_CONCURRENCY', '3'), 10);
    this.threshold = explicit ? parseInt(explicit, 10) : concurrency * 100;
    this.logger.log(`Backpressure threshold set to ${this.threshold}`);
  }

  async canActivate(): Promise<boolean> {
    const waiting = await this.taskQueue.getWaitingCount();
    const active = await this.taskQueue.getActiveCount();
    const depth = waiting + active;

    if (depth >= this.threshold) {
      this.logger.warn(
        `Backpressure triggered — queue depth ${depth} >= threshold ${this.threshold}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Server is under heavy load. Please retry later.',
          queueDepth: depth,
          threshold: this.threshold,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
