import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/domain/auth-ports';
import { DocumentChunksApplicationService } from '../application/document-chunks.application.service';

@ApiTags('documents')
@ApiBearerAuth('bearer')
@Controller('documents')
export class DocumentChunksController {
  constructor(private readonly chunksApp: DocumentChunksApplicationService) {}

  @Get(':documentId/chunks')
  @ApiOperation({
    summary: 'List knowledge chunks for a document version (default: current version)',
  })
  @ApiQuery({ name: 'versionId', required: false, description: 'Document version id' })
  @ApiOkResponse({ description: 'Chunks belonging to the requested or current version' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @Query('versionId') versionId?: string,
  ) {
    return this.chunksApp.list(user.id, documentId, versionId);
  }
}
