import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { TaskPriority, TaskType } from '@app/queue';

export class CreateTaskDto {
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsEnum(TaskType)
  taskType?: TaskType;

  @IsOptional()
  @IsString()
  model?: string;

  @IsNotEmpty()
  @IsObject()
  payload!: Record<string, unknown>;
}
