import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/**
 * Gate for chaos / admin-mutation endpoints.
 *
 * Fail-closed: if ADMIN_TOKEN is unset, every request is rejected (403) — a
 * misconfigured deploy must never silently expose stability-affecting actions.
 * The token is read from the `x-admin-token` header and compared in
 * constant time; it is never logged.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('ADMIN_TOKEN');
    if (!expected) {
      throw new ForbiddenException(
        'ADMIN_TOKEN is not configured — admin endpoints are disabled',
      );
    }

    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.header('x-admin-token') ?? '';

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    const ok = a.length === b.length && timingSafeEqual(a, b);
    if (!ok) {
      throw new UnauthorizedException('Invalid or missing x-admin-token');
    }
    return true;
  }
}
