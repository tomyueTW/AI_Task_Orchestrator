import { IsNotEmpty, IsObject } from 'class-validator';

export class CreateTaskDto {
  @IsNotEmpty()
  @IsObject()
  payload!: Record<string, unknown>;
}
