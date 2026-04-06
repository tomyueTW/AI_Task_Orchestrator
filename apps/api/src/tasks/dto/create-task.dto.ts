import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { TaskPriority } from '@app/queue';

export class CreateTaskDto {
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsNotEmpty()
  @IsObject()
  payload!: Record<string, unknown>;
}
