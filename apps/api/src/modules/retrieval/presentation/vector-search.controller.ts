import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { CurrentUser } from '../../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/domain/auth-ports';
import { VectorSearchApplicationService } from '../application/vector-search.application.service';
import {
  DEFAULT_VECTOR_THRESHOLD,
  DEFAULT_VECTOR_TOP_K,
  MAX_VECTOR_TOP_K,
} from '../domain/vector-search.port';

class VectorSearchDto {
  @IsString()
  @Length(1, 4000)
  query!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_VECTOR_TOP_K)
  topK?: number;

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
export class VectorSearchController {
  constructor(private readonly vectorSearch: VectorSearchApplicationService) {}

  @Post('vector')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vector similarity search in a knowledge space (cosine)' })
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Param('spaceId') spaceId: string,
    @Body() body: VectorSearchDto,
  ) {
    return this.vectorSearch.search(user.id, spaceId, {
      query: body.query,
      topK: body.topK ?? DEFAULT_VECTOR_TOP_K,
      threshold: body.threshold ?? DEFAULT_VECTOR_THRESHOLD,
      versionId: body.versionId,
    });
  }
}
