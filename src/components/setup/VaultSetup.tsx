import { useEffect, useState } from "react";
import {
  FolderOpen,
  Plus,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  FileText,
  Database,
} from "lucide-react";
import { useVaultStore } from "../../stores/vaultStore";

/**
 * Vault setup wizard shown on first launch
 */
export function VaultSetup() {
  const {
    setupStep,
    setSetupStep,
    isLoading,
    error,
    hasExistingData,
    vaultPath,
    pickFolder,
    createVault,
    openVault,
    migrateData,
    clearError,
  } = useVaultStore();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [vaultName, setVaultName] = useState("My Notes");

  // Handle folder selection for create/open
  const handlePickFolder = async () => {
    clearError();
    const path = await pickFolder();
    if (path) {
      setSelectedPath(path);
    }
  };

  // Create new vault
  const handleCreateVault = async () => {
    if (!selectedPath) return;
    const fullPath = `${selectedPath}/${vaultName}`;
    await createVault(fullPath);
  };

  // Open existing vault
  const handleOpenVault = async () => {
    if (!selectedPath) return;
    await openVault(selectedPath);
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center p-8"
      style={{ backgroundColor: "var(--color-bg-primary)" }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border p-8 shadow-lg"
        style={{
          backgroundColor: "var(--color-bg-secondary)",
          borderColor: "var(--color-border)",
        }}
      >
        {setupStep === "welcome" && (
          <WelcomeStep
            hasExistingData={hasExistingData}
            onContinue={() => setSetupStep("choose")}
          />
        )}

        {setupStep === "choose" && (
          <ChooseStep
            onBack={() => setSetupStep("welcome")}
            onCreateNew={() => setSetupStep("create")}
            onOpenExisting={() => setSetupStep("open")}
          />
        )}

        {setupStep === "create" && (
          <CreateStep
            selectedPath={selectedPath}
            vaultName={vaultName}
            setVaultName={setVaultName}
            onPickFolder={handlePickFolder}
            onBack={() => {
              setSetupStep("choose");
              setSelectedPath(null);
            }}
            onCreate={handleCreateVault}
            isLoading={isLoading}
            error={error}
          />
        )}

        {setupStep === "open" && (
          <OpenStep
            selectedPath={selectedPath}
            onPickFolder={handlePickFolder}
            onBack={() => {
              setSetupStep("choose");
              setSelectedPath(null);
            }}
            onOpen={handleOpenVault}
            isLoading={isLoading}
            error={error}
          />
        )}

        {setupStep === "migrate" && (
          <MigrateStep
            vaultPath={vaultPath}
            onMigrate={migrateData}
            onSkip={() => setSetupStep("complete")}
            isLoading={isLoading}
            error={error}
          />
        )}

        {setupStep === "complete" && (
          <CompleteStep vaultPath={vaultPath} />
        )}
      </div>
    </div>
  );
}

interface WelcomeStepProps {
  hasExistingData: boolean;
  onContinue: () => void;
}

function WelcomeStep({ hasExistingData, onContinue }: WelcomeStepProps) {
  return (
    <div className="text-center">
      <div
        className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ backgroundColor: "var(--color-accent-light)" }}
      >
        <FileText size={32} style={{ color: "var(--color-accent)" }} />
      </div>

      <h1
        className="mb-2 text-2xl font-bold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Welcome to Inkling
      </h1>

      <p
        className="mb-6 text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Your notes are stored as Markdown files in a vault folder, giving you
        full control over your data.
      </p>

      {hasExistingData && (
        <div
          className="mb-6 rounded-lg p-3 text-left text-sm"
          style={{
            backgroundColor: "var(--color-accent-light)",
            color: "var(--color-accent)",
          }}
        >
          <strong>Note:</strong> We found existing notes from a previous
          installation. You can migrate them to your new vault.
        </div>
      )}

      <button
        onClick={onContinue}
        className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-6 py-3 font-medium transition-opacity hover:opacity-90"
        style={{
          backgroundColor: "var(--color-accent)",
          color: "white",
        }}
      >
        Get Started
        <ArrowRight size={18} />
      </button>
    </div>
  );
}

interface ChooseStepProps {
  onBack: () => void;
  onCreateNew: () => void;
  onOpenExisting: () => void;
}

function ChooseStep({ onBack, onCreateNew, onOpenExisting }: ChooseStepProps) {
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex cursor-pointer items-center gap-1 text-sm transition-colors hover:opacity-70"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <h2
        className="mb-2 text-xl font-bold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Choose Your Vault
      </h2>

      <p
        className="mb-6 text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        A vault is a folder where all your notes and data are stored.
      </p>

      <div className="space-y-3">
        <button
          onClick={onCreateNew}
          className="flex w-full cursor-pointer items-center gap-4 rounded-lg border p-4 text-left transition-colors"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            borderColor: "var(--color-border)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--color-accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border)";
          }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--color-accent-light)" }}
          >
            <Plus size={20} style={{ color: "var(--color-accent)" }} />
          </div>
          <div>
            <h3
              className="font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Create New Vault
            </h3>
            <p
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Start fresh with a new vault folder
            </p>
          </div>
        </button>

        <button
          onClick={onOpenExisting}
          className="flex w-full cursor-pointer items-center gap-4 rounded-lg border p-4 text-left transition-colors"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            borderColor: "var(--color-border)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--color-accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border)";
          }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: "var(--color-bg-tertiary)" }}
          >
            <FolderOpen
              size={20}
              style={{ color: "var(--color-text-secondary)" }}
            />
          </div>
          <div>
            <h3
              className="font-medium"
              style={{ color: "var(--color-text-primary)" }}
            >
              Open Existing Vault
            </h3>
            <p
              className="text-sm"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Use an existing Inkling vault folder
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}

interface CreateStepProps {
  selectedPath: string | null;
  vaultName: string;
  setVaultName: (name: string) => void;
  onPickFolder: () => void;
  onBack: () => void;
  onCreate: () => void;
  isLoading: boolean;
  error: string | null;
}

function CreateStep({
  selectedPath,
  vaultName,
  setVaultName,
  onPickFolder,
  onBack,
  onCreate,
  isLoading,
  error,
}: CreateStepProps) {
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex cursor-pointer items-center gap-1 text-sm transition-colors hover:opacity-70"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <h2
        className="mb-2 text-xl font-bold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Create New Vault
      </h2>

      <p
        className="mb-6 text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Choose where to create your new vault folder.
      </p>

      <div className="space-y-4">
        <div>
          <label
            className="mb-1 block text-sm font-medium"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Vault Name
          </label>
          <input
            type="text"
            value={vaultName}
            onChange={(e) => setVaultName(e.target.value)}
            placeholder="My Notes"
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-accent)]"
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
            Location
          </label>
          <button
            onClick={onPickFolder}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
            style={{
              backgroundColor: "var(--color-bg-primary)",
              borderColor: "var(--color-border)",
              color: selectedPath
                ? "var(--color-text-primary)"
                : "var(--color-text-tertiary)",
            }}
          >
            <FolderOpen size={16} />
            {selectedPath || "Choose folder..."}
          </button>
        </div>

        {selectedPath && vaultName && (
          <p
            className="text-xs"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Vault will be created at: {selectedPath}/{vaultName}
          </p>
        )}

        {error && (
          <div
            className="flex items-center gap-2 rounded-lg p-3 text-sm"
            style={{
              backgroundColor: "var(--color-error-light)",
              color: "var(--color-error)",
            }}
          >
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <button
          onClick={onCreate}
          disabled={!selectedPath || !vaultName || isLoading}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-6 py-3 font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "white",
          }}
        >
          {isLoading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Creating...
            </>
          ) : (
            <>
              Create Vault
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface OpenStepProps {
  selectedPath: string | null;
  onPickFolder: () => void;
  onBack: () => void;
  onOpen: () => void;
  isLoading: boolean;
  error: string | null;
}

function OpenStep({
  selectedPath,
  onPickFolder,
  onBack,
  onOpen,
  isLoading,
  error,
}: OpenStepProps) {
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 flex cursor-pointer items-center gap-1 text-sm transition-colors hover:opacity-70"
        style={{ color: "var(--color-text-secondary)" }}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <h2
        className="mb-2 text-xl font-bold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Open Existing Vault
      </h2>

      <p
        className="mb-6 text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Select an existing Inkling vault folder.
      </p>

      <div className="space-y-4">
        <button
          onClick={onPickFolder}
          className="flex w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
          style={{
            backgroundColor: "var(--color-bg-primary)",
            borderColor: "var(--color-border)",
            color: selectedPath
              ? "var(--color-text-primary)"
              : "var(--color-text-tertiary)",
          }}
        >
          <FolderOpen size={16} />
          {selectedPath || "Choose vault folder..."}
        </button>

        {error && (
          <div
            className="flex items-center gap-2 rounded-lg p-3 text-sm"
            style={{
              backgroundColor: "var(--color-error-light)",
              color: "var(--color-error)",
            }}
          >
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <button
          onClick={onOpen}
          disabled={!selectedPath || isLoading}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-6 py-3 font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "white",
          }}
        >
          {isLoading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Opening...
            </>
          ) : (
            <>
              Open Vault
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface MigrateStepProps {
  vaultPath: string | null;
  onMigrate: () => void;
  onSkip: () => void;
  isLoading: boolean;
  error: string | null;
}

function MigrateStep({
  vaultPath,
  onMigrate,
  onSkip,
  isLoading,
  error,
}: MigrateStepProps) {
  return (
    <div>
      <div
        className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ backgroundColor: "var(--color-accent-light)" }}
      >
        <Database size={32} style={{ color: "var(--color-accent)" }} />
      </div>

      <h2
        className="mb-2 text-center text-xl font-bold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Migrate Existing Data
      </h2>

      <p
        className="mb-6 text-center text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        We found notes from a previous installation. Would you like to import
        them into your new vault?
      </p>

      <p
        className="mb-6 text-center text-xs"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        Vault: {vaultPath}
      </p>

      {error && (
        <div
          className="mb-4 flex items-center gap-2 rounded-lg p-3 text-sm"
          style={{
            backgroundColor: "var(--color-error-light)",
            color: "var(--color-error)",
          }}
        >
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="space-y-3">
        <button
          onClick={onMigrate}
          disabled={isLoading}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-6 py-3 font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "white",
          }}
        >
          {isLoading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Migrating...
            </>
          ) : (
            "Migrate Data"
          )}
        </button>

        <button
          onClick={onSkip}
          disabled={isLoading}
          className="w-full cursor-pointer rounded-lg border px-6 py-3 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: "transparent",
            borderColor: "var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          Skip for Now
        </button>
      </div>
    </div>
  );
}

interface CompleteStepProps {
  vaultPath: string | null;
}

function CompleteStep({ vaultPath }: CompleteStepProps) {
  // This step triggers a page reload to fully initialize the app with the vault
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.reload();
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="text-center">
      <div
        className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--color-success-light)" }}
      >
        <Check size={32} style={{ color: "var(--color-success)" }} />
      </div>

      <h2
        className="mb-2 text-xl font-bold"
        style={{ color: "var(--color-text-primary)" }}
      >
        You're All Set!
      </h2>

      <p
        className="mb-4 text-sm"
        style={{ color: "var(--color-text-secondary)" }}
      >
        Your vault is ready. Starting Inkling...
      </p>

      <p
        className="text-xs"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {vaultPath}
      </p>

      <div className="mt-6">
        <Loader2
          size={24}
          className="mx-auto animate-spin"
          style={{ color: "var(--color-accent)" }}
        />
      </div>
    </div>
  );
}
