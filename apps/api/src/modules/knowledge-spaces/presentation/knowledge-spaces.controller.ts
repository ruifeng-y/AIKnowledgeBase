import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/domain/auth-ports';
import { KnowledgeSpaceApplicationService } from '../application/knowledge-spaces.application.service';
import { CreateSpaceDto, UpdateSpaceDto } from './knowledge-spaces.dto';

@Controller('workspaces/:workspaceId/spaces')
@ApiBearerAuth('bearer')
@ApiTags('knowledge-spaces')
export class WorkspaceSpacesController {
  constructor(private readonly spaces: KnowledgeSpaceApplicationService) {}

  @Post()
  @ApiOperation({ summary: 'Create knowledge space in workspace' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateSpaceDto,
  ) {
    return this.spaces.create(user.id, workspaceId, body);
  }

  @Get()
  @ApiOperation({ summary: 'List knowledge spaces in workspace' })
  list(@CurrentUser() user: AuthenticatedUser, @Param('workspaceId') workspaceId: string) {
    return this.spaces.listInWorkspace(user.id, workspaceId);
  }
}

@Controller('spaces')
@ApiBearerAuth('bearer')
@ApiTags('knowledge-spaces')
export class SpacesController {
  constructor(private readonly spaces: KnowledgeSpaceApplicationService) {}

  @Get(':spaceId')
  @ApiOperation({ summary: 'Get owned knowledge space' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.spaces.getOwned(user.id, spaceId);
  }

  @Patch(':spaceId')
  @ApiOperation({ summary: 'Update owned knowledge space' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() body: UpdateSpaceDto,
  ) {
    return this.spaces.updateOwned(user.id, spaceId, body);
  }

  @Delete(':spaceId')
  @ApiOperation({ summary: 'Delete owned knowledge space' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    await this.spaces.deleteOwned(user.id, spaceId);
    return { data: { success: true } };
  }
}
