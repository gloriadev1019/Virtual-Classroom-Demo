import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { 
  TLStore, 
  createTLStore, 
  TLRecord, 
  TLStoreSchemaOptions,
  getDefaultUserPresence,
  TLPresenceUserInfo,
  TLPresenceStateInfo,
  InstancePresenceRecordType,
  TLInstancePresence
} from '@tldraw/tldraw';
import { TLSyncClient, TLSyncClientStatus } from '@tldraw/sync-core';
import { ClientWebSocketAdapter } from '@tldraw/sync-core';

interface LocalTldrawSyncOptions extends TLStoreSchemaOptions {
  roomId: string;
  userInfo?: TLPresenceUserInfo;
  getUserPresence?: (store: TLStore, user: TLPresenceUserInfo) => TLPresenceStateInfo | null;
  onConnectionChange?: (status: 'loading' | 'connected' | 'error' | 'connecting' | 'disconnected') => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

interface LocalTldrawSyncResult {
  status: 'loading' | 'connected' | 'error' | 'connecting' | 'disconnected';
  store: TLStore | null;
  error: Error | null;
  reconnect: () => void;
}

export function useLocalTldrawSync(options: LocalTldrawSyncOptions): LocalTldrawSyncResult {
  const {
    roomId,
    userInfo,
    getUserPresence = getDefaultUserPresence,
    onConnectionChange,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10,
    ...schemaOptions
  } = options;

  const [status, setStatus] = useState<'loading' | 'connected' | 'error' | 'connecting' | 'disconnected'>('loading');
  const [store, setStore] = useState<TLStore | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  const clientRef = useRef<TLSyncClient<TLRecord, TLStore> | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isConnectingRef = useRef(false);

  // Create a more reliable WebSocket connection
  const createConnection = useCallback(async () => {
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;

    try {
      setStatus('connecting');
      onConnectionChange?.('connecting');

      // Use a more reliable WebSocket URL for cloud environments
      const wsUrl = `wss://demo.tldraw.xyz/connect/${encodeURIComponent(roomId)}`;
      
      const socket = new ClientWebSocketAdapter(() => wsUrl);
      
      const client = new TLSyncClient({
        storeId: `local-${roomId}-${Date.now()}`,
        userId: userInfo?.id || 'anonymous',
        socket,
        onLoad: (store) => {
          setStore(store);
          setStatus('connected');
          setError(null);
          reconnectAttemptsRef.current = 0;
          onConnectionChange?.('connected');
          isConnectingRef.current = false;
        },
        onLoadError: (error) => {
          console.error('TLDraw sync load error:', error);
          setError(error);
          setStatus('error');
          onConnectionChange?.('error');
          isConnectingRef.current = false;
          
          // Attempt to reconnect
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            reconnectTimeoutRef.current = setTimeout(() => {
              createConnection();
            }, reconnectInterval);
          }
        },
        onClose: () => {
          console.log('TLDraw sync connection closed');
          setStatus('disconnected');
          onConnectionChange?.('disconnected');
          isConnectingRef.current = false;
          
          // Attempt to reconnect
          if (reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++;
            reconnectTimeoutRef.current = setTimeout(() => {
              createConnection();
            }, reconnectInterval);
          }
        },
        onError: (error) => {
          console.error('TLDraw sync error:', error);
          setError(error);
          setStatus('error');
          onConnectionChange?.('error');
          isConnectingRef.current = false;
        },
        ...schemaOptions
      });

      clientRef.current = client;
      
      // Set up presence updates
      if (userInfo) {
        const presence = getUserPresence(client.store, userInfo);
        if (presence) {
          const instancePresence = InstancePresenceRecordType.create({
            ...presence,
            id: InstancePresenceRecordType.createId(client.store.id),
          });
          client.store.put([instancePresence]);
        }
      }

    } catch (err) {
      console.error('Failed to create TLDraw sync connection:', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setStatus('error');
      onConnectionChange?.('error');
      isConnectingRef.current = false;
    }
  }, [roomId, userInfo, getUserPresence, onConnectionChange, reconnectInterval, maxReconnectAttempts, schemaOptions]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectAttemptsRef.current = 0;
    createConnection();
  }, [createConnection]);

  // Initialize connection
  useEffect(() => {
    createConnection();

    return () => {
      if (clientRef.current) {
        clientRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [createConnection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    status,
    store,
    error,
    reconnect
  };
}
