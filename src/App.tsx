import React, { useState, useRef, useEffect } from "react";
import {
  TextField,
  Button,
  Container,
  LinearProgress,
  Snackbar,
  Alert,
  Box,
  Typography,
  Paper,
  Switch,
  FormControlLabel,
  Card,
  CardActions,
  Slider,
  Chip,
  IconButton,
  Tooltip,
  AppBar,
  Toolbar,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  ThemeProvider,
  createTheme,
  CssBaseline,
  Tabs,
  Tab,
  Dialog,
} from "@mui/material";

import {
  Download as DownloadIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Menu as MenuIcon,
  Close as CloseIcon,
  Image as ImageIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Upload as UploadIcon,
  Palette as PaletteIcon,
  Tune as TuneIcon,
  History as HistoryIcon,
} from "@mui/icons-material";
import { styled } from "@mui/material/styles";
import axios from "axios";

// Import new components and types
import { HistoryProvider, useHistory } from "./contexts/HistoryContext";
import ImageGallery from "./components/ImageGallery";
import type { ImageHistoryItem, SnackMessage, WorkflowMode } from "./types";

// Dynamic API URL - works locally and on network
const API = window.location.hostname === 'localhost' 
  ? "http://127.0.0.1:8188"  // Local development
  : `http://${window.location.hostname}:8188`; // Network access

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  margin: theme.spacing(2, 0),
  borderRadius: theme.spacing(2),
  background: theme.palette.mode === 'dark' 
    ? 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)'
    : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
  boxShadow: theme.palette.mode === 'dark'
    ? '0 8px 32px rgba(0,0,0,0.3)'
    : '0 8px 32px rgba(0,0,0,0.1)',
}));

const GenerateButton = styled(Button)(({ theme }) => ({
  borderRadius: theme.spacing(3),
  padding: theme.spacing(1.5, 4),
  fontSize: '1.1rem',
  fontWeight: 'bold',
  background: 'linear-gradient(45deg, #6366f1 30%, #8b5cf6 90%)',
  '&:hover': {
    background: 'linear-gradient(45deg, #4f46e5 30%, #7c3aed 90%)',
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 25px rgba(99, 102, 241, 0.3)',
  },
  transition: 'all 0.3s ease',
}));

const ImagePreview = styled('img')({
  maxWidth: '100%',
  borderRadius: 16,
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  transition: 'transform 0.3s ease',
  '&:hover': {
    transform: 'scale(1.02)',
  },
});

// Types moved to separate file

// Main App component wrapped with HistoryProvider
function AppContent() {
  // Mode and tabs - now includes history
  const [mode, setMode] = useState<WorkflowMode>('create');
  
  // Use the history context
  const { addToHistory } = useHistory();
  
  // Create mode states
  const [prompt, setPrompt] = useState("Half-body selfie of a man with glasses, wearing a white polo shirt. The image is taken with a smartphone using direct camera flash, creating harsh frontal lighting, sharp shadows, and a slightly overexposed look typical of flash photography");
  const [steps, setSteps] = useState(20);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1000000000000000));
  const [cfg] = useState(1);
  const [guidance, setGuidance] = useState(3.5);
  const [width, setWidth] = useState(1616);
  const [height, setHeight] = useState(1088);
  
  // LoRA settings - now dynamic
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);
  const [lorasLoading, setLorasLoading] = useState(false);
  const [loraSettings, setLoraSettings] = useState<Record<string, { enabled: boolean; modelStrength: number; clipStrength: number }>>({});
  
  // Edit mode states
  const [editPrompt, setEditPrompt] = useState("Add a hat");
  const [editGuidance, setEditGuidance] = useState(2.5);
  const [editSteps, setEditSteps] = useState(20);
  const [editSeed, setEditSeed] = useState(() => Math.floor(Math.random() * 1000000000000000));
  const [inputImage, setInputImage] = useState<File | null>(null);
  const [inputImagePreview, setInputImagePreview] = useState<string | null>(null);
  
  // Common states
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [image, setImage] = useState<string | null>(null);
  const [snack, setSnack] = useState<SnackMessage | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [modalImage, setModalImage] = useState<string | null>(null);
  // History state is now managed by HistoryContext
  
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<{ isPolling: boolean; timeoutId?: number }>({ isPolling: false });

  // Load history on component mount - now handled by HistoryContext
  const { loadHistoryFromServer } = useHistory();
  
  useEffect(() => {
    loadHistoryFromServer();
    loadLoras(); // Load available LoRAs on component mount
    
    // Set up periodic LoRA checking (every 30 seconds) - silent mode
    const loraCheckInterval = setInterval(() => {
      loadLoras(false); // Don't show success message for automatic checks
    }, 30000);
    
    return () => {
      clearInterval(loraCheckInterval);
    };
  }, [loadHistoryFromServer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop polling
      pollingRef.current.isPolling = false;
      if (pollingRef.current.timeoutId) {
        clearTimeout(pollingRef.current.timeoutId);
      }
      
      // Close WebSocket
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Function to fetch available LoRAs from ComfyUI
  const fetchAvailableLoras = async (): Promise<string[]> => {
    try {
      // First check if ComfyUI server is accessible
      const response = await axios.get(`${API}/object_info/LoraLoader`, {
        timeout: 10000 // 10 second timeout
      });
      
      // Check if we have the expected structure
      if (!response.data || !response.data.LoraLoader || !response.data.LoraLoader.input || !response.data.LoraLoader.input.required) {
        console.warn('ComfyUI API returned unexpected structure:', response.data);
        return [];
      }
      
      // Get the LoRA names from the correct path
      const loraNameData = response.data.LoraLoader.input.required.lora_name;
      
      if (!Array.isArray(loraNameData) || loraNameData.length === 0) {
        console.warn('LoRA name data is not in expected format:', loraNameData);
        return [];
      }
      
      // The first element should be an array of LoRA names
      const loraNames = loraNameData[0];
      
      if (!Array.isArray(loraNames)) {
        console.warn('LoRA names is not an array:', loraNames);
        return [];
      }
      
      const filteredLoras = loraNames
        .filter((name: string) => typeof name === 'string' && name.endsWith('.safetensors'))
        .map((name: string) => name.replace('.safetensors', ''));
      
      console.log(`Found ${filteredLoras.length} LoRAs:`, filteredLoras);
      return filteredLoras;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        console.error('ComfyUI server is not accessible:', error.message);
      } else if (error.code === 'ECONNABORTED') {
        console.error('ComfyUI server request timed out');
      } else {
        console.error('Error fetching LoRAs:', error);
      }
      return [];
    }
  };

  // Function to load LoRAs and initialize settings
  const loadLoras = async (showSuccessMessage = true) => {
    if (lorasLoading) return; // Prevent multiple simultaneous calls
    
    setLorasLoading(true);
    try {
      const loras = await fetchAvailableLoras();
      setAvailableLoras(loras);
      
      // Load saved settings from localStorage
      const savedSettings = JSON.parse(localStorage.getItem('lora-settings') || '{}');
      
      // Clean up localStorage from non-existent LoRAs
      const cleanedSettings: Record<string, { enabled: boolean; modelStrength: number; clipStrength: number }> = {};
      Object.entries(savedSettings).forEach(([name, settings]) => {
        if (loras.includes(name)) {
          cleanedSettings[name] = settings as { enabled: boolean; modelStrength: number; clipStrength: number };
        }
      });
      
      // Create settings for all available LoRAs
      const newSettings: Record<string, { enabled: boolean; modelStrength: number; clipStrength: number }> = {};
      
      loras.forEach(loraName => {
        if (cleanedSettings[loraName]) {
          // Use cleaned saved settings
          newSettings[loraName] = cleanedSettings[loraName];
        } else {
          // Default settings for new LoRAs - all disabled by default
          newSettings[loraName] = {
            enabled: false, // All new LoRAs start disabled for safety
            modelStrength: 0.5,
            clipStrength: 0.45
          };
        }
      });
      
      // Check for changes in LoRAs
      const currentLoraNames = Object.keys(loraSettings);
      const newLoraNames = loras.filter(name => !currentLoraNames.includes(name));
      const removedLoraNames = currentLoraNames.filter(name => !loras.includes(name));
      
      setLoraSettings(newSettings);
      
      // Show appropriate message based on changes
      if (newLoraNames.length > 0 && removedLoraNames.length > 0) {
        setSnack({ 
          type: "info", 
          msg: `עודכנו לורות: +${newLoraNames.length} חדשות, -${removedLoraNames.length} הוסרו` 
        });
      } else if (newLoraNames.length > 0) {
        setSnack({ 
          type: "info", 
          msg: `נמצאו ${newLoraNames.length} לורות חדשות: ${newLoraNames.join(', ')}` 
        });
      } else if (removedLoraNames.length > 0) {
        setSnack({ 
          type: "warning", 
          msg: `הוסרו ${removedLoraNames.length} לורות: ${removedLoraNames.join(', ')}` 
        });
      } else if (showSuccessMessage) {
        if (loras.length === 0) {
          setSnack({ type: "warning", msg: "לא נמצאו לורות זמינות - בדוק חיבור לשרת או תיקיית לורות" });
        } else {
          setSnack({ type: "success", msg: `נטענו ${loras.length} לורות זמינות` });
        }
      }
    } catch (error) {
      console.error('Error loading LoRAs:', error);
      setSnack({ type: "error", msg: "שגיאה בטעינת לורות" });
    } finally {
      setLorasLoading(false);
    }
  };

  // Function to clear invalid LoRA settings from localStorage
  const clearInvalidLoraSettings = () => {
    const savedSettings = JSON.parse(localStorage.getItem('lora-settings') || '{}');
    const validSettings: Record<string, { enabled: boolean; modelStrength: number; clipStrength: number }> = {};
    
    Object.entries(savedSettings).forEach(([name, settings]) => {
      if (availableLoras.includes(name)) {
        validSettings[name] = settings as { enabled: boolean; modelStrength: number; clipStrength: number };
      }
    });
    
    localStorage.setItem('lora-settings', JSON.stringify(validSettings));
    
    // Update current settings to match cleaned localStorage
    setLoraSettings(validSettings);
    
    const removedCount = Object.keys(savedSettings).length - Object.keys(validSettings).length;
    if (removedCount > 0) {
      setSnack({ type: "info", msg: `נוקו ${removedCount} הגדרות לורות לא תקפות` });
    } else {
      setSnack({ type: "success", msg: "כל ההגדרות תקפות" });
    }
  };

  // Save LoRA settings to localStorage whenever they change
  useEffect(() => {
    if (Object.keys(loraSettings).length > 0) {
      // Only save settings for LoRAs that actually exist
      const validSettings: Record<string, { enabled: boolean; modelStrength: number; clipStrength: number }> = {};
      Object.entries(loraSettings).forEach(([name, settings]) => {
        if (availableLoras.includes(name)) {
          validSettings[name] = settings;
        }
      });
      localStorage.setItem('lora-settings', JSON.stringify(validSettings));
    }
  }, [loraSettings, availableLoras]);

  const theme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: {
        main: '#6366f1',
      },
      secondary: {
        main: '#8b5cf6',
      },
      background: {
        default: darkMode ? '#0f0f0f' : '#f8fafc',
        paper: darkMode ? '#1a1a1a' : '#ffffff',
      },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
      h4: {
        fontWeight: 700,
      },
    },
    shape: {
      borderRadius: 12,
    },
  });

  function createWorkflow() {
    // Build the workflow dynamically based on LoRA settings
    const workflow: any = {
      "6": {
        "inputs": {
          "text": prompt,
          "clip": ["39", 0]
        },
        "class_type": "CLIPTextEncode",
        "_meta": {
          "title": "CLIP Text Encode (Positive Prompt)"
        }
      },
      "8": {
        "inputs": {
          "samples": ["31", 0],
          "vae": ["40", 0]
        },
        "class_type": "VAEDecode",
        "_meta": {
          "title": "VAE Decode"
        }
      },
      "9": {
        "inputs": {
          "filename_prefix": "generated/create",
          "images": ["8", 0]
        },
        "class_type": "SaveImage",
        "_meta": {
          "title": "Save Image"
        }
      },
      "27": {
        "inputs": {
          "width": width,
          "height": height,
          "batch_size": 1
        },
        "class_type": "EmptySD3LatentImage",
        "_meta": {
          "title": "EmptySD3LatentImage"
        }
      },
      "31": {
        "inputs": {
          "seed": Number(seed),
          "steps": Number(steps),
          "cfg": cfg,
          "sampler_name": "heun",
          "scheduler": "simple",
          "denoise": 1,
          "model": ["38", 0],
          "positive": ["35", 0],
          "negative": ["33", 0],
          "latent_image": ["27", 0]
        },
        "class_type": "KSampler",
        "_meta": {
          "title": "KSampler"
        }
      },
      "33": {
        "inputs": {
          "text": "",
          "clip": ["39", 0]
        },
        "class_type": "CLIPTextEncode",
        "_meta": {
          "title": "CLIP Text Encode (Negative Prompt)"
        }
      },
      "35": {
        "inputs": {
          "guidance": guidance,
          "conditioning": ["6", 0]
        },
        "class_type": "FluxGuidance",
        "_meta": {
          "title": "FluxGuidance"
        }
      },
      "38": {
        "inputs": {
          "unet_name": "flux1-krea-dev-Q6_K.gguf"
        },
        "class_type": "UnetLoaderGGUF",
        "_meta": {
          "title": "Unet Loader (GGUF)"
        }
      },
      "39": {
        "inputs": {
          "clip_name1": "t5xxl_fp8_e4m3fn.safetensors",
          "clip_name2": "clip_l.safetensors",
          "type": "flux",
          "device": "default"
        },
        "class_type": "DualCLIPLoader",
        "_meta": {
          "title": "DualCLIPLoader"
        }
      },
      "40": {
        "inputs": {
          "vae_name": "ae.safetensors"
        },
        "class_type": "VAELoader",
        "_meta": {
          "title": "Load VAE"
        }
      }
    };

    // Build LoRA chain dynamically
    let currentModelNode = "38";
    let currentClipNode = "39";
    let nodeId = 41;

    // Add enabled LoRAs
    const enabledLoras = Object.entries(loraSettings).filter(([_, settings]) => settings.enabled);
    
    enabledLoras.forEach(([loraName, settings], index) => {
      
      workflow[nodeId.toString()] = {
        "inputs": {
          "lora_name": `${loraName}.safetensors`,
          "strength_model": settings.modelStrength,
          "strength_clip": settings.clipStrength,
          "model": [currentModelNode, 0],
          "clip": [currentClipNode, index === 0 ? 0 : 1]
        },
        "class_type": "LoraLoader",
        "_meta": {
          "title": `Load LoRA - ${loraName}`
        }
      };

      currentModelNode = nodeId.toString();
      currentClipNode = nodeId.toString();
      nodeId++;
    });

    // Update references to use the final LoRA nodes or base nodes if no LoRAs
    const finalModelNode = enabledLoras.length > 0 ? currentModelNode : "38";
    const finalClipNode = enabledLoras.length > 0 ? currentClipNode : "39";
    const clipIndex = enabledLoras.length > 0 ? 1 : 0; // LoRA outputs CLIP at index 1, base CLIP at index 0

    workflow["6"]["inputs"]["clip"] = [finalClipNode, clipIndex];
    workflow["33"]["inputs"]["clip"] = [finalClipNode, clipIndex];
    workflow["31"]["inputs"]["model"] = [finalModelNode, 0];

    return workflow;
  }

  function createEditWorkflow(uploadedImagePath: string) {
    return {
      "6": {
        "inputs": {
          "text": editPrompt,
          "clip": ["38", 0]
        },
        "class_type": "CLIPTextEncode",
        "_meta": {
          "title": "CLIP Text Encode (Positive Prompt)"
        }
      },
      "8": {
        "inputs": {
          "samples": ["31", 0],
          "vae": ["39", 0]
        },
        "class_type": "VAEDecode",
        "_meta": {
          "title": "VAE Decode"
        }
      },
      "31": {
        "inputs": {
          "seed": Number(editSeed),
          "steps": Number(editSteps),
          "cfg": 1,
          "sampler_name": "euler",
          "scheduler": "simple",
          "denoise": 1,
          "model": ["37", 0],
          "positive": ["35", 0],
          "negative": ["135", 0],
          "latent_image": ["124", 0]
        },
        "class_type": "KSampler",
        "_meta": {
          "title": "KSampler"
        }
      },
      "35": {
        "inputs": {
          "guidance": editGuidance,
          "conditioning": ["177", 0]
        },
        "class_type": "FluxGuidance",
        "_meta": {
          "title": "FluxGuidance"
        }
      },
      "37": {
        "inputs": {
          "unet_name": "flux1-kontext-dev-Q6_K.gguf"
        },
        "class_type": "UnetLoaderGGUF",
        "_meta": {
          "title": "Unet Loader (GGUF)"
        }
      },
      "38": {
        "inputs": {
          "clip_name1": "clip_l.safetensors",
          "clip_name2": "t5xxl_fp8_e4m3fn_scaled.safetensors",
          "type": "flux",
          "device": "default"
        },
        "class_type": "DualCLIPLoader",
        "_meta": {
          "title": "DualCLIPLoader"
        }
      },
      "39": {
        "inputs": {
          "vae_name": "ae.safetensors"
        },
        "class_type": "VAELoader",
        "_meta": {
          "title": "Load VAE"
        }
      },
      "42": {
        "inputs": {
          "image": ["146", 0]
        },
        "class_type": "FluxKontextImageScale",
        "_meta": {
          "title": "FluxKontextImageScale"
        }
      },
      "124": {
        "inputs": {
          "pixels": ["42", 0],
          "vae": ["39", 0]
        },
        "class_type": "VAEEncode",
        "_meta": {
          "title": "VAE Encode"
        }
      },
      "135": {
        "inputs": {
          "conditioning": ["6", 0]
        },
        "class_type": "ConditioningZeroOut",
        "_meta": {
          "title": "ConditioningZeroOut"
        }
      },
      "142": {
        "inputs": {
          "image": uploadedImagePath
        },
        "class_type": "LoadImage",
        "_meta": {
          "title": "Load Image"
        }
      },
      "146": {
        "inputs": {
          "direction": "right",
          "match_image_size": true,
          "spacing_width": 0,
          "spacing_color": "white",
          "image1": ["142", 0]
        },
        "class_type": "ImageStitch",
        "_meta": {
          "title": "Image Stitch"
        }
      },
      "177": {
        "inputs": {
          "conditioning": ["6", 0],
          "latent": ["124", 0]
        },
        "class_type": "ReferenceLatent",
        "_meta": {
          "title": "ReferenceLatent"
        }
      },
      "9": {
        "inputs": {
          "filename_prefix": "generated/edit",
          "images": ["8", 0]
        },
        "class_type": "SaveImage",
        "_meta": {
          "title": "Save Image"
        }
      }
    };
  }

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setInputImage(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setInputImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImageToComfyUI = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('overwrite', 'true');
    
    try {
      const response = await axios.post(`${API}/upload/image`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data.name;
    } catch (error) {
      throw new Error('Failed to upload image to ComfyUI');
    }
  };

  const handleGenerate = async () => {
    // Prevent multiple simultaneous generations
    if (loading) {
      setSnack({ type: "warning", msg: "יצירה כבר בתהליך..." });
      return;
    }
    
    setImage(null);
    setLoading(true);
    setProgress(0);
    
    const client_id = "react-ui-" + Math.random().toString(36).substring(2);
    
    let uploadedImagePath: string | null = null;
    
    // For edit mode, upload image first if needed
    if (mode === 'edit' && inputImage) {
      try {
        setSnack({ type: "info", msg: "מעלה תמונה..." });
        uploadedImagePath = await uploadImageToComfyUI(inputImage);
        setSnack({ type: "success", msg: `תמונה הועלתה בהצלחה: ${uploadedImagePath}` });
      } catch (err: any) {
        setSnack({ type: "error", msg: "שגיאה בהעלאת תמונה: " + err.message });
        setLoading(false);
        return;
      }
    }
    
    // WebSocket connection for progress
    const ws = new WebSocket(`${API.replace('http', 'ws')}/ws?clientId=${client_id}`);
    wsRef.current = ws;
    
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'progress') {
        setProgress(msg.data.value / Math.max(1, msg.data.max));
      }
      if (msg.type === 'executing' && msg.data.node === null) {
        ws.close();
      }
    };
    
    ws.onerror = ws.onclose = () => setLoading(false);
    
    let prompt_id = null;
    try {
      const workflow = mode === 'create' 
        ? createWorkflow() 
        : createEditWorkflow(uploadedImagePath!);
      const res = await axios.post(`${API}/prompt`, {
        prompt: workflow,
        client_id
      });
      prompt_id = res.data.prompt_id;
      const actionText = mode === 'create' ? 'יצירה' : 'עריכה';
      setSnack({ type: "info", msg: `משימת ${actionText} נשלחה בהצלחה! מזהה: ${prompt_id}` });
    } catch (err: any) {
      setSnack({ type: "error", msg: "שגיאת רשת: " + err.message });
      setLoading(false);
      ws.close();
      return;
    }
    
    // Stop any existing polling
    pollingRef.current.isPolling = false;
    if (pollingRef.current.timeoutId) {
      clearTimeout(pollingRef.current.timeoutId);
    }
    
    // Start new polling with timeout safety
    pollingRef.current.isPolling = true;
    const startTime = Date.now();
    const maxPollingTime = 10 * 60 * 1000; // 10 minutes max
    
    const pullResult = async () => {
      if (!pollingRef.current.isPolling) return;
      
      // Safety timeout - stop polling after max time
      if (Date.now() - startTime > maxPollingTime) {
        pollingRef.current.isPolling = false;
        setLoading(false);
        setSnack({ type: "error", msg: "תם הזמן המוקצב ליצירה - נסה שוב" });
        return;
      }
      
      try {
        const rsp = await axios.get(`${API}/history/${prompt_id}`);
        const item = rsp.data[prompt_id];
        if (item && item.outputs) {
          for (const nodeId in item.outputs) {
            const out = item.outputs[nodeId];
            if (out.images && out.images.length) {
              const im = out.images[0];
              const url = `${API}/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder)}&type=${encodeURIComponent(im.type)}`;
              setImage(url);
              
              // Add to history with full metadata
              addToHistory({
                url,
                prompt: mode === 'create' ? prompt : editPrompt,
                seed: mode === 'create' ? seed : editSeed,
                steps: mode === 'create' ? steps : editSteps,
                guidance: mode === 'create' ? guidance : editGuidance,
                mode,
                filename: im.filename,
                dimensions: { width, height },
                loraSettings: mode === 'create' ? loraSettings : undefined,
                editPrompt: mode === 'edit' ? editPrompt : undefined
              });
              
              setLoading(false);
              setProgress(1);
              const actionText = mode === 'create' ? 'נוצרה' : 'נערכה';
              setSnack({ type: "success", msg: `תמונה ${actionText} בהצלחה! נשמרה בהיסטוריה 📚` });
              pollingRef.current.isPolling = false; // Stop polling
              return;
            }
          }
        }
      } catch (error) {
        console.error('Error polling results:', error);
        // Stop polling on error to prevent infinite loops
        pollingRef.current.isPolling = false;
        setLoading(false);
        setSnack({ type: "error", msg: "שגיאה בקבלת התוצאה" });
        return;
      }
      
      // Continue polling only if still active
      if (pollingRef.current.isPolling) {
        pollingRef.current.timeoutId = setTimeout(pullResult, 2500);
      }
    };
    
    pullResult();
  };

  const handleStop = () => {
    // Stop WebSocket
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    // Stop polling
    pollingRef.current.isPolling = false;
    if (pollingRef.current.timeoutId) {
      clearTimeout(pollingRef.current.timeoutId);
    }
    
    setLoading(false);
    setProgress(0);
    setSnack({ type: "warning", msg: "יצירה הופסקה" });
  };

  const generateRandomSeed = () => {
    const newSeed = Math.floor(Math.random() * 1000000000000000);
    if (mode === 'create') {
      setSeed(newSeed);
    } else {
      setEditSeed(newSeed);
    }
  };

  // History drawer component
  const HistoryDrawerContent = ({ onImageSelect, onHistoryTabClick, currentImageUrl }: {
    onImageSelect: (item: ImageHistoryItem) => void;
    onHistoryTabClick: () => void;
    currentImageUrl?: string;
  }) => {
    const { history, loading, clearHistory, loadHistoryFromServer } = useHistory();
    
    return (
      <>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="h6">
            היסטוריה ({history.length})
          </Typography>
          <Box>
            <Tooltip title="רענן היסטוריה מהשרת">
              <IconButton 
                size="small" 
                onClick={loadHistoryFromServer}
                disabled={loading}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {history.length > 0 && (
              <Tooltip title="נקה היסטוריה">
                <IconButton 
                  size="small" 
                  onClick={() => {
                    clearHistory();
                    setSnack({ type: "info", msg: "ההיסטוריה נוקתה" });
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
        {loading ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <LinearProgress sx={{ mb: 2 }} />
            <Typography variant="body2" color="text.secondary">
              טוען היסטוריה מהשרת...
            </Typography>
          </Box>
        ) : history.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
            <ImageIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
            <Typography variant="body2">
              אין תמונות בהיסטוריה
            </Typography>
            <Typography variant="caption" display="block" mt={1}>
              לחץ על רענון לטעינה מהשרת
            </Typography>
          </Box>
        ) : (
          <>
            <List>
              {history.slice(0, 5).map((item, index) => (
                <ListItem 
                  key={index} 
                  component="div" 
                  onClick={() => onImageSelect(item)} 
                  sx={{ 
                    cursor: 'pointer',
                    '&:hover': {
                      bgcolor: 'action.hover',
                      borderRadius: 1
                    }
                  }}
                >
                  <ListItemIcon>
                    <ImageIcon color={currentImageUrl === item.url ? 'primary' : 'inherit'} />
                  </ListItemIcon>
                  <ListItemText 
                    primary={item.prompt.length > 20 ? `${item.prompt.substring(0, 20)}...` : item.prompt}
                    secondary={new Date(item.timestamp).toLocaleDateString('he-IL')}
                  />
                </ListItem>
              ))}
            </List>
            {history.length > 5 && (
              <Box sx={{ p: 1, textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  ועוד {history.length - 5} תמונות...
                </Typography>
                <Button 
                  size="small" 
                  onClick={onHistoryTabClick}
                  sx={{ display: 'block', mx: 'auto', mt: 1 }}
                >
                  צפה בכל ההיסטוריה
                </Button>
              </Box>
            )}
          </>
        )}
      </>
    );
  };

  const drawerContent = (
    <Box sx={{ width: 280, p: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">הגדרות</Typography>
        <IconButton onClick={() => setDrawerOpen(false)}>
          <CloseIcon />
        </IconButton>
      </Box>
      
      <Divider sx={{ mb: 2 }} />
      
      <FormControlLabel
        control={
          <Switch
            checked={darkMode}
            onChange={(e) => setDarkMode(e.target.checked)}
          />
        }
        label="מצב כהה"
      />
      
      <Box mt={3}>
        <Typography gutterBottom>רוחב: {width}px</Typography>
        <Slider
          value={width}
          onChange={(_, value) => setWidth(value as number)}
          min={512}
          max={2048}
          step={64}
        />
      </Box>
      
      <Box mt={2}>
        <Typography gutterBottom>גובה: {height}px</Typography>
        <Slider
          value={height}
          onChange={(_, value) => setHeight(value as number)}
          min={512}
          max={2048}
          step={64}
        />
      </Box>
      
      <Box mt={2}>
        <Typography gutterBottom>
          הדרכה: {mode === 'create' ? guidance : editGuidance}
        </Typography>
        <Slider
          value={mode === 'create' ? guidance : editGuidance}
          onChange={(_, value) => {
            if (mode === 'create') {
              setGuidance(value as number);
            } else {
              setEditGuidance(value as number);
            }
          }}
          min={1}
          max={10}
          step={0.1}
        />
      </Box>

      <Box mt={2}>
        <Typography gutterBottom>
          צעדים: {mode === 'create' ? steps : editSteps}
        </Typography>
        <Slider
          value={mode === 'create' ? steps : editSteps}
          onChange={(_, value) => {
            if (mode === 'create') {
              setSteps(value as number);
            } else {
              setEditSteps(value as number);
            }
          }}
          min={1}
          max={100}
          step={1}
        />
      </Box>

      <Box mt={2}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography gutterBottom>
            Seed: {mode === 'create' ? seed : editSeed}
          </Typography>
          <Tooltip title="Seed אקראי">
            <IconButton onClick={generateRandomSeed} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
        <TextField
          fullWidth
          size="small"
          type="number"
          value={mode === 'create' ? seed : editSeed}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (mode === 'create') {
              setSeed(value);
            } else {
              setEditSeed(value);
            }
          }}
        />
      </Box>
      
      <Divider sx={{ my: 2 }} />
      
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <TuneIcon color="primary" />
          <Typography variant="h6">LoRA Models ({availableLoras.length})</Typography>
        </Box>
        <Box display="flex" gap={0.5}>
          <Tooltip title="רענן רשימת לורות">
            <IconButton onClick={() => loadLoras(true)} size="small" disabled={lorasLoading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="נקה הגדרות לורות ישנות">
            <IconButton onClick={clearInvalidLoraSettings} size="small" disabled={lorasLoading}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      
      {lorasLoading && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            טוען לורות זמינות...
          </Typography>
        </Box>
      )}
      
      {!lorasLoading && availableLoras.length === 0 && (
        <Box sx={{ p: 2, bgcolor: 'warning.light', borderRadius: 1, mb: 2, textAlign: 'center' }}>
          <Typography variant="caption" color="warning.dark" display="block" gutterBottom>
            ⚠️ לא נמצאו לורות זמינות
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            • בדוק שיש קבצי .safetensors בתיקיית הלורות
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            • וודא שהשרת ComfyUI פועל ונגיש
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            • לחץ רענון לנסות שוב
          </Typography>
        </Box>
      )}
      
      {Object.entries(loraSettings).map(([loraName, settings]) => (
        <Box key={loraName} sx={{ 
          mb: 2, 
          p: 2, 
          border: 1, 
          borderColor: settings.enabled ? 'primary.main' : 'divider', 
          borderRadius: 1,
          bgcolor: settings.enabled ? 'primary.light' : 'transparent',
          opacity: settings.enabled ? 1 : 0.7
        }}>
          <FormControlLabel
            control={
              <Switch
                checked={settings.enabled}
                onChange={(e) => setLoraSettings(prev => ({
                  ...prev,
                  [loraName]: { ...prev[loraName], enabled: e.target.checked }
                }))}
              />
            }
            label={<Typography variant="subtitle2" fontWeight="bold">{loraName}</Typography>}
            sx={{ mb: 1 }}
          />
          
          {settings.enabled && (
            <>
              <Box mt={1}>
                <Typography variant="caption" gutterBottom display="block">
                  Model Strength: {settings.modelStrength.toFixed(2)}
                </Typography>
                <Slider
                  value={settings.modelStrength}
                  onChange={(_, value) => setLoraSettings(prev => ({
                    ...prev,
                    [loraName]: { ...prev[loraName], modelStrength: value as number }
                  }))}
                  min={0}
                  max={1}
                  step={0.05}
                  size="small"
                />
              </Box>
              
              <Box mt={1}>
                <Typography variant="caption" gutterBottom display="block">
                  CLIP Strength: {settings.clipStrength.toFixed(2)}
                </Typography>
                <Slider
                  value={settings.clipStrength}
                  onChange={(_, value) => setLoraSettings(prev => ({
                    ...prev,
                    [loraName]: { ...prev[loraName], clipStrength: value as number }
                  }))}
                  min={0}
                  max={1}
                  step={0.05}
                  size="small"
                />
              </Box>
            </>
          )}
        </Box>
      ))}
      
      {Object.values(loraSettings).every(s => !s.enabled) && (
        <Box sx={{ p: 2, bgcolor: 'warning.light', borderRadius: 1, mb: 2 }}>
          <Typography variant="caption" color="warning.dark">
            ⚠️ כל ה-LoRA models כבויים - ישתמש במודל הבסיסי בלבד
          </Typography>
        </Box>
      )}
      
      <Divider sx={{ my: 2 }} />
      
      <HistoryDrawerContent 
        onImageSelect={(item) => {
          setImage(item.url);
          setSnack({ type: "info", msg: `הוחזרה תמונה מההיסטוריה` });
        }}
        onHistoryTabClick={() => setMode('history')}
        currentImageUrl={image || undefined}
      />
    </Box>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box minHeight="100vh">
        <AppBar position="static" elevation={0} sx={{ background: 'transparent', backdropFilter: 'blur(10px)' }}>
          <Toolbar>
            <IconButton
              edge="start"
              color="inherit"
              onClick={() => setDrawerOpen(true)}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              ✨ ComfyUI - ממשק אינטראקטיבי
            </Typography>
            <Chip
              icon={mode === 'create' ? <AddIcon /> : mode === 'edit' ? <EditIcon /> : <HistoryIcon />}
              label={mode === 'create' ? 'יצירה' : mode === 'edit' ? 'עריכה' : 'היסטוריה'}
              color="secondary"
              variant="outlined"
              sx={{ mr: 2 }}
            />
            <Chip
              icon={<PaletteIcon />}
              label={darkMode ? "כהה" : "בהיר"}
              onClick={() => setDarkMode(!darkMode)}
              variant="outlined"
            />
          </Toolbar>
        </AppBar>

        <Drawer
          anchor="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        >
          {drawerContent}
        </Drawer>

        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Box display="flex" gap={4} flexDirection={{ xs: 'column', md: 'row' }}>
            <Box flex={1}>
              <StyledPaper>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                  <Tabs 
                    value={mode} 
                    onChange={(_, newValue) => setMode(newValue)}
                    variant="fullWidth"
                  >
                    <Tab 
                      icon={<AddIcon />} 
                      label="יצירת תמונה" 
                      value="create"
                      sx={{ minHeight: 64 }}
                    />
                    <Tab 
                      icon={<EditIcon />} 
                      label="עריכת תמונה" 
                      value="edit"
                      sx={{ minHeight: 64 }}
                    />
                    <Tab 
                      icon={<HistoryIcon />} 
                      label="היסטוריה" 
                      value="history"
                      sx={{ minHeight: 64 }}
                    />
                  </Tabs>
                </Box>

                {mode === 'create' ? (
                  <>
                    <TextField
                      label="תיאור התמונה (Prompt)"
                      variant="outlined"
                      fullWidth
                      multiline
                      rows={6}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      margin="normal"
                      sx={{ mb: 3 }}
                    />
                  </>
                ) : mode === 'edit' ? (
                  <>
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="h6" gutterBottom>
                        העלאת תמונה לעריכה
                      </Typography>
                      
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        style={{ display: 'none' }}
                        ref={fileInputRef}
                      />
                      
                      <Button
                        variant="outlined"
                        startIcon={<UploadIcon />}
                        onClick={() => fileInputRef.current?.click()}
                        fullWidth
                        sx={{ mb: 2, py: 2 }}
                      >
                        בחר תמונה לעריכה
                      </Button>
                      
                      {inputImagePreview && (
                        <Box textAlign="center" mb={2}>
                          <img
                            src={inputImagePreview}
                            alt="Input preview"
                            style={{
                              maxWidth: '100%',
                              maxHeight: 200,
                              borderRadius: 8,
                              border: `2px solid ${theme.palette.primary.main}`,
                            }}
                          />
                          <Typography variant="caption" display="block" mt={1}>
                            תמונה נבחרה לעריכה
                          </Typography>
                        </Box>
                      )}
                    </Box>

                    <TextField
                      label="תיאור העריכה (Edit Prompt)"
                      variant="outlined"
                      fullWidth
                      multiline
                      rows={3}
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      margin="normal"
                      sx={{ mb: 3 }}
                      placeholder="למשל: הוסף כובע, שנה צבע השיער, הוסף משקפיים..."
                    />
                  </>
                ) : (
                  // History tab content
                  <ImageGallery
                    onImageSelect={(item) => {
                      setImage(item.url);
                      setSnack({ type: "info", msg: `נבחרה תמונה מההיסטוריה` });
                    }}
                    onEditImage={(item) => {
                      setMode('edit');
                      setEditPrompt(item.editPrompt || 'Edit this image');
                      setEditSeed(item.seed);
                      setEditSteps(item.steps);
                      setEditGuidance(item.guidance);
                      
                      // Convert image URL to File for editing
                      fetch(item.url)
                        .then(res => res.blob())
                        .then(blob => {
                          const file = new File([blob], item.filename, { type: 'image/png' });
                          setInputImage(file);
                          setInputImagePreview(item.url);
                        })
                        .catch(err => {
                          console.error('Error converting image for editing:', err);
                          setSnack({ type: "error", msg: "שגיאה בהכנת התמונה לעריכה" });
                        });
                    }}
                    onImageClick={(imageUrl) => setModalImage(imageUrl)}
                    currentImageUrl={image || undefined}
                  />
                )}
                
                {mode !== 'history' && (
                  <Box display="flex" gap={2} justifyContent="center">
                    {!loading ? (
                      <GenerateButton
                        variant="contained"
                        size="large"
                        onClick={handleGenerate}
                        startIcon={mode === 'create' ? <AddIcon /> : <EditIcon />}
                        disabled={mode === 'edit' && !inputImage}
                      >
                        {mode === 'create' ? 'צור תמונה' : 'ערוך תמונה'}
                      </GenerateButton>
                    ) : (
                      <Button
                        variant="outlined"
                        size="large"
                        onClick={handleStop}
                        startIcon={<StopIcon />}
                        color="error"
                      >
                        עצור
                      </Button>
                    )}
                  </Box>
                )}
                
                {loading && (
                  <Box mt={3}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="body2">
                        {mode === 'create' ? 'יוצר תמונה...' : 'עורך תמונה...'}
                      </Typography>
                      <Typography variant="body2">{Math.round(progress * 100)}%</Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={progress * 100}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        background: theme.palette.mode === 'dark' ? '#333' : '#f0f0f0',
                      }}
                    />
                  </Box>
                )}
              </StyledPaper>
            </Box>
            
            <Box flex={1}>
              <StyledPaper>
                <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ImageIcon color="primary" />
                  תוצאה
                </Typography>
                
                {image ? (
                  <Card elevation={0} sx={{ background: 'transparent' }}>
                    <Box textAlign="center" p={2}>
                      <ImagePreview 
                        src={image} 
                        alt="Generated output" 
                        onClick={() => setModalImage(image)}
                        style={{ cursor: 'pointer' }}
                      />
                    </Box>
                    <CardActions sx={{ justifyContent: 'center', gap: 1 }}>
                      <Button
                        variant="contained"
                        startIcon={<DownloadIcon />}
                        onClick={async () => {
                          if (image) {
                            try {
                              const response = await fetch(image);
                              const blob = await response.blob();
                              const url = window.URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `generated-image-${Date.now()}.png`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              window.URL.revokeObjectURL(url);
                            } catch (error) {
                              console.error('Error downloading image:', error);
                              setSnack({ type: "error", msg: "שגיאה בהורדת התמונה" });
                            }
                          }
                        }}
                        color="primary"
                      >
                        הורד
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => setImage(null)}
                      >
                        נקה
                      </Button>
                      {mode === 'create' && (
                        <Button
                          variant="outlined"
                          onClick={() => {
                            setMode('edit');
                            // Convert current result to input for editing
                            fetch(image)
                              .then(res => res.blob())
                              .then(blob => {
                                const file = new File([blob], 'generated_image.png', { type: 'image/png' });
                                setInputImage(file);
                                setInputImagePreview(image);
                              });
                          }}
                          startIcon={<EditIcon />}
                        >
                          ערוך תמונה זו
                        </Button>
                      )}
                    </CardActions>
                  </Card>
                ) : (
                  <Box
                    display="flex"
                    flexDirection="column"
                    alignItems="center"
                    justifyContent="center"
                    minHeight={400}
                    sx={{
                      border: `2px dashed ${theme.palette.divider}`,
                      borderRadius: 2,
                      background: theme.palette.action.hover,
                    }}
                  >
                    <ImageIcon sx={{ fontSize: 64, color: theme.palette.text.secondary, mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">
                      התמונה תופיע כאן
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {mode === 'create' 
                        ? 'לחץ על "צור תמונה" כדי להתחיל'
                        : 'העלה תמונה ולחץ על "ערוך תמונה"'
                      }
                    </Typography>
                  </Box>
                )}
              </StyledPaper>
            </Box>
          </Box>
        </Container>

        <Snackbar
          open={Boolean(snack)}
          autoHideDuration={6000}
          onClose={() => setSnack(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            severity={snack?.type || "info"}
            onClose={() => setSnack(null)}
            sx={{ minWidth: 300 }}
          >
            {snack?.msg}
          </Alert>
        </Snackbar>

        {/* Image Modal for enlarged view */}
        <Dialog
          open={Boolean(modalImage)}
          onClose={() => setModalImage(null)}
          maxWidth="lg"
          fullWidth
          sx={{
            '& .MuiDialog-paper': {
              backgroundColor: 'transparent',
              boxShadow: 'none',
              overflow: 'visible'
            }
          }}
        >
          <Box
            sx={{
              position: 'relative',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '80vh',
              p: 2
            }}
          >
            <IconButton
              onClick={() => setModalImage(null)}
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                zIndex: 2,
                backgroundColor: 'rgba(0,0,0,0.7)',
                color: 'white',
                '&:hover': {
                  backgroundColor: 'rgba(0,0,0,0.9)'
                }
              }}
            >
              <CloseIcon />
            </IconButton>
            {modalImage && (
              <img
                src={modalImage}
                alt="Enlarged view"
                style={{
                  maxWidth: '100%',
                  maxHeight: '90vh',
                  objectFit: 'contain',
                  borderRadius: 8,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                }}
              />
            )}
          </Box>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}

// Main App component with HistoryProvider
function App() {
  return (
    <HistoryProvider>
      <AppContent />
    </HistoryProvider>
  );
}

export default App;
