import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class CreateTaskDto {
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @IsNotEmpty()
  @IsObject()
  payload!: Record<string, unknown>;
}
