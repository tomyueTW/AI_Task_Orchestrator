import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of, tap } from 'rxjs';
import { IdempotencyService } from '@app/idempotency';

const HEADER = 'idempotency-key';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const key = request.headers[HEADER];

    if (!key) {
      return next.handle();
    }

    const entry = await this.idempotency.acquire(key);

    if (entry) {
      if (entry.status === 'processing') {
        throw new ConflictException(
          'A request with this Idempotency-Key is already being processed.',
        );
      }
      // status === 'done' — return cached response
      return of(entry.response);
    }

    // Key acquired — proceed and cache the response
    return next.handle().pipe(
      tap(async (response) => {
        await this.idempotency.complete(key, response);
      }),
    );
  }
}
