import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TasksService } from '../tasks.service';

@Injectable()
export class BackpressureGuard implements CanActivate {
  private readonly logger = new Logger(BackpressureGuard.name);
  private readonly threshold: number;

  constructor(
    private readonly tasksService: TasksService,
    config: ConfigService,
  ) {
    const explicit = config.get<string>('BACKPRESSURE_THRESHOLD');
    const concurrency = parseInt(config.get('WORKER_CONCURRENCY', '3'), 10);
    this.threshold = explicit ? parseInt(explicit, 10) : concurrency * 100;
    this.logger.log(`Backpressure threshold set to ${this.threshold} (per user)`);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ body: { userId?: string } }>();
    const userId = request.body?.userId;

    if (!userId) return true;

    const depth = await this.tasksService.getQueueDepth(userId);

    if (depth >= this.threshold) {
      this.logger.warn(
        `Backpressure triggered for user ${userId} — queue depth ${depth} >= threshold ${this.threshold}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Server is under heavy load. Please retry later.',
          userId,
          queueDepth: depth,
          threshold: this.threshold,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
