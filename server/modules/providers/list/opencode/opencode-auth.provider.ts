import spawn from 'cross-spawn';

import type { IProviderAuth } from '@/shared/interfaces.js';
import type { ProviderAuthStatus } from '@/shared/types.js';

export class OpenCodeProviderAuth implements IProviderAuth {
  private checkInstalled(): boolean {
    const cliPath = process.env.OPENCODE_BIN_PATH || 'opencode';
    try {
      spawn.sync(cliPath, ['--version'], { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<ProviderAuthStatus> {
    const installed = this.checkInstalled();

    return {
      installed,
      provider: 'opencode',
      authenticated: installed,
      email: null,
      method: installed ? 'cli' : null,
      error: installed ? undefined : 'Opencode CLI is not installed',
    };
  }
}
