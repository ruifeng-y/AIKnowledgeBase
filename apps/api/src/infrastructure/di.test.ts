import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { AuthApplicationService } from '../modules/users/application/auth.application.service';
import { WorkspaceApplicationService } from '../modules/workspaces/application/workspaces.application.service';
import { KnowledgeSpaceApplicationService } from '../modules/knowledge-spaces/application/knowledge-spaces.application.service';
import { AuthorizationService } from '../modules/shared/application/authorization.service';
import { PASSWORD_SERVICE, TOKEN_SERVICE } from '../modules/auth/domain/auth-ports';
import { USER_ACCOUNT_REPOSITORY } from '../modules/users/domain/user-account.port';
import { WORKSPACE_REPOSITORY } from '../modules/workspaces/domain/workspace-repository.port';
import { KNOWLEDGE_SPACE_REPOSITORY } from '../modules/knowledge-spaces/domain/knowledge-space-repository.port';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';

describe('V0.4-E DI wiring', () => {
  it('resolves auth/workspace/space application services and guards', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(AuthApplicationService)).toBeDefined();
    expect(moduleRef.get(WorkspaceApplicationService)).toBeDefined();
    expect(moduleRef.get(KnowledgeSpaceApplicationService)).toBeDefined();
    expect(moduleRef.get(AuthorizationService, { strict: false })).toBeDefined();
    expect(moduleRef.get(PASSWORD_SERVICE)).toBeDefined();
    expect(moduleRef.get(TOKEN_SERVICE)).toBeDefined();
    expect(moduleRef.get(USER_ACCOUNT_REPOSITORY)).toBeDefined();
    expect(moduleRef.get(WORKSPACE_REPOSITORY)).toBeDefined();
    expect(moduleRef.get(KNOWLEDGE_SPACE_REPOSITORY)).toBeDefined();
    expect(moduleRef.get(JwtAuthGuard)).toBeDefined();
    await moduleRef.close();
  }, 30_000);
});
