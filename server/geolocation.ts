/**
 * IP Geolocation service using local MaxMind GeoLite2 database
 * No API rate limits - unlimited lookups!
 */

import { Reader } from '@maxmind/geoip2-node';
import type { GeoLocation } from '../src/types';
import { join } from 'path';

/** Path to GeoLite2 database */
const DB_PATH = join(import.meta.dir, '../data/GeoLite2-City.mmdb');

/** MaxMind reader instance */
let reader: Reader | null = null;

/** Initialize the database reader */
async function initReader(): Promise<Reader | null> {
  if (reader) return reader;

  try {
    reader = await Reader.open(DB_PATH);
    console.log('GeoLite2 database loaded successfully');
    return reader;
  } catch (error) {
    console.error('Failed to load GeoLite2 database:', error);
    return null;
  }
}

// Initialize on startup
initReader();

/**
 * Look up geolocation data for an IP address
 * Uses local MaxMind database - no rate limits!
 */
export async function getGeolocation(ip: string): Promise<GeoLocation | null> {
  // Skip localhost/private IPs
  if (isPrivateIP(ip)) {
    return null;
  }

  try {
    const db = await initReader();
    if (!db) {
      return null;
    }

    const result = db.city(ip);

    if (!result) {
      return null;
    }

    const geo: GeoLocation = {
      lat: result.location?.latitude || 0,
      lng: result.location?.longitude || 0,
      city: result.city?.names?.en || 'Unknown',
      region: result.subdivisions?.[0]?.names?.en || 'Unknown',
      country: result.country?.names?.en || 'Unknown',
      countryCode: result.country?.isoCode || 'XX',
      timezone: result.location?.timeZone || 'UTC',
      isp: result.traits?.isp || result.traits?.organization || 'Unknown',
      org: result.traits?.organization || 'Unknown',
      as: result.traits?.autonomousSystemOrganization || 'Unknown',
    };

    return geo;
  } catch (error) {
    // Silently handle lookup errors (invalid IPs, etc.)
    return null;
  }
}

/**
 * Check if an IP is private/localhost
 */
function isPrivateIP(ip: string): boolean {
  // IPv4 private ranges
  if (
    ip === '127.0.0.1' ||
    ip === 'localhost' ||
    ip === 'unknown' ||
    ip.startsWith('10.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.20.') ||
    ip.startsWith('172.21.') ||
    ip.startsWith('172.22.') ||
    ip.startsWith('172.23.') ||
    ip.startsWith('172.24.') ||
    ip.startsWith('172.25.') ||
    ip.startsWith('172.26.') ||
    ip.startsWith('172.27.') ||
    ip.startsWith('172.28.') ||
    ip.startsWith('172.29.') ||
    ip.startsWith('172.30.') ||
    ip.startsWith('172.31.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.')
  ) {
    return true;
  }

  // IPv6 localhost
  if (ip === '::1' || ip === '::ffff:127.0.0.1') {
    return true;
  }

  return false;
}
