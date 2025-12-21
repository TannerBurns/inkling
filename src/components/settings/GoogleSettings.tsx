import { useEffect, useState } from "react";
import { Chrome, Loader2, CheckCircle, XCircle, Calendar, Settings, ExternalLink, Shield } from "lucide-react";
import * as googleApi from "../../lib/google";
import type { GoogleConnectionStatus } from "../../types/google";
import type { CredentialSource } from "../../lib/google";

/**
 * Google account settings component
 * Allows users to connect/disconnect their Google account for calendar sync
 */
export function GoogleSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [credentialSource, setCredentialSource] = useState<CredentialSource>("none");
  const [connectionStatus, setConnectionStatus] =
    useState<GoogleConnectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Credential input state
  const [showCredentialForm, setShowCredentialForm] = useState(false);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [existingSecretSet, setExistingSecretSet] = useState(false);

  // Load connection status on mount
  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setIsLoading(true);
    setError(null);
    try {
      const [configured, status, source] = await Promise.all([
        googleApi.isGoogleConfigured(),
        googleApi.getGoogleConnectionStatus(),
        googleApi.getCredentialSource(),
      ]);
      setIsConfigured(configured);
      setConnectionStatus(status);
      setCredentialSource(source);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConnect() {
    setIsConnecting(true);
    setError(null);
    try {
      await googleApi.initiateGoogleAuth();
      // Reload status after successful auth
      await loadStatus();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (
      !confirm(
        "Are you sure you want to disconnect your Google account? All synced calendar events will be removed."
      )
    ) {
      return;
    }

    setIsDisconnecting(true);
    setError(null);
    try {
      await googleApi.disconnectGoogleAccount();
      setConnectionStatus({
        connected: false,
        email: null,
        connectedAt: null,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setIsDisconnecting(false);
    }
  }

  async function handleSaveCredentials() {
    setError(null);
    setSuccessMessage(null);
    
    if (!clientId.trim()) {
      setError("Client ID is required");
      return;
    }
    // Client secret is only required if no existing secret is set
    if (!clientSecret.trim() && !existingSecretSet) {
      setError("Client Secret is required");
      return;
    }

    setIsSavingCredentials(true);
    
    try {
      await googleApi.saveGoogleCredentials(clientId.trim(), clientSecret.trim());
      setSuccessMessage("Credentials saved successfully!");
      setShowCredentialForm(false);
      setClientId("");
      setClientSecret("");
      setExistingSecretSet(false);
      // Reload to check if now configured
      await loadStatus();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSavingCredentials(false);
    }
  }

  async function handleClearCredentials() {
    if (!confirm("Are you sure you want to remove your saved Google credentials?")) {
      return;
    }
    
    setError(null);
    setSuccessMessage(null);
    
    try {
      await googleApi.clearGoogleCredentials();
      setSuccessMessage("Credentials removed");
      await loadStatus();
    } catch (err) {
      setError(String(err));
    }
  }

  function getCredentialSourceLabel(source: CredentialSource): string {
    switch (source) {
      case "database": return "User configured";
      case "environment": return "Environment variable";
      case "embedded": return "Built-in";
      default: return "Not configured";
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2
          className="animate-spin"
          size={24}
          style={{ color: "var(--color-accent)" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error display */}
      {error && (
        <div
          className="flex items-center gap-2 rounded-lg p-3"
          style={{
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            color: "#ef4444",
          }}
        >
          <XCircle size={16} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Success display */}
      {successMessage && (
        <div
          className="flex items-center gap-2 rounded-lg p-3"
          style={{
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            color: "#22c55e",
          }}
        >
          <CheckCircle size={16} />
          <span className="text-sm">{successMessage}</span>
        </div>
      )}

      {/* Configuration status - show when configured but not connected */}
      {isConfigured && !connectionStatus?.connected && !showCredentialForm && (
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="rounded-full p-2"
                style={{ backgroundColor: "var(--color-bg-tertiary)" }}
              >
                <Calendar
                  size={20}
                  style={{ color: "var(--color-text-secondary)" }}
                />
              </div>
              <div>
                <h4
                  className="font-medium"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Google Calendar
                </h4>
                <p
                  className="text-sm"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  Sync your Google Calendar events
                </p>
              </div>
            </div>
            {/* Show credential source badge */}
            <div
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
              style={{
                backgroundColor: credentialSource === "database" 
                  ? "rgba(34, 197, 94, 0.1)" 
                  : "var(--color-bg-tertiary)",
                color: credentialSource === "database" 
                  ? "#22c55e" 
                  : "var(--color-text-tertiary)",
              }}
            >
              <Shield size={12} />
              {getCredentialSourceLabel(credentialSource)}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: "#4285f4",
                color: "white",
                opacity: isConnecting ? 0.7 : 1,
              }}
            >
              {isConnecting ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Connecting...
                </>
              ) : (
                <>
                  <Chrome size={16} />
                  Sign in with Google
                </>
              )}
            </button>
            {credentialSource === "database" && (
              <button
                onClick={handleClearCredentials}
                className="rounded-md px-3 py-2.5 text-sm transition-colors"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  color: "var(--color-text-tertiary)",
                }}
                title="Remove saved credentials"
              >
                <Settings size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Not configured - show setup options */}
      {!isConfigured && !showCredentialForm && (
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            borderColor: "var(--color-border)",
          }}
        >
          <h4
            className="mb-2 font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            Set Up Google Calendar Sync
          </h4>
          <p
            className="mb-4 text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            To sync your Google Calendar, you need to create a free Google Cloud project
            and enter your credentials below.
          </p>
          
          <div className="flex gap-2">
            <button
              onClick={async () => {
                // Check if credentials already exist to enable "keep existing" feature
                try {
                  const current = await googleApi.getCurrentCredentials();
                  if (current.clientId) {
                    setClientId(current.clientId);
                    setExistingSecretSet(current.clientSecretSet);
                  } else {
                    setClientId("");
                    setExistingSecretSet(false);
                  }
                } catch {
                  setClientId("");
                  setExistingSecretSet(false);
                }
                setClientSecret("");
                setShowCredentialForm(true);
              }}
              className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "white",
              }}
            >
              <Settings size={16} />
              Configure Credentials
            </button>
            <a
              href="https://github.com/TannerBurns/inkling#setting-up-google-calendar-sync"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-bg-tertiary)",
                color: "var(--color-text-secondary)",
              }}
            >
              <ExternalLink size={16} />
              Setup Guide
            </a>
          </div>
        </div>
      )}

      {/* Credential input form */}
      {showCredentialForm && (
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            borderColor: "var(--color-border)",
          }}
        >
          <h4
            className="mb-3 font-medium"
            style={{ color: "var(--color-text-primary)" }}
          >
            Enter Google OAuth Credentials
          </h4>
          
          <p
            className="mb-4 text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Follow the{" "}
            <a
              href="https://github.com/TannerBurns/inkling#setting-up-google-calendar-sync"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--color-accent)" }}
            >
              setup guide
            </a>{" "}
            to get your Client ID and Secret from Google Cloud Console.
          </p>
          
          <div className="space-y-3">
            <div>
              <label
                className="mb-1 block text-sm font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Client ID
              </label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxxx.apps.googleusercontent.com"
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>
            
            <div>
              <label
                className="mb-1 block text-sm font-medium"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Client Secret
                {existingSecretSet && (
                  <span
                    className="ml-2 text-xs font-normal"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    (leave blank to keep existing)
                  </span>
                )}
              </label>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={existingSecretSet ? "••••••••••••••••" : "GOCSPX-xxxxx"}
                className="w-full rounded-md border px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--color-bg-primary)",
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-primary)",
                }}
              />
            </div>
            
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveCredentials}
                disabled={isSavingCredentials}
                className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "white",
                  opacity: isSavingCredentials ? 0.7 : 1,
                }}
              >
                {isSavingCredentials ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    Saving...
                  </>
                ) : (
                  "Save Credentials"
                )}
              </button>
              <button
                onClick={() => {
                  setShowCredentialForm(false);
                  setClientId("");
                  setClientSecret("");
                  setExistingSecretSet(false);
                  setError(null);
                }}
                className="rounded-md px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--color-bg-tertiary)",
                  color: "var(--color-text-secondary)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connected state */}
      {isConfigured && connectionStatus?.connected && (
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="rounded-full p-2"
                style={{ backgroundColor: "rgba(34, 197, 94, 0.1)" }}
              >
                <CheckCircle size={20} style={{ color: "#22c55e" }} />
              </div>
              <div>
                <h4
                  className="font-medium"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  Connected
                </h4>
                <p
                  className="text-sm"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {connectionStatus.email}
                </p>
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
              style={{
                backgroundColor: "transparent",
                color: "#ef4444",
                border: "1px solid #ef4444",
                opacity: isDisconnecting ? 0.7 : 1,
              }}
            >
              {isDisconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between">
            {connectionStatus.connectedAt && (
              <p
                className="text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Connected on{" "}
                {new Date(connectionStatus.connectedAt).toLocaleDateString()}
              </p>
            )}
            <div
              className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs"
              style={{
                backgroundColor: "var(--color-bg-tertiary)",
                color: "var(--color-text-tertiary)",
              }}
            >
              <Shield size={10} />
              {getCredentialSourceLabel(credentialSource)}
            </div>
          </div>
        </div>
      )}

      {/* Features list */}
      <div>
        <h4
          className="mb-3 text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          What you can do with Google Calendar sync
        </h4>
        <ul className="space-y-2">
          {[
            "View your Google Calendar events in Inkling's calendar",
            "Create meeting notes with pre-filled attendees and agenda",
            "Link notes to calendar events for easy reference",
            "Keep your events synced automatically",
          ].map((feature, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <span style={{ color: "var(--color-accent)" }}>•</span>
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {/* Privacy note */}
      <div
        className="rounded-lg p-3"
        style={{ backgroundColor: "var(--color-bg-tertiary)" }}
      >
        <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
          <strong>Privacy:</strong> Inkling only requests read-only access to
          your calendar. Your events and credentials are stored locally on your device and are
          never sent to any third-party servers.
        </p>
      </div>
    </div>
  );
}