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
import { WorkflowsService, WorkflowMeta, WorkflowStatus, DagStatus } from './workflows.service';
import { DagMeta } from '@app/workflow';
import { CreateChainDto } from './dto/create-chain.dto';
import { CreateDagDto } from './dto/create-dag.dto';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Post('chain')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createChain(@Body() dto: CreateChainDto): Promise<WorkflowMeta> {
    return this.workflows.createChain(dto);
  }

  @Post('dag')
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createDag(@Body() dto: CreateDagDto): Promise<DagMeta> {
    return this.workflows.createDag(dto);
  }

  @Get('dag/:id')
  async findDag(@Param('id') id: string): Promise<DagStatus> {
    return this.workflows.findDag(id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<WorkflowStatus> {
    return this.workflows.findOne(id);
  }
}
