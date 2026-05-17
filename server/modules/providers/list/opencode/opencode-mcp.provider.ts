import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { McpProvider } from '@/modules/providers/shared/mcp/mcp.provider.js';
import type { McpScope, ProviderMcpServer, UpsertProviderMcpServerInput } from '@/shared/types.js';
import {
  AppError,
  readObjectRecord,
  readOptionalString,
  readStringArray,
  readStringRecord,
} from '@/shared/utils.js';

function stripJsoncComments(input: string): string {
  return input.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

async function readOpencodeConfig(configPath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(configPath, 'utf8');
    const stripped = stripJsoncComments(raw);
    return readObjectRecord(JSON.parse(stripped)) ?? {};
  } catch {
    return {};
  }
}

export class OpenCodeMcpProvider extends McpProvider {
  constructor() {
    super('opencode', ['user', 'project'], ['stdio', 'http', 'sse']);
  }

  protected async readScopedServers(scope: McpScope, workspacePath: string): Promise<Record<string, unknown>> {
    const candidates: string[] = [];

    if (scope === 'user' || scope === 'project') {
      candidates.push(path.join(os.homedir(), '.config', 'opencode', 'opencode.jsonc'));
      candidates.push(path.join(os.homedir(), '.config', 'opencode', 'opencode.json'));
    }

    if (scope === 'project') {
      candidates.push(path.join(workspacePath, 'opencode.jsonc'));
      candidates.push(path.join(workspacePath, 'opencode.json'));
    }

    for (const filePath of candidates) {
      const config = await readOpencodeConfig(filePath);
      const mcpServers = readObjectRecord(config.mcp?.servers || config.mcpServers);
      if (mcpServers && Object.keys(mcpServers).length > 0) {
        return mcpServers as Record<string, unknown>;
      }
    }

    return {};
  }

  protected async writeScopedServers(
    scope: McpScope,
    workspacePath: string,
    servers: Record<string, unknown>,
  ): Promise<void> {
    const configPath = scope === 'user'
      ? path.join(os.homedir(), '.config', 'opencode', 'opencode.jsonc')
      : path.join(workspacePath, 'opencode.jsonc');
    const config = await readOpencodeConfig(configPath);
    const mcp = readObjectRecord(config.mcp) ?? {};
    mcp.servers = servers;
    config.mcp = mcp;
    await this.writeConfig(configPath, config);
  }

  private async writeConfig(configPath: string, config: Record<string, unknown>): Promise<void> {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  }

  protected buildServerConfig(input: UpsertProviderMcpServerInput): Record<string, unknown> {
    if (input.transport === 'stdio') {
      if (!input.command?.trim()) {
        throw new AppError('command is required for stdio MCP servers.', {
          code: 'MCP_COMMAND_REQUIRED',
          statusCode: 400,
        });
      }

      return {
        command: input.command,
        args: input.args ?? [],
        env: input.env ?? {},
        cwd: input.cwd,
      };
    }

    if (!input.url?.trim()) {
      throw new AppError('url is required for http/sse MCP servers.', {
        code: 'MCP_URL_REQUIRED',
        statusCode: 400,
      });
    }

    return {
      type: input.transport,
      url: input.url,
      headers: input.headers ?? {},
    };
  }

  protected normalizeServerConfig(
    scope: McpScope,
    name: string,
    rawConfig: unknown,
  ): ProviderMcpServer | null {
    if (!rawConfig || typeof rawConfig !== 'object') {
      return null;
    }

    const config = rawConfig as Record<string, unknown>;
    if (typeof config.command === 'string') {
      return {
        provider: 'opencode',
        name,
        scope,
        transport: 'stdio',
        command: config.command,
        args: readStringArray(config.args),
        env: readStringRecord(config.env),
        cwd: readOptionalString(config.cwd),
      };
    }

    if (typeof config.url === 'string') {
      const transport = readOptionalString(config.type) === 'sse' ? 'sse' : 'http';
      return {
        provider: 'opencode',
        name,
        scope,
        transport,
        url: config.url,
        headers: readStringRecord(config.headers),
      };
    }

    return null;
  }
}
