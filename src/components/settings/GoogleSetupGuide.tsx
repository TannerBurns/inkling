import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

interface SetupGuideProps {
  defaultExpanded?: boolean;
}

/**
 * Embedded setup guide for Google Calendar integration
 * Displays step-by-step instructions for setting up Google Cloud credentials
 */
export function GoogleSetupGuide({ defaultExpanded = false }: SetupGuideProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div
      className="rounded-lg border"
      style={{
        backgroundColor: "var(--color-bg-tertiary)",
        borderColor: "var(--color-border)",
      }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <span
          className="text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          Setup Guide (~5 minutes)
        </span>
        {isExpanded ? (
          <ChevronDown size={16} style={{ color: "var(--color-text-tertiary)" }} />
        ) : (
          <ChevronRight size={16} style={{ color: "var(--color-text-tertiary)" }} />
        )}
      </button>

      {isExpanded && (
        <div
          className="space-y-4 border-t px-3 pb-4 pt-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          {/* Step 1 */}
          <div>
            <h5
              className="mb-1.5 text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              1. Create a Google Cloud Project
            </h5>
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Go to{" "}
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: "var(--color-accent)" }}
              >
                Google Cloud Console
              </a>{" "}
              and create a new project (e.g., &ldquo;Inkling&rdquo;).
            </p>
          </div>

          {/* Step 2 */}
          <div>
            <h5
              className="mb-1.5 text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              2. Enable the Google Calendar API
            </h5>
            <ul className="space-y-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              <li>• Navigate to <strong>APIs & Services</strong> → <strong>Library</strong></li>
              <li>• Search for &ldquo;Google Calendar API&rdquo; and click <strong>Enable</strong></li>
            </ul>
          </div>

          {/* Step 3 */}
          <div>
            <h5
              className="mb-1.5 text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              3. Configure OAuth Consent Screen
            </h5>
            <ul className="space-y-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              <li>• Go to <strong>APIs & Services</strong> → <strong>OAuth consent screen</strong></li>
              <li>• Choose <strong>External</strong> (or <strong>Internal</strong> for Google Workspace)</li>
              <li>• Fill in required fields:
                <ul className="ml-4 mt-1 space-y-0.5">
                  <li>- App name: &ldquo;Inkling&rdquo;</li>
                  <li>- User support email: Your email</li>
                  <li>- Developer contact: Your email</li>
                </ul>
              </li>
              <li>• Add scope: <code className="rounded bg-black/20 px-1">https://www.googleapis.com/auth/calendar.readonly</code></li>
              <li>• Add your email as a test user (while in testing mode)</li>
            </ul>
          </div>

          {/* Step 4 */}
          <div>
            <h5
              className="mb-1.5 text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              4. Create OAuth Credentials
            </h5>
            <ul className="space-y-1 text-xs" style={{ color: "var(--color-text-secondary)" }}>
              <li>• Go to <strong>APIs & Services</strong> → <strong>Credentials</strong></li>
              <li>• Click <strong>Create Credentials</strong> → <strong>OAuth client ID</strong></li>
              <li>• Application type: <strong>Desktop application</strong></li>
              <li>• Name: &ldquo;Inkling Desktop&rdquo;</li>
              <li>• Click <strong>Create</strong></li>
            </ul>
          </div>

          {/* Step 5 */}
          <div>
            <h5
              className="mb-1.5 text-sm font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              5. Enter Credentials Below
            </h5>
            <p className="text-xs" style={{ color: "var(--color-text-secondary)" }}>
              Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> from Google Cloud Console
              and paste them in the form below.
            </p>
          </div>

          {/* Help link */}
          <div
            className="flex items-center gap-1.5 rounded-md p-2"
            style={{ backgroundColor: "var(--color-bg-secondary)" }}
          >
            <ExternalLink size={12} style={{ color: "var(--color-text-tertiary)" }} />
            <a
              href="https://console.cloud.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs"
              style={{ color: "var(--color-accent)" }}
            >
              Open Google Cloud Console
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

