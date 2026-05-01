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

    let lastEventCursor = 0;

    const tick = async () => {
      try {
        const snapshot = await this.stream.snapshot();
        send('snapshot', snapshot);

        const events = this.stream.recentEvents();
        if (events.length > lastEventCursor) {
          const fresh = events.slice(lastEventCursor);
          for (const ev of fresh) send('flow', ev);
          lastEventCursor = events.length;
        } else if (events.length < lastEventCursor) {
          // ring buffer rotated — replay all
          for (const ev of events) send('flow', ev);
          lastEventCursor = events.length;
        }
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
