/**
 * Shared visitor state across multiple instances using Redis
 */

import { createClient, type RedisClientType } from 'redis';
import type { VisitorInfo } from '../src/types';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const INSTANCE_ID = `instance_${process.env.PORT || '3020'}_${Date.now().toString(36)}`;
const VISITORS_KEY = 'yourinfo:visitors';
const VISITOR_CHANNEL = 'yourinfo:visitor_events';
const VISITOR_TTL = 300; // 5 minutes TTL for visitor data

let pubClient: RedisClientType | null = null;
let subClient: RedisClientType | null = null;
let isConnected = false;

type VisitorEventType = 'joined' | 'left' | 'updated';

interface VisitorEvent {
  type: VisitorEventType;
  visitor: VisitorInfo;
  instanceId: string;
}

type EventCallback = (event: VisitorEvent) => void;
const eventCallbacks: EventCallback[] = [];

/**
 * Initialize Redis connections
 */
export async function initSharedVisitors(): Promise<boolean> {
  try {
    const clientOptions = {
      url: REDIS_URL,
      socket: {
        tls: REDIS_URL.startsWith('rediss://'),
        rejectUnauthorized: false,
      },
    };
    pubClient = createClient(clientOptions);
    subClient = createClient(clientOptions);

    pubClient.on('error', (err) => console.error('Redis pub error:', err.message));
    subClient.on('error', (err) => console.error('Redis sub error:', err.message));

    await pubClient.connect();
    await subClient.connect();

    // Subscribe to visitor events
    await subClient.subscribe(VISITOR_CHANNEL, (message) => {
      try {
        const event: VisitorEvent = JSON.parse(message);
        // Ignore events from our own instance
        if (event.instanceId !== INSTANCE_ID) {
          eventCallbacks.forEach(cb => cb(event));
        }
      } catch (err) {
        console.error('Failed to parse visitor event:', err);
      }
    });

    isConnected = true;
    console.log(`Shared visitors initialized (${INSTANCE_ID})`);
    return true;
  } catch (err) {
    console.error('Failed to init shared visitors:', err);
    return false;
  }
}

/**
 * Register callback for visitor events from other instances
 */
export function onVisitorEvent(callback: EventCallback): void {
  eventCallbacks.push(callback);
}

/**
 * Publish visitor joined event
 */
export async function publishVisitorJoined(visitor: VisitorInfo): Promise<void> {
  if (!pubClient || !isConnected) return;

  try {
    // Store visitor in Redis hash with TTL
    await pubClient.hSet(VISITORS_KEY, visitor.id, JSON.stringify(visitor));
    await pubClient.expire(VISITORS_KEY, VISITOR_TTL);

    // Publish event to other instances
    const event: VisitorEvent = {
      type: 'joined',
      visitor,
      instanceId: INSTANCE_ID,
    };
    await pubClient.publish(VISITOR_CHANNEL, JSON.stringify(event));
  } catch (err) {
    console.error('Failed to publish visitor joined:', err);
  }
}

/**
 * Publish visitor left event
 */
export async function publishVisitorLeft(visitor: VisitorInfo): Promise<void> {
  if (!pubClient || !isConnected) return;

  try {
    // Remove visitor from Redis
    await pubClient.hDel(VISITORS_KEY, visitor.id);

    // Publish event to other instances
    const event: VisitorEvent = {
      type: 'left',
      visitor,
      instanceId: INSTANCE_ID,
    };
    await pubClient.publish(VISITOR_CHANNEL, JSON.stringify(event));
  } catch (err) {
    console.error('Failed to publish visitor left:', err);
  }
}

/**
 * Publish visitor updated event
 */
export async function publishVisitorUpdated(visitor: VisitorInfo): Promise<void> {
  if (!pubClient || !isConnected) return;

  try {
    // Update visitor in Redis
    await pubClient.hSet(VISITORS_KEY, visitor.id, JSON.stringify(visitor));

    // Publish event to other instances
    const event: VisitorEvent = {
      type: 'updated',
      visitor,
      instanceId: INSTANCE_ID,
    };
    await pubClient.publish(VISITOR_CHANNEL, JSON.stringify(event));
  } catch (err) {
    console.error('Failed to publish visitor updated:', err);
  }
}

/**
 * Get all visitors from Redis (from all instances)
 */
export async function getAllSharedVisitors(): Promise<VisitorInfo[]> {
  if (!pubClient || !isConnected) return [];

  try {
    const visitors = await pubClient.hGetAll(VISITORS_KEY);
    return Object.values(visitors).map(v => JSON.parse(v));
  } catch (err) {
    console.error('Failed to get shared visitors:', err);
    return [];
  }
}

/**
 * Get total online count from Redis
 */
export async function getSharedOnlineCount(): Promise<number> {
  if (!pubClient || !isConnected) return 0;

  try {
    return await pubClient.hLen(VISITORS_KEY);
  } catch (err) {
    console.error('Failed to get online count:', err);
    return 0;
  }
}

/**
 * Check if shared visitors is connected
 */
export function isSharedVisitorsConnected(): boolean {
  return isConnected;
}
