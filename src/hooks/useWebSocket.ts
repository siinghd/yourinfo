/**
 * WebSocket hook for real-time visitor updates
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  VisitorInfo,
  WSMessage,
  WelcomePayload,
  VisitorEventPayload,
  ClientInfo,
  BehaviorData,
  UserProfile,
} from '../types';
import { collectClientInfo } from '../utils/fingerprint';
import { behaviorTracker } from '../utils/behavior';
import { advancedBehaviorTracker } from '../utils/advanced';
import type { AdvancedBehavior } from '../types';

/** Get API URL based on environment */
function getApiUrl(): string {
  if (import.meta.env.PROD) {
    return '';  // Same origin
  }
  return `http://localhost:${import.meta.env.VITE_WS_PORT || 3020}`;
}

/** Fetch AI profile from backend */
async function fetchAIProfile(clientInfo: ClientInfo): Promise<{
  profile: UserProfile | null;
  source: 'ai' | 'cache' | 'fallback';
}> {
  try {
    const response = await fetch(`${getApiUrl()}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientInfo }),
    });

    if (!response.ok) {
      console.error('AI profile request failed:', response.status);
      return { profile: null, source: 'fallback' };
    }

    const data = await response.json();
    return {
      profile: data.profile,
      source: data.source || 'fallback',
    };
  } catch (err) {
    console.error('AI profile fetch error:', err);
    return { profile: null, source: 'fallback' };
  }
}

interface UseWebSocketResult {
  connected: boolean;
  visitors: VisitorInfo[];
  currentVisitor: VisitorInfo | null;
  error: string | null;
  aiLoading: boolean;
  aiCreditsExhausted: boolean;
  totalUniqueVisitors: number;
}

/** Get WebSocket URL based on environment */
function getWebSocketUrl(): string {
  // In production, use relative path (nginx will proxy)
  if (import.meta.env.PROD) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  // In development, connect directly to backend
  return `ws://localhost:${import.meta.env.VITE_WS_PORT || 3020}/ws`;
}

export function useWebSocket(): UseWebSocketResult {
  const [connected, setConnected] = useState(false);
  const [visitors, setVisitors] = useState<VisitorInfo[]>([]);
  const [currentVisitor, setCurrentVisitor] = useState<VisitorInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCreditsExhausted, setAiCreditsExhausted] = useState(false);
  const [totalUniqueVisitors, setTotalUniqueVisitors] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const behaviorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch stats from server
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/stats`);
      if (response.ok) {
        const data = await response.json();
        setTotalUniqueVisitors(data.totalUnique || 0);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  // Update behavior data in current visitor
  const updateBehavior = useCallback((behavior: BehaviorData, advancedBehavior: AdvancedBehavior) => {
    setCurrentVisitor((prev) => {
      if (!prev || !prev.client) return prev;
      return {
        ...prev,
        client: {
          ...prev.client,
          behavior,
          advancedBehavior,
        },
      };
    });
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url = getWebSocketUrl();
    console.log('Connecting to WebSocket:', url);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log('WebSocket connected');
        setConnected(true);
        setError(null);

        // Fetch initial stats and refresh every 30 seconds
        fetchStats();
        statsIntervalRef.current = setInterval(fetchStats, 30000);

        // Collect and send client info
        try {
          const clientInfo: ClientInfo = await collectClientInfo();
          ws.send(
            JSON.stringify({
              type: 'client_info',
              payload: { clientInfo },
            })
          );

          // Start behavior tracking first (don't wait for AI)
          behaviorTracker.start();
          advancedBehaviorTracker.start();

          // Fetch AI profile in background (don't block connection)
          console.log('Fetching AI profile in background...');
          setAiLoading(true);
          fetchAIProfile(clientInfo).then((aiResult) => {
            setAiLoading(false);
            if (aiResult.profile) {
              console.log(`AI profile loaded (source: ${aiResult.source})`);
              setAiCreditsExhausted(false);
              clientInfo.userProfile = aiResult.profile;
              // Send updated client info with AI profile
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: 'client_info',
                    payload: { clientInfo },
                  })
                );
              }
            } else {
              console.log('Using local fallback profile - AI credits exhausted');
              setAiCreditsExhausted(true);
            }
          }).catch((err) => {
            console.error('AI profile error:', err);
            setAiLoading(false);
            setAiCreditsExhausted(true);
          });

          // Update behavior data every second
          behaviorIntervalRef.current = setInterval(() => {
            const behavior = behaviorTracker.getData();
            const advancedBehavior = advancedBehaviorTracker.getData();
            updateBehavior(behavior, advancedBehavior);
          }, 1000);
        } catch (err) {
          console.error('Failed to collect client info:', err);
        }
      };

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          handleMessage(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);

        // Clear stats interval
        if (statsIntervalRef.current) {
          clearInterval(statsIntervalRef.current);
        }

        // Reconnect after delay
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setError('Connection failed');
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to connect');
    }
  }, []);

  const handleMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case 'welcome': {
        const payload = message.payload as WelcomePayload;
        setCurrentVisitor(payload.visitor);
        setVisitors(payload.visitors);
        break;
      }

      case 'visitor_joined': {
        const payload = message.payload as VisitorEventPayload;
        setVisitors((prev) => [...prev, payload.visitor]);
        break;
      }

      case 'visitor_left': {
        const payload = message.payload as VisitorEventPayload;
        setVisitors((prev) => prev.filter((v) => v.id !== payload.visitor.id));
        break;
      }

      case 'visitor_updated': {
        const payload = message.payload as VisitorEventPayload;
        setVisitors((prev) =>
          prev.map((v) => (v.id === payload.visitor.id ? payload.visitor : v))
        );
        // Update current visitor if it's us
        setCurrentVisitor((prev) =>
          prev?.id === payload.visitor.id ? payload.visitor : prev
        );
        break;
      }

      default:
        console.warn('Unknown message type:', message.type);
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (behaviorIntervalRef.current) {
        clearInterval(behaviorIntervalRef.current);
      }
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
      behaviorTracker.stop();
      advancedBehaviorTracker.stop();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    connected,
    visitors,
    currentVisitor,
    error,
    aiLoading,
    aiCreditsExhausted,
    totalUniqueVisitors,
  };
}
