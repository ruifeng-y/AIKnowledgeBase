import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './presentation/users.controller';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
})
export class UsersModule {}
