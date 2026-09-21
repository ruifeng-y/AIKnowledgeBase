import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/domain/auth-ports';
import { DocumentChunksApplicationService } from '../application/document-chunks.application.service';

@ApiTags('documents')
@ApiBearerAuth('bearer')
@Controller('documents')
export class DocumentChunksController {
  constructor(private readonly chunksApp: DocumentChunksApplicationService) {}

  @Get(':documentId/chunks')
  @ApiOperation({ summary: 'List knowledge chunks for current document version' })
  list(@CurrentUser() user: AuthenticatedUser, @Param('documentId') documentId: string) {
    return this.chunksApp.list(user.id, documentId);
  }
}
