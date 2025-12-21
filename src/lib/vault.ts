/**
 * Typed wrappers for Vault-related Tauri IPC commands
 */
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface VaultInfo {
  path: string;
  notesCount: number;
  hasExistingData: boolean;
}

export interface VaultStatus {
  isConfigured: boolean;
  path: string | null;
  isValid: boolean;
}

/**
 * Get the current vault path (or null if not configured)
 */
export async function getVaultPath(): Promise<string | null> {
  return invoke<string | null>("get_vault_path");
}

/**
 * Get full vault status
 */
export async function getVaultStatus(): Promise<VaultStatus> {
  return invoke<VaultStatus>("get_vault_status");
}

/**
 * Set the vault path and initialize it
 */
export async function setVaultPath(path: string): Promise<void> {
  return invoke<void>("set_vault_path", { path });
}

/**
 * Create a new vault at the specified path
 */
export async function createVault(path: string): Promise<VaultInfo> {
  return invoke<VaultInfo>("create_vault", { path });
}

/**
 * Validate if a path is a valid vault
 */
export async function validateVault(path: string): Promise<VaultInfo | null> {
  return invoke<VaultInfo | null>("validate_vault", { path });
}

/**
 * Check if there's existing data to migrate
 */
export async function hasExistingData(): Promise<boolean> {
  return invoke<boolean>("has_existing_data");
}

/**
 * Migrate existing data to the new vault
 */
export async function migrateToVault(vaultPath: string): Promise<void> {
  return invoke<void>("migrate_to_vault", { vaultPath });
}

/**
 * Open a folder picker dialog
 */
export async function pickFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Select Vault Location",
  });
  return selected as string | null;
}

/**
 * Save an attachment to the vault's attachments folder
 */
export async function saveAttachment(
  data: Uint8Array,
  filename: string,
): Promise<string> {
  return invoke<string>("save_attachment", {
    data: Array.from(data),
    filename,
  });
}

/**
 * Clear all chat conversations
 * @returns Number of conversations deleted
 */
export async function clearChats(): Promise<number> {
  return invoke<number>("clear_chats");
}

/**
 * Clear all notes
 * @returns Number of notes deleted
 */
export async function clearNotes(): Promise<number> {
  return invoke<number>("clear_notes");
}

/**
 * Clear AI configuration (reset to defaults)
 */
export async function clearAIConfig(): Promise<void> {
  return invoke<void>("clear_ai_config");
}

/**
 * Factory reset - clear everything and reset vault path
 * App will need to be restarted after this
 */
export async function factoryReset(): Promise<void> {
  return invoke<void>("factory_reset");
}

/**
 * Result of syncing vault
 */
export interface SyncResult {
  notesSynced: number;
  foldersSynced: number;
}

/**
 * Sync all notes and folders from database to filesystem
 */
export async function syncVaultToDisk(): Promise<SyncResult> {
  return invoke<SyncResult>("sync_vault_to_disk");
}

/**
 * Sync all notes and folders from filesystem to database
 */
export async function syncDiskToVault(): Promise<SyncResult> {
  return invoke<SyncResult>("sync_disk_to_vault");
}
