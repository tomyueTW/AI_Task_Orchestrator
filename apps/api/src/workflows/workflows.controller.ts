import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { WorkflowsService, WorkflowMeta, WorkflowStatus } from './workflows.service';
import { CreateChainDto } from './dto/create-chain.dto';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Post('chain')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createChain(@Body() dto: CreateChainDto): Promise<WorkflowMeta> {
    return this.workflows.createChain(dto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<WorkflowStatus> {
    return this.workflows.findOne(id);
  }
}
