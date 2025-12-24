/**
 * Info Panel component
 * Displays gathered information about the visitor in categorized sections
 */

import type { VisitorInfo } from '../types';
import './InfoPanel.css';

interface InfoPanelProps {
  visitor: VisitorInfo | null;
  isCurrentUser: boolean;
  onClose?: () => void;
  aiLoading?: boolean;
}

interface InfoRowProps {
  label: string;
  value: string | number | boolean | null | undefined;
  tooltip?: string;
  warning?: boolean;
}

function InfoRow({ label, value, tooltip, warning }: InfoRowProps) {
  const displayValue =
    value === null || value === undefined
      ? 'N/A'
      : typeof value === 'boolean'
        ? value
          ? 'Yes'
          : 'No'
        : String(value);

  return (
    <div className={`info-row ${warning ? 'warning' : ''}`} title={tooltip}>
      <span className="info-label">{label}</span>
      <span className="info-value">{displayValue}</span>
    </div>
  );
}

interface InfoSectionProps {
  title: string;
  icon: string;
  children: React.ReactNode;
  collapsed?: boolean;
}

function InfoSection({ title, icon, children }: InfoSectionProps) {
  return (
    <div className="info-section">
      <div className="info-section-header">
        <span className="info-section-icon">{icon}</span>
        <span className="info-section-title">{title}</span>
      </div>
      <div className="info-section-content">{children}</div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="loading-skeleton">
      <div className="skeleton-row">
        <div className="skeleton-label"></div>
        <div className="skeleton-value"></div>
      </div>
      <div className="skeleton-row">
        <div className="skeleton-label"></div>
        <div className="skeleton-value"></div>
      </div>
      <div className="skeleton-row">
        <div className="skeleton-label"></div>
        <div className="skeleton-value"></div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function InfoPanel({ visitor, isCurrentUser, onClose, aiLoading }: InfoPanelProps) {
  if (!visitor) {
    return (
      <div className="info-panel">
        <div className="info-panel-header">
          <h2>Your Information</h2>
        </div>
        <div className="info-panel-content">
          <p className="loading-message">Connecting...</p>
        </div>
      </div>
    );
  }

  const { server, client } = visitor;

  return (
    <div className="info-panel">
      <div className="info-panel-header">
        <h2>{isCurrentUser ? 'Your Information' : 'Visitor Info'}</h2>
        {!isCurrentUser && onClose && (
          <button className="close-button" onClick={onClose}>
            x
          </button>
        )}
        {isCurrentUser && <span className="you-badge">You</span>}
      </div>

      <div className="info-panel-content">
        {/* Unique Fingerprint ID - Show at top! */}
        {client && (
          <InfoSection title="Your Unique IDs" icon="!">
            <InfoRow
              label="Browser Fingerprint"
              value={client.fingerprintId}
              tooltip="Unique to this browser - changes if you switch browsers"
              warning
            />
            <InfoRow
              label="Cross-Browser ID"
              value={client.crossBrowserId}
              tooltip="SAME across Chrome, Firefox, Safari! Based on hardware."
              warning
            />
            <InfoRow
              label="Confidence"
              value={`${client.fingerprintConfidence}%`}
              tooltip="How confident we are this ID is unique to you"
            />
          </InfoSection>
        )}

        {/* Location Section - Second! */}
        <InfoSection title="Location" icon="O">
          <InfoRow
            label="IP Address"
            value={server.ip}
            tooltip="Your public IP address visible to every website"
            warning={isCurrentUser}
          />
          {server.geo && (
            <>
              <InfoRow label="City" value={server.geo.city} />
              <InfoRow label="Region" value={server.geo.region} />
              <InfoRow label="Country" value={`${server.geo.country} (${server.geo.countryCode})`} />
              <InfoRow
                label="Coordinates"
                value={isCurrentUser
                  ? `${server.geo.lat.toFixed(4)}, ${server.geo.lng.toFixed(4)}`
                  : `~${server.geo.lat.toFixed(1)}, ${server.geo.lng.toFixed(1)} (APPROX)`
                }
                tooltip={isCurrentUser ? undefined : "Approximate location for privacy"}
                warning={isCurrentUser}
              />
              <InfoRow label="Timezone" value={server.geo.timezone} />
              {isCurrentUser && (
                <>
                  <InfoRow label="ISP" value={server.geo.isp} tooltip="Your Internet Service Provider" />
                  <InfoRow label="Organization" value={server.geo.org} />
                </>
              )}
            </>
          )}
        </InfoSection>

        {/* User Profile - What advertisers think about you */}
        {client && (
          <InfoSection title={client.userProfile.aiGenerated ? "AI Analysis of You" : "What Advertisers Know About You"} icon="$">
            {client.userProfile.aiGenerated && (
              <InfoRow
                label="Profile Source"
                value="AI Generated"
                tooltip="Analyzed by Google Gemini AI"
                warning
              />
            )}
            <InfoRow
              label="Human Score"
              value={`${client.userProfile.humanScore}%`}
              tooltip="How confident we are you're human"
              warning={client.userProfile.humanScore < 70}
            />
            <InfoRow
              label="Fraud Risk"
              value={`${client.userProfile.fraudRiskScore}%`}
              tooltip="Risk score used by payment processors"
              warning={client.userProfile.fraudRiskScore > 30}
            />
            <InfoRow
              label="Device Tier"
              value={client.userProfile.deviceTier}
              tooltip="Used to determine your spending power"
            />
            <InfoRow
              label="Device Value"
              value={client.userProfile.estimatedDeviceValue}
              tooltip="Estimated value of your device"
              warning
            />
            <InfoRow
              label="Device Age"
              value={client.userProfile.deviceAge}
            />
            <InfoRow
              label="Country"
              value={client.userProfile.likelyCountry}
            />
            {client.userProfile.incomeLevel && (
              <InfoRow
                label="Income Level"
                value={client.userProfile.incomeLevel}
                tooltip="Inferred from device and browsing patterns"
                warning
              />
            )}
            {client.userProfile.ageRange && (
              <InfoRow
                label="Age Range"
                value={client.userProfile.ageRange}
                tooltip="Estimated age based on device and preferences"
                warning
              />
            )}
            {client.userProfile.occupation && (
              <InfoRow
                label="Occupation"
                value={client.userProfile.occupation}
                tooltip="Best guess based on tools and patterns"
                warning
              />
            )}
            {client.userProfile.educationLevel && client.userProfile.educationLevel !== 'unknown' && (
              <InfoRow
                label="Education"
                value={client.userProfile.educationLevel}
                tooltip={client.userProfile.educationReason}
                warning
              />
            )}
            {client.userProfile.workStyle && (
              <InfoRow
                label="Work Style"
                value={client.userProfile.workStyle}
                tooltip={client.userProfile.workReason}
                warning
              />
            )}
            {client.userProfile.lifeSituation && (
              <InfoRow
                label="Life Situation"
                value={client.userProfile.lifeSituation}
                warning
              />
            )}
          </InfoSection>
        )}

        {/* Creepy Personal Life Inferences */}
        {client && (aiLoading || client.userProfile.aiGenerated) && (
          <InfoSection title="Your Personal Life (AI Guesses)" icon="!">
            {aiLoading && !client.userProfile.aiGenerated && <LoadingSkeleton />}
            {client.userProfile.relationshipStatus && client.userProfile.relationshipStatus !== 'unknown' && (
              <InfoRow
                label="Relationship"
                value={client.userProfile.relationshipStatus}
                tooltip={client.userProfile.relationshipReason}
                warning
              />
            )}
            {client.userProfile.likelyParent !== undefined && (
              <InfoRow
                label="Parent"
                value={client.userProfile.likelyParent ? 'Likely yes' : 'Probably not'}
                tooltip={client.userProfile.parentReason}
                warning={client.userProfile.likelyParent}
              />
            )}
            {client.userProfile.petOwner !== undefined && (
              <InfoRow
                label="Pet Owner"
                value={client.userProfile.petOwner ? (client.userProfile.petType || 'Yes') : 'No'}
                warning={client.userProfile.petOwner}
              />
            )}
            {client.userProfile.homeowner !== undefined && (
              <InfoRow
                label="Homeowner"
                value={client.userProfile.homeowner ? 'Likely yes' : 'Renter'}
                tooltip={client.userProfile.homeReason}
                warning
              />
            )}
            {client.userProfile.carOwner !== undefined && (
              <InfoRow
                label="Car Owner"
                value={client.userProfile.carOwner ? (client.userProfile.carType || 'Yes') : 'No'}
                warning={client.userProfile.carOwner}
              />
            )}
            {client.userProfile.socialLife && (
              <InfoRow
                label="Social Type"
                value={client.userProfile.socialLife}
                tooltip={client.userProfile.socialReason}
                warning
              />
            )}
          </InfoSection>
        )}

        {/* Mental & Physical State */}
        {client && (aiLoading || client.userProfile.aiGenerated) && (
          <InfoSection title="Your Mental & Physical State" icon="H">
            {aiLoading && !client.userProfile.aiGenerated && <LoadingSkeleton />}
            {client.userProfile.stressLevel && (
              <InfoRow
                label="Stress Level"
                value={client.userProfile.stressLevel}
                tooltip={client.userProfile.stressReason}
                warning={client.userProfile.stressLevel === 'high' || client.userProfile.stressLevel === 'burnout'}
              />
            )}
            {client.userProfile.sleepSchedule && (
              <InfoRow
                label="Sleep Schedule"
                value={client.userProfile.sleepSchedule}
                tooltip={client.userProfile.sleepReason}
                warning
              />
            )}
            {client.userProfile.fitnessLevel && (
              <InfoRow
                label="Fitness Level"
                value={client.userProfile.fitnessLevel}
                tooltip={client.userProfile.fitnessReason}
                warning
              />
            )}
            {client.userProfile.healthConscious !== undefined && (
              <InfoRow
                label="Health Conscious"
                value={client.userProfile.healthConscious ? 'Yes' : 'Not really'}
                tooltip={client.userProfile.healthReason}
              />
            )}
            {client.userProfile.dietaryPreference && (
              <InfoRow
                label="Diet"
                value={client.userProfile.dietaryPreference}
                warning
              />
            )}
          </InfoSection>
        )}

        {/* Lifestyle & Habits */}
        {client && (aiLoading || client.userProfile.aiGenerated) && (
          <InfoSection title="Your Lifestyle & Habits" icon="L">
            {aiLoading && !client.userProfile.aiGenerated && <LoadingSkeleton />}
            {client.userProfile.coffeeOrTea && (
              <InfoRow
                label="Caffeine"
                value={client.userProfile.coffeeOrTea === 'coffee' ? 'Coffee person' : client.userProfile.coffeeOrTea === 'tea' ? 'Tea person' : client.userProfile.coffeeOrTea}
                warning
              />
            )}
            {client.userProfile.drinksAlcohol !== undefined && (
              <InfoRow
                label="Drinks Alcohol"
                value={client.userProfile.drinksAlcohol ? 'Probably' : 'Unlikely'}
              />
            )}
            {client.userProfile.smokes !== undefined && (
              <InfoRow
                label="Smokes"
                value={client.userProfile.smokes ? 'Possibly' : 'Unlikely'}
                warning={client.userProfile.smokes}
              />
            )}
            {client.userProfile.travelFrequency && (
              <InfoRow
                label="Travel"
                value={client.userProfile.travelFrequency}
                tooltip={client.userProfile.travelReason}
              />
            )}
          </InfoSection>
        )}

        {/* Financial & Shopping */}
        {client && (aiLoading || client.userProfile.aiGenerated) && (
          <InfoSection title="Your Financial Profile" icon="$">
            {aiLoading && !client.userProfile.aiGenerated && <LoadingSkeleton />}
            {client.userProfile.financialHealth && (
              <InfoRow
                label="Financial Health"
                value={client.userProfile.financialHealth}
                tooltip={client.userProfile.financialReason}
                warning
              />
            )}
            {client.userProfile.shoppingHabits && (
              <InfoRow
                label="Shopping Style"
                value={client.userProfile.shoppingHabits}
                tooltip={client.userProfile.shoppingReason}
                warning
              />
            )}
            {client.userProfile.brandPreference && client.userProfile.brandPreference.length > 0 && (
              <InfoRow
                label="Brand Affinity"
                value={client.userProfile.brandPreference.slice(0, 3).join(', ')}
                warning
              />
            )}
          </InfoSection>
        )}

        {/* Entertainment & Media */}
        {client && (aiLoading || (client.userProfile.aiGenerated && (client.userProfile.streamingServices?.length || client.userProfile.musicTaste?.length))) && (
          <InfoSection title="Your Entertainment" icon="E">
            {aiLoading && !client.userProfile.aiGenerated && <LoadingSkeleton />}
            {client.userProfile.streamingServices && client.userProfile.streamingServices.length > 0 && (
              <InfoRow
                label="Streaming"
                value={client.userProfile.streamingServices.join(', ')}
                warning
              />
            )}
            {client.userProfile.musicTaste && client.userProfile.musicTaste.length > 0 && (
              <InfoRow
                label="Music Taste"
                value={client.userProfile.musicTaste.join(', ')}
                warning
              />
            )}
          </InfoSection>
        )}

        {/* Life Events */}
        {client && client.userProfile.lifeEvents && client.userProfile.lifeEvents.length > 0 && (
          <InfoSection title="Recent Life Events" icon="!">
            {client.userProfile.lifeEvents.map((event) => (
              <InfoRow key={event} label={event} value="Detected" warning />
            ))}
          </InfoSection>
        )}

        {/* Political (if detected) */}
        {client && client.userProfile.politicalLeaning && client.userProfile.politicalLeaning !== 'unknown' && (
          <InfoSection title="Political Inference" icon="P">
            <InfoRow
              label="Leaning"
              value={client.userProfile.politicalLeaning}
              tooltip={client.userProfile.politicalReason}
              warning
            />
          </InfoSection>
        )}

        {/* Creepy Insights Summary */}
        {client && client.userProfile.creepyInsights && client.userProfile.creepyInsights.length > 0 && (
          <InfoSection title="Other Creepy Insights" icon="!">
            {client.userProfile.creepyInsights.map((insight, i) => (
              <InfoRow key={i} label={`Insight ${i + 1}`} value={insight} warning />
            ))}
          </InfoSection>
        )}

        {/* User Type Detection */}
        {client && (
          <InfoSection title="Who They Think You Are" icon="U">
            <InfoRow
              label="Developer"
              value={client.userProfile.likelyDeveloper ? `Yes (${client.userProfile.developerScore}%)` : `No (${client.userProfile.developerScore}%)`}
              tooltip={client.userProfile.developerReason}
              warning={client.userProfile.likelyDeveloper}
            />
            <InfoRow
              label="Gamer"
              value={client.userProfile.likelyGamer ? `Yes (${client.userProfile.gamerScore}%)` : `No (${client.userProfile.gamerScore}%)`}
              tooltip={client.userProfile.gamerReason}
              warning={client.userProfile.likelyGamer}
            />
            <InfoRow
              label="Designer"
              value={client.userProfile.likelyDesigner ? `Yes (${client.userProfile.designerScore}%)` : `No (${client.userProfile.designerScore}%)`}
              tooltip={client.userProfile.designerReason}
              warning={client.userProfile.likelyDesigner}
            />
            <InfoRow
              label="Power User"
              value={client.userProfile.likelyPowerUser ? `Yes (${client.userProfile.powerUserScore}%)` : `No (${client.userProfile.powerUserScore}%)`}
              tooltip={client.userProfile.powerUserReason}
              warning={client.userProfile.likelyPowerUser}
            />
            <InfoRow
              label="Privacy Conscious"
              value={client.userProfile.privacyConscious ? `Yes (${client.userProfile.privacyScore}%)` : `No (${client.userProfile.privacyScore}%)`}
              tooltip={client.userProfile.privacyReason}
            />
            <InfoRow
              label="Tech Savvy"
              value={client.userProfile.likelyTechSavvy}
            />
            <InfoRow
              label="Mobile User"
              value={client.userProfile.likelyMobile}
            />
            <InfoRow
              label="Work Device"
              value={client.userProfile.likelyWorkDevice}
            />
          </InfoSection>
        )}

        {/* Personality Traits (AI only) */}
        {client && client.userProfile.personalityTraits && client.userProfile.personalityTraits.length > 0 && (
          <InfoSection title="Personality Traits" icon="P">
            {client.userProfile.personalityTraits.map((trait) => (
              <InfoRow key={trait} label={trait} value="Detected" warning />
            ))}
          </InfoSection>
        )}

        {/* Inferred Interests */}
        {client && client.userProfile.inferredInterests.length > 0 && (
          <InfoSection title="Inferred Interests" icon="*">
            {client.userProfile.inferredInterests.map((interest) => (
              <InfoRow key={interest} label={interest} value="Likely interested" warning />
            ))}
          </InfoSection>
        )}

        {/* Bot Indicators */}
        {client && client.userProfile.botIndicators.length > 0 && (
          <InfoSection title="Bot Detection Flags" icon="!">
            {client.userProfile.botIndicators.map((indicator) => (
              <InfoRow key={indicator} label={indicator} value="Detected" warning />
            ))}
          </InfoSection>
        )}

        {/* Fraud Indicators */}
        {client && client.userProfile.fraudIndicators.length > 0 && (
          <InfoSection title="Fraud Risk Factors" icon="!">
            {client.userProfile.fraudIndicators.map((indicator) => (
              <InfoRow key={indicator} label={indicator} value="Flagged" warning />
            ))}
          </InfoSection>
        )}

        {/* Cross-Browser Tracking Factors */}
        {client && client.crossBrowserFactors.length > 0 && (
          <InfoSection title="Why We Can Track You Across Browsers" icon="X">
            {client.crossBrowserFactors.map((factor, i) => (
              <InfoRow key={i} label={factor.split(':')[0]} value={factor.split(':')[1]?.trim() || 'Yes'} />
            ))}
          </InfoSection>
        )}


        {/* WebRTC Local IPs */}
        {client && client.webrtcLocalIPs.length > 0 && (
          <InfoSection title="Local Network" icon="!">
            {client.webrtcLocalIPs.map((ip, i) => (
              <InfoRow
                key={ip}
                label={`Local IP ${i + 1}`}
                value={ip}
                tooltip="Private IP revealed via WebRTC - can expose your network setup"
                warning
              />
            ))}
          </InfoSection>
        )}

        {/* Browser Section */}
        <InfoSection title="Browser" icon="#">
          <InfoRow
            label="User Agent"
            value={server.userAgent.substring(0, 50) + (server.userAgent.length > 50 ? '...' : '')}
            tooltip={server.userAgent}
          />
          <InfoRow label="Languages" value={server.acceptLanguage.split(',')[0]} />
          <InfoRow label="Referrer" value={server.referer} />
          {client && (
            <>
              <InfoRow label="Platform" value={client.platform} />
              <InfoRow label="Language" value={client.language} />
              <InfoRow label="Do Not Track" value={client.doNotTrack} />
              <InfoRow label="Global Privacy Control" value={client.globalPrivacyControl} />
              <InfoRow label="Cookies Enabled" value={client.cookiesEnabled} />
              <InfoRow label="LocalStorage" value={client.localStorageEnabled} />
              <InfoRow label="SessionStorage" value={client.sessionStorageEnabled} />
              <InfoRow label="IndexedDB" value={client.indexedDBEnabled} />
              <InfoRow label="PDF Viewer" value={client.pdfViewerEnabled} />
            </>
          )}
        </InfoSection>

        {/* Client Hints - More accurate OS/device info */}
        {client?.clientHints && (
          <InfoSection title="Client Hints" icon="+">
            <InfoRow label="Architecture" value={client.clientHints.architecture} />
            <InfoRow label="Bitness" value={client.clientHints.bitness ? `${client.clientHints.bitness}-bit` : null} />
            <InfoRow label="Mobile" value={client.clientHints.mobile} />
            <InfoRow label="Model" value={client.clientHints.model} />
            <InfoRow label="Platform Version" value={client.clientHints.platformVersion} />
            <InfoRow
              label="Browser Versions"
              value={
                client.clientHints.fullVersionList
                  ? client.clientHints.fullVersionList.substring(0, 40) + '...'
                  : null
              }
              tooltip={client.clientHints.fullVersionList || undefined}
            />
          </InfoSection>
        )}

        {/* Device Section */}
        {client && (
          <InfoSection title="Display" icon="=">
            <InfoRow label="Screen" value={`${client.screenWidth} x ${client.screenHeight}`} tooltip="Screen resolution" />
            <InfoRow label="Window" value={`${client.windowWidth} x ${client.windowHeight}`} tooltip="Browser window size" />
            <InfoRow label="Color Depth" value={`${client.screenColorDepth}-bit`} />
            <InfoRow label="Pixel Ratio" value={`${client.devicePixelRatio}x`} />
            <InfoRow label="Orientation" value={client.screenOrientation} />
            <InfoRow label="Touch Points" value={client.maxTouchPoints} />
          </InfoSection>
        )}

        {/* Hardware Section */}
        {client && (
          <InfoSection title="Hardware" icon="*">
            <InfoRow label="CPU Cores" value={client.hardwareConcurrency} tooltip="Number of logical processors" />
            <InfoRow
              label="RAM"
              value={
                client.deviceMemory
                  ? `${client.deviceMemory} GB${client.deviceMemoryCapped ? ' (capped)' : ''}`
                  : null
              }
              tooltip={
                client.deviceMemoryCapped
                  ? 'Browser caps RAM at 8GB for privacy - actual RAM may be higher!'
                  : 'Approximate device memory'
              }
              warning={client.deviceMemoryCapped}
            />
            <InfoRow label="GPU Vendor" value={client.webglVendor} />
            <InfoRow
              label="GPU"
              value={
                client.webglRenderer
                  ? client.webglRenderer.substring(0, 40) + (client.webglRenderer.length > 40 ? '...' : '')
                  : null
              }
              tooltip={client.webglRenderer || undefined}
            />
            <InfoRow label="WebGL Version" value={client.webglVersion} />
            <InfoRow label="WebGL Extensions" value={client.webglExtensions} />
          </InfoSection>
        )}

        {/* Network Section */}
        {client && (
          <InfoSection title="Network" icon="~">
            <InfoRow
              label="Connection"
              value={client.connectionType?.toUpperCase()}
              tooltip="Effective connection type (2G, 3G, 4G, etc.)"
            />
            <InfoRow label="Downlink" value={client.connectionDownlink ? `${client.connectionDownlink} Mbps` : null} />
            <InfoRow label="RTT" value={client.connectionRtt ? `${client.connectionRtt} ms` : null} tooltip="Round-trip time estimate" />
            <InfoRow label="Data Saver" value={client.connectionSaveData} tooltip="Data saver mode enabled" />
            <InfoRow label="Battery" value={client.batteryLevel !== null ? `${client.batteryLevel}%` : null} />
            <InfoRow label="Charging" value={client.batteryCharging} />
            <InfoRow label="WebRTC Supported" value={client.webrtcSupported} />
          </InfoSection>
        )}

        {/* Media Devices */}
        {client?.mediaDevices && (
          <InfoSection title="Media Devices" icon="M">
            <InfoRow label="Microphones" value={client.mediaDevices.audioinput} />
            <InfoRow label="Cameras" value={client.mediaDevices.videoinput} />
            <InfoRow label="Speakers" value={client.mediaDevices.audiooutput} />
          </InfoSection>
        )}

        {/* Storage Section */}
        {client?.storageQuota && (
          <InfoSection title="Storage" icon="D">
            <InfoRow label="Used" value={formatBytes(client.storageQuota.usage)} />
            <InfoRow
              label="Quota"
              value={formatBytes(client.storageQuota.quota)}
              tooltip="Estimated storage quota - can reveal disk size"
            />
            <InfoRow
              label="Usage %"
              value={`${((client.storageQuota.usage / client.storageQuota.quota) * 100).toFixed(2)}%`}
            />
          </InfoSection>
        )}

        {/* Permissions Section */}
        {client && Object.keys(client.permissions).length > 0 && (
          <InfoSection title="Permissions" icon="P">
            {Object.entries(client.permissions).map(([name, state]) => (
              <InfoRow key={name} label={name} value={state} />
            ))}
          </InfoSection>
        )}

        {/* API Support Section */}
        {client && (
          <InfoSection title="API Support" icon="A">
            <InfoRow label="Bluetooth" value={client.bluetoothSupported} />
            <InfoRow label="USB" value={client.usbSupported} />
            <InfoRow label="MIDI" value={client.midiSupported} />
            <InfoRow label="Gamepads" value={client.gamepadsSupported} />
            <InfoRow label="WebGPU" value={client.webGPUSupported} />
            <InfoRow label="SharedArrayBuffer" value={client.sharedArrayBufferSupported} />
          </InfoSection>
        )}

        {/* Fingerprints Section */}
        {client && (
          <InfoSection title="Fingerprints" icon="@">
            <InfoRow label="Canvas Hash" value={client.canvasFingerprint} tooltip="Unique identifier from canvas rendering" />
            <InfoRow label="Audio Hash" value={client.audioFingerprint} tooltip="Unique identifier from audio processing" />
            <InfoRow label="WebGL Hash" value={client.webglFingerprint} tooltip="Unique identifier from WebGL parameters" />
            <InfoRow label="Fonts Detected" value={client.fontsDetected.length} tooltip={client.fontsDetected.join(', ')} />
            <InfoRow label="Speech Voices" value={client.speechVoicesCount} tooltip="Number of text-to-speech voices installed" />
            <InfoRow label="Voices Hash" value={client.speechVoicesHash} tooltip="Hash of installed voices - very unique!" />
            <InfoRow label="Timezone" value={client.timezone} />
            <InfoRow
              label="TZ Offset"
              value={`UTC${client.timezoneOffset > 0 ? '-' : '+'}${Math.abs(client.timezoneOffset / 60)}`}
            />
          </InfoSection>
        )}

        {/* Privacy & Tracking Section */}
        {client && (
          <InfoSection title="Tracking Detection" icon="!">
            <InfoRow
              label="Ad Blocker"
              value={client.adBlockerDetected === null ? 'Unknown' : client.adBlockerDetected ? 'Detected' : 'Not detected'}
              tooltip="Whether an ad blocker is active"
            />
            <InfoRow label="Do Not Track" value={client.doNotTrack ? 'Enabled' : 'Disabled'} />
            <InfoRow
              label="Global Privacy Control"
              value={client.globalPrivacyControl === null ? 'N/A' : client.globalPrivacyControl ? 'Enabled' : 'Disabled'}
            />
          </InfoSection>
        )}

        {/* Browser Detection */}
        {client && (
          <InfoSection title="Browser Analysis" icon="B">
            <InfoRow label="Browser" value={`${client.browserName} ${client.browserVersion}`} />
            <InfoRow label="Hardware Family" value={client.hardwareFamily} />
            <InfoRow
              label="Incognito Mode"
              value={client.isIncognito === null ? 'Unknown' : client.isIncognito ? 'Yes' : 'No'}
              tooltip="Private/incognito browsing detected"
              warning={client.isIncognito === true}
            />
            <InfoRow
              label="Automated"
              value={client.isAutomated}
              tooltip="Selenium, Puppeteer, or other automation detected"
              warning={client.isAutomated}
            />
            <InfoRow
              label="Headless"
              value={client.isHeadless}
              tooltip="Headless browser detected"
              warning={client.isHeadless}
            />
            <InfoRow
              label="Virtual Machine"
              value={client.isVirtualMachine === null ? 'Unknown' : client.isVirtualMachine ? 'Yes' : 'No'}
              tooltip="Running in a VM"
            />
            <InfoRow label="History Length" value={client.historyLength} tooltip="Number of pages in browser history" />
          </InfoSection>
        )}

        {/* CSS Preferences */}
        {client && (
          <InfoSection title="System Preferences" icon="S">
            <InfoRow label="Color Scheme" value={client.prefersColorScheme} tooltip="Dark/light mode preference" />
            <InfoRow label="Reduced Motion" value={client.prefersReducedMotion} />
            <InfoRow label="Reduced Transparency" value={client.prefersReducedTransparency} />
            <InfoRow label="Contrast" value={client.prefersContrast} />
            <InfoRow label="Forced Colors" value={client.forcedColors} tooltip="Windows High Contrast mode" />
            <InfoRow label="Color Gamut" value={client.colorGamut} tooltip="Display color range" />
            <InfoRow label="HDR Support" value={client.hdrSupported} />
            <InfoRow label="Inverted Colors" value={client.invertedColors} />
          </InfoSection>
        )}

        {/* Codec Support */}
        {client && (
          <InfoSection title="Media Codecs" icon="V">
            <InfoRow label="Video Codecs" value={client.videoCodecs.join(', ')} />
            <InfoRow label="Audio Codecs" value={client.audioCodecs.join(', ')} />
            <InfoRow label="Widevine DRM" value={client.drmSupported.widevine} />
            <InfoRow label="FairPlay DRM" value={client.drmSupported.fairplay} />
            <InfoRow label="PlayReady DRM" value={client.drmSupported.playready} />
          </InfoSection>
        )}

        {/* Sensors */}
        {client && (
          <InfoSection title="Sensors" icon="G">
            <InfoRow label="Accelerometer" value={client.sensors.accelerometer} />
            <InfoRow label="Gyroscope" value={client.sensors.gyroscope} />
            <InfoRow label="Magnetometer" value={client.sensors.magnetometer} />
            <InfoRow label="Ambient Light" value={client.sensors.ambientLight} />
            <InfoRow label="Proximity" value={client.sensors.proximity} />
            <InfoRow label="Linear Acceleration" value={client.sensors.linearAcceleration} />
            <InfoRow label="Gravity" value={client.sensors.gravity} />
            <InfoRow label="Orientation" value={client.sensors.absoluteOrientation} />
          </InfoSection>
        )}

        {/* Performance Memory */}
        {client?.performanceMemory && (
          <InfoSection title="JS Memory" icon="J">
            <InfoRow label="Heap Limit" value={formatBytes(client.performanceMemory.jsHeapSizeLimit)} />
            <InfoRow label="Total Heap" value={formatBytes(client.performanceMemory.totalJSHeapSize)} />
            <InfoRow label="Used Heap" value={formatBytes(client.performanceMemory.usedJSHeapSize)} />
          </InfoSection>
        )}

        {/* Extensions Detected */}
        {client && client.extensionsDetected.length > 0 && (
          <InfoSection title="Extensions Detected" icon="E">
            {client.extensionsDetected.map((ext) => (
              <InfoRow key={ext} label={ext} value="Detected" warning />
            ))}
          </InfoSection>
        )}

        {/* Advanced Capabilities */}
        {client && (
          <InfoSection title="Web APIs" icon="W">
            <InfoRow label="Service Worker" value={client.serviceWorkerSupported} />
            <InfoRow label="Web Worker" value={client.webWorkerSupported} />
            <InfoRow label="WebAssembly" value={client.wasmSupported} />
            <InfoRow label="WebSocket" value={client.webSocketSupported} />
            <InfoRow label="WebRTC" value={client.webRTCSupported} />
            <InfoRow label="Notifications" value={client.notificationSupported} />
            <InfoRow label="Push API" value={client.pushSupported} />
            <InfoRow label="Payment Request" value={client.paymentRequestSupported} />
            <InfoRow label="Credentials API" value={client.credentialsSupported} />
            <InfoRow label="Clipboard API" value={client.clipboardSupported} />
          </InfoSection>
        )}

        {/* Advanced Fingerprints */}
        {client && (
          <InfoSection title="Advanced Fingerprints" icon="F">
            <InfoRow label="Math Hash" value={client.mathFingerprint} tooltip="JS engine math differences" />
            <InfoRow label="Timing Hash" value={client.timingFingerprint} tooltip="CPU performance fingerprint" />
            <InfoRow label="Error Hash" value={client.errorFingerprint} tooltip="Error message fingerprint" />
            <InfoRow label="Navigator Props" value={client.navigatorPropsCount} tooltip="Number of navigator properties" />
            <InfoRow label="Window Props" value={client.windowPropsCount} tooltip="Number of window properties" />
            <InfoRow label="Max Downlink" value={client.downlinkMax ? `${client.downlinkMax} Mbps` : 'N/A'} />
          </InfoSection>
        )}

        {/* Real-time Behavior Tracking */}
        {client && (
          <InfoSection title="Mouse Behavior" icon="M">
            <InfoRow label="Speed" value={`${client.behavior.mouseSpeed} px/s`} tooltip="Average mouse speed" />
            <InfoRow label="Acceleration" value={`${client.behavior.mouseAcceleration}`} />
            <InfoRow label="Movements" value={client.behavior.mouseMovements} />
            <InfoRow label="Distance" value={`${client.behavior.mouseDistanceTraveled} px`} tooltip="Total distance traveled" />
            <InfoRow label="Idle Time" value={`${Math.round(client.behavior.mouseIdleTime / 1000)}s`} />
            <InfoRow label="Clicks" value={client.behavior.clickCount} />
            <InfoRow label="Click Interval" value={client.behavior.avgClickInterval ? `${client.behavior.avgClickInterval}ms` : 'N/A'} />
          </InfoSection>
        )}

        {client && (
          <InfoSection title="Scroll Behavior" icon="S">
            <InfoRow label="Speed" value={`${client.behavior.scrollSpeed} px/s`} />
            <InfoRow label="Max Depth" value={`${Math.round(client.behavior.scrollDepthMax * 100)}%`} tooltip="Deepest scroll position" />
            <InfoRow label="Direction Changes" value={client.behavior.scrollDirectionChanges} />
            <InfoRow label="Scroll Events" value={client.behavior.scrollEvents} />
          </InfoSection>
        )}

        {client && (
          <InfoSection title="Typing Behavior" icon="K">
            <InfoRow label="Keys Pressed" value={client.behavior.keyPressCount} />
            <InfoRow label="Hold Time" value={client.behavior.avgKeyHoldTime ? `${client.behavior.avgKeyHoldTime}ms` : 'N/A'} tooltip="Average key hold duration" />
            <InfoRow label="Key Interval" value={client.behavior.avgKeyInterval ? `${client.behavior.avgKeyInterval}ms` : 'N/A'} tooltip="Time between key presses" />
            <InfoRow label="Typing Speed" value={`${client.behavior.typingSpeed} CPM`} tooltip="Characters per minute" />
          </InfoSection>
        )}

        {client && (client.behavior.touchCount > 0 || navigator.maxTouchPoints > 0) && (
          <InfoSection title="Touch Behavior" icon="T">
            <InfoRow label="Touches" value={client.behavior.touchCount} />
            <InfoRow label="Avg Pressure" value={client.behavior.avgTouchPressure || 'N/A'} />
            <InfoRow label="Pinch Zooms" value={client.behavior.pinchZoomCount} />
            <InfoRow label="Swipes" value={client.behavior.swipeCount} />
          </InfoSection>
        )}

        {client && (
          <InfoSection title="Attention Tracking" icon="!">
            <InfoRow label="Tab Switches" value={client.behavior.tabSwitchCount} tooltip="Times you switched away from this tab" warning={client.behavior.tabSwitchCount > 0} />
            <InfoRow label="Focus Time" value={formatDuration(client.behavior.totalFocusTime)} tooltip="Time spent with tab focused" />
            <InfoRow label="Away Time" value={formatDuration(client.behavior.totalBlurTime)} tooltip="Time spent on other tabs" />
            <InfoRow label="Session Duration" value={formatDuration(client.behavior.sessionDuration)} />
            <InfoRow label="First Interaction" value={client.behavior.firstInteractionTime ? `${Math.round(client.behavior.firstInteractionTime)}ms` : 'N/A'} tooltip="Time until first mouse/key/touch" />
          </InfoSection>
        )}

        {/* Installed Apps */}
        {client && client.installedApps.length > 0 && (
          <InfoSection title="Installed Apps" icon="A">
            {client.installedApps.map((app) => (
              <InfoRow key={app} label={app} value="Detected" warning />
            ))}
          </InfoSection>
        )}

        {/* Social Media Logins */}
        {client && (
          <InfoSection title="Logged Into" icon="L">
            <InfoRow
              label="Google"
              value={client.socialLogins.google === null ? 'Unknown' : client.socialLogins.google ? 'Logged In' : 'Not Logged In'}
              warning={client.socialLogins.google === true}
            />
            <InfoRow
              label="Facebook"
              value={client.socialLogins.facebook === null ? 'Unknown' : client.socialLogins.facebook ? 'Logged In' : 'Not Logged In'}
              warning={client.socialLogins.facebook === true}
            />
            <InfoRow
              label="Twitter"
              value={client.socialLogins.twitter === null ? 'Unknown' : client.socialLogins.twitter ? 'Logged In' : 'Not Logged In'}
              warning={client.socialLogins.twitter === true}
            />
            <InfoRow
              label="GitHub"
              value={client.socialLogins.github === null ? 'Unknown' : client.socialLogins.github ? 'Logged In' : 'Not Logged In'}
              warning={client.socialLogins.github === true}
            />
            <InfoRow
              label="Reddit"
              value={client.socialLogins.reddit === null ? 'Unknown' : client.socialLogins.reddit ? 'Logged In' : 'Not Logged In'}
              warning={client.socialLogins.reddit === true}
            />
          </InfoSection>
        )}

        {/* Crypto Wallets */}
        {client && client.cryptoWallets.length > 0 && (
          <InfoSection title="Crypto Wallets" icon="$">
            {client.cryptoWallets.map((wallet) => (
              <InfoRow key={wallet} label={wallet} value="Connected" warning />
            ))}
          </InfoSection>
        )}

        {/* VPN Detection */}
        {client && (
          <InfoSection title="VPN/Proxy Detection" icon="V">
            <InfoRow
              label="Likely Using VPN"
              value={client.vpnDetection.likelyUsingVPN}
              warning={client.vpnDetection.likelyUsingVPN}
            />
            <InfoRow
              label="Timezone Mismatch"
              value={client.vpnDetection.timezoneIPMismatch}
              tooltip="Your browser timezone doesn't match your IP location"
              warning={client.vpnDetection.timezoneIPMismatch}
            />
            <InfoRow
              label="WebRTC Leak"
              value={client.vpnDetection.webrtcLeak}
              tooltip="Your real IP might be leaking through WebRTC"
              warning={client.vpnDetection.webrtcLeak}
            />
          </InfoSection>
        )}

        {/* Advanced Behavior - DevTools & Idle */}
        {client && (
          <InfoSection title="You Right Now" icon="!">
            <InfoRow
              label="DevTools Open"
              value={client.advancedBehavior.devToolsOpen}
              tooltip="We can detect if you're inspecting this page!"
              warning={client.advancedBehavior.devToolsOpen}
            />
            <InfoRow
              label="Status"
              value={client.advancedBehavior.isIdle ? 'Away/Idle' : 'Active'}
              warning={client.advancedBehavior.isIdle}
            />
            <InfoRow
              label="Idle Time"
              value={formatDuration(client.advancedBehavior.idleTime)}
            />
            <InfoRow
              label="Times Went AFK"
              value={client.advancedBehavior.afkCount}
            />
            <InfoRow
              label="Mouse In Window"
              value={!client.advancedBehavior.mouseLeftWindow}
            />
          </InfoSection>
        )}

        {/* Frustration & Engagement */}
        {client && (
          <InfoSection title="Your Emotions" icon="H">
            <InfoRow
              label="Rage Clicks"
              value={client.advancedBehavior.rageClickCount}
              tooltip="Rapid clicking in same area = frustration!"
              warning={client.advancedBehavior.rageClickCount > 0}
            />
            <InfoRow
              label="Exit Intents"
              value={client.advancedBehavior.exitIntentCount}
              tooltip="Mouse moved to close/leave the page"
            />
            <InfoRow
              label="Engagement"
              value={`${client.advancedBehavior.contentEngagement}%`}
            />
            <InfoRow
              label="Handedness"
              value={`${client.advancedBehavior.likelyHandedness} (${client.advancedBehavior.handednessConfidence}% conf)`}
              tooltip="We can guess if you're left or right handed!"
            />
          </InfoSection>
        )}

        {/* Clipboard & Selection */}
        {client && (
          <InfoSection title="Copy/Paste Activity" icon="C">
            <InfoRow label="Text Selections" value={client.advancedBehavior.textSelectCount} />
            <InfoRow
              label="Last Selected"
              value={client.advancedBehavior.lastSelectedText || 'None'}
              tooltip="We can see what text you highlight!"
              warning={!!client.advancedBehavior.lastSelectedText}
            />
            <InfoRow label="Copies" value={client.advancedBehavior.copyCount} />
            <InfoRow label="Pastes" value={client.advancedBehavior.pasteCount} />
            <InfoRow label="Right Clicks" value={client.advancedBehavior.rightClickCount} />
            <InfoRow
              label="Screenshot Attempts"
              value={client.advancedBehavior.screenshotAttempts}
              warning={client.advancedBehavior.screenshotAttempts > 0}
            />
          </InfoSection>
        )}

        {/* Keyboard Shortcuts Used */}
        {client && client.advancedBehavior.keyboardShortcutsUsed.length > 0 && (
          <InfoSection title="Shortcuts Used" icon="K">
            {client.advancedBehavior.keyboardShortcutsUsed.slice(0, 10).map((shortcut) => (
              <InfoRow key={shortcut} label={shortcut} value="Used" />
            ))}
          </InfoSection>
        )}

        {/* Privacy Tips */}
        {isCurrentUser && (
          <div className="privacy-tips">
            <h3>Privacy Tips</h3>
            <ul>
              <li>Use a VPN to mask your IP address</li>
              <li>Enable Do Not Track in your browser</li>
              <li>Use privacy-focused browsers like Firefox or Brave</li>
              <li>Consider using browser extensions to block fingerprinting</li>
              <li>Disable WebRTC to prevent local IP leaks</li>
              <li>Regularly clear cookies and browsing data</li>
              <li>Use Tor Browser for maximum anonymity</li>
              <li>Your mouse movements, typing patterns, and scroll behavior create a unique fingerprint!</li>
            </ul>
          </div>
        )}
      </div>

      <div className="info-panel-footer">
        <span className="connected-time">Connected {formatTimestamp(visitor.connectedAt)}</span>
      </div>
    </div>
  );
}

function formatTimestamp(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
