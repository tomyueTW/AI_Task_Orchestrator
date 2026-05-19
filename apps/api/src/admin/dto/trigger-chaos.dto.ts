import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class TriggerChaosDto {
  /** How long the effect stays active (ms). Bounded so blast radius is finite. */
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(120000)
  durationMs?: number;

  /** injectLatency only: artificial delay added before each LLM call (ms). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120000)
  latencyMs?: number;
}
