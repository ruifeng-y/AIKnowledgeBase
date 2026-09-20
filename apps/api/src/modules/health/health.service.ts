import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@akb/contracts';

@Injectable()
export class HealthService {
  getHealth(): HealthResponse {
    return { status: 'ok' };
  }
}
