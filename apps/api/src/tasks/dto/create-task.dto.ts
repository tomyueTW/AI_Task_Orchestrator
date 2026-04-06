import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { TaskPriority } from '@app/queue';

export class CreateTaskDto {
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  model?: string;

  @IsNotEmpty()
  @IsObject()
  payload!: Record<string, unknown>;
}
