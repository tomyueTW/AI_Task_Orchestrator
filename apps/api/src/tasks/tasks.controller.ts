import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards, UseInterceptors, UsePipes, ValidationPipe } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { BackpressureGuard } from './guards/backpressure.guard';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { Task } from '@app/queue';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(BackpressureGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(@Body() dto: CreateTaskDto): Promise<Task> {
    return this.tasksService.create(dto.userId, dto.payload, dto.priority, dto.model);
  }

  @Get('dlq')
  async findDlq(): Promise<unknown[]> {
    return this.tasksService.findDlq();
  }

  @Post('dlq/:id/retry')
  @HttpCode(HttpStatus.CREATED)
  async retryFromDlq(@Param('id') id: string): Promise<Task> {
    return this.tasksService.retryFromDlq(id);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Query('userId') userId: string,
  ): Promise<Task> {
    return this.tasksService.findOne(id, userId);
  }
}
