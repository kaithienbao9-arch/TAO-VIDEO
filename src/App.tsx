/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { SubtitleBlock, CharacterImage, RenderConfig, DictionaryRule, SubtitlePreset } from './types';
import AudioLoader from './components/AudioLoader';
import SrtLoader from './components/SrtLoader';
import SubtitleMatcher from './components/SubtitleMatcher';
import VideoPreviewSection from './components/VideoPreviewSection';
import VideoExporter from './components/VideoExporter';
import SettingsModal from './components/SettingsModal';
import KhoAnhModal from './components/KhoAnhModal';
import MissingCharacterImagesModal from './components/MissingCharacterImagesModal';
import { 
  getAllImagesFromDB, 
  saveImagesToDB, 
  clearAllImagesFromDB, 
  deleteImageFromDB,
  saveBgMusicToDB,
  getAllBgMusicFromDB,
  saveConfigFileToDB,
  getConfigFileFromDB,
  deleteConfigFileFromDB
} from './utils/indexedDB';
import { 
  Sparkles, 
  Film, 
  ArrowRight, 
  Settings, 
  Info,
  Cpu,
  FolderLock
} from 'lucide-react';

const DEFAULT_PRESETS: SubtitlePreset[] = [];

import { DEFAULT_STICKER_GROUPS, populateDefaultStickers } from './utils/stickerGenerator';

const DEFAULT_CONFIG: RenderConfig = {
  width: 1280,
  height: 720,
  fps: 30,
  transitionDuration: 0.5,
  transitionType: 'random_all',
  enableKenBurns: true,
  imageEffect: 'random',
  subtitleOffset: 15,
  subtitleFontSize: 40,
  subtitleColor: '#FFFFFF',
  subtitleOutlineColor: '#000000',
  subtitleOutlineWidth: 1.5,
  subtitleBgColor: '#000000',
  subtitleBgOpacity: 0.0,
  enableDynamicSubstyling: false,
  activePresetId: '',
  singleKeywordMode: 'no_split',
  bgEffect: 'lightning',
  bgEffectInterval: 10,
  bgEffectConsecutive: 1,
  
  // Custom drag positioning & animations
  subtitleX: 50,
  subtitleY: 85,
  subtitleAlign: 'center',
  subtitleEffectIn: 'zoom_fade',
  subtitleEffectOut: 'fade',
  subtitleShowEffect: 'none',
  
  // Custom translucent blur background defaults
  enableBlurBg: true,
  blurBgHeight: 285,
  blurBgWidth: 100,
  blurBgOpacity: 0.5,
  blurBgInOutEffect: 'bottom-to-top',
  blurBgX: 50,
  blurBgY: 85,
  blurBgShape: 'rectangle',
  blurBgColorHex: '#000000',
  blurBgBlurAmount: 18,
  lockTextInBlur: true,
  
  // Intro properties
  introDuration: 0,
  introTitle: 'GIỚI THIỆU VIDEO',
  introSubtitle: 'Sắp xếp nội dung hình ảnh khớp phụ đề tự động',
  introBgColor: '#09090B',
  introTextColor: '#3B82F6',
  introImageId: 'none',
  
  // Outro properties
  outroDuration: 0,
  outroTitle: 'CẢM ƠN ĐÃ THEO DÕI',
  outroSubtitle: 'Được tạo bởi V-Sync Engine NGUYỄN THÀNH NHÂN',
  outroBgColor: '#09090B',
  outroTextColor: '#10B981',
  outroImageId: 'none',

  // Brand Logo default values
  logoUrl: undefined,
  logoX: 85,
  logoY: 15,
  logoSize: 80,
  logoOpacity: 0.9,

  // Subtitle Highlight Settings
  subtitleHighlightMode: 'random_pair',
  subtitleHighlightColor: '#EAB308',
  enableTextHighlight: false,
  enableHighlightContrastText: true,
  subtitleHighlightBgColor: '#EAB308',
  syncHighlightTextColor: true,

  // Substyle phase alternation controls default values
  substyleSwitchMin: 2,
  substyleSwitchMax: 4,
  primaryRenderMode: 'alternate',

  // Audio volume controls
  mainAudioVolume: 100,
  typewriterVolume: 100,

  // Human-like Behavior default controls
  enableHumanArrow: false,
  humanArrowBlocks: '',
  enableHumanTypewriter: false,
  humanTypewriterBlocks: '',
  humanTypewriterColor: '#000000',
  humanTypewriterOpacity: 85,
  enableHumanStickers: false,
  humanStickerGroups: populateDefaultStickers(DEFAULT_STICKER_GROUPS),
  enableHighlightDate: false,
  highlightDateFontFamily: 'Josefin Sans',
  highlightDateColor: '#FFFFFF',
  highlightDateBgColor: '#EAB308',
  highlightDateBgOpacity: 85,
  highlightTextModeDate: false,
  highlightTextModeCaps: true,
  highlightTextFontSize: 150,
  testHighlightText: false,
  enableFakeWebsite: false,
  fakeWebsiteBlocks: '',
  enableFakeVideoEditor: false,
  fakeVideoEditorBlocks: '',
  enableFakeCalendar: false
};

export default function App() {
  const [images, setImages] = useState<CharacterImage[]>([]);
  const [isDbLoading, setIsDbLoading] = useState(true);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [subtitles, setSubtitles] = useState<SubtitleBlock[]>([]);
  const [config, setConfig] = useState<RenderConfig>(DEFAULT_CONFIG);
  const [presets, setPresets] = useState<SubtitlePreset[]>(() => {
    const saved = localStorage.getItem('vsync_sub_presets');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Remove pre-loaded default preset if present
          const filtered = parsed.filter(p => p.id !== 'preset_white_yellow_highlight');
          return filtered;
        }
      } catch (e) {
        console.error("Lỗi parse subtitle presets:", e);
      }
    }
    return DEFAULT_PRESETS;
  });

  // Backup subtitle style presets to localStorage for permanent storage across reboots
  useEffect(() => {
    localStorage.setItem('vsync_sub_presets', JSON.stringify(presets));
  }, [presets]);

  const [previewTime, setPreviewTime] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'create' | 'guide'>('create');
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isKhoAnhOpen, setIsKhoAnhOpen] = useState(false);
  const [showMissingImagesModal, setShowMissingImagesModal] = useState(false);
  const [missingCharacters, setMissingCharacters] = useState<Array<{ characterName: string; matchedKeywords: string[] }>>([]);
  const [bypassMissingCheck, setBypassMissingCheck] = useState(false);
  
  // Stepped-flow UI coordinators
  const [hasProcessed, setHasProcessed] = useState(false);
  const [bgMusicFiles, setBgMusicFiles] = useState<Array<{ id: string; name: string; url: string; file: File; volume?: number }>>([]);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [dictionary, setDictionary] = useState<DictionaryRule[]>([]);

  // Background music management hooks
  const handleAddBgMusic = async (files: File[]) => {
    const newItems = files.map(file => ({
      id: Math.random().toString(36).substring(2, 9),
      name: file.name,
      url: URL.createObjectURL(file),
      file,
      volume: 100 // Default 100% volume
    }));
    
    setBgMusicFiles(prev => {
      const updated = [...prev, ...newItems];
      saveBgMusicToDB(updated).catch(err => console.error("Lỗi lưu nhạc nền vào IndexedDB:", err));
      return updated;
    });
  };

  const handleUpdateBgMusicVolume = async (id: string, volume: number) => {
    setBgMusicFiles(prev => {
      const updated = prev.map(item => {
        if (item.id === id) {
          return { ...item, volume };
        }
        return item;
      });
      saveBgMusicToDB(updated).catch(err => console.error("Lỗi cập nhật âm lượng nhạc nền:", err));
      return updated;
    });
  };

  const handleDeleteBgMusic = async (id: string) => {
    setBgMusicFiles(prev => {
      const target = prev.find(item => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      const updated = prev.filter(item => item.id !== id);
      saveBgMusicToDB(updated).catch(err => console.error("Lỗi đồng bộ nhạc nền sau khi xóa:", err));
      return updated;
    });
  };

  // Delete all images of an entire character group
  const handleDeleteCharacter = async (charName: string) => {
    const targets = images.filter(img => img.characterName === charName);
    for (const img of targets) {
      try {
        await deleteImageFromDB(img.id);
        URL.revokeObjectURL(img.url);
      } catch (err) {
        console.error("Lỗi khi xóa ảnh của nhân vật:", img.name, err);
      }
    }
    setImages(prev => {
      const updated = prev.filter(img => img.characterName !== charName);
      if (subtitles.length > 0) {
        remapSubtitles(subtitles, updated);
      }
      return updated;
    });
  };

  const handleCustomBgUploaded = (type: 'intro' | 'outro', file: File) => {
    const url = URL.createObjectURL(file);
    const customId = type === 'intro' ? 'intro-bg-custom' : 'outro-bg-custom';
    
    const newImg: CharacterImage = {
      id: customId,
      name: type === 'intro' ? 'Ảnh nền Intro riêng' : 'Ảnh nền Outro riêng',
      path: customId,
      url,
      file,
      keywords: []
    };
    
    setConfig(prev => ({
      ...prev,
      [type === 'intro' ? 'introImageId' : 'outroImageId']: customId
    }));
    
    setImages(prev => {
      const filtered = prev.filter(img => img.id !== customId);
      return [...filtered, newImg];
    });
  };

  const getBlobVideoDuration = (blob: Blob): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      const url = URL.createObjectURL(blob);
      
      let resolved = false;
      const done = (val: number) => {
        if (resolved) return;
        resolved = true;
        video.removeEventListener('loadedmetadata', onLoad);
        video.removeEventListener('durationchange', onLoad);
        video.removeEventListener('loadeddata', onLoad);
        video.removeEventListener('error', onError);
        URL.revokeObjectURL(url);
        resolve(val);
      };

      const onLoad = () => {
        const d = video.duration;
        if (typeof d === 'number' && isFinite(d) && d > 0) {
          done(d);
        }
      };
      const onError = () => {
        done(0);
      };

      video.addEventListener('loadedmetadata', onLoad);
      video.addEventListener('durationchange', onLoad);
      video.addEventListener('loadeddata', onLoad);
      video.addEventListener('error', onError);

      video.src = url;
      video.load();

      setTimeout(() => {
        if (!resolved) {
          const d = video.duration;
          if (typeof d === 'number' && isFinite(d) && d > 0) {
            done(d);
          } else {
            done(0);
          }
        }
      }, 1500);
    });
  };

  const handleVideoConfigUploaded = async (type: 'intro' | 'outro', file: File, duration: number) => {
    const url = URL.createObjectURL(file);
    const key = type === 'intro' ? 'introVideoUrl' : 'outroVideoUrl';
    const durKey = type === 'intro' ? 'introDuration' : 'outroDuration';
    
    try {
      await saveConfigFileToDB(type === 'intro' ? 'intro-video' : 'outro-video', file);
    } catch (e) {
      console.error("Lỗi khi lưu video config vào DB:", e);
    }

    setConfig(prev => ({
      ...prev,
      [key]: url,
      [durKey]: duration
    }));
  };

  const handleVideoConfigRemoved = async (type: 'intro' | 'outro') => {
    const key = type === 'intro' ? 'introVideoUrl' : 'outroVideoUrl';
    
    try {
      await deleteConfigFileFromDB(type === 'intro' ? 'intro-video' : 'outro-video');
    } catch (e) {
      console.error("Lỗi khi xóa video config khỏi DB:", e);
    }

    setConfig(prev => ({
      ...prev,
      [key]: undefined
    }));
  };

  // Load state and files on startup
  useEffect(() => {
    // 1. Recover character images
    getAllImagesFromDB()
      .then(loaded => {
        setImages(loaded);
        setIsDbLoading(false);
      })
      .catch(err => {
        console.error("Lỗi khi khôi phục ảnh từ IndexedDB:", err);
        setIsDbLoading(false);
      });

    // 2. Recover configurations
    const savedConfigStr = localStorage.getItem('vsync_config');
    let loadedConfig = DEFAULT_CONFIG;
    if (savedConfigStr) {
      try {
        const parsed = JSON.parse(savedConfigStr);
        if (parsed) {
          if (!parsed.humanStickerGroups || parsed.humanStickerGroups.length === 0) {
            parsed.humanStickerGroups = populateDefaultStickers(DEFAULT_STICKER_GROUPS);
          } else {
            parsed.humanStickerGroups = populateDefaultStickers(parsed.humanStickerGroups);
          }
        }
        loadedConfig = { ...DEFAULT_CONFIG, ...parsed };
      } catch (e) {
        console.error("Lỗi khôi phục cấu hình từ localStorage:", e);
      }
    }

    // 3. Load custom intro & outro video files from IndexedDB
    Promise.all([
      getConfigFileFromDB('intro-video'),
      getConfigFileFromDB('outro-video')
    ]).then(async ([introFile, outroFile]) => {
      const updatedConfig = { ...loadedConfig };
      if (introFile) {
        updatedConfig.introVideoUrl = URL.createObjectURL(introFile);
        const dur = await getBlobVideoDuration(introFile);
        if (dur > 0) {
          updatedConfig.introDuration = dur;
        }
      }
      if (outroFile) {
        updatedConfig.outroVideoUrl = URL.createObjectURL(outroFile);
        const dur = await getBlobVideoDuration(outroFile);
        if (dur > 0) {
          updatedConfig.outroDuration = dur;
        }
      }
      setConfig(updatedConfig);
      setIsConfigLoaded(true);
    }).catch(err => {
      console.error("Lỗi khi khôi phục file video intro/outro:", err);
      setConfig(loadedConfig);
      setIsConfigLoaded(true);
    });

    // 4. Load background music files from IndexedDB
    getAllBgMusicFromDB()
      .then(tracks => {
        setBgMusicFiles(tracks);
      })
      .catch(err => {
        console.error("Lỗi khôi phục danh sách nhạc nền:", err);
      });

    // 5. Load dictionary rules from localStorage
    const savedDictStr = localStorage.getItem('vsync_dictionary');
    if (savedDictStr) {
      try {
        setDictionary(JSON.parse(savedDictStr));
      } catch (e) {
        console.error("Lỗi khôi phục danh bạ từ localStorage:", e);
      }
    }
  }, []);

  // Save configurations upon changes after initialization
  useEffect(() => {
    if (!isConfigLoaded) return;
    const serializable = {
      ...config,
      introVideoUrl: undefined,
      outroVideoUrl: undefined
    };
    localStorage.setItem('vsync_config', JSON.stringify(serializable));
  }, [config, isConfigLoaded]);

  // Sync dictionary to localStorage and trigger subtitle remapping on dictionary edits
  useEffect(() => {
    if (!isConfigLoaded) return;
    localStorage.setItem('vsync_dictionary', JSON.stringify(dictionary));
    if (subtitles.length > 0 && images.length > 0) {
      remapSubtitles(subtitles, images, dictionary);
    }
  }, [dictionary]);

  const handleImagesLoaded = async (loadedImages: CharacterImage[], skipRemap = false) => {
    try {
      await saveImagesToDB(loadedImages);
    } catch (err) {
      console.error("Lỗi lưu ảnh vào db:", err);
    }

    setImages(prev => {
      const existingPaths = new Set(prev.map(img => img.path));
      const filteredNew = loadedImages.filter(img => !existingPaths.has(img.path));
      const combined = [...prev, ...filteredNew];
      if (subtitles.length > 0 && !skipRemap) {
        remapSubtitles(subtitles, combined);
      }
      return combined;
    });
  };

  const handleSingleImageDelete = async (id: string) => {
    try {
      await deleteImageFromDB(id);
      setImages(prev => {
        const updated = prev.filter(img => {
          if (img.id === id) {
            URL.revokeObjectURL(img.url); // prevent leak
            return false;
          }
          return true;
        });
        if (subtitles.length > 0) {
          remapSubtitles(subtitles, updated);
        }
        return updated;
      });
    } catch (err) {
      console.error("Không thể xóa ảnh lẻ:", err);
    }
  };

  const handleClearImages = async () => {
    try {
      await clearAllImagesFromDB();
      images.forEach(img => URL.revokeObjectURL(img.url)); // clear object urls cleanly
    } catch (err) {
      console.error("Lỗi dọn sạch db:", err);
    }
    setImages([]);
    // Reset matches on subtitles if images are cleared
    setSubtitles(prev => prev.map(b => ({
      ...b,
      matchedLeftImageId: undefined,
      matchedRightImageId: undefined,
      matchedLeftKeyword: undefined,
      matchedRightKeyword: undefined
    })));
  };

  const handleAudioLoaded = (file: File, duration: number) => {
    setAudioFile(file);
    if (duration > 0) {
      setAudioDuration(duration);
    }
  };

  const handleClearAudio = () => {
    setAudioFile(null);
    setAudioDuration(0);
    setHasProcessed(false);
  };

  const [srtFile, setSrtFile] = useState<File | null>(null);

  const handleSubtitlesLoaded = (file: File, parsedBlocks: SubtitleBlock[]) => {
    setSrtFile(file);
    setSubtitles(parsedBlocks);
    setBypassMissingCheck(false); // Reset bypass for fresh subtitle upload
    if (images.length > 0) {
      remapSubtitles(parsedBlocks, images);
    }
    // Check missing immediately and trigger showing the popup if any are missing
    const missing = checkMissingCharacterImages(parsedBlocks, images, dictionary);
    if (missing.length > 0) {
      setMissingCharacters(missing);
      setShowMissingImagesModal(true);
    }
  };

  const handleClearSubtitles = () => {
    setSrtFile(null);
    setSubtitles([]);
    setBypassMissingCheck(false);
    setHasProcessed(false);
  };

  // Helper for keyword matching with exact case, standalone or bordered by special chars (word boundaries)
  const isKeywordMatch = (subtitleText: string, kw: string): boolean => {
    if (!subtitleText || !kw) return false;
    
    let index = subtitleText.indexOf(kw);
    while (index !== -1) {
      let leftOk = true;
      if (index > 0) {
        const leftChar = subtitleText[index - 1];
        if (/[A-Za-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/.test(leftChar)) {
          leftOk = false;
        }
      }
      
      let rightOk = true;
      const rightIndex = index + kw.length;
      if (rightIndex < subtitleText.length) {
        const rightChar = subtitleText[rightIndex];
        if (/[A-Za-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/.test(rightChar)) {
          rightOk = false;
        }
      }
      
      if (leftOk && rightOk) {
        return true;
      }
      index = subtitleText.indexOf(kw, index + 1);
    }
    return false;
  };

  // Helper matching detector for missing character images
  const checkMissingCharacterImages = (
    blocksList: SubtitleBlock[], 
    imagesList: CharacterImage[], 
    dictList: DictionaryRule[]
  ): Array<{ characterName: string; matchedKeywords: string[] }> => {
    if (blocksList.length === 0 || dictList.length === 0) return [];
    
    // Group keywords by characterName from dictionary rules
    const charKeywordsMap: Record<string, Set<string>> = {};
    dictList.forEach(entry => {
      if (!entry.characterName) return;
      if (!charKeywordsMap[entry.characterName]) {
        charKeywordsMap[entry.characterName] = new Set();
      }
      charKeywordsMap[entry.characterName].add(entry.characterName);
      if (entry.keyword) {
        charKeywordsMap[entry.characterName].add(entry.keyword);
      }
    });

    const missing: Array<{ characterName: string; matchedKeywords: string[] }> = [];

    // For each unique character, check if mentioned and if they have 0 images in the stock images list
    Object.entries(charKeywordsMap).forEach(([charName, kws]) => {
      const matchedWithCounts: string[] = [];
      kws.forEach(kw => {
        let count = 0;
        blocksList.forEach(block => {
          if (isKeywordMatch(block.text, kw)) {
            count++;
          }
        });
        if (count > 0) {
          matchedWithCounts.push(`${kw} (${count} lần)`);
        }
      });

      if (matchedWithCounts.length > 0) {
        // Character is mentioned! Check if they have images associated with their name
        const hasImages = imagesList.some(img => img.characterName === charName);
        if (!hasImages) {
          missing.push({
            characterName: charName,
            matchedKeywords: matchedWithCounts
          });
        }
      }
    });

    return missing;
  };

  useEffect(() => {
    if (subtitles.length > 0 && dictionary.length > 0) {
      const missing = checkMissingCharacterImages(subtitles, images, dictionary);
      setMissingCharacters(missing);
    } else {
      setMissingCharacters([]);
    }
  }, [subtitles, images, dictionary]);

  // Helper matching connector
  const remapSubtitles = (
    blocksList: SubtitleBlock[],
    imagesList: CharacterImage[],
    dictList: DictionaryRule[] = dictionary
  ) => {
    if (imagesList.length === 0) return;

    // Gather all unique valid keywords/characterName from image items + dictionary (preserving original casing!)
    const allKeywords = new Set<string>();
    imagesList.forEach(img => {
      if (img.characterName && img.characterName !== 'Không có nhân vật' && img.characterName !== 'Tất cả') {
        allKeywords.add(img.characterName);
      }
    });

    dictList.forEach(entry => {
      if (entry.keyword) {
        allKeywords.add(entry.keyword);
      }
      if (entry.characterName) {
        allKeywords.add(entry.characterName);
      }
    });

    // Count frequency of each keyword in the entire srt file based on exact matching
    const kwFrequency: Record<string, number> = {};
    allKeywords.forEach(kw => {
      kwFrequency[kw] = 0;
    });

    blocksList.forEach(block => {
      allKeywords.forEach(kw => {
        if (isKeywordMatch(block.text, kw)) {
          kwFrequency[kw] = (kwFrequency[kw] || 0) + 1;
        }
      });
    });

    const sortedKws = Object.entries(kwFrequency)
      .filter(([kw, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);

    // Select the 5 most frequent keywords across the subtitles
    const top5Kws = sortedKws.slice(0, 5);
    // If we have fewer than 5 keywords, supplement with other valid keywords from candidate allKeywords
    if (top5Kws.length < 5) {
      const extraList = Array.from(allKeywords).filter(kw => !top5Kws.includes(kw));
      top5Kws.push(...extraList.slice(0, 5 - top5Kws.length));
    }

    const usedImageIds = new Set<string>();

    const getImagesForKw = (kw: string) => {
      const matches: CharacterImage[] = [];
      // 1. Match from dictionary rules
      dictList.forEach(entry => {
        if (entry.keyword === kw && kw.length > 0) {
          const targetChar = entry.characterName;
          imagesList.forEach(img => {
            if (img.characterName && img.characterName === targetChar) {
              if (!matches.some(m => m.id === img.id)) {
                matches.push(img);
              }
            }
          });
        }
      });
      // 2. Fallback to characterName exact match
      imagesList.forEach(img => {
        if (img.characterName && img.characterName === kw) {
          if (!matches.some(m => m.id === img.id)) {
            matches.push(img);
          }
        }
      });
      return matches;
    };

    const selectRandomImageForKw = (kw: string, excludeIds: Set<string> = new Set()): CharacterImage | null => {
      const pool = getImagesForKw(kw);
      if (pool.length === 0) return null;

      let candidates = pool.filter(img => !excludeIds.has(img.id));
      if (candidates.length === 0) {
        candidates = pool;
      }

      let freshCandidates = candidates.filter(img => !usedImageIds.has(img.id));
      if (freshCandidates.length === 0) {
        freshCandidates = candidates;
      }

      const selected = freshCandidates[Math.floor(Math.random() * freshCandidates.length)];
      if (selected) {
        usedImageIds.add(selected.id);
      }
      return selected;
    };

    const selectRandomRandomImage = (excludeIds: Set<string> = new Set()): CharacterImage | null => {
      if (imagesList.length === 0) return null;
      let candidates = imagesList.filter(img => !excludeIds.has(img.id));
      if (candidates.length === 0) candidates = imagesList;

      let freshCandidates = candidates.filter(img => !usedImageIds.has(img.id));
      if (freshCandidates.length === 0) freshCandidates = candidates;

      const selected = freshCandidates[Math.floor(Math.random() * freshCandidates.length)];
      if (selected) {
        usedImageIds.add(selected.id);
      }
      return selected;
    };

    const resultBlocks: SubtitleBlock[] = [];

    for (let i = 0; i < blocksList.length; i++) {
      const block = blocksList[i];
      
      // If block was manually overridden or uploaded directly by the user, preserve it!
      if (block.isManualMatch) {
        resultBlocks.push(block);
        continue;
      }

      const keywordToImages: Record<string, CharacterImage[]> = {};
      
      // 1. Match from characterName
      imagesList.forEach(img => {
        if (img.characterName && img.characterName !== 'Không có nhân vật' && img.characterName !== 'Tất cả') {
          if (isKeywordMatch(block.text, img.characterName)) {
            const kw = img.characterName;
            if (!keywordToImages[kw]) {
              keywordToImages[kw] = [];
            }
            if (!keywordToImages[kw].some(x => x.id === img.id)) {
              keywordToImages[kw].push(img);
            }
          }
        }
      });

      // 2. Match from dictionary rules
      dictList.forEach(entry => {
        const dictKw = entry.keyword;
        if (isKeywordMatch(block.text, dictKw) && dictKw.length > 0) {
          const targetChar = entry.characterName;
          const charImages = imagesList.filter(img => 
            img.characterName && img.characterName === targetChar
          );
          if (charImages.length > 0) {
            if (!keywordToImages[dictKw]) {
              keywordToImages[dictKw] = [];
            }
            charImages.forEach(img => {
              if (!keywordToImages[dictKw].some(existing => existing.id === img.id)) {
                keywordToImages[dictKw].push(img);
              }
            });
          }
        }
      });

      let matchedKeywords = Object.keys(keywordToImages);

      // If it is the first block (index 0) and has no matching keywords, default to the most frequent keyword in srt
      if (i === 0 && matchedKeywords.length === 0 && sortedKws.length > 0) {
        const topKw = sortedKws[0];
        const topKwImages = getImagesForKw(topKw);
        if (topKwImages.length > 0) {
          keywordToImages[topKw] = topKwImages;
          matchedKeywords = [topKw];
        }
      }

      // If we already have AI prediction and there are no direct matched keywords, preserve the AI state!
      if (block.isAiPredicted && matchedKeywords.length === 0 && block.matchedKeywordsList && block.matchedKeywordsList.length > 0) {
        resultBlocks.push({
          ...block,
          inheritanceDistance: 0
        });
        continue;
      }

      let leftImgId: string | undefined = undefined;
      let rightImgId: string | undefined = undefined;
      let leftKw: string | undefined = undefined;
      let rightKw: string | undefined = undefined;
      let matchedKwsList: string[] | undefined = undefined;
      let matchedImgIds: string[] | undefined = undefined;
      let inheritanceDist = 0;

      if (matchedKeywords.length >= 2) {
        // Collect one image for each matched keyword
        const selectedImagesForKws: CharacterImage[] = [];
        matchedKeywords.forEach(kw => {
          const imgSelected = selectRandomImageForKw(kw);
          if (imgSelected) {
            selectedImagesForKws.push(imgSelected);
          }
        });

        if (selectedImagesForKws.length >= 2) {
          leftImgId = selectedImagesForKws[0].id;
          rightImgId = selectedImagesForKws[selectedImagesForKws.length - 1].id;
          leftKw = matchedKeywords[0];
          rightKw = matchedKeywords[matchedKeywords.length - 1];
          matchedKwsList = matchedKeywords;
          matchedImgIds = selectedImagesForKws.map(img => img.id);
          inheritanceDist = 0;
        }
      } else if (matchedKeywords.length === 1) {
        // Exactly 1 keyword matches, pick 2 different images for that character
        const kw = matchedKeywords[0];
        const img1 = selectRandomImageForKw(kw);
        if (img1) {
          const img2 = selectRandomImageForKw(kw, new Set([img1.id])) || img1;
          leftImgId = img1.id;
          rightImgId = img2.id;
          leftKw = kw;
          rightKw = kw;
          matchedKwsList = [kw];
          matchedImgIds = [img1.id, img2.id];
          inheritanceDist = 0;
        }
      } else {
        // Inherit from previous block up to 5 consecutive levels
        const prevBlock = i > 0 ? resultBlocks[i - 1] : null;
        const prevDist = prevBlock ? (prevBlock.inheritanceDistance ?? 0) : 999;

        if (prevBlock && prevDist < 5 && prevBlock.matchedKeywordsList && prevBlock.matchedKeywordsList.length > 0) {
          leftKw = prevBlock.matchedLeftKeyword;
          rightKw = prevBlock.matchedRightKeyword;
          matchedKwsList = prevBlock.matchedKeywordsList;
          inheritanceDist = prevDist + 1;

          // Crucial: Do not inherit image IDs directly! Reselect unique random images using inherited keywords list!
          const selectedImages: CharacterImage[] = [];
          if (matchedKwsList.length === 1) {
            const kw = matchedKwsList[0];
            const img1 = selectRandomImageForKw(kw);
            if (img1) {
              const img2 = selectRandomImageForKw(kw, new Set([img1.id])) || img1;
              selectedImages.push(img1, img2);
            }
          } else {
            matchedKwsList.forEach(kw => {
              const img = selectRandomImageForKw(kw);
              if (img) selectedImages.push(img);
            });
          }

          if (selectedImages.length >= 2) {
            leftImgId = selectedImages[0].id;
            rightImgId = selectedImages[selectedImages.length - 1].id;
            matchedImgIds = selectedImages.map(img => img.id);
          } else if (selectedImages.length === 1) {
            leftImgId = selectedImages[0].id;
            rightImgId = selectedImages[0].id;
            matchedImgIds = [selectedImages[0].id, selectedImages[0].id];
          } else {
            const img1 = selectRandomRandomImage();
            const img2 = selectRandomRandomImage(new Set([img1?.id].filter(Boolean) as string[]));
            if (img1 && img2) {
              leftImgId = img1.id;
              rightImgId = img2.id;
              matchedImgIds = [img1.id, img2.id];
            }
          }
        } else {
          // Fallback utilizing a random subset of the top 5 frequent keywords
          const poolKws = top5Kws.length > 0 ? top5Kws : [imagesList[0]?.characterName || imagesList[0]?.keywords?.[0] || ""].filter(Boolean);
          
          if (poolKws.length > 0) {
            const numKwsChoices = [2, 3, 4];
            let numKws = numKwsChoices[Math.floor(Math.random() * numKwsChoices.length)];
            if (numKws > poolKws.length) {
              numKws = poolKws.length;
            }

            // Shuffle poolKws to select random keywords
            const shuffledPool = [...poolKws].sort(() => 0.5 - Math.random());
            const fallbackSelectedKws = shuffledPool.slice(0, numKws);

            const activeImagesList: CharacterImage[] = [];
            const usedKeywords: string[] = [];

            if (fallbackSelectedKws.length === 1) {
              const kw = fallbackSelectedKws[0];
              const img1 = selectRandomImageForKw(kw);
              if (img1) {
                const img2 = selectRandomImageForKw(kw, new Set([img1.id])) || img1;
                activeImagesList.push(img1, img2);
                usedKeywords.push(kw);
              }
            } else {
              fallbackSelectedKws.forEach(kw => {
                const img = selectRandomImageForKw(kw);
                if (img) {
                  activeImagesList.push(img);
                  usedKeywords.push(kw);
                }
              });
            }

            if (activeImagesList.length >= 2) {
              leftImgId = activeImagesList[0].id;
              rightImgId = activeImagesList[activeImagesList.length - 1].id;
              leftKw = usedKeywords[0];
              rightKw = usedKeywords[usedKeywords.length - 1];
              matchedKwsList = usedKeywords;
              matchedImgIds = activeImagesList.map(img => img.id);
            } else if (activeImagesList.length === 1) {
              const mainImgId = activeImagesList[0].id;
              const mainKw = usedKeywords[0];
              leftImgId = mainImgId;
              rightImgId = mainImgId;
              leftKw = mainKw;
              rightKw = mainKw;
              matchedKwsList = [mainKw];
              matchedImgIds = [mainImgId, mainImgId];
            } else {
              const leftImgSelected = selectRandomRandomImage();
              const rightImgSelected = selectRandomRandomImage(new Set([leftImgSelected?.id].filter(Boolean) as string[]));
              leftImgId = leftImgSelected?.id;
              rightImgId = rightImgSelected?.id;
              matchedImgIds = [leftImgSelected?.id, rightImgSelected?.id].filter(Boolean) as string[];
              matchedKwsList = undefined;
            }
          } else {
            const leftImgSelected = selectRandomRandomImage();
            const rightImgSelected = selectRandomRandomImage(new Set([leftImgSelected?.id].filter(Boolean) as string[]));
            leftImgId = leftImgSelected?.id;
            rightImgId = rightImgSelected?.id;
            matchedImgIds = [leftImgSelected?.id, rightImgSelected?.id].filter(Boolean) as string[];
          }

          inheritanceDist = 0;
        }
      }

      resultBlocks.push({
        ...block,
        matchedLeftImageId: leftImgId,
        matchedRightImageId: rightImgId,
        matchedLeftKeyword: leftKw,
        matchedRightKeyword: rightKw,
        matchedKeywordsList: matchedKwsList && matchedKwsList.length > 0 ? matchedKwsList : undefined,
        matchedImageIds: matchedImgIds && matchedImgIds.length > 0 ? matchedImgIds : undefined,
        isAiPredicted: block.isAiPredicted || false,
        aiExplanation: block.aiExplanation,
        inheritanceDistance: inheritanceDist
      });
    }

    setSubtitles(resultBlocks);
  };

  const handleSubtitlesMatched = (updatedBlocks: SubtitleBlock[]) => {
    setSubtitles(updatedBlocks);
  };

  const handlePreviewTimeSelect = (time: number) => {
    setPreviewTime(time);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#E0E0E0] font-sans selection:bg-blue-600/30 selection:text-white" id="main-app-container">
      {/* Sleek Header */}
      <header className="border-b border-white/10 bg-[#111114]/90 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Film size={18} className="animate-pulse" />
            </div>
            <div>
              <h1 className="text-md font-bold tracking-tight text-white flex items-center flex-wrap gap-2">
                V-SYNC ENGINE
                <span className="text-[10px] font-mono text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded font-bold">NGUYỄN THÀNH NHÂN</span>
              </h1>
              <p className="text-[10px] text-white/40 mt-0.5 uppercase tracking-wider">
                Professional Visual Matcher • Secure Browser Offline IndexedDB Store
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex gap-2 bg-white/5 p-1 rounded-lg border border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className={`px-3 py-1.5 rounded-md transition-all font-medium ${
                  activeTab === 'create' ? 'bg-blue-600 text-white shadow font-semibold' : 'text-white/40 hover:text-white'
                }`}
              >
                Chế độ Tạo Video
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('guide')}
                className={`px-3 py-1.5 rounded-md transition-all font-medium ${
                  activeTab === 'guide' ? 'bg-blue-600 text-white shadow font-semibold' : 'text-white/40 hover:text-white'
                }`}
              >
                Hướng dẫn Sử dụng
              </button>
            </div>

            {/* Kho Anh Trigger folder */}
            <button
              onClick={() => setIsKhoAnhOpen(true)}
              className="flex items-center gap-1.5 bg-[#0e2c45] text-sky-400 hover:bg-[#143e61] font-bold text-xs px-4 py-2.5 rounded-lg border border-sky-500/20 active:scale-95 transition-all shadow-md"
              title="Kho ảnh nhân vật"
              id="header-kho-anh-btn"
            >
              <FolderLock size={14} />
              <span>KHO ẢNH ({images.length})</span>
            </button>

            {/* Custom Settings Trigger gear */}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white font-bold text-xs px-4 py-2.5 rounded-lg border border-white/10 transition-all shadow-md"
              title="Cài đặt Video &amp; mật độ phụ đề"
              id="header-settings-btn"
            >
              <Settings size={14} className="hover:rotate-45 transition-transform" />
              <span>Cài đặt Video</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'create' ? (
          <div className="space-y-8">
            
            {/* Step-by-Step simplified flow coordinator */}
            {!hasProcessed ? (
              <div className="max-w-xl mx-auto bg-[#0E0E12] border border-white/10 rounded-2xl p-8 shadow-2xl space-y-6" id="simplified-start-card">
                <div className="text-center space-y-2">
                  <span className="text-[10px] font-bold text-blue-400 tracking-wider uppercase bg-blue-500/10 px-3 py-1 rounded-full">
                    BƯỚC 1: NẠP TÀI NGUYÊN GỐC
                  </span>
                  <h2 className="text-base font-bold text-white">Nạp tệp Phụ đề & Âm thanh</h2>
                  <p className="text-[11px] text-white/50 leading-relaxed">
                    Tải lên tệp phụ đề <code className="bg-slate-900 text-white px-1 py-0.5 rounded text-[10px] font-mono">.srt</code> và audio thuyết minh <code className="bg-slate-900 text-white px-1 py-0.5 rounded text-[10px] font-mono">.mp3</code> tương ứng. Bạn có thể nạp hoặc quản lý Kho ảnh bằng cách bấm nút <span className="font-bold text-sky-400">KHO ẢNH</span> phía trên bất cứ lúc nào!
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Audio File Loader */}
                  <AudioLoader
                    audioFile={audioFile}
                    audioDuration={audioDuration}
                    onAudioLoaded={handleAudioLoaded}
                    onClearAudio={handleClearAudio}
                  />

                  {/* Subtitle File Loader */}
                  <SrtLoader
                    srtFile={srtFile}
                    subtitles={subtitles}
                    onSubtitlesLoaded={handleSubtitlesLoaded}
                    onClearSubtitles={handleClearSubtitles}
                  />
                </div>

                {images.length === 0 && (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] rounded-xl flex items-start gap-2">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <span>Kho ảnh hiện tại trống. Vui lòng bấm vào <strong>KHO ẢNH</strong> trên thanh công cụ để tạo danh sách nhóm nhân vật và nạp ảnh trước khi xử lý video!</span>
                  </div>
                )}

                {images.length > 0 && missingCharacters.length > 0 && (
                  <div 
                    onClick={() => setShowMissingImagesModal(true)}
                    className="p-3.5 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 hover:border-amber-500/30 text-amber-300 text-[11px] rounded-xl flex items-start gap-2.5 cursor-pointer transition-all active:scale-[0.99] select-none shadow animate-in fade-in"
                  >
                    <Sparkles size={14} className="shrink-0 mt-0.5 text-amber-400" />
                    <div className="space-y-0.5">
                      <div className="font-bold flex items-center gap-1.5 text-amber-300">
                        <span>Thiếu ảnh nhân vật kịch bản!</span>
                        <span className="bg-amber-500/20 text-amber-300 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase">Bổ sung</span>
                      </div>
                      <p className="text-[10px] text-white/50 leading-relaxed font-sans">
                        Có {missingCharacters.length} nhân vật được đề cập trong phụ đề srt ({missingCharacters.map(c => c.characterName).slice(0, 3).join(', ')}{missingCharacters.length > 3 ? '...' : ''}) nhưng chưa có ảnh nào trong Kho ảnh. Bấm để thêm nhanh!
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!audioFile || subtitles.length === 0}
                  onClick={() => {
                    if (images.length === 0) {
                      alert("⚠️ Kho ảnh hiện đang trống! Hãy bấm nút 'KHO ẢNH' ở trên góc phải để thêm ít nhất 1 nhân vật và nạp danh sách ảnh nhé!");
                      setIsKhoAnhOpen(true);
                      return;
                    }
                    const missing = checkMissingCharacterImages(subtitles, images, dictionary);
                    if (missing.length > 0 && !bypassMissingCheck) {
                      setMissingCharacters(missing);
                      setShowMissingImagesModal(true);
                      setBypassMissingCheck(true);
                      return;
                    }
                    // Trigger match automatically on processing
                    remapSubtitles(subtitles, images);
                    setHasProcessed(true);
                  }}
                  className={`w-full py-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all transition-transform active:scale-[0.98] ${
                    audioFile && subtitles.length > 0
                      ? 'bg-[#1d4ed8] text-white shadow-lg shadow-blue-500/15 hover:bg-blue-600 font-semibold'
                      : 'bg-[#27272a]/30 border border-white/5 text-white/30 cursor-not-allowed'
                  }`}
                >
                  <Cpu size={14} />
                  <span>XỬ LÝ VIDEO</span>
                </button>
              </div>
            ) : (
              /* Step 2 Workspace panel revealed on process matching */
              <div className="space-y-8 animate-in fade-in duration-200">
                <div className="flex items-center justify-between bg-[#111114] border border-white/10 px-5 py-3 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                    <span className="text-[11px] font-bold text-sky-400 font-mono">BƯỚC 2: LIÊN KẾT PHỤ ĐỀ & KIỂM TRA PREVIEW</span>
                  </div>
                  <button
                    onClick={() => setHasProcessed(false)}
                    className="text-[10px] font-bold text-white/50 hover:text-white px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] rounded-md transition-all border border-white/10"
                  >
                    ← Chọn Lại File SRT & MP3
                  </button>
                </div>

                {/* Subtitle to Image Matching takes full width on top */}
                <div className="w-full">
                  <SubtitleMatcher
                    subtitles={subtitles}
                    images={images}
                    config={config}
                    onSubtitlesMatched={handleSubtitlesMatched}
                    onPreviewTimeSelect={handlePreviewTimeSelect}
                    dictionary={dictionary}
                    onImagesAdded={handleImagesLoaded}
                  />
                </div>

                {/* Video Preview and Exporter below it */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                  {/* Visual Realtime Preview Monitor */}
                  <VideoPreviewSection
                    subtitles={subtitles}
                    images={images}
                    audioFile={audioFile}
                    audioDuration={audioDuration}
                    config={config}
                    onConfigChange={setConfig}
                    previewTime={previewTime}
                    onPreviewTimeSelect={setPreviewTime}
                    bgMusicFiles={bgMusicFiles}
                    presets={presets}
                  />

                  {/* Exporter Progress Bar & Formats */}
                  <VideoExporter
                    subtitles={subtitles}
                    images={images}
                    audioFile={audioFile}
                    audioDuration={audioDuration}
                    config={config}
                    bgMusicFiles={bgMusicFiles}
                    presets={presets}
                  />
                </div>
              </div>
            )}

          </div>
        ) : (
          /* Detailed Multi-step Vietnamese instructions guide context block */
          <div className="bg-[#0E0E11] border border-white/10 rounded-2xl p-8 max-w-3xl mx-auto shadow-2xl font-sans text-white/80 space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-2 border-b border-white/10 pb-3">
              <Sparkles className="text-blue-400" /> Hướng dẫn sản xuất Video chuyên nghiệp
            </h2>
            
            <div className="space-y-4 font-sans leading-relaxed text-sm">
              <div>
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span className="w-5 h-5 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center text-xs font-mono">1</span>
                  Khởi tạo nhân vật & Upload Kho ảnh
                </h3>
                <p className="text-xs text-slate-400 mt-1 pl-7 leading-relaxed font-sans">
                  Bấm nút <strong>KHO ẢNH</strong> ở góc phải phía trên. Tại đây, bạn có thể tạo mới các nhóm nhân vật (ví dụ: Nathan, Sarah), sau đó tải trực tiếp các tệp ảnh chân dung tương thích lên cho nhân vật đó. Hệ thống sẽ tự động chỉ định từ khóa theo tên tệp để phục vụ khớp kịch bản.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span className="w-5 h-5 bg-indigo-500/10 text-indigo-400 rounded-full flex items-center justify-center text-xs font-mono">2</span>
                  Nạp tệp gốc & Bấm Xử Lý Video
                </h3>
                <p className="text-xs text-slate-400 mt-1 pl-7 leading-relaxed flex flex-col gap-1.5 font-sans">
                  Tải lên tệp âm thanh thuyết minh trò chuyện <code className="text-slate-350 bg-slate-950 px-1 rounded">.mp3</code> và tệp phụ đề câu thoại <code className="text-slate-350 bg-slate-950 px-1 rounded">.srt</code> tương ứng. Bấm nút <strong>XỬ LÝ VIDEO</strong>. Thuật toán sẽ quét kịch bản chữ, tìm các từ khóa khớp với tên nhân vật trong Kho ảnh để tự động gắn ghép và mở trang phân tách cảnh split-screen cực kỳ khoa học.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span className="w-5 h-5 bg-indigo-500/10 text-indigo-400 text-xs rounded-full flex items-center justify-center font-mono">3</span>
                  Chỉnh ghép Split-Screen & Xem thử mượt mà
                </h3>
                <p className="text-xs text-slate-400 mt-1 pl-7 leading-relaxed font-sans">
                  Ở chế độ Workspace, mỗi mốc phụ đề thoại tương ứng với một phân cảnh chia đôi màn hình độc đáo. Bạn có thể tự do bấm nút <span className="font-semibold text-sky-400">"Đổi ảnh"</span> để thay thế hình ảnh nhân vật hiển thị hiển thị bên trái hoặc bên phải theo ý thích.
                  Bạn cũng có thể mở bảng <span className="font-semibold text-slate-200">Cài đặt Video</span> để tích hợp các tệp video Intro, video Outro, nạp 1 hoặc nhiều bài <strong>NHẠC NỀN</strong> ngẫu nhiên lặp lại.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span className="w-5 h-5 bg-indigo-500/10 text-indigo-400 text-xs rounded-full flex items-center justify-center font-mono">4</span>
                  Xuất video thành phẩm chất lượng cao
                </h3>
                <p className="text-xs text-slate-400 mt-1 pl-7 leading-relaxed font-sans">
                  Sau khi ưng ý với cấu hình chuyển động và mốc nối hình ảnh phụ đề, cuộn xuống bảng <span className="font-semibold text-slate-200">"Xuất Video Thành Phẩm"</span>. 
                  Nhấn nút <span className="font-semibold text-emerald-400">"Bấm để Tạo Video Ngay"</span>. Trình duyệt sẽ tự động kích hoạt bộ dựng canvas, trộn âm và sinh video MP4 tuyệt đẹp.
                </p>
              </div>
            </div>

            <div className="text-center pt-2">
              <button
                onClick={() => setActiveTab('create')}
                className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl text-xs hover:bg-blue-500 active:scale-95 transition-all shadow-lg shadow-blue-600/15"
              >
                Bắt đầu Tạo ngay <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Settings Modal popover panel */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onConfigChange={setConfig}
        images={images}
        onCustomBgUploaded={handleCustomBgUploaded}
        bgMusicFiles={bgMusicFiles}
        onAddBgMusic={handleAddBgMusic}
        onDeleteBgMusic={handleDeleteBgMusic}
        onUpdateBgMusicVolume={handleUpdateBgMusicVolume}
        audioFile={audioFile}
        onVideoConfigUploaded={handleVideoConfigUploaded}
        onVideoConfigRemoved={handleVideoConfigRemoved}
        presets={presets}
        onPresetsChange={setPresets}
      />

      {/* Kho Anh Modal popover catalog */}
      <KhoAnhModal
        isOpen={isKhoAnhOpen}
        onClose={() => setIsKhoAnhOpen(false)}
        images={images}
        onImagesLoaded={handleImagesLoaded}
        onDeleteImage={handleSingleImageDelete}
        onDeleteCharacter={handleDeleteCharacter}
        dictionary={dictionary}
        onUpdateDictionary={setDictionary}
      />

      {/* Missing Character Images Warning Dialog */}
      <MissingCharacterImagesModal
        isOpen={showMissingImagesModal}
        onClose={() => {
          setShowMissingImagesModal(false);
          setBypassMissingCheck(true);
          if (subtitles.length > 0) {
            remapSubtitles(subtitles, images, dictionary);
          }
        }}
        missingCharacters={missingCharacters}
        onImagesAdded={handleImagesLoaded}
        allImages={images}
      />

      {/* Sleek Footer */}
      <footer className="border-t border-white/10 py-6 text-center text-[11px] text-white/40 mt-12 bg-[#111114]">
        <div>V-SYNC ENGINE • LOCAL RENDER ACCELERATION WITH BROWSER GPU</div>
        <div className="mt-1 opacity-70">Sáng tạo nội dung không giới hạn với sức mạnh xử lý cục bộ an toàn và nhanh chóng.</div>
      </footer>
    </div>
  );
}
