import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../components/auth/context/AuthContext';
import { IS_PLATFORM } from '../constants/config';

type MessageQueueListener = () => void;

type WebSocketContextType = {
  ws: WebSocket | null;
  sendMessage: (message: any) => void;
  latestMessage: any | null;
  isConnected: boolean;
  subscribeMessageQueue: (cb: MessageQueueListener) => () => void;
  drainMessageQueue: () => any[];
};

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

const buildWebSocketUrl = (token: string | null) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (IS_PLATFORM) return `${protocol}//${window.location.host}/ws`;
  if (!token) return null;
  return `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
};

const useWebSocketProviderState = (): WebSocketContextType => {
  const wsRef = useRef<WebSocket | null>(null);
  const unmountedRef = useRef(false);
  const hasConnectedRef = useRef(false);
  const [latestMessage, setLatestMessage] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { token } = useAuth();

  const messageQueueRef = useRef<any[]>([]);
  const queueListenersRef = useRef<Set<MessageQueueListener>>(new Set());

  const subscribeMessageQueue = useCallback((cb: MessageQueueListener) => {
    queueListenersRef.current.add(cb);
    return () => { queueListenersRef.current.delete(cb); };
  }, []);

  const drainMessageQueue = useCallback((): any[] => {
    const queue = messageQueueRef.current;
    if (queue.length === 0) return [];
    messageQueueRef.current = [];
    return queue;
  }, []);

  const notifyQueueListeners = useCallback(() => {
    queueListenersRef.current.forEach(cb => { try { cb(); } catch { /* ignore subscriber error */ } });
  }, []);

  useEffect(() => {
    connect();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token]);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    try {
      const wsUrl = buildWebSocketUrl(token);
      if (!wsUrl) return console.warn('No authentication token found for WebSocket connection');

      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        setIsConnected(true);
        wsRef.current = websocket;
        if (hasConnectedRef.current) {
          const reconnectMsg = { type: 'websocket-reconnected', timestamp: Date.now() };
          setLatestMessage(reconnectMsg);
          messageQueueRef.current.push(reconnectMsg);
          notifyQueueListeners();
        }
        hasConnectedRef.current = true;
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          messageQueueRef.current.push(data);
          notifyQueueListeners();
          setLatestMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      websocket.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        reconnectTimeoutRef.current = setTimeout(() => {
          if (unmountedRef.current) return;
          connect();
        }, 3000);
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
    }
  }, [token]);

  const sendMessage = useCallback((message: any) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected');
    }
  }, []);

  const value: WebSocketContextType = useMemo(() =>
  ({
    ws: wsRef.current,
    sendMessage,
    latestMessage,
    isConnected,
    subscribeMessageQueue,
    drainMessageQueue,
  }), [sendMessage, latestMessage, isConnected, subscribeMessageQueue, drainMessageQueue]);

  return value;
};

export const WebSocketProvider = ({ children }: { children: React.ReactNode }) => {
  const webSocketData = useWebSocketProviderState();
  return (
    <WebSocketContext.Provider value={webSocketData}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default WebSocketContext;