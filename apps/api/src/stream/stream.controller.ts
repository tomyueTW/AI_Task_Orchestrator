import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { StreamService } from './stream.service';

@Controller('stream')
export class StreamController {
  constructor(private readonly stream: StreamService) {}

  @Get('queues')
  async streamQueues(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const tick = async () => {
      try {
        const snapshot = await this.stream.snapshot();
        send('snapshot', snapshot);
      } catch (err: unknown) {
        send('error', { message: (err as Error).message });
      }
    };

    await tick();
    const interval = setInterval(tick, 1000);

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    res.on('close', () => {
      clearInterval(interval);
      clearInterval(heartbeat);
      res.end();
    });
  }
}
