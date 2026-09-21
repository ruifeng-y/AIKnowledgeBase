import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/domain/auth-ports';
import { DocumentProcessingApplicationService } from '../application/document-processing.application.service';

@ApiTags('documents')
@ApiBearerAuth('bearer')
@Controller('documents')
export class DocumentProcessingController {
  constructor(private readonly processing: DocumentProcessingApplicationService) {}

  @Get(':documentId/processing')
  @ApiOperation({ summary: 'Get document processing status' })
  status(@CurrentUser() user: AuthenticatedUser, @Param('documentId') documentId: string) {
    return this.processing.getStatus(user.id, documentId);
  }

  @Post(':documentId/reprocess')
  @ApiOperation({ summary: 'Reprocess current document version' })
  reprocess(@CurrentUser() user: AuthenticatedUser, @Param('documentId') documentId: string) {
    return this.processing.reprocess(user.id, documentId);
  }
}
