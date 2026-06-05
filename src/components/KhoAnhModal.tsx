/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useRef, useTransition, useEffect } from 'react';
import { CharacterImage, DictionaryRule } from '../types';
import { 
  X, 
  FolderLock, 
  FolderOpen, 
  Plus, 
  Trash2, 
  Image as ImageIcon, 
  Upload, 
  Check, 
  ChevronRight, 
  Users, 
  Sparkles, 
  Search,
  Tag,
  AlertCircle,
  HelpCircle,
  Loader2
} from 'lucide-react';

interface KhoAnhModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: CharacterImage[];
  onImagesLoaded: (loadedImages: CharacterImage[]) => void;
  onDeleteImage: (id: string) => void;
  onDeleteCharacter?: (charName: string) => void;
  dictionary?: DictionaryRule[];
  onUpdateDictionary?: (rules: DictionaryRule[]) => void;
}

// Resizer and optimizer for canvas image uploads - preserves original/standard size while compressing
const compressAndResizeImage = (file: File): Promise<{ blob: Blob; url: string }> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        
        let w = img.width;
        let h = img.height;
        const maxDim = 1920;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const url = URL.createObjectURL(file);
          resolve({ blob: file, url });
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              resolve({ blob, url });
            } else {
              const url = URL.createObjectURL(file);
              resolve({ blob: file, url });
            }
          },
          'image/jpeg',
          0.85
        );
      };
      img.onerror = () => {
        const url = URL.createObjectURL(file);
        resolve({ blob: file, url });
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = () => {
      const url = URL.createObjectURL(file);
      resolve({ blob: file, url });
    };
    reader.readAsDataURL(file);
  });
};

// Keyword extraction from filenames and relative pathways
const extractKeywords = (fileName: string, relativePath?: string): string[] => {
  const allKeywords = new Set<string>();

  const processSegment = (segment: string) => {
    const nameWithoutExt = segment.substring(0, segment.lastIndexOf('.')) || segment;
    const words = nameWithoutExt.split(/[^a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+/i);
    words.forEach(w => {
      const trimmed = w.trim();
      if (trimmed.length >= 2 && !/^\d+$/.test(trimmed)) {
        allKeywords.add(trimmed);
      }
    });
  };

  processSegment(fileName);

  if (relativePath) {
    const parts = relativePath.split('/');
    for (let i = 0; i < parts.length - 1; i++) {
      processSegment(parts[i]);
    }
  }

  return Array.from(allKeywords);
};

export default function KhoAnhModal({
  isOpen,
  onClose,
  images,
  onImagesLoaded,
  onDeleteImage,
  onDeleteCharacter,
  dictionary,
  onUpdateDictionary
}: KhoAnhModalProps) {
  const [selectedChar, setSelectedChar] = useState<string>('Tất cả');
  const [newCharName, setNewCharName] = useState('');
  const [createdEmptyChars, setCreatedEmptyChars] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vsync_empty_chars');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Error loading empty characters:', e);
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('vsync_empty_chars', JSON.stringify(createdEmptyChars));
    } catch (e) {
      console.error('Error saving empty characters:', e);
    }
  }, [createdEmptyChars]);

  const [isPending, startTransition] = useTransition();
  const [optimizeProgress, setOptimizeProgress] = useState<{ current: number; total: number } | null>(null);
  
  // Tab view within the Kho Ảnh panel
  const [modalView, setModalView] = useState<'images' | 'dictionary'>('images');

  // Dictionary management states
  const [manualKeyword, setManualKeyword] = useState('');
  const [manualCharName, setManualCharName] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingKeyword, setEditingKeyword] = useState('');
  const [editingCharName, setEditingCharName] = useState('');
  const [dictSearchQuery, setDictSearchQuery] = useState('');
  const [newAliasKeyword, setNewAliasKeyword] = useState('');
  const [confirmDeleteChar, setConfirmDeleteChar] = useState<string | null>(null);

  // Pending batch state waiting for name input
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [charNamingInput, setCharNamingInput] = useState('');
  const [showNamingPrompt, setShowNamingPrompt] = useState(false);
  const [showNewCharInput, setShowNewCharInput] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const triggerInputRef = useRef<HTMLInputElement>(null);
  const dictFileInputRef = useRef<HTMLInputElement>(null);

  const rules = dictionary || [];
  const setRules = onUpdateDictionary || (() => {});

  const handleDictFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const lines = content.split('\n');
      const newRules: DictionaryRule[] = [];
      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return; // skip comments and empty

        if (trimmed.includes('|')) {
          const parts = trimmed.split('|');
          if (parts.length >= 2) {
            const kw = parts[0].trim();
            const char = parts[1].trim();
            if (kw && char) {
              newRules.push({
                id: `dict_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                keyword: kw,
                characterName: char
              });
            }
          }
        }
      });

      if (newRules.length > 0) {
        const updated = [...rules];
        newRules.forEach((newR) => {
          const idx = updated.findIndex((r) => r.keyword.toLowerCase() === newR.keyword.toLowerCase());
          if (idx >= 0) {
            updated[idx] = newR; // overwrite duplicate keywords
          } else {
            updated.push(newR);
          }
        });
        setRules(updated);
        alert(`Đã nhập thành công ${newRules.length} quy tắc liên kết từ file .txt!`);
      } else {
        alert('Không tìm thấy quy tắc hợp lệ nào trong file. Đảm bảo cấu trúc là: Từ khóa | Tên nhân vật (Ví dụ: Peter | Brennan)');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input element
  };

  const handleAddManualRule = (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = manualKeyword.trim();
    const charName = manualCharName.trim();
    if (!keyword || !charName) return;

    const updated = [...rules];
    const idx = updated.findIndex((r) => r.keyword.toLowerCase() === keyword.toLowerCase());
    const newRule = {
      id: `dict_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      keyword,
      characterName: charName
    };

    if (idx >= 0) {
      updated[idx] = newRule;
    } else {
      updated.push(newRule);
    }
    setRules(updated);

    setManualKeyword('');
    setManualCharName('');
  };

  const handleDeleteRule = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
  };

  const startEditRule = (rule: DictionaryRule) => {
    setEditingRuleId(rule.id);
    setEditingKeyword(rule.keyword);
    setEditingCharName(rule.characterName);
  };

  const handleSaveEditRule = (id: string) => {
    const kw = editingKeyword.trim();
    const char = editingCharName.trim();
    if (!kw || !char) return;

    const updated = rules.map((r) => {
      if (r.id === id) {
        return { ...r, keyword: kw, characterName: char };
      }
      return r;
    });
    setRules(updated);

    setEditingRuleId(null);
  };

  if (!isOpen) return null;

  // Extract list of all unique character name categories sorted and partitioned as requested
  const charactersList = (() => {
    const rawNames = Array.from(
      new Set([
        ...images.map(img => img.characterName).filter(Boolean),
        ...createdEmptyChars
      ])
    ).filter(name => name !== 'Tất cả' && name !== 'Không có nhân vật');

    // Separate into with images (count > 0) vs without images (count === 0)
    const withImages = rawNames.filter(name => {
      return images.some(img => img.characterName === name);
    });

    const withoutImages = rawNames.filter(name => {
      return !images.some(img => img.characterName === name);
    });

    // Sort both groups alphabetically in Vietnamese
    withImages.sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));
    withoutImages.sort((a, b) => a.localeCompare(b, 'vi', { sensitivity: 'base' }));

    return [
      'Tất cả',
      ...withImages,
      ...withoutImages,
      'Không có nhân vật'
    ];
  })();

  const handleCreateEmptyCharName = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCharName.trim();
    if (!name) return;
    if (!createdEmptyChars.includes(name)) {
      setCreatedEmptyChars(prev => [...prev, name]);
      setSelectedChar(name);
    }
    setNewCharName('');
    setShowNewCharInput(false);
  };

  const handleCharTxtImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const lines = content.split('\n');
      const newEmptyNames: string[] = [];
      const newRules: DictionaryRule[] = [];

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        let charName = '';
        let keyword = '';

        if (trimmed.includes('|')) {
          const parts = trimmed.split('|');
          if (parts.length >= 2) {
            charName = parts[1].trim(); // Choose the right side as character name (e.g., "ava")
            keyword = parts[0].trim(); // Use left side as trigger keyword (e.g., "Ava") - preserved casing
          }
        } else {
          charName = trimmed;
          keyword = trimmed; // preserved casing
        }

        if (charName) {
          if (!newEmptyNames.includes(charName)) {
            newEmptyNames.push(charName);
          }
          if (keyword) {
            newRules.push({
              id: `dict_${Date.now()}__${Math.random().toString(36).substr(2, 5)}`,
              keyword: keyword,
              characterName: charName
            });
          }
        }
      });

      if (newEmptyNames.length > 0) {
        setCreatedEmptyChars(prev => {
          const updated = [...prev];
          newEmptyNames.forEach(name => {
            if (!updated.includes(name)) {
              updated.push(name);
            }
          });
          return updated;
        });

        if (newRules.length > 0 && onUpdateDictionary) {
          const updatedRules = [...rules];
          newRules.forEach((newR) => {
            // Check for EXACT case-sensitive match of the keyword to prevent overwriting differently-cased triggers
            const idx = updatedRules.findIndex((r) => r.keyword === newR.keyword);
            if (idx >= 0) {
              updatedRules[idx] = newR;
            } else {
              updatedRules.push(newR);
            }
          });
          onUpdateDictionary(updatedRules);
        }

        setSelectedChar(newEmptyNames[0]);
        alert(`Đã nhập thành công ${newEmptyNames.length} nhân vật từ tệp tin! Hãy bấm vào từng nhân vật bên trái để thêm ảnh cho họ.`);
      } else {
        alert('Không tìm thấy dữ liệu nhân vật hợp lệ.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFileUploadTriggered = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const acceptedFiles: File[] = [];
      const imageRegex = /\.(png|jpe?g|webp|gif|bmp)$/i;
      
      for (let i = 0; i < files.length; i++) {
        if (imageRegex.test(files[i].name)) {
          acceptedFiles.push(files[i]);
        }
      }

      if (acceptedFiles.length > 0) {
        setPendingFiles(acceptedFiles);
        // Default the name assignment input to either currently selected character (if it's not "Tất cả") or blank
        setCharNamingInput(selectedChar === 'Tất cả' || selectedChar === 'Không có nhân vật' ? '' : selectedChar);
        setShowNamingPrompt(true);
      }
    }
    // reset input
    e.target.value = '';
  };

  const handleCompleteNamingAndSave = () => {
    const finalCharName = charNamingInput.trim() || 'Không có nhân vật';
    
    startTransition(async () => {
      setOptimizeProgress({ current: 0, total: pendingFiles.length });
      const loaded: CharacterImage[] = [];

      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        const path = file.webkitRelativePath || file.name;
        const keywords = extractKeywords(file.name, path);
        const id = `img_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`;

        // Process resizing to optimal dimensions
        const { blob, url } = await compressAndResizeImage(file);
        const compressedFile = new File([blob], file.name, { type: 'image/jpeg' });

        // Add additional keywords matching the character name for smart matching
        const customKeywords = new Set([...keywords]);
        finalCharName.split(/\s+/).forEach(word => {
          if (word.length >= 2) customKeywords.add(word);
        });

        loaded.push({
          id,
          name: file.name,
          path,
          url,
          file: compressedFile,
          keywords: Array.from(customKeywords),
          characterName: finalCharName
        });

        setOptimizeProgress({ current: i + 1, total: pendingFiles.length });
      }

      if (loaded.length > 0) {
        onImagesLoaded(loaded);
        // Ensure character name gets registered in list even if select character changes
        if (finalCharName !== 'Không có nhân vật' && !createdEmptyChars.includes(finalCharName)) {
          setCreatedEmptyChars(prev => [...prev, finalCharName]);
        }
        setSelectedChar(finalCharName);
      }

      // Cleanup batch state
      setPendingFiles([]);
      setShowNamingPrompt(false);
      setOptimizeProgress(null);
    });
  };

  // Filter images according to active selection
  const filteredCategoryImages = images.filter(img => {
    if (selectedChar === 'Tất cả') return true;
    if (selectedChar === 'Không có nhân vật') return !img.characterName || img.characterName === 'Không có nhân vật';
    return img.characterName === selectedChar;
  });

  // Filter dictionary rules according to active selection
  const filteredRules = rules.filter((rule) => {
    if (selectedChar === 'Tất cả') return true;
    if (selectedChar === 'Không có nhân vật') return false; // mappings are explicitly to characters
    return rule.characterName.toLowerCase() === selectedChar.toLowerCase();
  });

  const searchedRules = filteredRules.filter(rule => 
    rule.keyword.toLowerCase().includes(dictSearchQuery.toLowerCase()) ||
    rule.characterName.toLowerCase().includes(dictSearchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200" id="kho-anh-modal-overlay">
      <div 
        className="bg-[#0E0E11] border border-white/10 rounded-2xl w-full max-w-4xl flex flex-col h-[85vh] shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 bg-[#131317] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl">
              <FolderLock size={20} />
            </div>
            <div>
              <h2 className="text-md font-bold text-white uppercase tracking-tight">
                Kho Thư Viện Ảnh Nhân Vật (Grouped Catalog)
              </h2>
              <p className="text-[11px] text-white/40 mt-0.5">
                Sắp xếp và lọc tài nguyên ảnh tĩnh theo nhân vật để khớp phụ đề độc lập thông minh
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/50 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Inner Two Column Split Panels */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Left Panel: Sidebar containing Character Name groupings */}
          <div className="w-1/3 border-r border-white/10 bg-[#070709] flex flex-col overflow-y-auto">


            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-[#0e0e11]/50 shrink-0">
              <span className="text-[10px] font-bold text-white/40 tracking-widest uppercase flex items-center gap-1">
                <Users size={11} /> Nhân vật
              </span>

              <div className="flex items-center gap-1 shrink-0">
                {!showNewCharInput && (
                  <button
                    type="button"
                    onClick={() => setShowNewCharInput(true)}
                    className="flex items-center gap-1 text-[10px] bg-sky-600 hover:bg-sky-500 active:scale-95 text-white px-2 py-1 rounded font-bold transition-all"
                    title="Thêm nhân vật thủ công"
                  >
                    <Plus size={10} /> Thêm
                  </button>
                )}

                <input
                  type="file"
                  id="bulk-char-txt-input"
                  accept=".txt"
                  className="hidden"
                  onChange={handleCharTxtImport}
                />
                
                <button
                  type="button"
                  onClick={() => document.getElementById('bulk-char-txt-input')?.click()}
                  className="flex items-center gap-1 text-[10px] bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white px-2 py-1 rounded font-bold transition-all"
                  title="Nhập danh sách nhân vật từ file .txt"
                >
                  <Upload size={10} /> Nhập .TXT
                </button>
              </div>
            </div>

            {/* Quick Create Empty Character Input Form */}
            {showNewCharInput && (
              <form onSubmit={handleCreateEmptyCharName} className="p-3 bg-slate-900/40 border-b border-white/5 animate-in slide-in-from-top-2 duration-100">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-white/50 block font-medium">Nhập tên nhân vật mới:</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="Ví dụ: Sarah, Dũng Sỹ..."
                      value={newCharName}
                      onChange={(e) => setNewCharName(e.target.value)}
                      className="flex-1 bg-black text-xs px-2.5 py-1 rounded border border-white/10 text-white focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="submit"
                      className="px-2 bg-sky-500 hover:bg-sky-450 rounded text-xs text-white"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewCharInput(false)}
                      className="px-2 bg-white/5 hover:bg-white/10 rounded text-xs text-white/50"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Character Items scroll region */}
            <div className="flex-1 p-2 space-y-1 overflow-y-auto">
              {charactersList.map((charName) => {
                const count = images.filter(img => {
                  if (charName === 'Tất cả') return true;
                  if (charName === 'Không có nhân vật') return !img.characterName || img.characterName === 'Không có nhân vật';
                  return img.characterName === charName;
                }).length;

                const canDelete = charName !== 'Tất cả' && charName !== 'Không có nhân vật';

                return (
                  <div
                    key={charName}
                    onClick={() => setSelectedChar(charName)}
                    className={`group/char w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-all cursor-pointer ${
                      selectedChar === charName
                        ? 'bg-sky-600 text-white font-bold shadow-md'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1">
                      <div className={`p-1 rounded-md ${
                        selectedChar === charName ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40'
                      }`}>
                        <FolderOpen size={12} />
                      </div>
                      <span className="truncate">{charName}</span>
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${
                        selectedChar === charName ? 'bg-white/20 text-white' : 'bg-[#050505] text-white/40'
                      }`}>
                        {count}
                      </span>
                      
                      {canDelete && (
                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {confirmDeleteChar === charName ? (
                            <div className="flex items-center gap-1 bg-rose-590/10 border border-rose-500/30 rounded-lg p-0.5 px-1 animate-in fade-in duration-200">
                              <span className="text-[9px] text-rose-400 font-bold uppercase tracking-wider mr-1">Xóa?</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteCharacter?.(charName);
                                  setCreatedEmptyChars(prev => prev.filter(c => c !== charName));
                                  setSelectedChar('Tất cả');
                                  setConfirmDeleteChar(null);
                                }}
                                className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-[9px] font-bold transition-colors shadow-md shrink-0"
                                title="Xác nhận xóa"
                              >
                                Có
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteChar(null);
                                }}
                                className="px-1.5 py-0.5 bg-white/10 hover:bg-white/20 text-white/70 rounded text-[9px] font-bold transition-colors shrink-0"
                                title="Hủy bỏ"
                              >
                                Không
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteChar(charName);
                              }}
                              className="p-1 rounded text-rose-500 hover:bg-rose-600 hover:text-white transition-colors bg-rose-500/10 border border-rose-500/20 shadow-sm flex items-center justify-center shrink-0"
                              title="Xóa toàn bộ nhân vật & ảnh"
                            >
                              <X size={12} className="stroke-[3]" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Content / Thumbnails and Actions */}
          <div className="flex-1 bg-[#0A0A0C]/50 flex flex-col">
                    {/* Action Header inside Category Preview */}
            <div className="p-4 bg-[#111115]/30 border-b border-white/15 flex items-center justify-between gap-4 shrink-0">
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-1">
                  Nhân vật: <span className="text-sky-400 text-sm italic font-sans font-bold">"{selectedChar}"</span>
                </h3>
                <p className="text-[10px] text-white/35 font-medium">
                  Hiển thị {filteredCategoryImages.length} ảnh thuộc về nhân vật này
                </p>
              </div>

              {/* Upload image for selected character */}
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={triggerInputRef}
                  onChange={handleFileUploadTriggered}
                  accept="image/*"
                  multiple
                  className="hidden"
                />
                
                <button
                  type="button"
                  onClick={() => triggerInputRef.current?.click()}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 active:scale-[0.98] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md select-none"
                >
                  <Upload size={13} /> Thêm ảnh cho nhân vật
                </button>
              </div>
            </div>

            {/* Sleek Subtitle Keywords/Aliases Editor Section */}
            {selectedChar !== 'Tất cả' && selectedChar !== 'Không có nhân vật' && (
              <div className="px-5 py-3.5 bg-amber-500/5 border-b border-white/10 space-y-3 shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wide">
                      <Tag size={12} className="text-amber-505" />
                      Từ khóa trong phụ đề kịch bản (.srt):
                    </h4>
                    <p className="text-[10px] text-white/40 mt-1 font-medium">
                      Khi phụ đề xuất hiện một trong các từ khóa này, AI sẽ tự động gán ảnh của nhân vật <span className="text-sky-400 font-bold font-sans">"{selectedChar}"</span>
                    </p>
                  </div>
                  
                  {/* Form to add a new keyword trigger */}
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      const kw = newAliasKeyword.trim();
                      if (!kw) return;
                      
                      // Check if keyword is already mapped to this character
                      const isAlreadyMapped = rules.some(
                        r => r.keyword === kw && r.characterName === selectedChar
                      );
                      if (isAlreadyMapped) {
                        return;
                      }
                      
                      // Check if keyword is mapped to another character
                      const existingRule = rules.find(
                        r => r.keyword.toLowerCase() === kw.toLowerCase()
                      );
                      if (existingRule) {
                        if (window.confirm(`Từ khóa "${kw}" đang được liên kết với nhân vật "${existingRule.characterName}". Bạn có muốn chuyển sang nhân vật "${selectedChar}"?`)) {
                          const updated = rules.map(r => {
                            if (r.id === existingRule.id) {
                              return { ...r, characterName: selectedChar, keyword: kw };
                            }
                            return r;
                          });
                          setRules(updated);
                        }
                        setNewAliasKeyword('');
                        return;
                      }

                      const newRule: DictionaryRule = {
                        id: `dict_${Date.now()}_keyword_${Math.random().toString(36).substr(2, 5)}`,
                        keyword: kw,
                        characterName: selectedChar
                      };
                      setRules([...rules, newRule]);
                      setNewAliasKeyword('');
                    }}
                    className="flex items-center gap-1.5 shrink-0"
                  >
                    <input
                      type="text"
                      placeholder="Thêm từ khóa phụ đề..."
                      value={newAliasKeyword}
                      onChange={(e) => setNewAliasKeyword(e.target.value)}
                      className="bg-black border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/30 w-44 focus:outline-none focus:border-amber-500 font-mono h-8"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-xs font-bold text-white transition-all active:scale-95 shadow shrink-0 select-none h-8"
                    >
                      Thêm
                    </button>
                  </form>
                </div>

                {/* Rendering tags of triggers */}
                <div className="flex flex-wrap gap-2 items-center">
                  {rules.filter(r => r.characterName === selectedChar).length > 0 ? (
                    rules
                      .filter(r => r.characterName === selectedChar)
                      .map((rule) => (
                        <span
                          key={rule.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs font-mono font-medium rounded-lg"
                        >
                          {rule.keyword}
                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="text-amber-500 hover:text-rose-400 font-bold text-[10px] p-0.5"
                            title="Xóa từ khóa này"
                          >
                            ✕
                          </button>
                        </span>
                      ))
                  ) : (
                    <p className="text-[10px] text-amber-400/50 italic font-medium">
                      Chưa có từ khóa nào được thiết lập cho nhân vật này. Thêm từ khóa ở ô phía trên để AI tự động phát hiện trong phụ đề.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Grid of images preview */}
            <div className="flex-1 p-5 overflow-y-auto">
              {filteredCategoryImages.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {filteredCategoryImages.map((img) => (
                    <div
                      key={img.id}
                      className="group relative aspect-[64/72] bg-[#050505] border border-white/10 hover:border-sky-500/50 rounded-xl overflow-hidden transition-all shadow-md animate-fade-in"
                    >
                      <img
                        src={img.url}
                        alt={img.name}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />
                      
                      {/* Name tag Overlay */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-2">
                        <p className="text-[9px] text-white/80 font-mono truncate">
                          {img.name}
                        </p>
                      </div>

                      {/* Deletion of individual index */}
                      <button
                        type="button"
                        onClick={() => onDeleteImage(img.id)}
                        className="absolute top-1.5 right-1.5 p-1.5 bg-black/80 hover:bg-rose-600 text-white rounded-md transition-colors opacity-0 group-hover:opacity-100 duration-155 shadow-lg"
                        title="Xóa ảnh này"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-12 h-12 bg-white/5 border border-white/5 text-white/20 rounded-full flex items-center justify-center">
                    <ImageIcon size={22} className="opacity-60" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-white/50">Thư mục chưa có ảnh</h4>
                    <p className="text-[11px] text-white/30 max-w-sm mt-1 leading-relaxed">
                      Nhân vật này chưa chứa bất kỳ ảnh nào. Bấm vào nút "Thêm ảnh cho nhân vật" ở góc trên để tải ảnh chuẩn hóa gán trực tiếp.
                    </p>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Save/Close bar Footer */}
        <div className="p-4 border-t border-white/10 bg-[#131317] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] transition-all text-white font-bold text-xs"
          >
            Đóng bảng
          </button>
        </div>
      </div>

      {/* Prompts Overlay: Group Name Selector prompt when loading files */}
      {showNamingPrompt && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111114] border border-white/15 p-6 rounded-2xl w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
                <Tag size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-tight">Đặt tên nhóm nhân vật</h3>
                <p className="text-[11px] text-white/40">Gán {pendingFiles.length} ảnh vừa nạp vào danh mục nhân vật</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-white/50 block mb-1">Nhập tên hoặc chọn nhân vật:</label>
                
                {/* Text input with quick suggestions */}
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Ví dụ: Sarah, Dũng Sỹ..."
                  value={charNamingInput}
                  onChange={(e) => setCharNamingInput(e.target.value)}
                  className="w-full bg-black text-xs px-3 py-2.5 rounded-lg border border-white/10 text-white font-medium focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* List of existing characters to quickly tap to fill */}
              {charactersList.filter(n => n !== 'Tất cả' && n !== 'Không có nhân vật').length > 0 && (
                <div>
                  <span className="text-[9px] text-white/35 uppercase block mb-1">Hoặc chọn tên có sẵn:</span>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {charactersList
                      .filter(n => n !== 'Tất cả' && n !== 'Không có nhân vật')
                      .map(name => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setCharNamingInput(name)}
                          className="text-[10px] bg-white/5 hover:bg-white/10 text-white/70 px-2 py-1 rounded transition-colors"
                        >
                          {name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Processing feedback */}
            {optimizeProgress && (
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-[10px] text-white/40">
                  <span>Đang tối ưu dung lượng...</span>
                  <span>{optimizeProgress.current}/{optimizeProgress.total}</span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-sky-500 h-full transition-all duration-100" 
                    style={{ width: `${(optimizeProgress.current / optimizeProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setPendingFiles([]);
                  setShowNamingPrompt(false);
                }}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-white/60 transition-colors"
              >
                Hủy tải lên
              </button>
              
              <button
                type="button"
                disabled={isPending || !charNamingInput.trim()}
                onClick={handleCompleteNamingAndSave}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 transition-colors"
              >
                {isPending ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Đang nén ảnh...
                  </>
                ) : (
                  <>
                    <Check size={12} />
                    Xác nhận &amp; Lưu
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
