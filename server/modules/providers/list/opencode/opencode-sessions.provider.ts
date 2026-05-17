import type { IProviderSessions } from '@/shared/interfaces.js';
import type { AnyRecord, FetchHistoryOptions, FetchHistoryResult, NormalizedMessage } from '@/shared/types.js';
import { createNormalizedMessage, generateMessageId, readObjectRecord } from '@/shared/utils.js';

const PROVIDER = 'opencode';

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
    _options: FetchHistoryOptions = {},
  ): Promise<FetchHistoryResult> {
    return { messages: [], total: 0, hasMore: false, offset: 0, limit: null };
  }
}
