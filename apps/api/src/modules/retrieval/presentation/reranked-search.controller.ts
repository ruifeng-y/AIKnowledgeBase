import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/domain/auth-ports';
import { RerankedSearchApplicationService } from '../application/reranked-search.application.service';
import {
  DEFAULT_FINAL_TOP_K,
  DEFAULT_RERANK_CANDIDATE_K,
  DEFAULT_RERANK_THRESHOLD,
  DEFAULT_RETRIEVAL_CANDIDATE_K,
  MAX_FINAL_TOP_K,
  MAX_RERANK_CANDIDATE_K,
  MAX_RETRIEVAL_CANDIDATE_K,
} from '../domain/reranked-search.port';

class RerankedSearchDto {
  @IsString()
  @Length(1, 4000)
  query!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_FINAL_TOP_K)
  topK?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_RETRIEVAL_CANDIDATE_K)
  retrievalCandidateK?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_RERANK_CANDIDATE_K)
  rerankCandidateK?: number;

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
export class RerankedSearchController {
  constructor(private readonly rerankedSearch: RerankedSearchApplicationService) {}

  @Post('reranked')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reranked hybrid search: RRF candidates → reranker → final topK',
  })
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() body: RerankedSearchDto,
  ) {
    return this.rerankedSearch.search(user.id, spaceId, {
      query: body.query,
      topK: body.topK ?? DEFAULT_FINAL_TOP_K,
      retrievalCandidateK: body.retrievalCandidateK ?? DEFAULT_RETRIEVAL_CANDIDATE_K,
      rerankCandidateK: body.rerankCandidateK ?? DEFAULT_RERANK_CANDIDATE_K,
      threshold: body.threshold ?? DEFAULT_RERANK_THRESHOLD,
      versionId: body.versionId,
    });
  }
}
