import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

import { useWebSocket } from '../../../contexts/WebSocketContext';
import { usePaletteOps } from '../../../contexts/PaletteOpsContext';
import type { PendingPermissionRequest, SessionNavigationOptions } from '../types/types';
import type { ProjectSession, LLMProvider } from '../../../types/app';
import type { SessionStore, NormalizedMessage } from '../../../stores/useSessionStore';

type PendingViewSession = {
  sessionId: string | null;
  startedAt: number;
};

type LatestChatMessage = {
  type?: string;
  kind?: string;
  data?: any;
  message?: any;
  delta?: string;
  sessionId?: string;
  session_id?: string;
  requestId?: string;
  toolName?: string;
  input?: unknown;
  context?: unknown;
  error?: string;
  tool?: any;
  toolId?: string;
  result?: any;
  exitCode?: number;
  isProcessing?: boolean;
  actualSessionId?: string;
  event?: string;
  status?: any;
  isNewSession?: boolean;
  resultText?: string;
  isError?: boolean;
  success?: boolean;
  reason?: string;
  provider?: string;
  content?: string;
  text?: string;
  tokens?: number;
  canInterrupt?: boolean;
  tokenBudget?: unknown;
  newSessionId?: string;
  aborted?: boolean;
  [key: string]: any;
};

interface UseChatRealtimeHandlersArgs {
  latestMessage: LatestChatMessage | null;
  provider: LLMProvider;
  selectedSession: ProjectSession | null;
  currentSessionId: string | null;
  setCurrentSessionId: (sessionId: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setCanAbortSession: (canAbort: boolean) => void;
  setClaudeStatus: (status: { text: string; tokens: number; can_interrupt: boolean } | null) => void;
  setTokenBudget: (budget: Record<string, unknown> | null) => void;
  setPendingPermissionRequests: Dispatch<SetStateAction<PendingPermissionRequest[]>>;
  pendingViewSessionRef: MutableRefObject<PendingViewSession | null>;
  streamTimerRef: MutableRefObject<number | null>;
  accumulatedStreamRef: MutableRefObject<string>;
  onSessionInactive?: (sessionId?: string | null) => void;
  onSessionProcessing?: (sessionId?: string | null) => void;
  onSessionNotProcessing?: (sessionId?: string | null) => void;
  onNavigateToSession?: (sessionId: string, options?: SessionNavigationOptions) => void;
  onWebSocketReconnect?: () => void;
  sessionStore: SessionStore;
}

function computeMessageKey(msg: LatestChatMessage): string {
  return `${msg.kind}_${msg.id || ''}_${msg.sessionId || msg.session_id || ''}_${msg.timestamp || ''}`;
}

function getSid(msg: LatestChatMessage, activeViewSessionId: string | null, pendingViewSessionRef: MutableRefObject<PendingViewSession | null>, currentSessionId: string | null): string | null {
  return msg.sessionId
    || msg.session_id
    || activeViewSessionId
    || pendingViewSessionRef.current?.sessionId
    || currentSessionId
    || (typeof window !== 'undefined' ? sessionStorage.getItem('pendingSessionId') : null)
    || null;
}

export function useChatRealtimeHandlers({
  latestMessage,
  provider,
  selectedSession,
  currentSessionId,
  setCurrentSessionId,
  setIsLoading,
  setCanAbortSession,
  setClaudeStatus,
  setTokenBudget,
  setPendingPermissionRequests,
  pendingViewSessionRef,
  streamTimerRef,
  accumulatedStreamRef,
  onSessionInactive,
  onSessionProcessing,
  onSessionNotProcessing,
  onNavigateToSession,
  onWebSocketReconnect,
  sessionStore,
}: UseChatRealtimeHandlersArgs) {
  const paletteOps = usePaletteOps();
  const { subscribeMessageQueue, drainMessageQueue } = useWebSocket();

  /* ------------------------------------------------------------------ */
  /*  Stable refs to avoid stale closures in queue/rAF callbacks         */
  /* ------------------------------------------------------------------ */

  const depsRef = useRef({
    provider,
    selectedSession,
    currentSessionId,
    setCurrentSessionId,
    setIsLoading,
    setCanAbortSession,
    setClaudeStatus,
    setTokenBudget,
    setPendingPermissionRequests,
    pendingViewSessionRef,
    streamTimerRef,
    accumulatedStreamRef,
    onSessionInactive,
    onSessionProcessing,
    onSessionNotProcessing,

    onNavigateToSession,
    onWebSocketReconnect,
    sessionStore,
    paletteOps,
  });
  depsRef.current = {
    provider, selectedSession, currentSessionId, setCurrentSessionId,
    setIsLoading, setCanAbortSession, setClaudeStatus, setTokenBudget,
    setPendingPermissionRequests, pendingViewSessionRef, streamTimerRef,
    accumulatedStreamRef, onSessionInactive, onSessionProcessing,
    onSessionNotProcessing, onNavigateToSession, onWebSocketReconnect,
    sessionStore, paletteOps,
  };

  /* ------------------------------------------------------------------ */
  /*  Process one message                                                */
  /* ------------------------------------------------------------------ */

  const processMessageRef = useRef<(msg: LatestChatMessage) => void>();
  processMessageRef.current = (msg: LatestChatMessage) => {
    const d = depsRef.current;
    const activeViewSessionId = d.selectedSession?.id || d.currentSessionId || d.pendingViewSessionRef.current?.sessionId || null;

    /* --- Legacy messages (no `kind` field) --- */
    if (!msg.kind) {
      const messageType = String(msg.type || '');
      switch (messageType) {
        case 'websocket-reconnected':
          d.onWebSocketReconnect?.();
          return;
        case 'pending-permissions-response': {
          const permSessionId = msg.sessionId;
          const isCurrentPermSession = permSessionId === d.currentSessionId || (d.selectedSession && permSessionId === d.selectedSession.id);
          if (permSessionId && !isCurrentPermSession) return;
          d.setPendingPermissionRequests(msg.data || []);
          return;
        }
        case 'session-status': {
          const statusSessionId = msg.sessionId;
          if (!statusSessionId) return;
          if (msg.status) {
            d.setClaudeStatus({
              text: msg.status.text || 'Working...',
              tokens: msg.status.tokens || 0,
              can_interrupt: msg.status.can_interrupt !== undefined ? msg.status.can_interrupt : true,
            });
            d.setIsLoading(true);
            d.setCanAbortSession(msg.status.can_interrupt !== false);
            return;
          }
          const isCurrentSession = statusSessionId === d.currentSessionId || (d.selectedSession && statusSessionId === d.selectedSession.id);
          if (msg.isProcessing) {
            d.onSessionProcessing?.(statusSessionId);
            if (isCurrentSession) { d.setIsLoading(true); d.setCanAbortSession(true); }
            return;
          }
          d.onSessionInactive?.(statusSessionId);
          d.onSessionNotProcessing?.(statusSessionId);
          if (isCurrentSession) {
            d.setIsLoading(false);
            d.setCanAbortSession(false);
            d.setClaudeStatus(null);
          }
          return;
        }
        default:
          return;
      }
    }

    /* --- NormalizedMessage handling --- */
    const sid = getSid(msg, activeViewSessionId, d.pendingViewSessionRef, d.currentSessionId);

    // --- Streaming: rAF-driven (replaces setTimeout(100)) ---
    if (msg.kind === 'stream_delta') {
      const text = msg.content || '';
      if (!text) return;
      d.accumulatedStreamRef.current += text;
      if (d.streamTimerRef.current === null) {
        d.streamTimerRef.current = requestAnimationFrame(() => {
          d.streamTimerRef.current = null;
          if (sid) {
            d.sessionStore.updateStreaming(sid, d.accumulatedStreamRef.current, d.provider);
          }
        });
      }
      if (sid && sid !== activeViewSessionId) {
        d.sessionStore.appendRealtime(sid, msg as NormalizedMessage);
      }
      return;
    }

    if (msg.kind === 'stream_end') {
      if (d.streamTimerRef.current !== null) {
        cancelAnimationFrame(d.streamTimerRef.current);
        d.streamTimerRef.current = null;
      }
      if (sid) {
        if (d.accumulatedStreamRef.current) {
          d.sessionStore.updateStreaming(sid, d.accumulatedStreamRef.current, d.provider);
        }
        d.sessionStore.finalizeStreaming(sid);
      }
      d.accumulatedStreamRef.current = '';
      return;
    }

    // --- All other messages ---
    const shouldPersist = msg.kind !== 'session_created'
      && msg.kind !== 'complete'
      && msg.kind !== 'status'
      && msg.kind !== 'permission_request'
      && msg.kind !== 'permission_cancelled';

    if (sid && shouldPersist) {
      d.sessionStore.appendRealtime(sid, msg as NormalizedMessage);
    }

    // --- UI side effects ---
    switch (msg.kind) {
      case 'session_created': {
        const newSessionId = msg.newSessionId;
        if (!newSessionId) break;
        if (!d.currentSessionId) {
          if (sid && sid !== newSessionId) {
            d.sessionStore.replaceSessionId(sid, newSessionId);
          }
          sessionStorage.setItem('pendingSessionId', newSessionId);
          if (d.pendingViewSessionRef.current && !d.pendingViewSessionRef.current.sessionId) {
            d.pendingViewSessionRef.current.sessionId = newSessionId;
          }
          d.setCurrentSessionId(newSessionId);
          d.setPendingPermissionRequests((prev) =>
            prev.map((r) => (r.sessionId ? r : { ...r, sessionId: newSessionId })),
          );
        }
        d.onNavigateToSession?.(newSessionId);
        break;
      }

      case 'complete': {
        if (d.streamTimerRef.current !== null) {
          cancelAnimationFrame(d.streamTimerRef.current);
          d.streamTimerRef.current = null;
        }
        if (sid && d.accumulatedStreamRef.current) {
          d.sessionStore.updateStreaming(sid, d.accumulatedStreamRef.current, d.provider);
          d.sessionStore.finalizeStreaming(sid);
        }
        d.accumulatedStreamRef.current = '';

        d.setIsLoading(false);
        d.setCanAbortSession(false);
        d.setClaudeStatus(null);
        d.setPendingPermissionRequests([]);
        d.onSessionInactive?.(sid);
        d.onSessionNotProcessing?.(sid);

        const actualSessionId = typeof msg.actualSessionId === 'string' && msg.actualSessionId.trim().length > 0
          ? msg.actualSessionId : null;
        const pendingSessionId = sessionStorage.getItem('pendingSessionId');
        const completedSuccessfully = msg.exitCode === undefined || msg.exitCode === 0;
        const isVisibleSession = Boolean(sid && (sid === activeViewSessionId || sid === pendingSessionId || d.pendingViewSessionRef.current?.sessionId === sid));

        if (actualSessionId && sid && actualSessionId !== sid) {
          d.sessionStore.replaceSessionId(sid, actualSessionId);
          if (isVisibleSession) {
            d.setCurrentSessionId(actualSessionId);
            if (d.pendingViewSessionRef.current) {
              const pendingSession = d.pendingViewSessionRef.current.sessionId;
              if (!pendingSession || pendingSession === sid) {
                d.pendingViewSessionRef.current.sessionId = actualSessionId;
              }
            }
          }
          if (completedSuccessfully && pendingSessionId === sid) {
            sessionStorage.removeItem('pendingSessionId');
          }
          if (isVisibleSession) {
            d.onNavigateToSession?.(actualSessionId, { replace: true });
            setTimeout(() => { void d.paletteOps.refreshProjects(); }, 500);
          }
          break;
        }

        if (pendingSessionId && !d.currentSessionId && completedSuccessfully) {
          const resolvedSessionId = actualSessionId || pendingSessionId;
          d.setCurrentSessionId(resolvedSessionId);
          if (actualSessionId) {
            d.onNavigateToSession?.(resolvedSessionId, { replace: true });
          }
          sessionStorage.removeItem('pendingSessionId');
          setTimeout(() => { void d.paletteOps.refreshProjects(); }, 500);
        }
        break;
      }

      case 'error': {
        d.setIsLoading(false);
        d.setCanAbortSession(false);
        d.setClaudeStatus(null);
        d.onSessionInactive?.(sid);
        d.onSessionNotProcessing?.(sid);
        break;
      }

      case 'permission_request': {
        if (!msg.requestId) break;
        d.setPendingPermissionRequests((prev) => {
          if (prev.some((r: PendingPermissionRequest) => r.requestId === msg.requestId)) return prev;
          return [...prev, {
            requestId: msg.requestId,
            toolName: msg.toolName || 'UnknownTool',
            input: msg.input,
            context: msg.context,
            sessionId: sid || null,
            receivedAt: new Date(),
          }];
        });
        d.setIsLoading(true);
        d.setCanAbortSession(true);
        d.setClaudeStatus({ text: 'Waiting for permission', tokens: 0, can_interrupt: true });
        // permission_request means the backend has completed its current phase
        // (e.g. plan generation) and is now waiting for user decision.
        // Remove from processingSessions so the elastic isLoading effect
        // does not keep the loading indicator active.
        d.onSessionNotProcessing?.(sid);
        break;
      }

      case 'permission_cancelled': {
        if (msg.requestId) {
          d.setPendingPermissionRequests((prev) => prev.filter((r: PendingPermissionRequest) => r.requestId !== msg.requestId));
        }
        break;
      }

      case 'status': {
        if (msg.text === 'token_budget' && msg.tokenBudget) {
          d.setTokenBudget(msg.tokenBudget as Record<string, unknown>);
        } else if (msg.text) {
          d.setClaudeStatus({
            text: msg.text,
            tokens: msg.tokens || 0,
            can_interrupt: msg.canInterrupt !== undefined ? msg.canInterrupt : true,
          });
          d.setIsLoading(true);
          d.setCanAbortSession(msg.canInterrupt !== false);
        }
        break;
      }

      default:
        break;
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Message queue subscription (reliable path — never drops messages)  */
  /* ------------------------------------------------------------------ */

  const processedKeysRef = useRef(new Set<string>());
  const isProcessingQueueRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeMessageQueue(() => {
      if (isProcessingQueueRef.current) return;
      isProcessingQueueRef.current = true;
      try {
        const messages = drainMessageQueue();
        for (const msg of messages) {
          const key = computeMessageKey(msg);
          if (processedKeysRef.current.has(key)) continue;
          processedKeysRef.current.add(key);
          processMessageRef.current?.(msg);
        }
      } finally {
        isProcessingQueueRef.current = false;
      }
    });
    return unsubscribe;
  }, [subscribeMessageQueue, drainMessageQueue]);

  /* ------------------------------------------------------------------ */
  /*  Fallback: process via latestMessage (catches anything queue missed) */
  /* ------------------------------------------------------------------ */

  const lastProcessedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!latestMessage) return;
    const key = computeMessageKey(latestMessage);
    if (processedKeysRef.current.has(key)) return;
    if (lastProcessedKeyRef.current === key) return;
    lastProcessedKeyRef.current = key;
    processedKeysRef.current.add(key);
    processMessageRef.current?.(latestMessage);
  }, [
    latestMessage,
    provider,
    selectedSession,
    currentSessionId,
    setCurrentSessionId,
    setIsLoading,
    setCanAbortSession,
    setClaudeStatus,
    setTokenBudget,
    setPendingPermissionRequests,
    pendingViewSessionRef,
    streamTimerRef,
    accumulatedStreamRef,
    onSessionInactive,
    onSessionProcessing,
    onSessionNotProcessing,
    onNavigateToSession,
    onWebSocketReconnect,
    sessionStore,
    paletteOps,
  ]);
}