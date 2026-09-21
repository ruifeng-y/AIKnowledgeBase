import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/domain/auth-ports';
import { WorkspaceApplicationService } from '../application/workspaces.application.service';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './workspaces.dto';

@ApiTags('workspaces')
@ApiBearerAuth('bearer')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspaceApplicationService) {}

  @Post()
  @ApiOperation({ summary: 'Create workspace owned by current user' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateWorkspaceDto) {
    return this.workspaces.create(user.id, body);
  }

  @Get()
  @ApiOperation({ summary: 'List workspaces owned by current user' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.workspaces.list(user.id);
  }

  @Get(':workspaceId')
  @ApiOperation({ summary: 'Get owned workspace' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') workspaceId: string) {
    return this.workspaces.getOwned(user.id, workspaceId);
  }

  @Patch(':workspaceId')
  @ApiOperation({ summary: 'Update owned workspace' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body() body: UpdateWorkspaceDto,
  ) {
    return this.workspaces.updateOwned(user.id, workspaceId, body);
  }

  @Delete(':workspaceId')
  @ApiOperation({ summary: 'Delete owned workspace' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') workspaceId: string) {
    await this.workspaces.deleteOwned(user.id, workspaceId);
    return { data: { success: true } };
  }
}
