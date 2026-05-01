import { create } from "zustand";
import {
  DEFAULT_AI_CONFIG,
  getDefaultAiBaseUrl,
  type AiConfig,
  type AiProvider,
} from "./config";

interface AiState {
  ai: AiConfig;
  setAi: (ai: AiConfig) => void;
  setProvider: (provider: AiProvider) => void;
  setBaseUrl: (url: string) => void;
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
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
  setBaseUrl: (base_url) =>
    set((state) => ({ ai: { ...state.ai, base_url } })),
  setApiKey: (api_key) =>
    set((state) => ({ ai: { ...state.ai, api_key } })),
  setModel: (model) =>
    set((state) => ({ ai: { ...state.ai, model } })),
}));
