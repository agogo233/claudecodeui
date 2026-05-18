import os from 'node:os';
import path from 'node:path';
import { readdir } from 'node:fs/promises';

import type { IProviderSessionSynchronizer } from '@/shared/interfaces.js';

function msToIso(ms: number | null | undefined): string | undefined {
  return ms ? new Date(ms).toISOString() : undefined;
}

export class OpenCodeSessionSynchronizer implements IProviderSessionSynchronizer {
  private readonly provider = 'opencode' as const;

  private opencodeDataDir(): string {
    const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    return path.join(xdgData, 'opencode');
  }

  async synchronize(since?: Date): Promise<number> {
    const dataDir = this.opencodeDataDir();
    let dbFiles: string[] = [];

    try {
      const entries = await readdir(dataDir, { withFileTypes: true });
      dbFiles = entries
        .filter(e => e.isFile() && /^opencode(-[a-zA-Z0-9]+)?\.db$/.test(e.name))
        .map(e => path.join(dataDir, e.name));
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

        const hasSessionTable = db.prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='session'`
        ).get();

        if (!hasSessionTable) {
          db.close();
          continue;
        }

        const rows = db.prepare(
          `SELECT id, directory, title, time_created, time_updated FROM session ORDER BY time_created DESC`
        ).all() as Array<{ id: string; directory: string; title: string; time_created: number | null; time_updated: number | null }>;

        for (const row of rows) {
          try {
            const { sessionsDb } = await import('@/modules/database/index.js');
            sessionsDb.createSession(
              row.id,
              this.provider,
              row.directory,
              row.title || 'New OpenCode Session',
              msToIso(row.time_created),
              msToIso(row.time_updated),
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
    if (!/^opencode(-[a-zA-Z0-9]+)?\.db$/.test(path.basename(filePath))) {
      return null;
    }

    try {
      const betterSqlite3 = await import('better-sqlite3');
      const db = betterSqlite3.default(filePath, { readonly: true, fileMustExist: true });

      const hasSessionTable = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='session'`
      ).get();

      if (!hasSessionTable) {
        db.close();
        return null;
      }

      const rows = db.prepare(
        `SELECT id, directory, title, time_created, time_updated FROM session ORDER BY time_updated DESC`
      ).all() as Array<{ id: string; directory: string; title: string; time_created: number | null; time_updated: number | null }>;

      if (rows.length === 0) {
        db.close();
        return null;
      }

      const { sessionsDb } = await import('@/modules/database/index.js');
      for (const row of rows) {
        try {
          sessionsDb.createSession(
            row.id,
            this.provider,
            row.directory,
            row.title || 'New OpenCode Session',
            msToIso(row.time_created),
            msToIso(row.time_updated),
            filePath,
          );
        } catch {
          continue;
        }
      }

      db.close();
      return rows[0].id;
    } catch {
      return null;
    }
  }
}
