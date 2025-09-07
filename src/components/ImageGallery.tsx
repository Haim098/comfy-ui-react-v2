import React, { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardMedia,
  CardContent,
  Typography,
  IconButton,
  Tooltip,
  TextField,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  LinearProgress
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  ContentCopy as ContentCopyIcon,
  Search as SearchIcon,

} from '@mui/icons-material';
import type { ImageHistoryItem } from '../types';
import { useHistory } from '../contexts/HistoryContext';

interface ImageGalleryProps {
  onImageSelect: (item: ImageHistoryItem) => void;
  onEditImage: (item: ImageHistoryItem) => void;
  currentImageUrl?: string;
}

const ImageGallery: React.FC<ImageGalleryProps> = ({ 
  onImageSelect, 
  onEditImage, 
  currentImageUrl 
}) => {
  const { history, loading, removeFromHistory, clearHistory, loadHistoryFromServer } = useHistory();
  const [searchTerm, setSearchTerm] = useState('');
  const [modeFilter, setModeFilter] = useState<'all' | 'create' | 'edit'>('all');
  const [selectedItem, setSelectedItem] = useState<ImageHistoryItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      const matchesSearch = item.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           item.filename.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesMode = modeFilter === 'all' || item.mode === modeFilter;
      return matchesSearch && matchesMode;
    });
  }, [history, searchTerm, modeFilter]);

  const handleDownload = (item: ImageHistoryItem) => {
    const link = document.createElement('a');
    link.href = item.url;
    link.download = item.filename || `generated-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDuplicate = (item: ImageHistoryItem) => {
    // Copy parameters to clipboard or trigger generation with same parameters
    const params = {
      prompt: item.prompt,
      seed: item.seed,
      steps: item.steps,
      guidance: item.guidance,
      width: item.dimensions.width,
      height: item.dimensions.height
    };
    navigator.clipboard.writeText(JSON.stringify(params, null, 2));
  };

  const handleDelete = (item: ImageHistoryItem) => {
    setSelectedItem(item);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (selectedItem) {
      removeFromHistory(selectedItem.url);
      setDeleteDialogOpen(false);
      setSelectedItem(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <LinearProgress sx={{ mb: 2 }} />
        <Typography variant="body2" color="text.secondary">
          טוען היסטוריה מהשרת...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      {/* Header with filters */}
      <Box sx={{ mb: 3 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5" gutterBottom>
            גלריית תמונות ({filteredHistory.length})
          </Typography>
          <Box>
            <Tooltip title="רענן מהשרת">
              <IconButton onClick={loadHistoryFromServer} disabled={loading}>
                <SearchIcon />
              </IconButton>
            </Tooltip>
            {history.length > 0 && (
              <Tooltip title="נקה הכל">
                <IconButton onClick={clearHistory} color="error">
                  <DeleteIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {/* Search and filters */}
        <Box display="flex" gap={2} mb={2} flexWrap="wrap">
          <TextField
            placeholder="חפש בהיסטוריה..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
            sx={{ minWidth: 200 }}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
            }}
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>מצב</InputLabel>
            <Select
              value={modeFilter}
              label="מצב"
              onChange={(e) => setModeFilter(e.target.value as 'all' | 'create' | 'edit')}
            >
              <MenuItem value="all">הכל</MenuItem>
              <MenuItem value="create">יצירה</MenuItem>
              <MenuItem value="edit">עריכה</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* Empty state */}
      {filteredHistory.length === 0 ? (
        <Box sx={{ 
          p: 4, 
          textAlign: 'center', 
          color: 'text.secondary',
          border: '2px dashed',
          borderColor: 'divider',
          borderRadius: 2
        }}>
          <Typography variant="h6" gutterBottom>
            {searchTerm || modeFilter !== 'all' ? 'לא נמצאו תוצאות' : 'אין תמונות בהיסטוריה'}
          </Typography>
          <Typography variant="body2">
            {searchTerm || modeFilter !== 'all' 
              ? 'נסה לשנות את החיפוש או הסינון'
              : 'צור תמונה ראשונה כדי להתחיל'
            }
          </Typography>
        </Box>
      ) : (
        /* Gallery grid */
        <Box 
          sx={{ 
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(1, 1fr)',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(4, 1fr)'
            },
            gap: 2
          }}
        >
          {filteredHistory.map((item, index) => (
            <Card 
              key={`${item.url}-${index}`}
              sx={{ 
                cursor: 'pointer',
                border: currentImageUrl === item.url ? 2 : 0,
                borderColor: 'primary.main',
                position: 'relative',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4
                }
              }}
              onClick={() => onImageSelect(item)}
            >
                {/* Action buttons overlay */}
                <Box 
                  sx={{ 
                    position: 'absolute', 
                    top: 8, 
                    right: 8, 
                    zIndex: 2,
                    display: 'flex',
                    gap: 0.5,
                    opacity: 0,
                    transition: 'opacity 0.3s ease',
                    '.MuiCard-root:hover &': {
                      opacity: 1
                    }
                  }}
                >
                  <Tooltip title="הורד">
                    <IconButton 
                      size="small" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(item);
                      }}
                      sx={{ 
                        bgcolor: 'rgba(0,0,0,0.7)', 
                        color: 'white',
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.9)' }
                      }}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="שכפל פרמטרים">
                    <IconButton 
                      size="small" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicate(item);
                      }}
                      sx={{ 
                        bgcolor: 'rgba(0,0,0,0.7)', 
                        color: 'white',
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.9)' }
                      }}
                    >
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="ערוך">
                    <IconButton 
                      size="small" 
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditImage(item);
                      }}
                      sx={{ 
                        bgcolor: 'rgba(0,0,0,0.7)', 
                        color: 'white',
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.9)' }
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="מחק">
                    <IconButton 
                      size="small" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item);
                      }}
                      sx={{ 
                        bgcolor: 'rgba(244,67,54,0.8)', 
                        color: 'white',
                        '&:hover': { bgcolor: 'rgba(244,67,54,1)' }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>

                <CardMedia
                  component="img"
                  height="200"
                  image={item.url}
                  alt={`תמונה ${index + 1}`}
                  sx={{ 
                    objectFit: 'cover',
                    transition: 'transform 0.3s ease',
                    '&:hover': {
                      transform: 'scale(1.05)'
                    }
                  }}
                />
                <CardContent sx={{ p: 1.5 }}>
                  <Typography variant="body2" noWrap title={item.prompt} gutterBottom>
                    {item.prompt.length > 40 ? `${item.prompt.substring(0, 40)}...` : item.prompt}
                  </Typography>
                  
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Chip 
                      label={item.mode === 'create' ? 'יצירה' : 'עריכה'} 
                      size="small" 
                      color={item.mode === 'create' ? 'primary' : 'secondary'}
                      variant="outlined"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {new Date(item.timestamp).toLocaleDateString('he-IL')}
                    </Typography>
                  </Box>
                  
                  <Typography variant="caption" color="text.secondary" display="block">
                    {item.dimensions.width}×{item.dimensions.height} • {item.steps} צעדים
                  </Typography>
                </CardContent>
              </Card>
          ))}
        </Box>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>מחיקת תמונה</DialogTitle>
        <DialogContent>
          <Typography>
            האם אתה בטוח שברצונך למחוק את התמונה הזו מההיסטוריה?
          </Typography>
          {selectedItem && (
            <Box mt={2}>
              <img 
                src={selectedItem.url} 
                alt="Preview" 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: 200, 
                  borderRadius: 8 
                }} 
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            ביטול
          </Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            מחק
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ImageGallery;