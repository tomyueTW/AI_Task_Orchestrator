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

export class DagNodeDto {
  @IsNotEmpty()
  @IsString()
  id!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependsOn?: string[];

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

export class CreateDagDto {
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DagNodeDto)
  nodes!: DagNodeDto[];
}
