import type { IProviderSessions } from '@/shared/interfaces.js';
import type { AnyRecord, FetchHistoryOptions, FetchHistoryResult, NormalizedMessage } from '@/shared/types.js';
import { createNormalizedMessage, generateMessageId, readObjectRecord } from '@/shared/utils.js';

const PROVIDER = 'opencode';

type PartData = {
  type: string;
  text?: string;
  tool?: string;
  callID?: string;
  state?: {
    status?: string;
    input?: unknown;
    output?: string;
    isError?: boolean;
  };
  metadata?: { tokens?: number };
  [key: string]: unknown;
};

type MessageData = {
  role?: string;
  time?: { created?: number };
  agent?: string;
  modelID?: string;
  providerID?: string;
  [key: string]: unknown;
};

export class OpenCodeSessionsProvider implements IProviderSessions {
  normalizeMessage(rawMessage: unknown, sessionId: string | null): NormalizedMessage[] {
    const raw = readObjectRecord(rawMessage);
    if (!raw) {
      return [];
    }

    const ts = raw.timestamp || new Date().toISOString();
    const baseId = raw.uuid || generateMessageId(PROVIDER);
    const kind = raw.sessionUpdate || raw.kind;
    const content = raw.content;

    if (kind === 'agent_message_chunk' || kind === 'stream_delta') {
      const text = typeof content?.text === 'string' ? content.text : '';
      if (!text) return [];
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'stream_delta',
        content: text,
      })];
    }

    if (kind === 'agent_thought_chunk' || kind === 'thinking') {
      const text = typeof content?.text === 'string' ? content.text : '';
      if (!text) return [];
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'thinking',
        content: text,
      })];
    }

    if (kind === 'tool_call' || kind === 'tool_use') {
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'tool_use',
        toolName: raw.title || raw.toolName || raw.kind || 'Tool',
        toolInput: raw.rawInput || raw.toolInput || {},
        toolId: raw.toolCallId || baseId,
      })];
    }

    if (kind === 'tool_call_update' || kind === 'tool_result') {
      if (raw.status === 'completed' || raw.status === 'failed' || raw.status === undefined) {
        const output = raw.rawOutput?.output || raw.content?.[0]?.content?.text || raw.output || '';
        return [createNormalizedMessage({
          id: baseId,
          sessionId,
          timestamp: ts,
          provider: PROVIDER,
          kind: 'tool_result',
          toolId: raw.toolCallId || '',
          content: typeof output === 'string' ? output : JSON.stringify(output),
          isError: raw.status === 'failed' || Boolean(raw.isError),
        })];
      }
      return [];
    }

    if (kind === 'usage_update') {
      return [createNormalizedMessage({
        id: baseId,
        sessionId,
        timestamp: ts,
        provider: PROVIDER,
        kind: 'status',
        text: 'Complete',
        tokens: raw.used || 0,
        canInterrupt: false,
      })];
    }

    return [];
  }

  async fetchHistory(
    sessionId: string,
    options: FetchHistoryOptions = {},
  ): Promise<FetchHistoryResult> {
    const { limit, offset = 0 } = options;

    const { sessionsDb } = await import('@/modules/database/index.js');
    const session = sessionsDb.getSessionById(sessionId);
    if (!session?.jsonl_path) {
      return { messages: [], total: 0, hasMore: false, offset: 0, limit: limit ?? null };
    }

    let db: any = null;
    try {
      const betterSqlite3 = await import('better-sqlite3');
      db = betterSqlite3.default(session.jsonl_path, { readonly: true, fileMustExist: true });

      const messageRows = db.prepare(
        `SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created ASC, id ASC`
      ).all(sessionId) as Array<{ id: string; time_created: number; data: string }>;

      const allMessages: NormalizedMessage[] = [];

      for (const msgRow of messageRows) {
        let msgData: MessageData;
        try { msgData = JSON.parse(msgRow.data) as MessageData; } catch { continue; }

        const role = msgData.role === 'user' ? 'user' : 'assistant';
        const msgTs = msgData.time?.created
          ? new Date(msgData.time.created).toISOString()
          : new Date(msgRow.time_created).toISOString();

        const partRows = db.prepare(
          `SELECT id, time_created, data FROM part WHERE message_id = ? ORDER BY time_created ASC, id ASC`
        ).all(msgRow.id) as Array<{ id: string; time_created: number; data: string }>;

        for (const partRow of partRows) {
          let partData: PartData;
          try { partData = JSON.parse(partRow.data) as PartData; } catch { continue; }

          const partTs = new Date(partRow.time_created).toISOString();

          if (partData.type === 'text' && partData.text) {
            allMessages.push(createNormalizedMessage({
              id: partRow.id, sessionId, timestamp: partTs, provider: PROVIDER,
              kind: 'text', role, content: partData.text,
            }));
          } else if (partData.type === 'reasoning' && partData.text) {
            allMessages.push(createNormalizedMessage({
              id: partRow.id, sessionId, timestamp: partTs, provider: PROVIDER,
              kind: 'thinking', content: partData.text,
            }));
          } else if (partData.type === 'tool') {
            const toolId = partData.callID || partRow.id;
            allMessages.push(createNormalizedMessage({
              id: partRow.id, sessionId, timestamp: partTs, provider: PROVIDER,
              kind: 'tool_use',
              toolName: partData.tool || 'Tool',
              toolInput: partData.state?.input ?? {},
              toolId,
            }));

            if (partData.state?.output !== undefined || partData.state?.error !== undefined) {
              const output = typeof partData.state?.output === 'string'
                ? partData.state.output
                : partData.state?.error ?? '';
              allMessages.push(createNormalizedMessage({
                id: `${partRow.id}_result`, sessionId, timestamp: partTs, provider: PROVIDER,
                kind: 'tool_result', toolId, content: output,
                isError: partData.state?.status === 'error',
              }));
            }
          } else if (partData.type === 'step-finish') {
            const t = partData.tokens as { total?: number } | undefined;
            if (t?.total) {
              allMessages.push(createNormalizedMessage({
                id: partRow.id, sessionId, timestamp: partTs, provider: PROVIDER,
                kind: 'status', text: 'Complete', tokens: t.total, canInterrupt: false,
              }));
            }
          }
        }
      }

      const total = allMessages.filter(m => m.kind !== 'tool_result').length;
      const pageLimit = limit ?? allMessages.length;
      const sliced = allMessages.slice(offset, offset + pageLimit);
      const hasMore = offset + pageLimit < allMessages.length;

      return { messages: sliced, total, hasMore, offset, limit: pageLimit };
    } catch {
      return { messages: [], total: 0, hasMore: false, offset: 0, limit: limit ?? null };
    } finally {
      db?.close();
    }
  }
}
