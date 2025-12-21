import { create } from "zustand";
import * as vaultLib from "../lib/vault";

export type VaultSetupStep = "welcome" | "choose" | "create" | "open" | "migrate" | "complete";

interface VaultState {
  // State
  isConfigured: boolean;
  vaultPath: string | null;
  isValid: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Setup wizard state
  setupStep: VaultSetupStep;
  hasExistingData: boolean;
  
  // Actions
  checkVaultStatus: () => Promise<void>;
  setVaultPath: (path: string) => Promise<void>;
  createVault: (path: string) => Promise<void>;
  openVault: (path: string) => Promise<void>;
  migrateData: () => Promise<void>;
  pickFolder: () => Promise<string | null>;
  setSetupStep: (step: VaultSetupStep) => void;
  clearError: () => void;
  reset: () => void;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  // Initial state
  isConfigured: false,
  vaultPath: null,
  isValid: false,
  isLoading: true,
  error: null,
  setupStep: "welcome",
  hasExistingData: false,

  // Check current vault status
  checkVaultStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const status = await vaultLib.getVaultStatus();
      const hasExisting = await vaultLib.hasExistingData();
      set({
        isConfigured: status.isConfigured,
        vaultPath: status.path,
        isValid: status.isValid,
        hasExistingData: hasExisting,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
    }
  },

  // Set vault path (for existing vault)
  setVaultPath: async (path: string) => {
    set({ isLoading: true, error: null });
    try {
      await vaultLib.setVaultPath(path);
      set({
        isConfigured: true,
        vaultPath: path,
        isValid: true,
        isLoading: false,
        setupStep: "complete",
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
    }
  },

  // Create a new vault
  createVault: async (path: string) => {
    set({ isLoading: true, error: null });
    try {
      await vaultLib.createVault(path);
      await vaultLib.setVaultPath(path);
      set({
        isConfigured: true,
        vaultPath: path,
        isValid: true,
        isLoading: false,
        setupStep: "complete",
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
    }
  },

  // Open an existing vault
  openVault: async (path: string) => {
    set({ isLoading: true, error: null });
    try {
      const info = await vaultLib.validateVault(path);
      if (!info) {
        throw new Error("The selected folder is not a valid Inkling vault");
      }
      await vaultLib.setVaultPath(path);
      set({
        isConfigured: true,
        vaultPath: path,
        isValid: true,
        isLoading: false,
        setupStep: "complete",
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
    }
  },

  // Migrate existing data to vault
  migrateData: async () => {
    const { vaultPath } = get();
    if (!vaultPath) {
      set({ error: "No vault path configured" });
      return;
    }
    
    set({ isLoading: true, error: null });
    try {
      await vaultLib.migrateToVault(vaultPath);
      set({
        isLoading: false,
        hasExistingData: false,
        setupStep: "complete",
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
    }
  },

  // Open folder picker
  pickFolder: async () => {
    try {
      return await vaultLib.pickFolder();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  // Set setup step
  setSetupStep: (step: VaultSetupStep) => {
    set({ setupStep: step, error: null });
  },

  // Clear error
  clearError: () => set({ error: null }),

  // Reset state
  reset: () =>
    set({
      isConfigured: false,
      vaultPath: null,
      isValid: false,
      isLoading: false,
      error: null,
      setupStep: "welcome",
      hasExistingData: false,
    }),
}));
