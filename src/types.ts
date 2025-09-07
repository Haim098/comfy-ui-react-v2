// Types for the ComfyUI React Interface

export interface ImageHistoryItem {
  url: string;
  timestamp: number;
  prompt: string;
  seed: number;
  steps: number;
  guidance: number;
  mode: 'create' | 'edit' | 'history';
  filename: string;
  dimensions: { width: number; height: number };
  loraSettings?: Record<string, { enabled: boolean; modelStrength: number; clipStrength: number }>;
  editPrompt?: string; // For edit mode
}

export interface SnackMessage {
  type: 'success' | 'error' | 'info' | 'warning';
  msg: string;
}

export type WorkflowMode = 'create' | 'edit';

export interface HistoryContextType {
  history: ImageHistoryItem[];
  loading: boolean;
  addToHistory: (item: Omit<ImageHistoryItem, 'timestamp'>) => void;
  removeFromHistory: (url: string) => void;
  clearHistory: () => void;
  loadHistoryFromServer: () => Promise<void>;
}