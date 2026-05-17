import os from 'node:os';
import path from 'node:path';

import { SkillsProvider } from '@/modules/providers/shared/skills/skills.provider.js';
import type { ProviderSkillSource } from '@/shared/types.js';

export class OpenCodeSkillsProvider extends SkillsProvider {
  constructor() {
    super('opencode');
  }

  protected async getSkillSources(workspacePath: string): Promise<ProviderSkillSource[]> {
    return [
      {
        scope: 'user',
        rootDir: path.join(os.homedir(), '.config', 'opencode', 'skills'),
        commandPrefix: '/',
      },
      {
        scope: 'project',
        rootDir: path.join(workspacePath, '.opencode', 'skills'),
        commandPrefix: '/',
      },
    ];
  }
}
