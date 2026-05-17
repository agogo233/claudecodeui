import os from 'node:os';
import path from 'node:path';
import { readdir } from 'node:fs/promises';

import type { IProviderSessionSynchronizer } from '@/shared/interfaces.js';

function stripAnsiCodes(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function extractSessionName(content: string): string | undefined {
  const firstLine = content.split('\n').find(l => l.trim());
  if (!firstLine) return undefined;
  const cleaned = stripAnsiCodes(firstLine.trim()).slice(0, 80);
  return cleaned || undefined;
}

export class OpenCodeSessionSynchronizer implements IProviderSessionSynchronizer {
  private readonly provider = 'opencode' as const;

  async synchronize(since?: Date): Promise<number> {
    const opencodeConfigDir = path.join(os.homedir(), '.config', 'opencode');
    let dbFiles: string[] = [];

    try {
      const entries = await readdir(opencodeConfigDir, { withFileTypes: true });
      dbFiles = entries
        .filter(e => e.isFile() && e.name.endsWith('.db'))
        .map(e => path.join(opencodeConfigDir, e.name));
    } catch {
      return 0;
    }

    if (dbFiles.length === 0) {
      return 0;
    }

    let processed = 0;
    for (const dbPath of dbFiles) {
      try {
        const betterSqlite3 = await import('better-sqlite3');
        const db = betterSqlite3.default(dbPath, { readonly: true, fileMustExist: true });

        const hasSessionsTable = db.prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'`
        ).get();

        if (!hasSessionsTable) {
          db.close();
          continue;
        }

        const rows = db.prepare(
          `SELECT session_id, created_at, updated_at FROM sessions ORDER BY created_at DESC`
        ).all() as Array<{ session_id: string; created_at: string; updated_at: string }>;

        for (const row of rows) {
          try {
            const { createSession } = await import('@/modules/database/index.js');
            createSession(
              row.session_id,
              this.provider,
              process.cwd(),
              'New OpenCode Session',
              row.created_at ? new Date(row.created_at) : undefined,
              row.updated_at ? new Date(row.updated_at) : undefined,
              dbPath,
            );
            processed += 1;
          } catch {
            continue;
          }
        }

        db.close();
      } catch {
        continue;
      }
    }

    return processed;
  }

  async synchronizeFile(filePath: string): Promise<string | null> {
    if (!filePath.endsWith('.db')) {
      return null;
    }

    try {
      const betterSqlite3 = await import('better-sqlite3');
      const db = betterSqlite3.default(filePath, { readonly: true, fileMustExist: true });

      const hasSessionsTable = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'`
      ).get();

      if (!hasSessionsTable) {
        db.close();
        return null;
      }

      const row = db.prepare(
        `SELECT session_id, created_at, updated_at FROM sessions ORDER BY updated_at DESC LIMIT 1`
      ).get() as { session_id: string; created_at: string; updated_at: string } | undefined;

      db.close();

      if (!row) return null;

      const { createSession } = await import('@/modules/database/index.js');
      return createSession(
        row.session_id,
        this.provider,
        process.cwd(),
        'New OpenCode Session',
        row.created_at ? new Date(row.created_at) : undefined,
        row.updated_at ? new Date(row.updated_at) : undefined,
        filePath,
      );
    } catch {
      return null;
    }
  }
}
