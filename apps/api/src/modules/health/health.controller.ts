import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@akb/contracts';
import { Public } from '../../common/auth/jwt-auth.guard';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({ description: 'Service is healthy' })
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }
}
