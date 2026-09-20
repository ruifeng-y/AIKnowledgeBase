import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@akb/contracts';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}
