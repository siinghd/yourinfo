/**
 * AI-powered User Profiling with Redis Caching
 * Uses Grok (X.AI) to analyze user data and infer profile
 */

import { createClient, type RedisClientType } from 'redis';
import type { ClientInfo, UserProfile } from '../src/types';

// Initialize Grok AI
const GROK_API_KEY = process.env.GROK_API_KEY;
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

if (GROK_API_KEY) {
  console.log('Grok AI initialized');
} else {
  console.warn('GROK_API_KEY not set - AI profiling disabled');
}

// Initialize Redis clients (separate for caching and tracking)
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Cache Redis client (for AI profiles)
let redis: RedisClientType | null = null;
let redisConnecting = false;
let redisLastError = 0;

// Tracking Redis client (separate connection for unique visitor tracking)
let trackingRedis: RedisClientType | null = null;
let trackingRedisConnecting = false;
let trackingRedisLastError = 0;

// Reduced backoff: 5 seconds instead of 30
const REDIS_BACKOFF_MS = 5000;

async function createRedisClient(): Promise<RedisClientType> {
  const client = createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: 5000,
      tls: REDIS_URL.startsWith('rediss://'),
      rejectUnauthorized: false,
      reconnectStrategy: (retries) => {
        if (retries > 5) {
          return new Error('Max retries reached');
        }
        return Math.min(retries * 200, 2000);
      },
    },
  });
  return client;
}

async function getRedis(): Promise<RedisClientType | null> {
  // Reduced backoff to 5 seconds
  if (redisLastError > 0 && Date.now() - redisLastError < REDIS_BACKOFF_MS) {
    return null;
  }

  if (redis && redis.isOpen) return redis;
  if (redisConnecting) return null;

  try {
    redisConnecting = true;
    redis = await createRedisClient();

    redis.on('error', (err) => {
      console.error('Redis cache error:', err.message);
      redisLastError = Date.now();
    });

    await redis.connect();
    console.log('Redis connected:', REDIS_URL);
    redisConnecting = false;
    redisLastError = 0;
    return redis;
  } catch (err) {
    console.error('Redis connection failed:', (err as Error).message);
    redisConnecting = false;
    redisLastError = Date.now();
    redis = null;
    return null;
  }
}

// Separate Redis connection for tracking (isolated from cache errors)
async function getTrackingRedis(): Promise<RedisClientType | null> {
  if (trackingRedisLastError > 0 && Date.now() - trackingRedisLastError < REDIS_BACKOFF_MS) {
    return null;
  }

  if (trackingRedis && trackingRedis.isOpen) return trackingRedis;
  if (trackingRedisConnecting) return null;

  try {
    trackingRedisConnecting = true;
    trackingRedis = await createRedisClient();

    trackingRedis.on('error', (err) => {
      console.error('Redis tracking error:', err.message);
      trackingRedisLastError = Date.now();
    });

    await trackingRedis.connect();
    console.log('Redis tracking connected');
    trackingRedisConnecting = false;
    trackingRedisLastError = 0;
    return trackingRedis;
  } catch (err) {
    console.error('Redis tracking connection failed:', (err as Error).message);
    trackingRedisConnecting = false;
    trackingRedisLastError = Date.now();
    trackingRedis = null;
    return null;
  }
}

// Cache TTL: 1 year (profile doesn't change, save AI costs)
const CACHE_TTL = 60 * 60 * 24 * 365;

// Rate limiting: max 2 AI requests per minute PER USER
const RATE_LIMIT_WINDOW = 60 * 1000; // milliseconds
const RATE_LIMIT_MAX = 2;
const userRateLimits = new Map<string, { count: number; resetTime: number }>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of userRateLimits) {
    if (now > value.resetTime) {
      userRateLimits.delete(key);
    }
  }
}, 5 * 60 * 1000);

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = userRateLimits.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    // New window for this user
    userRateLimits.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX) {
    return false; // Rate limited
  }

  userLimit.count++;
  return true;
}

/**
 * Generate a cache key from fingerprint data
 */
function getCacheKey(fingerprintId: string, crossBrowserId: string): string {
  return `yourinfo:profile:${fingerprintId}:${crossBrowserId}`;
}

/**
 * Get cached profile from Redis
 */
async function getCachedProfile(cacheKey: string): Promise<UserProfile | null> {
  try {
    const client = await getRedis();
    if (!client) return null;

    const cached = await client.get(cacheKey);
    if (cached) {
      console.log('Cache hit for profile:', cacheKey);
      return JSON.parse(cached);
    }
    return null;
  } catch (err) {
    console.error('Redis get error:', err);
    return null;
  }
}

/**
 * Cache profile in Redis
 */
async function cacheProfile(cacheKey: string, profile: UserProfile): Promise<void> {
  try {
    const client = await getRedis();
    if (!client) return;

    await client.setEx(cacheKey, CACHE_TTL, JSON.stringify(profile));
    console.log('Cached profile:', cacheKey);
  } catch (err) {
    console.error('Redis set error:', err);
  }
}

/** Geo data from server */
export interface GeoData {
  city?: string;
  region?: string;
  country?: string;
  isp?: string;
  timezone?: string;
}

/**
 * Build prompt for Grok AI
 */
function buildPrompt(clientInfo: Partial<ClientInfo>, geo?: GeoData): string {
  // Get current time info for the user's timezone
  const now = new Date();
  const userTimezone = clientInfo.timezone || geo?.timezone || 'UTC';
  let localHour = now.getUTCHours();
  try {
    const localTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
    localHour = localTime.getHours();
  } catch { /* use UTC */ }

  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

  // Extract relevant data for profiling
  const data = {
    // Hardware
    screenResolution: `${clientInfo.screenWidth}x${clientInfo.screenHeight}`,
    colorDepth: clientInfo.screenColorDepth,
    devicePixelRatio: clientInfo.devicePixelRatio,
    cpuCores: clientInfo.hardwareConcurrency,
    ramGB: clientInfo.deviceMemory,
    ramCapped: clientInfo.deviceMemoryCapped,
    gpu: clientInfo.webglRenderer,
    gpuVendor: clientInfo.webglVendor,
    touchPoints: clientInfo.maxTouchPoints,

    // Browser
    browser: `${clientInfo.browserName} ${clientInfo.browserVersion}`,
    platform: clientInfo.platform,
    language: clientInfo.language,
    languages: clientInfo.languages,
    timezone: clientInfo.timezone,
    hardwareFamily: clientInfo.hardwareFamily,
    historyLength: clientInfo.historyLength,

    // Privacy
    doNotTrack: clientInfo.doNotTrack,
    adBlocker: clientInfo.adBlockerDetected,
    incognito: clientInfo.isIncognito,
    globalPrivacyControl: clientInfo.globalPrivacyControl,
    vpnDetection: clientInfo.vpnDetection,

    // Extensions
    extensions: clientInfo.extensionsDetected,

    // Fonts (coding fonts indicate developer)
    fonts: clientInfo.fontsDetected,

    // Social logins
    socialLogins: clientInfo.socialLogins,

    // Crypto wallets
    cryptoWallets: clientInfo.cryptoWallets,

    // Installed apps (protocol handlers)
    installedApps: clientInfo.installedApps,

    // Color preferences
    colorScheme: clientInfo.prefersColorScheme,
    prefersReducedMotion: clientInfo.prefersReducedMotion,
    colorGamut: clientInfo.colorGamut,
    hdrSupport: clientInfo.hdrSupported,

    // Connection
    connectionType: clientInfo.connectionType,
    connectionSpeed: clientInfo.connectionDownlink,

    // Media devices
    mediaDevices: clientInfo.mediaDevices,

    // APIs supported
    gamepadsSupported: clientInfo.gamepadsSupported,
    webGPUSupported: clientInfo.webGPUSupported,
    midiSupported: clientInfo.midiSupported,
    bluetoothSupported: clientInfo.bluetoothSupported,

    // Bot/automation detection
    isAutomated: clientInfo.isAutomated,
    isHeadless: clientInfo.isHeadless,
    isVirtualMachine: clientInfo.isVirtualMachine,

    // Behavioral data (if available)
    behavior: clientInfo.behavior ? {
      mouseSpeed: clientInfo.behavior.mouseSpeed,
      typingSpeed: clientInfo.behavior.typingSpeed,
      scrollSpeed: clientInfo.behavior.scrollSpeed,
      sessionDuration: clientInfo.behavior.sessionDuration,
      tabSwitchCount: clientInfo.behavior.tabSwitchCount,
    } : null,

    // Advanced behavior
    advancedBehavior: clientInfo.advancedBehavior ? {
      devToolsOpen: clientInfo.advancedBehavior.devToolsOpen,
      rageClickCount: clientInfo.advancedBehavior.rageClickCount,
      likelyHandedness: clientInfo.advancedBehavior.likelyHandedness,
      keyboardShortcutsUsed: clientInfo.advancedBehavior.keyboardShortcutsUsed,
    } : null,

    // Geo/Location (from server-side IP lookup)
    geo: geo ? {
      city: geo.city,
      region: geo.region,
      country: geo.country,
      isp: geo.isp,
    } : null,

    // Time context
    visitTime: {
      localHour,
      dayOfWeek,
      isWeekend: dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday',
      isLateNight: localHour >= 0 && localHour < 6,
      isWorkHours: localHour >= 9 && localHour <= 17 && dayOfWeek !== 'Saturday' && dayOfWeek !== 'Sunday',
    },

    // Storage usage (heavy user indicator)
    storageQuota: clientInfo.storageQuota,

    // DRM support (streaming services)
    drmSupported: clientInfo.drmSupported,

    // Video codecs (content consumption)
    videoCodecs: clientInfo.videoCodecs,
  };

  return `You are a user profiling AI for an educational privacy demonstration website. Analyze this browser fingerprint data and provide insights about what advertisers and tech companies can infer about this user.

DATA:
${JSON.stringify(data, null, 2)}

Respond with a JSON object (no markdown, just pure JSON) with these EXACT fields:
{
  "likelyDeveloper": boolean,
  "developerScore": number (0-100),
  "developerReason": string (brief explanation),
  "likelyGamer": boolean,
  "gamerScore": number (0-100),
  "gamerReason": string,
  "likelyDesigner": boolean,
  "designerScore": number (0-100),
  "designerReason": string,
  "likelyPowerUser": boolean,
  "powerUserScore": number (0-100),
  "powerUserReason": string,
  "privacyConscious": boolean,
  "privacyScore": number (0-100),
  "privacyReason": string,
  "deviceTier": "budget" | "mid-range" | "high-end" | "premium",
  "estimatedDeviceValue": string (e.g., "$1,500-$2,500"),
  "deviceAge": "new" | "recent" | "older" | "old",
  "humanScore": number (0-100, 100 = definitely human),
  "botIndicators": string[],
  "likelyTechSavvy": boolean,
  "likelyMobile": boolean,
  "likelyWorkDevice": boolean,
  "likelyCountry": string,
  "inferredInterests": string[],
  "fraudRiskScore": number (0-100),
  "fraudIndicators": string[],
  "personalityTraits": string[],
  "incomeLevel": "low" | "medium" | "high" | "very-high",
  "ageRange": string (e.g., "25-35"),
  "occupation": string (best guess),

  "relationshipStatus": "single" | "in-relationship" | "married" | "unknown",
  "relationshipReason": string,
  "educationLevel": "high-school" | "some-college" | "bachelors" | "masters" | "phd" | "unknown",
  "educationReason": string,
  "politicalLeaning": "liberal" | "moderate" | "conservative" | "unknown",
  "politicalReason": string,
  "lifeSituation": string (e.g., "Urban professional", "Suburban family", "College student"),
  "financialHealth": "struggling" | "stable" | "comfortable" | "wealthy",
  "financialReason": string,
  "workStyle": "remote" | "office" | "hybrid" | "freelance" | "unemployed" | "student",
  "workReason": string,
  "sleepSchedule": "early-bird" | "night-owl" | "irregular" | "normal",
  "sleepReason": string,
  "stressLevel": "low" | "moderate" | "high" | "burnout",
  "stressReason": string,
  "socialLife": "introvert" | "ambivert" | "extrovert",
  "socialReason": string,
  "likelyParent": boolean,
  "parentReason": string,
  "petOwner": boolean,
  "petType": string | null,
  "homeowner": boolean,
  "homeReason": string,
  "carOwner": boolean,
  "carType": string | null,
  "healthConscious": boolean,
  "healthReason": string,
  "dietaryPreference": string | null,
  "coffeeOrTea": "coffee" | "tea" | "both" | "neither",
  "drinksAlcohol": boolean,
  "smokes": boolean,
  "fitnessLevel": "sedentary" | "light" | "moderate" | "athletic",
  "fitnessReason": string,
  "lifeEvents": string[],
  "shoppingHabits": "frugal" | "moderate" | "spender" | "luxury",
  "shoppingReason": string,
  "brandPreference": string[],
  "streamingServices": string[],
  "musicTaste": string[],
  "travelFrequency": "rarely" | "occasionally" | "frequently" | "constant",
  "travelReason": string,
  "creepyInsights": string[]
}

Be accurate based on the data. Use ALL available signals:

HARDWARE SIGNALS:
- High-end GPUs (RTX 4090, Apple M3 Max) = premium device, likely gamer or professional
- Low RAM (4GB) + budget GPU = budget device, possibly student or lower income
- Multiple monitors (high resolution) = professional/power user
- High DPI display = likely newer/premium device

DEVELOPER SIGNALS:
- Coding fonts (Fira Code, JetBrains Mono, Source Code Pro) = developer
- React/Vue/Angular DevTools extension = definitely a developer
- DevTools open = developer or tech-savvy
- Keyboard shortcuts used (Ctrl+Shift+I, etc.) = power user/developer

LIFESTYLE SIGNALS:
- Browsing at 2-5am = night owl, possibly single, gamer, or different timezone job
- Browsing during work hours = employed, possibly remote worker
- Weekend late night = possibly single, gamer
- Multiple streaming DRM support = movie/TV enthusiast

BEHAVIOR SIGNALS:
- Fast typing speed (>60 WPM) = professional, possibly writer or developer
- Slow mouse movement = casual user or elderly
- Rage clicks = frustrated, possibly impatient personality
- Many tab switches = multitasker or distracted

GEO/ISP SIGNALS:
- Business ISP = likely work device or home office
- Mobile carrier = on-the-go user
- Residential fiber = likely homeowner or apartment with good internet
- City tier (metro vs rural) = urban vs rural lifestyle

PRIVACY SIGNALS:
- VPN detected = privacy conscious, possibly tech worker
- Ad blocker + Do Not Track + GPC = very privacy conscious
- Incognito mode = privacy conscious or hiding something

CRYPTO/FINANCE:
- Multiple crypto wallets = crypto enthusiast, possibly higher risk tolerance
- MetaMask + hardware wallet = serious crypto investor

INSTALLED APPS:
- Discord/Slack = gamer or remote worker
- Zoom/Teams = remote worker
- Spotify = music lover
- Steam = gamer

Be bold with inferences - this is an educational demo showing how much can be inferred.

Respond ONLY with the JSON object, no explanation.`;
}

/**
 * Parse AI response into UserProfile
 */
function parseAIResponse(response: string): UserProfile | null {
  try {
    // Clean up response (remove markdown code blocks if present)
    let cleaned = response.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    }
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (typeof parsed.likelyDeveloper !== 'boolean' ||
        typeof parsed.developerScore !== 'number') {
      throw new Error('Invalid AI response structure');
    }

    return {
      likelyDeveloper: parsed.likelyDeveloper,
      developerScore: Math.min(100, Math.max(0, parsed.developerScore)),
      likelyGamer: parsed.likelyGamer ?? false,
      gamerScore: Math.min(100, Math.max(0, parsed.gamerScore ?? 0)),
      likelyDesigner: parsed.likelyDesigner ?? false,
      designerScore: Math.min(100, Math.max(0, parsed.designerScore ?? 0)),
      likelyPowerUser: parsed.likelyPowerUser ?? false,
      powerUserScore: Math.min(100, Math.max(0, parsed.powerUserScore ?? 0)),
      privacyConscious: parsed.privacyConscious ?? false,
      privacyScore: Math.min(100, Math.max(0, parsed.privacyScore ?? 0)),
      deviceTier: parsed.deviceTier ?? 'mid-range',
      estimatedDeviceValue: parsed.estimatedDeviceValue ?? 'Unknown',
      deviceAge: parsed.deviceAge ?? 'recent',
      humanScore: Math.min(100, Math.max(0, parsed.humanScore ?? 100)),
      botIndicators: parsed.botIndicators ?? [],
      likelyTechSavvy: parsed.likelyTechSavvy ?? false,
      likelyMobile: parsed.likelyMobile ?? false,
      likelyWorkDevice: parsed.likelyWorkDevice ?? false,
      likelyCountry: parsed.likelyCountry ?? 'Unknown',
      inferredInterests: parsed.inferredInterests ?? [],
      fraudRiskScore: Math.min(100, Math.max(0, parsed.fraudRiskScore ?? 0)),
      fraudIndicators: parsed.fraudIndicators ?? [],
      // Extended fields from AI
      ...(parsed.personalityTraits && { personalityTraits: parsed.personalityTraits }),
      ...(parsed.incomeLevel && { incomeLevel: parsed.incomeLevel }),
      ...(parsed.ageRange && { ageRange: parsed.ageRange }),
      ...(parsed.occupation && { occupation: parsed.occupation }),
      ...(parsed.developerReason && { developerReason: parsed.developerReason }),
      ...(parsed.gamerReason && { gamerReason: parsed.gamerReason }),
      ...(parsed.designerReason && { designerReason: parsed.designerReason }),
      ...(parsed.powerUserReason && { powerUserReason: parsed.powerUserReason }),
      ...(parsed.privacyReason && { privacyReason: parsed.privacyReason }),

      // Creepy personal inferences
      ...(parsed.relationshipStatus && { relationshipStatus: parsed.relationshipStatus }),
      ...(parsed.relationshipReason && { relationshipReason: parsed.relationshipReason }),
      ...(parsed.educationLevel && { educationLevel: parsed.educationLevel }),
      ...(parsed.educationReason && { educationReason: parsed.educationReason }),
      ...(parsed.politicalLeaning && { politicalLeaning: parsed.politicalLeaning }),
      ...(parsed.politicalReason && { politicalReason: parsed.politicalReason }),
      ...(parsed.lifeSituation && { lifeSituation: parsed.lifeSituation }),
      ...(parsed.financialHealth && { financialHealth: parsed.financialHealth }),
      ...(parsed.financialReason && { financialReason: parsed.financialReason }),
      ...(parsed.workStyle && { workStyle: parsed.workStyle }),
      ...(parsed.workReason && { workReason: parsed.workReason }),
      ...(parsed.sleepSchedule && { sleepSchedule: parsed.sleepSchedule }),
      ...(parsed.sleepReason && { sleepReason: parsed.sleepReason }),
      ...(parsed.stressLevel && { stressLevel: parsed.stressLevel }),
      ...(parsed.stressReason && { stressReason: parsed.stressReason }),
      ...(parsed.socialLife && { socialLife: parsed.socialLife }),
      ...(parsed.socialReason && { socialReason: parsed.socialReason }),
      ...(parsed.likelyParent !== undefined && { likelyParent: parsed.likelyParent }),
      ...(parsed.parentReason && { parentReason: parsed.parentReason }),
      ...(parsed.petOwner !== undefined && { petOwner: parsed.petOwner }),
      ...(parsed.petType && { petType: parsed.petType }),
      ...(parsed.homeowner !== undefined && { homeowner: parsed.homeowner }),
      ...(parsed.homeReason && { homeReason: parsed.homeReason }),
      ...(parsed.carOwner !== undefined && { carOwner: parsed.carOwner }),
      ...(parsed.carType && { carType: parsed.carType }),
      ...(parsed.healthConscious !== undefined && { healthConscious: parsed.healthConscious }),
      ...(parsed.healthReason && { healthReason: parsed.healthReason }),
      ...(parsed.dietaryPreference && { dietaryPreference: parsed.dietaryPreference }),
      ...(parsed.coffeeOrTea && { coffeeOrTea: parsed.coffeeOrTea }),
      ...(parsed.drinksAlcohol !== undefined && { drinksAlcohol: parsed.drinksAlcohol }),
      ...(parsed.smokes !== undefined && { smokes: parsed.smokes }),
      ...(parsed.fitnessLevel && { fitnessLevel: parsed.fitnessLevel }),
      ...(parsed.fitnessReason && { fitnessReason: parsed.fitnessReason }),
      ...(parsed.lifeEvents && { lifeEvents: parsed.lifeEvents }),
      ...(parsed.shoppingHabits && { shoppingHabits: parsed.shoppingHabits }),
      ...(parsed.shoppingReason && { shoppingReason: parsed.shoppingReason }),
      ...(parsed.brandPreference && { brandPreference: parsed.brandPreference }),
      ...(parsed.streamingServices && { streamingServices: parsed.streamingServices }),
      ...(parsed.musicTaste && { musicTaste: parsed.musicTaste }),
      ...(parsed.travelFrequency && { travelFrequency: parsed.travelFrequency }),
      ...(parsed.travelReason && { travelReason: parsed.travelReason }),
      ...(parsed.creepyInsights && { creepyInsights: parsed.creepyInsights }),
    } as UserProfile;
  } catch (err) {
    console.error('Failed to parse AI response:', err);
    return null;
  }
}

/**
 * Generate AI profile for client info
 */
export async function generateAIProfile(clientInfo: Partial<ClientInfo>, geo?: GeoData): Promise<{
  profile: UserProfile | null;
  source: 'ai' | 'cache' | 'fallback';
  error?: string;
}> {
  const fingerprintId = clientInfo.fingerprintId || 'unknown';
  const crossBrowserId = clientInfo.crossBrowserId || 'unknown';
  const cacheKey = getCacheKey(fingerprintId, crossBrowserId);

  // Try cache first
  const cached = await getCachedProfile(cacheKey);
  if (cached) {
    return { profile: cached, source: 'cache' };
  }

  // If no AI available, return null (will use fallback)
  if (!GROK_API_KEY) {
    return { profile: null, source: 'fallback', error: 'AI not configured' };
  }

  // Check rate limit (per user)
  const userId = `${fingerprintId}:${crossBrowserId}`;
  if (!checkRateLimit(userId)) {
    console.log(`Rate limited user ${userId} - using fallback`);
    return { profile: null, source: 'fallback', error: 'Rate limited' };
  }

  try {
    const prompt = buildPrompt(clientInfo, geo);

    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-reasoning',
        messages: [
          {
            role: 'system',
            content: 'You are a user profiling AI for an educational privacy demonstration. Analyze browser fingerprint data and infer personal details. Always respond with valid JSON only, no markdown.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: false,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Grok API error:', response.status, errorText);
      return { profile: null, source: 'fallback', error: `Grok API error: ${response.status}` };
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      return { profile: null, source: 'fallback', error: 'Empty AI response' };
    }

    const profile = parseAIResponse(text);
    if (!profile) {
      return { profile: null, source: 'fallback', error: 'Failed to parse AI response' };
    }

    // Mark as AI-generated
    (profile as UserProfile & { aiGenerated: boolean }).aiGenerated = true;

    // Cache the result
    await cacheProfile(cacheKey, profile);

    return { profile, source: 'ai' };
  } catch (err) {
    console.error('AI profiling error:', err);
    return { profile: null, source: 'fallback', error: String(err) };
  }
}

/**
 * Close Redis connections (for cleanup)
 */
export async function closeRedis(): Promise<void> {
  if (redis && redis.isOpen) {
    await redis.quit();
    console.log('Redis cache disconnected');
  }
  if (trackingRedis && trackingRedis.isOpen) {
    await trackingRedis.quit();
    console.log('Redis tracking disconnected');
  }
}

// Unique visitors tracking key
const UNIQUE_VISITORS_KEY = 'yourinfo:unique_visitors';

/**
 * Track a unique visitor by fingerprint with retry logic
 * Returns true if this is a new visitor, false if already seen
 */
export async function trackUniqueVisitor(fingerprintId: string, crossBrowserId: string): Promise<boolean> {
  const visitorKey = `${fingerprintId}:${crossBrowserId}`;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await getTrackingRedis();
      if (!client) {
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
          continue;
        }
        return false;
      }

      const added = await client.sAdd(UNIQUE_VISITORS_KEY, visitorKey);
      return added === 1;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (attempt === maxRetries) {
        console.error(`Track unique visitor failed after ${maxRetries} attempts:`, errorMsg);
      }
      // Reset connection on error to force reconnect
      if (trackingRedis) {
        try { await trackingRedis.disconnect(); } catch {}
        trackingRedis = null;
      }
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
      }
    }
  }
  return false;
}

/**
 * Get total unique visitors count with retry logic
 */
export async function getTotalUniqueVisitors(): Promise<number> {
  const maxRetries = 2;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await getTrackingRedis();
      if (!client) {
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        return 0;
      }

      return await client.sCard(UNIQUE_VISITORS_KEY);
    } catch (err) {
      if (attempt === maxRetries) {
        console.error('Get unique visitors error:', err instanceof Error ? err.message : err);
      }
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }
  return 0;
}
