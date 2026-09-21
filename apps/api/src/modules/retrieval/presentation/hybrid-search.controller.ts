import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/domain/auth-ports';
import { HybridSearchApplicationService } from '../application/hybrid-search.application.service';
import {
  DEFAULT_HYBRID_CANDIDATE_K,
  DEFAULT_HYBRID_THRESHOLD,
  DEFAULT_HYBRID_TOP_K,
  MAX_HYBRID_CANDIDATE_K,
  MAX_HYBRID_TOP_K,
} from '../domain/hybrid-search.port';

class HybridSearchDto {
  @IsString()
  @Length(1, 4000)
  query!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_HYBRID_TOP_K)
  topK?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_HYBRID_CANDIDATE_K)
  candidateK?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  @Max(1)
  threshold?: number;

  @IsOptional()
  @IsString()
  versionId?: string;
}

@ApiTags('retrieval')
@ApiBearerAuth('bearer')
@Controller('spaces/:spaceId/search')
export class HybridSearchController {
  constructor(private readonly hybridSearch: HybridSearchApplicationService) {}

  @Post('hybrid')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Hybrid search: vector + lexical (PostgreSQL FTS) with RRF fusion',
  })
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() body: HybridSearchDto,
  ) {
    return this.hybridSearch.search(user.id, spaceId, {
      query: body.query,
      topK: body.topK ?? DEFAULT_HYBRID_TOP_K,
      candidateK: body.candidateK ?? DEFAULT_HYBRID_CANDIDATE_K,
      threshold: body.threshold ?? DEFAULT_HYBRID_THRESHOLD,
      versionId: body.versionId,
    });
  }
}
