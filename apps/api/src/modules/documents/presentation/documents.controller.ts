import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/domain/auth-ports';
import {
  contentDispositionFilename,
  DocumentApplicationService,
  type UploadFileInput,
} from '../application/documents.application.service';
import { CreateDocumentDto, UpdateDocumentDto } from './documents.dto';

type MulterFile = UploadFileInput;

@Controller()
@ApiTags('documents')
@ApiBearerAuth('bearer')
export class SpaceDocumentsController {
  constructor(private readonly documents: DocumentApplicationService) {}

  @Post('workspaces/:workspaceId/spaces/:spaceId/documents')
  @ApiOperation({ summary: 'Create document metadata in a knowledge space' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() body: CreateDocumentDto,
  ) {
    return this.documents.createMetadataOnly(user.id, spaceId, body);
  }

  @Get('workspaces/:workspaceId/spaces/:spaceId/documents')
  @ApiOperation({ summary: 'List documents in a knowledge space' })
  list(@CurrentUser() user: AuthenticatedUser, @Param('spaceId') spaceId: string) {
    return this.documents.listInSpace(user.id, spaceId);
  }

  @Post('spaces/:spaceId/documents/upload')
  @ApiOperation({ summary: 'Upload a document file to a knowledge space' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: { title?: string },
  ) {
    return this.documents.upload(user.id, spaceId, file as MulterFile, { title: body?.title });
  }

  @Post('spaces/:spaceId/documents/:documentId/versions')
  @ApiOperation({ summary: 'Upload a new version for an existing document' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @UploadedFile() file: MulterFile | undefined,
  ) {
    return this.documents.appendVersion(user.id, documentId, file as MulterFile);
  }
}

@ApiTags('documents')
@ApiBearerAuth('bearer')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentApplicationService) {}

  @Get(':documentId')
  @ApiOperation({ summary: 'Get owned document' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('documentId') documentId: string) {
    return this.documents.getOwned(user.id, documentId);
  }

  @Patch(':documentId')
  @ApiOperation({ summary: 'Update owned document metadata' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @Body() body: UpdateDocumentDto,
  ) {
    return this.documents.updateOwned(user.id, documentId, body);
  }

  @Delete(':documentId')
  @ApiOperation({ summary: 'Delete owned document and related storage objects' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('documentId') documentId: string) {
    await this.documents.deleteOwned(user.id, documentId);
    return { data: { success: true } };
  }

  @Get(':documentId/content')
  @ApiOperation({ summary: 'Download document content from object storage' })
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const result = await this.documents.download(user.id, documentId);
    const filename =
      typeof result.document.metadata['originalFilename'] === 'string'
        ? result.document.metadata['originalFilename']
        : result.document.title;
    const contentType = result.version.mimeType ?? 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('Content-Disposition', contentDispositionFilename(filename));
    res.status(200).end(result.buffer);
  }
}
