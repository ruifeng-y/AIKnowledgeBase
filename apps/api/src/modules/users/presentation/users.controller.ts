import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/domain/auth-ports';
import { AuthApplicationService } from '../application/auth.application.service';

@ApiTags('users')
@ApiBearerAuth('bearer')
@Controller('users')
export class UsersController {
  constructor(private readonly auth: AuthApplicationService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }
}
