import { create } from "zustand";
import {
  DEFAULT_AI_CONFIG,
  getDefaultAiBaseUrl,
  normalizeAiContextCompactionThresholdKb,
  type AiConfig,
  type AiProvider,
} from "./config";

interface AiState {
  ai: AiConfig;
  setAi: (ai: AiConfig) => void;
  setProvider: (provider: AiProvider) => void;
  setProviderName: (name: string) => void;
  setBaseUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
  setContextCompactionThresholdKb: (thresholdKb: number) => void;
}

export const useAiStore = create<AiState>((set) => ({
  ai: { ...DEFAULT_AI_CONFIG },
  setAi: (ai) => set({ ai }),
  setProvider: (provider) =>
    set((state) => ({
      ai: {
        ...state.ai,
        provider,
        base_url: getDefaultAiBaseUrl(provider),
        model: "",
      },
    })),
  setProviderName: (provider_name) =>
    set((state) => ({ ai: { ...state.ai, provider_name } })),
  setBaseUrl: (base_url) =>
    set((state) => ({ ai: { ...state.ai, base_url } })),
  setApiKey: (api_key) =>
    set((state) => ({ ai: { ...state.ai, api_key } })),
  setModel: (model) =>
    set((state) => ({ ai: { ...state.ai, model } })),
  setContextCompactionThresholdKb: (context_compaction_threshold_kb) =>
    set((state) => ({
      ai: {
        ...state.ai,
        context_compaction_threshold_kb: normalizeAiContextCompactionThresholdKb(
          context_compaction_threshold_kb,
          state.ai.context_compaction_threshold_kb,
        ),
      },
    })),
}));
