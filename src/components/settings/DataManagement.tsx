import { useState } from "react";
import { Trash2, AlertTriangle, RefreshCw, MessageSquare, FileText, Cpu, Loader2, Download, Upload } from "lucide-react";
import { clearChats, clearNotes, clearAIConfig, factoryReset, syncVaultToDisk, syncDiskToVault } from "../../lib/vault";
import { useVaultStore } from "../../stores/vaultStore";

interface ActionButtonProps {
  icon: typeof Trash2;
  label: string;
  description: string;
  onClick: () => void;
  isLoading?: boolean;
  isDangerous?: boolean;
}

function ActionButton({
  icon: Icon,
  label,
  description,
  onClick,
  isLoading,
  isDangerous,
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className="flex w-full cursor-pointer items-center gap-4 rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        backgroundColor: "var(--color-bg-primary)",
        borderColor: isDangerous ? "var(--color-error)" : "var(--color-border)",
      }}
      onMouseEnter={(e) => {
        if (!isLoading) {
          e.currentTarget.style.borderColor = isDangerous
            ? "var(--color-error)"
            : "var(--color-accent)";
          e.currentTarget.style.backgroundColor = isDangerous
            ? "var(--color-error-light)"
            : "var(--color-bg-hover)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isDangerous
          ? "var(--color-error)"
          : "var(--color-border)";
        e.currentTarget.style.backgroundColor = "var(--color-bg-primary)";
      }}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{
          backgroundColor: isDangerous
            ? "var(--color-error-light)"
            : "var(--color-bg-tertiary)",
        }}
      >
        {isLoading ? (
          <Loader2
            size={20}
            className="animate-spin"
            style={{ color: "var(--color-text-secondary)" }}
          />
        ) : (
          <Icon
            size={20}
            style={{
              color: isDangerous
                ? "var(--color-error)"
                : "var(--color-text-secondary)",
            }}
          />
        )}
      </div>
      <div className="flex-1">
        <h4
          className="font-medium"
          style={{
            color: isDangerous
              ? "var(--color-error)"
              : "var(--color-text-primary)",
          }}
        >
          {label}
        </h4>
        <p
          className="text-sm"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {description}
        </p>
      </div>
    </button>
  );
}

export function DataManagement() {
  const { vaultPath } = useVaultStore();
  const [isClearing, setIsClearing] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleClearChats = async () => {
    setIsClearing("chats");
    try {
      const count = await clearChats();
      showMessage("success", `Cleared ${count} conversation${count !== 1 ? "s" : ""}`);
    } catch (error) {
      showMessage("error", error instanceof Error ? error.message : "Failed to clear chats");
    } finally {
      setIsClearing(null);
    }
  };

  const handleClearNotes = async () => {
    setIsClearing("notes");
    try {
      const count = await clearNotes();
      showMessage("success", `Cleared ${count} note${count !== 1 ? "s" : ""}`);
    } catch (error) {
      showMessage("error", error instanceof Error ? error.message : "Failed to clear notes");
    } finally {
      setIsClearing(null);
    }
  };

  const handleClearAIConfig = async () => {
    setIsClearing("ai");
    try {
      await clearAIConfig();
      showMessage("success", "AI configuration reset to defaults");
    } catch (error) {
      showMessage("error", error instanceof Error ? error.message : "Failed to reset AI config");
    } finally {
      setIsClearing(null);
    }
  };

  const handleFactoryReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }

    setIsClearing("factory");
    try {
      await factoryReset();
      showMessage("success", "Factory reset complete. Reloading...");
      // Reload the app after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      showMessage("error", error instanceof Error ? error.message : "Factory reset failed");
      setConfirmReset(false);
    } finally {
      setIsClearing(null);
    }
  };

  const handleSyncToDisk = async () => {
    setIsClearing("sync-to-disk");
    try {
      const result = await syncVaultToDisk();
      showMessage(
        "success",
        `Synced ${result.notesSynced} note${result.notesSynced !== 1 ? "s" : ""} and ${result.foldersSynced} folder${result.foldersSynced !== 1 ? "s" : ""} to disk`
      );
    } catch (error) {
      showMessage("error", error instanceof Error ? error.message : "Failed to sync to disk");
    } finally {
      setIsClearing(null);
    }
  };

  const handleSyncFromDisk = async () => {
    setIsClearing("sync-from-disk");
    try {
      const result = await syncDiskToVault();
      showMessage(
        "success",
        `Imported ${result.notesSynced} note${result.notesSynced !== 1 ? "s" : ""} from disk`
      );
    } catch (error) {
      showMessage("error", error instanceof Error ? error.message : "Failed to sync from disk");
    } finally {
      setIsClearing(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status message */}
      {message && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            backgroundColor:
              message.type === "success"
                ? "var(--color-success-light)"
                : "var(--color-error-light)",
            color:
              message.type === "success"
                ? "var(--color-success)"
                : "var(--color-error)",
          }}
        >
          {message.text}
        </div>
      )}

      {/* Vault Info */}
      {vaultPath && (
        <div>
          <h4
            className="mb-2 text-sm font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Current Vault
          </h4>
          <p
            className="text-sm font-mono"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {vaultPath}
          </p>
        </div>
      )}

      {/* Sync Section */}
      {vaultPath && (
        <div>
          <h4
            className="mb-3 text-sm font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Vault Sync
          </h4>
          <div className="space-y-3">
            <ActionButton
              icon={Upload}
              label="Export to Filesystem"
              description="Write all notes and folders as Markdown files to your vault"
              onClick={handleSyncToDisk}
              isLoading={isClearing === "sync-to-disk"}
            />
            <ActionButton
              icon={Download}
              label="Import from Filesystem"
              description="Import Markdown files from your vault into the database"
              onClick={handleSyncFromDisk}
              isLoading={isClearing === "sync-from-disk"}
            />
          </div>
        </div>
      )}

      {/* Clear Data Section */}
      <div>
        <h4
          className="mb-3 text-sm font-medium"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Clear Data
        </h4>
        <div className="space-y-3">
          <ActionButton
            icon={MessageSquare}
            label="Clear Chat History"
            description="Delete all conversations and messages"
            onClick={handleClearChats}
            isLoading={isClearing === "chats"}
          />
          <ActionButton
            icon={FileText}
            label="Clear All Notes"
            description="Delete all notes, folders, and embeddings"
            onClick={handleClearNotes}
            isLoading={isClearing === "notes"}
          />
          <ActionButton
            icon={Cpu}
            label="Reset AI Settings"
            description="Reset AI provider configuration to defaults"
            onClick={handleClearAIConfig}
            isLoading={isClearing === "ai"}
          />
        </div>
      </div>

      {/* Factory Reset Section */}
      <div
        className="rounded-lg border p-4"
        style={{
          borderColor: "var(--color-error)",
          backgroundColor: "var(--color-error-light)",
        }}
      >
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle size={20} style={{ color: "var(--color-error)" }} />
          <h4
            className="font-medium"
            style={{ color: "var(--color-error)" }}
          >
            Danger Zone
          </h4>
        </div>

        {confirmReset ? (
          <div className="space-y-3">
            <p
              className="text-sm"
              style={{ color: "var(--color-text-primary)" }}
            >
              Are you sure? This will delete all your data and reset the app to
              its initial state. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleFactoryReset}
                disabled={isClearing === "factory"}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: "var(--color-error)" }}
              >
                {isClearing === "factory" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Yes, Reset Everything
                  </>
                )}
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                disabled={isClearing === "factory"}
                className="cursor-pointer rounded-lg border px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text-secondary)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <ActionButton
            icon={RefreshCw}
            label="Factory Reset"
            description="Clear all data, settings, and start fresh"
            onClick={handleFactoryReset}
            isLoading={isClearing === "factory"}
            isDangerous
          />
        )}
      </div>
    </div>
  );
}
