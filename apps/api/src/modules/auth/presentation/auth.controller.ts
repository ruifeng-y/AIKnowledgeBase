import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../common/auth/jwt-auth.guard';
import { AuthApplicationService } from '../../users/application/auth.application.service';
import { LoginDto, RefreshDto, RegisterDto } from './auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthApplicationService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() body: RefreshDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @ApiBearerAuth('bearer')
  @HttpCode(200)
  @Post('logout')
  @ApiOperation({ summary: 'Logout (client discards tokens)' })
  @ApiOkResponse({ description: 'Always succeeds for stateless JWT' })
  logout() {
    return { data: this.auth.logout() };
  }
}
