import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CHAOS_ACTIONS, ChaosAction } from '@app/queue';
import { AdminTokenGuard } from './admin-token.guard';
import { ChaosService } from './chaos.service';
import { TriggerChaosDto } from './dto/trigger-chaos.dto';

@Controller('admin/chaos')
@UseGuards(AdminTokenGuard)
export class ChaosController {
  constructor(private readonly chaos: ChaosService) {}

  @Get()
  status() {
    return this.chaos.status();
  }

  @Post(':action')
  @HttpCode(HttpStatus.ACCEPTED)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  trigger(@Param('action') action: string, @Body() dto: TriggerChaosDto) {
    if (!CHAOS_ACTIONS.includes(action as ChaosAction)) {
      throw new BadRequestException(
        `Unknown chaos action "${action}". Valid: ${CHAOS_ACTIONS.join(', ')}`,
      );
    }
    return this.chaos.trigger(action as ChaosAction, dto);
  }
}
