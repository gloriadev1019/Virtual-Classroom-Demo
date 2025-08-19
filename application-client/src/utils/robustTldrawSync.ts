import { useCallback, useEffect, useRef, useState } from 'react';
import { useSyncDemo } from '@tldraw/sync';
import { TLStore, getDefaultUserPresence, TLPresenceUserInfo, TLPresenceStateInfo } from '@tldraw/tldraw';
import { RemoteTLStoreWithStatus } from '@tldraw/sync';

interface RobustTldrawSyncOptions {
  roomId: string;
  userInfo?: TLPresenceUserInfo;
  getUserPresence?: (store: TLStore, user: TLPresenceUserInfo) => TLPresenceStateInfo | null;
  onConnectionChange?: (status: 'loading' | 'connected' | 'error' | 'connecting' | 'disconnected') => void;
  enableFallback?: boolean;
  connectionTimeout?: number;
}

interface RobustTldrawSyncResult {
  status: 'loading' | 'connected' | 'error' | 'connecting' | 'disconnected';
  store: RemoteTLStoreWithStatus | null;
  error: Error | null;
  reconnect: () => void;
  isFallback: boolean;
}

export function useRobustTldrawSync(options: RobustTldrawSyncOptions): RobustTldrawSyncResult {
  const {
    roomId,
    userInfo,
    getUserPresence = getDefaultUserPresence,
    onConnectionChange,
    enableFallback = true,
    connectionTimeout = 10000
  } = options;

  const [status, setStatus] = useState<'loading' | 'connected' | 'error' | 'connecting' | 'disconnected'>('loading');
  const [error, setError] = useState<Error | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const maxRetries = 3;

  // Enhanced connection monitoring
  const monitorConnection = useCallback((store: RemoteTLStoreWithStatus) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set up connection timeout
    timeoutRef.current = setTimeout(() => {
      console.warn('TLDraw sync connection timeout, attempting fallback...');
      setStatus('error');
      setError(new Error('Connection timeout'));
      onConnectionChange?.('error');
    }, connectionTimeout);

    // Monitor store status changes
    if (store.status === 'synced-remote') {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setStatus('connected');
      setError(null);
      onConnectionChange?.('connected');
    } else if (store.status === 'error') {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setStatus('error');
      setError(store.error);
      onConnectionChange?.('error');
    }
  }, [connectionTimeout, onConnectionChange]);

  // Primary sync with enhanced error handling
  const primarySync = useSyncDemo({
    roomId: `${roomId}-primary`,
    userInfo,
    getUserPresence,
    host: 'https://demo.tldraw.xyz'
  });

  // Fallback sync for better reliability
  const fallbackSync = useSyncDemo({
    roomId: `${roomId}-fallback`,
    userInfo,
    getUserPresence,
    host: 'https://demo.tldraw.xyz'
  });

  // Determine which sync to use
  const currentSync = isFallback ? fallbackSync : primarySync;

  // Monitor connection and handle fallback
  useEffect(() => {
    if (!currentSync) return;

    monitorConnection(currentSync);

    // If primary sync fails and fallback is enabled, switch to fallback
    if (!isFallback && enableFallback && currentSync.status === 'error' && retryCount < maxRetries) {
      console.log('Primary sync failed, switching to fallback...');
      setIsFallback(true);
      setRetryCount(prev => prev + 1);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [currentSync, isFallback, enableFallback, retryCount, maxRetries, monitorConnection]);

  // Manual reconnect function
  const reconnect = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    setStatus('connecting');
    onConnectionChange?.('connecting');
    setError(null);

    // Reset fallback state and retry count
    setIsFallback(false);
    setRetryCount(0);

    // Force reconnection by updating room ID
    const newRoomId = `${roomId}-retry-${Date.now()}`;
    
    // This will trigger a new connection
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }, [roomId, onConnectionChange]);

  // Auto-reconnect on connection loss
  useEffect(() => {
    if (status === 'error' && retryCount < maxRetries) {
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log(`Auto-reconnecting... (attempt ${retryCount + 1}/${maxRetries})`);
        reconnect();
      }, 5000 * (retryCount + 1)); // Exponential backoff
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [status, retryCount, maxRetries, reconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    status,
    store: currentSync,
    error,
    reconnect,
    isFallback
  };
}
