import { useEffect, useState } from "react";
import { Chrome, Loader2, CheckCircle, XCircle, Calendar } from "lucide-react";
import * as googleApi from "../../lib/google";
import type { GoogleConnectionStatus } from "../../types/google";

/**
 * Google account settings component
 * Allows users to connect/disconnect their Google account for calendar sync
 */
export function GoogleSettings() {
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<GoogleConnectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load connection status on mount
  useEffect(() => {
    loadStatus();
  }, []);

  async function loadStatus() {
    setIsLoading(true);
    setError(null);
    try {
      const [configured, status] = await Promise.all([
        googleApi.isGoogleConfigured(),
        googleApi.getGoogleConnectionStatus(),
      ]);
      setIsConfigured(configured);
      setConnectionStatus(status);
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

      {/* Configuration check */}
      {!isConfigured && (
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
            Google Integration Not Configured
          </h4>
          <p
            className="text-sm"
            style={{ color: "var(--color-text-secondary)" }}
          >
            To enable Google Calendar sync, you need to set up a Google Cloud
            project and configure the <code>GOOGLE_CLIENT_ID</code> environment
            variable. See the{" "}
            <a
              href="https://github.com/TannerBurns/inkling#-google-calendar-integration"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--color-accent)" }}
            >
              setup guide
            </a>{" "}
            for instructions.
          </p>
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

          {connectionStatus.connectedAt && (
            <p
              className="mt-3 text-xs"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              Connected on{" "}
              {new Date(connectionStatus.connectedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* Disconnected state */}
      {isConfigured && !connectionStatus?.connected && (
        <div
          className="rounded-lg border p-4"
          style={{
            backgroundColor: "var(--color-bg-secondary)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="mb-4 flex items-center gap-3">
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

          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors"
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
            "Keep your events synced with the click of a button",
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
          your calendar. Your events are stored locally on your device and are
          never sent to any third-party servers.
        </p>
      </div>
    </div>
  );
}

