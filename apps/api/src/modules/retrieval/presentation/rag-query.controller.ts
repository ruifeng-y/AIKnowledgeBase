import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/domain/auth-ports';
import { RagQueryApplicationService } from '../application/rag-query.application.service';
import {
  DEFAULT_CONTEXT_TOKEN_BUDGET,
  DEFAULT_CONTEXT_TOP_K,
  MAX_CONTEXT_TOKEN_BUDGET,
  MAX_CONTEXT_TOP_K,
  MIN_CONTEXT_TOKEN_BUDGET,
} from '../domain/rag.port';

class RagQueryDto {
  @IsString()
  @Length(1, 4000)
  query!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_CONTEXT_TOP_K)
  contextTopK?: number;

  @IsOptional()
  @IsInt()
  @Min(MIN_CONTEXT_TOKEN_BUDGET)
  @Max(MAX_CONTEXT_TOKEN_BUDGET)
  contextTokenBudget?: number;

  @IsOptional()
  @IsString()
  versionId?: string;
}

@ApiTags('rag')
@ApiBearerAuth('bearer')
@Controller('spaces/:spaceId/rag')
export class RagQueryController {
  constructor(private readonly ragQuery: RagQueryApplicationService) {}

  @Post('query')
  @HttpCode(200)
  @ApiOperation({ summary: 'Grounded RAG query with citation validation' })
  query(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() body: RagQueryDto,
  ) {
    return this.ragQuery.search(user.id, spaceId, {
      query: body.query,
      contextTopK: body.contextTopK ?? DEFAULT_CONTEXT_TOP_K,
      contextTokenBudget: body.contextTokenBudget ?? DEFAULT_CONTEXT_TOKEN_BUDGET,
      versionId: body.versionId,
    });
  }
}
