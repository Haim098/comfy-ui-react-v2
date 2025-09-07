import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import type { ImageHistoryItem, HistoryContextType } from '../types';

// Dynamic API URL - works locally and on network
const API = typeof window !== 'undefined' 
  ? (window.location.hostname === 'localhost' 
      ? "http://127.0.0.1:8188"  // Local development
      : `http://${window.location.hostname}:8188`) // Network access
  : "http://127.0.0.1:8188"; // Fallback for SSR

const HistoryContext = createContext<HistoryContextType | undefined>(undefined);

export const useHistory = () => {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error('useHistory must be used within a HistoryProvider');
  }
  return context;
};

interface HistoryProviderProps {
  children: ReactNode;
}

export const HistoryProvider: React.FC<HistoryProviderProps> = ({ children }) => {
  const [history, setHistory] = useState<ImageHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const addToHistory = useCallback((item: Omit<ImageHistoryItem, 'timestamp'>) => {
    const newItem: ImageHistoryItem = {
      ...item,
      timestamp: Date.now()
    };
    
    setHistory(prev => {
      const filtered = prev.filter(h => h.url !== newItem.url);
      const newHistory = [newItem, ...filtered].slice(0, 50); // Keep last 50 items
      
      // Save to localStorage as backup
      localStorage.setItem('comfyui-history', JSON.stringify(newHistory));
      return newHistory;
    });
  }, []);

  const removeFromHistory = useCallback((url: string) => {
    setHistory(prev => {
      const newHistory = prev.filter(item => item.url !== url);
      localStorage.setItem('comfyui-history', JSON.stringify(newHistory));
      return newHistory;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('comfyui-history');
  }, []);

  const loadHistoryFromServer = useCallback(async () => {
    setLoading(true);
    try {
      // First try to get from history API (includes metadata)
      const historyResponse = await axios.get(`${API}/history`);
      const historyData = historyResponse.data;
      
      const historyItems: ImageHistoryItem[] = [];
      
      // Extract images from history (most recent first)
      const historyEntries = Object.entries(historyData)
        .sort(([a], [b]) => b.localeCompare(a)) // Sort by prompt_id (newest first)
        .slice(0, 50); // Check last 50 generations
      
      for (const [, data] of historyEntries) {
        const historyItem = data as any;
        if (historyItem.outputs && historyItem.prompt) {
          // Extract workflow parameters
          const workflow = historyItem.prompt[0] || {};
          const inputs = workflow.inputs || {};
          
          // Try to extract parameters from different node types
          let prompt = '';
          let seed = 0;
          let steps = 20;
          let guidance = 3.5;
          let width = 1024;
          let height = 1024;
          let mode: 'create' | 'edit' = 'create';
          
          // Look for text encode nodes for prompt
          Object.values(inputs).forEach((node: any) => {
            if (node.class_type === 'CLIPTextEncode' && node.inputs?.text) {
              prompt = node.inputs.text;
            }
            if (node.class_type === 'KSampler') {
              seed = node.inputs?.seed || seed;
              steps = node.inputs?.steps || steps;
            }
            if (node.class_type === 'FluxGuidance') {
              guidance = node.inputs?.guidance || guidance;
            }
            if (node.class_type === 'EmptySD3LatentImage') {
              width = node.inputs?.width || width;
              height = node.inputs?.height || height;
            }
            // Check for edit mode indicators
            if (node.class_type === 'LoadImage' || node.class_type === 'VAEEncode') {
              mode = 'edit';
            }
          });
          
          for (const nodeId in historyItem.outputs) {
            const output = historyItem.outputs[nodeId];
            if (output.images && Array.isArray(output.images)) {
              for (const img of output.images) {
                const url = `${API}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`;
                
                historyItems.push({
                  url,
                  timestamp: Date.now() - (historyItems.length * 1000), // Approximate timestamps
                  prompt: prompt || 'Unknown prompt',
                  seed,
                  steps,
                  guidance,
                  mode,
                  filename: img.filename,
                  dimensions: { width, height }
                });
              }
            }
          }
        }
      }
      
      // Remove duplicates and limit to 50
      const uniqueItems = historyItems
        .filter((item, index, self) => 
          index === self.findIndex(t => t.url === item.url)
        )
        .slice(0, 50);
      
      setHistory(uniqueItems);
      
    } catch (error) {
      console.error('Error loading history from API:', error);
      
      // Fallback: try the file listing approach
      try {
        const filesResponse = await axios.get(`${API}/internal/files/output`);
        const files = filesResponse.data;
        
        if (Array.isArray(files)) {
          const historyItems = files
            .filter((filename: string) => filename.match(/\.(png|jpg|jpeg|webp)$/i))
            .sort((a: string, b: string) => b.localeCompare(a))
            .slice(0, 50)
            .map((filename: string, index: number) => ({
              url: `${API}/view?filename=${encodeURIComponent(filename)}&subfolder=&type=output`,
              timestamp: Date.now() - (index * 1000),
              prompt: 'Unknown prompt',
              seed: 0,
              steps: 20,
              guidance: 3.5,
              mode: 'create' as const,
              filename,
              dimensions: { width: 1024, height: 1024 }
            }));
          
          setHistory(historyItems);
        }
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError);
        // Final fallback to localStorage
        const savedHistory = JSON.parse(localStorage.getItem('comfyui-history') || '[]');
        if (Array.isArray(savedHistory)) {
          // Convert old format to new format if needed
          const convertedHistory = savedHistory.map((item: any, index: number) => {
            if (typeof item === 'string') {
              // Old format - just URL
              return {
                url: item,
                timestamp: Date.now() - (index * 1000),
                prompt: 'Unknown prompt',
                seed: 0,
                steps: 20,
                guidance: 3.5,
                mode: 'create' as const,
                filename: 'unknown.png',
                dimensions: { width: 1024, height: 1024 }
              };
            }
            return item; // New format
          });
          setHistory(convertedHistory);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const value: HistoryContextType = {
    history,
    loading,
    addToHistory,
    removeFromHistory,
    clearHistory,
    loadHistoryFromServer
  };

  return (
    <HistoryContext.Provider value={value}>
      {children}
    </HistoryContext.Provider>
  );
};