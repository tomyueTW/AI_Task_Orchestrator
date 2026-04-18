import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { TaskPriority, TaskType } from '@app/queue';

export class ChainStepDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

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

export class CreateChainDto {
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => ChainStepDto)
  steps!: ChainStepDto[];
}
