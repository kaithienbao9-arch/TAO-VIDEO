/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { SubtitleBlock, CharacterImage, DictionaryRule, RenderConfig } from '../types';
import { Sparkles, Image as ImageIcon, CheckCircle, AlertCircle, RefreshCw, X, ArrowRight, Search, Play } from 'lucide-react';

interface SubtitleMatcherProps {
  subtitles: SubtitleBlock[];
  images: CharacterImage[];
  onSubtitlesMatched: (updatedBlocks: SubtitleBlock[]) => void;
  onPreviewTimeSelect?: (time: number) => void;
  dictionary?: DictionaryRule[];
  config?: RenderConfig;
  onImagesAdded?: (newImages: CharacterImage[], skipRemap?: boolean) => void;
}

export default function SubtitleMatcher({
  subtitles,
  images,
  onSubtitlesMatched,
  onPreviewTimeSelect,
  dictionary = [],
  config,
  onImagesAdded
}: SubtitleMatcherProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [selectorPosition, setSelectorPosition] = useState<'left' | 'right'>('left');
  const [imageSelectorSearch, setImageSelectorSearch] = useState('');
  const [tryPreviewBlock, setTryPreviewBlock] = useState<SubtitleBlock | null>(null);

  // AI loading and suggestion states
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [individualLoadingId, setIndividualLoadingId] = useState<number | null>(null); // To satisfy TS let's use number | null
  const [aiError, setAiError] = useState<string | null>(null);

  const getIndividualLoadingState = (id: number): boolean => {
    return individualLoadingId === id;
  };

  // 1. Highlight matched keywords in the subtitle text in yellow
  const renderHighlightedText = (textString: string, keywordsArr: string[] = []) => {
    if (!keywordsArr || keywordsArr.length === 0) {
      return <span>{textString}</span>;
    }

    const sortedKeywords = Array.from(new Set(keywordsArr))
      .filter(Boolean)
      .map(k => k.trim())
      .filter(k => k.length > 0)
      .sort((a, b) => b.length - a.length);

    if (sortedKeywords.length === 0) {
      return <span>{textString}</span>;
    }

    const pattern = sortedKeywords
      .map(kw => kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'))
      .join('|');

    try {
      const regex = new RegExp(`(${pattern})`, 'gi');
      const parts = textString.split(regex);
      return (
        <>
          {parts.map((part, index) => {
            const isMatch = sortedKeywords.some(
              kw => kw.toLowerCase() === part.toLowerCase()
            );
            return isMatch ? (
              <span key={index} className="text-yellow-400 bg-yellow-400/10 px-1 py-0.5 rounded font-bold border border-yellow-400/20 shadow-sm animate-pulse-subtle">
                {part}
              </span>
            ) : (
              <span key={index}>{part}</span>
            );
          })}
        </>
      );
    } catch (e) {
      return <span>{textString}</span>;
    }
  };

  // 2. Individual line suggestion via server-side Gemini Mime-response
  const handleIndividualAiSuggest = async (block: SubtitleBlock) => {
    if (images.length === 0) {
      alert("Vui lòng tải tệp ảnh nhân vật lên trước để AI có danh sách đối chiếu!");
      return;
    }

    setIndividualLoadingId(block.id);
    setAiError(null);

    try {
      const charactersMap: Record<string, Set<string>> = {};
      images.forEach(img => {
        if (!img.characterName) return;
        if (!charactersMap[img.characterName]) {
          charactersMap[img.characterName] = new Set();
        }
        if (img.keywords) {
          img.keywords.forEach(kw => {
            if (kw && kw.trim().length > 0) {
              charactersMap[img.characterName].add(kw.toLowerCase());
            }
          });
        }
      });

      const charactersPayload = Object.entries(charactersMap).map(([name, kwSet]) => ({
        name,
        keywords: Array.from(kwSet)
      }));

      const response = await fetch('/api/gemini/suggest-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtitles: [{ id: block.id, text: block.text }],
          characters: charactersPayload
        })
      });

      if (!response.ok) {
        let errMsg = `Lỗi máy chủ: Trả về trạng thái ${response.status}`;
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      if (!data || !data.suggestions) {
        throw new Error('Định dạng phản hồi AI không đồng bộ hợp lệ.');
      }

      const suggestions = data.suggestions as Array<{
        id: number;
        suggestedKeywords: string[];
        explanation?: string;
      }>;

      const suggestion = suggestions.find(s => s.id === block.id);
      if (suggestion && suggestion.suggestedKeywords && suggestion.suggestedKeywords.length > 0) {
        const suggestedKws = suggestion.suggestedKeywords.map(k => k.toLowerCase());
        
        let leftImgId = block.matchedLeftImageId;
        let rightImgId = block.matchedRightImageId;
        let leftKw = block.matchedLeftKeyword;
        let rightKw = block.matchedRightKeyword;

        const keywordToImages: Record<string, CharacterImage[]> = {};
        suggestedKws.forEach(kw => {
          const ruleMatchChars = new Set<string>();
          dictionary.forEach(entry => {
            if (entry.keyword.toLowerCase() === kw) {
              ruleMatchChars.add(entry.characterName);
            }
          });

          const matchingImages = images.filter(img => 
            img.characterName && (
              img.characterName.toLowerCase() === kw ||
              ruleMatchChars.has(img.characterName)
            )
          );
          if (matchingImages.length > 0) {
            keywordToImages[kw] = matchingImages;
          }
        });

        const matchedKeys = Object.keys(keywordToImages);
        const mode = config?.singleKeywordMode || 'pair';
        const isNoSplit = mode === 'no_split';

        if (matchedKeys.length >= 2 && isNoSplit) {
          const seedIndex = (block.id * 31 + 7) % matchedKeys.length;
          const kw = matchedKeys[seedIndex];
          const pool = keywordToImages[kw];
          leftImgId = pool[Math.floor(Math.random() * pool.length)].id;
          rightImgId = undefined;
          leftKw = kw;
          rightKw = undefined;
        } else if (matchedKeys.length >= 2) {
          const kw1 = matchedKeys[0];
          const kw2 = matchedKeys[1];
          const leftPool = keywordToImages[kw1];
          const rightPool = keywordToImages[kw2];
          leftImgId = leftPool[Math.floor(Math.random() * leftPool.length)].id;
          rightImgId = rightPool[Math.floor(Math.random() * rightPool.length)].id;
          leftKw = kw1;
          rightKw = kw2;
        } else if (matchedKeys.length === 1) {
          const kw = matchedKeys[0];
          const pool = keywordToImages[kw];
          leftImgId = pool[Math.floor(Math.random() * pool.length)].id;
          const shouldPair = checkShouldPairForKw(block.id);
          if (shouldPair) {
            rightImgId = pool.length > 1 
              ? pool.filter(i => i.id !== leftImgId)[Math.floor(Math.random() * (pool.length - 1))].id 
              : leftImgId;
            rightKw = kw;
          } else {
            rightImgId = undefined;
            rightKw = undefined;
          }
          leftKw = kw;
        }

        const updated = subtitles.map(b => b.id === block.id ? {
          ...b,
          matchedLeftImageId: leftImgId,
          matchedRightImageId: rightImgId,
          matchedLeftKeyword: leftKw,
          matchedRightKeyword: rightKw,
          matchedKeywordsList: suggestedKws,
          isAiPredicted: true,
          aiExplanation: suggestion.explanation
        } : b);

        onSubtitlesMatched(updated);
      } else {
        alert("AI đọc phụ đề nhưng không phát hiện nhân vật đối chiếu nào phù hợp.");
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Không thể lấy gợi ý AI cho dòng này.");
    } finally {
      setIndividualLoadingId(null);
    }
  };

  // 3. Batch suggestions trigger for all empty subtitle blocks
  const handleAiSuggestForUnmatched = async () => {
    const unmatchedBlocks = subtitles.filter(
      b => !b.matchedLeftKeyword && !b.matchedRightKeyword && (!b.matchedKeywordsList || b.matchedKeywordsList.length === 0)
    );

    if (unmatchedBlocks.length === 0) {
      alert("Tất cả câu phụ đề đều đã có từ khóa chủ đạo. Không cần phân tích AI thêm!");
      return;
    }

    if (images.length === 0) {
      alert("Vui lòng tải tệp ảnh nhân vật lên trước để AI có danh sách đối chiếu!");
      return;
    }

    setIsAiLoading(true);
    setAiError(null);

    try {
      const charactersMap: Record<string, Set<string>> = {};
      images.forEach(img => {
        if (!img.characterName) return;
        if (!charactersMap[img.characterName]) {
          charactersMap[img.characterName] = new Set();
        }
        if (img.keywords) {
          img.keywords.forEach(kw => {
            if (kw && kw.trim().length > 0) {
              charactersMap[img.characterName].add(kw.toLowerCase());
            }
          });
        }
      });

      const charactersPayload = Object.entries(charactersMap).map(([name, kwSet]) => ({
        name,
        keywords: Array.from(kwSet)
      }));

      const response = await fetch('/api/gemini/suggest-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtitles: unmatchedBlocks.map(b => ({ id: b.id, text: b.text })),
          characters: charactersPayload
        })
      });

      if (!response.ok) {
        let errMsg = `Lỗi máy chủ: Trả về trạng thái ${response.status}`;
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const data = await response.json();
      if (!data || !data.suggestions) {
        throw new Error('Định dạng phản hồi AI không đồng bộ hợp lệ.');
      }

      const suggestions = data.suggestions as Array<{
        id: number;
        suggestedKeywords: string[];
        explanation?: string;
      }>;

      const updated = subtitles.map(block => {
        const suggestion = suggestions.find(s => s.id === block.id);
        if (suggestion && suggestion.suggestedKeywords && suggestion.suggestedKeywords.length > 0) {
          const suggestedKws = suggestion.suggestedKeywords.map(k => k.toLowerCase());
          
          let leftImgId = block.matchedLeftImageId;
          let rightImgId = block.matchedRightImageId;
          let leftKw = block.matchedLeftKeyword;
          let rightKw = block.matchedRightKeyword;

          const keywordToImages: Record<string, CharacterImage[]> = {};
          suggestedKws.forEach(kw => {
            const ruleMatchChars = new Set<string>();
            dictionary.forEach(entry => {
              if (entry.keyword.toLowerCase() === kw) {
                ruleMatchChars.add(entry.characterName);
              }
            });

            const matchingImages = images.filter(img => 
              img.characterName && (
                img.characterName.toLowerCase() === kw ||
                ruleMatchChars.has(img.characterName)
              )
            );
            if (matchingImages.length > 0) {
              keywordToImages[kw] = matchingImages;
            }
          });

          const matchedKeys = Object.keys(keywordToImages);
          const mode = config?.singleKeywordMode || 'pair';
          const isNoSplit = mode === 'no_split';

          if (matchedKeys.length >= 2 && isNoSplit) {
            const seedIndex = (block.id * 31 + 7) % matchedKeys.length;
            const kw = matchedKeys[seedIndex];
            const pool = keywordToImages[kw];
            leftImgId = pool[Math.floor(Math.random() * pool.length)].id;
            rightImgId = undefined;
            leftKw = kw;
            rightKw = undefined;
          } else if (matchedKeys.length >= 2) {
            const kw1 = matchedKeys[0];
            const kw2 = matchedKeys[1];
            const leftPool = keywordToImages[kw1];
            const rightPool = keywordToImages[kw2];
            leftImgId = leftPool[Math.floor(Math.random() * leftPool.length)].id;
            rightImgId = rightPool[Math.floor(Math.random() * rightPool.length)].id;
            leftKw = kw1;
            rightKw = kw2;
          } else if (matchedKeys.length === 1) {
            const kw = matchedKeys[0];
            const pool = keywordToImages[kw];
            leftImgId = pool[Math.floor(Math.random() * pool.length)].id;
            const shouldPair = checkShouldPairForKw(block.id);
            if (shouldPair) {
              rightImgId = pool.length > 1 
                ? pool.filter(i => i.id !== leftImgId)[Math.floor(Math.random() * (pool.length - 1))].id 
                : leftImgId;
              rightKw = kw;
            } else {
              rightImgId = undefined;
              rightKw = undefined;
            }
            leftKw = kw;
          }

          return {
            ...block,
            matchedLeftImageId: leftImgId,
            matchedRightImageId: rightImgId,
            matchedLeftKeyword: leftKw,
            matchedRightKeyword: rightKw,
            matchedKeywordsList: suggestedKws,
            isAiPredicted: true,
            aiExplanation: suggestion.explanation
          };
        }
        return block;
      });

      onSubtitlesMatched(updated);
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Không thể lấy gợi ý AI lúc này.");
    } finally {
      setIsAiLoading(false);
    }
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

  // Auto-matching logic for Left/Right images mapping
  const handleAutoMatch = () => {
    if (images.length === 0 || subtitles.length === 0) return;

    // Gather all unique valid keywords/characterNames from image items + dictionary (preserving original casing!)
    const allKeywords = new Set<string>();
    images.forEach(img => {
      if (img.characterName && img.characterName !== 'Không có nhân vật' && img.characterName !== 'Tất cả') {
        allKeywords.add(img.characterName);
      }
    });

    dictionary.forEach(entry => {
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

    subtitles.forEach(block => {
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
      dictionary.forEach(entry => {
        if (entry.keyword === kw && kw.length > 0) {
          const targetChar = entry.characterName;
          images.forEach(img => {
            if (img.characterName && img.characterName === targetChar) {
              if (!matches.some(m => m.id === img.id)) {
                matches.push(img);
              }
            }
          });
        }
      });
      // 2. Fallback to characterName exact match
      images.forEach(img => {
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
      if (images.length === 0) return null;
      let candidates = images.filter(img => !excludeIds.has(img.id));
      if (candidates.length === 0) candidates = images;

      let freshCandidates = candidates.filter(img => !usedImageIds.has(img.id));
      if (freshCandidates.length === 0) freshCandidates = candidates;

      const selected = freshCandidates[Math.floor(Math.random() * freshCandidates.length)];
      if (selected) {
        usedImageIds.add(selected.id);
      }
      return selected;
    };

    const resultBlocks: SubtitleBlock[] = [];

    for (let i = 0; i < subtitles.length; i++) {
      const block = subtitles[i];
      
      // Keep manually matched or uploaded blocks untouched!
      if (block.isManualMatch) {
        resultBlocks.push(block);
        continue;
      }

      const keywordToImages: Record<string, CharacterImage[]> = {};
      
      // 1. Match from characterName
      images.forEach(img => {
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
      dictionary.forEach(entry => {
        const dictKw = entry.keyword;
        if (isKeywordMatch(block.text, dictKw) && dictKw.length > 0) {
          const targetChar = entry.characterName;
          const charImages = images.filter(img => 
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

      const checkShouldPairForKw = (blockId: number): boolean => {
        const mode = config?.singleKeywordMode || 'pair';
        if (mode === 'no_split') return false;
        if (mode === 'pair') return true;
        if (mode === 'single') return false;
        
        const seed = (blockId * 17 + 13) % 100;
        if (mode === 'percent_50_50') return seed < 50;
        if (mode === 'percent_25_75') return seed < 25;
        if (mode === 'percent_75_25') return seed < 75;
        return true;
      };

      const isNoSplit = config?.singleKeywordMode === 'no_split';

      if (matchedKeywords.length >= 2 && isNoSplit) {
        // Select exactly 1 keyword deterministically
        const seedIndex = (block.id * 31 + 7) % matchedKeywords.length;
        const kw = matchedKeywords[seedIndex];
        const img1 = selectRandomImageForKw(kw);
        if (img1) {
          leftImgId = img1.id;
          leftKw = kw;
          matchedKwsList = [kw];
          rightImgId = undefined;
          rightKw = undefined;
          matchedImgIds = [img1.id];
          inheritanceDist = 0;
        }
      } else if (matchedKeywords.length >= 2) {
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
        // Exactly 1 keyword matches, check configuration for single or pair matching layout
        const kw = matchedKeywords[0];
        const img1 = selectRandomImageForKw(kw);
        if (img1) {
          const shouldPair = checkShouldPairForKw(block.id);
          leftImgId = img1.id;
          leftKw = kw;
          matchedKwsList = [kw];
          if (shouldPair) {
            const img2 = selectRandomImageForKw(kw, new Set([img1.id])) || img1;
            rightImgId = img2.id;
            rightKw = kw;
            matchedImgIds = [img1.id, img2.id];
          } else {
            rightImgId = undefined;
            rightKw = undefined;
            matchedImgIds = [img1.id];
          }
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
              const shouldPair = checkShouldPairForKw(block.id);
              selectedImages.push(img1);
              if (shouldPair) {
                const img2 = selectRandomImageForKw(kw, new Set([img1.id])) || img1;
                selectedImages.push(img2);
              }
            }
          } else {
            if (isNoSplit) {
              const seedIndex = (block.id * 31 + 7) % matchedKwsList.length;
              const kw = matchedKwsList[seedIndex];
              const img1 = selectRandomImageForKw(kw);
              if (img1) {
                selectedImages.push(img1);
              }
            } else {
              matchedKwsList.forEach(kw => {
                const img = selectRandomImageForKw(kw);
                if (img) selectedImages.push(img);
              });
            }
          }

          if (selectedImages.length >= 2) {
            leftImgId = selectedImages[0].id;
            rightImgId = selectedImages[selectedImages.length - 1].id;
            matchedImgIds = selectedImages.map(img => img.id);
          } else if (selectedImages.length === 1) {
            leftImgId = selectedImages[0].id;
            rightImgId = undefined;
            matchedImgIds = [selectedImages[0].id];
          } else {
            const imgSelected = selectRandomRandomImage();
            leftImgId = imgSelected?.id;
            rightImgId = undefined;
            matchedImgIds = [imgSelected?.id].filter(Boolean) as string[];
          }
        } else {
          // Fallback utilizing a random subset of the top 5 frequent keywords
          const poolKws = top5Kws.length > 0 ? top5Kws : [images[0]?.characterName || images[0]?.keywords?.[0] || ""].filter(Boolean);
          
          if (poolKws.length > 0) {
            const numKwsChoices = isNoSplit ? [1] : [2, 3, 4];
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
                activeImagesList.push(img1);
                const shouldPair = checkShouldPairForKw(block.id);
                if (shouldPair) {
                  const img2 = selectRandomImageForKw(kw, new Set([img1.id])) || img1;
                  activeImagesList.push(img2);
                }
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
              rightImgId = undefined;
              leftKw = mainKw;
              rightKw = undefined;
              matchedKwsList = [mainKw];
              matchedImgIds = [mainImgId];
            } else {
              const imgSelected = selectRandomRandomImage();
              leftImgId = imgSelected?.id;
              rightImgId = undefined;
              matchedImgIds = [imgSelected?.id].filter(Boolean) as string[];
              matchedKwsList = undefined;
            }
          } else {
            const imgSelected = selectRandomRandomImage();
            leftImgId = imgSelected?.id;
            rightImgId = undefined;
            matchedImgIds = [imgSelected?.id].filter(Boolean) as string[];
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

    onSubtitlesMatched(resultBlocks);
  };

  // Run auto-match elements when data sets load
  useEffect(() => {
    if (images.length > 0 && subtitles.length > 0 && subtitles.every(s => !s.matchedLeftImageId && !s.matchedRightImageId)) {
      handleAutoMatch();
    }
  }, [images.length, subtitles.length]);

  const checkShouldPairForKw = (blockId: number): boolean => {
    const mode = config?.singleKeywordMode || 'pair';
    if (mode === 'no_split') return false;
    if (mode === 'pair') return true;
    if (mode === 'single') return false;
    
    const seed = (blockId * 17 + 13) % 100;
    if (mode === 'percent_50_50') return seed < 50;
    if (mode === 'percent_25_75') return seed < 25;
    if (mode === 'percent_75_25') return seed < 75;
    return true;
  };

  const handleManualImageSelect = (blockId: number, imageId: string) => {
    const updated = subtitles.map(b => {
      if (b.id === blockId) {
        const image = images.find(img => img.id === imageId);
        const mode = config?.singleKeywordMode || 'pair';
        
        // Count how many keywords are present
        const matchedKwsList = [b.matchedLeftKeyword, b.matchedRightKeyword, ...(b.matchedKeywordsList || [])].filter(Boolean) as string[];
        const uniqueKws = Array.from(new Set(matchedKwsList));

        // If 'no_split' or if single keyword with shouldPair = false, we force single image!
        const isSingleKw = uniqueKws.length <= 1;
        const shouldPair = mode !== 'no_split' && (!isSingleKw || checkShouldPairForKw(blockId));

        if (!shouldPair) {
          return {
            ...b,
            matchedLeftImageId: imageId,
            matchedLeftKeyword: image ? image.keywords[0] : undefined,
            matchedRightImageId: undefined,
            matchedRightKeyword: undefined,
            matchedImageIds: [imageId],
            matchedKeywordsList: image ? [image.keywords[0]].filter(Boolean) : undefined,
            isManualMatch: true,
          };
        } else {
          const leftImgId = selectorPosition === 'left' ? imageId : b.matchedLeftImageId;
          const rightImgId = selectorPosition === 'right' ? imageId : b.matchedRightImageId;
          const leftKw = selectorPosition === 'left' ? (image ? image.keywords[0] : b.matchedLeftKeyword) : b.matchedLeftKeyword;
          const rightKw = selectorPosition === 'right' ? (image ? image.keywords[0] : b.matchedRightKeyword) : b.matchedRightKeyword;
          const imgIds = [leftImgId, rightImgId].filter(Boolean) as string[];
          const kws = [leftKw, rightKw].filter(Boolean) as string[];

          return {
            ...b,
            matchedLeftImageId: leftImgId,
            matchedRightImageId: rightImgId,
            matchedLeftKeyword: leftKw,
            matchedRightKeyword: rightKw,
            matchedImageIds: imgIds,
            matchedKeywordsList: kws,
            isManualMatch: true,
          };
        }
      }
      return b;
    });
    onSubtitlesMatched(updated);
    setSelectedBlockId(null);
  };

  const getLeftImage = (block: SubtitleBlock) => {
    return images.find(img => img.id === block.matchedLeftImageId);
  };

  const getRightImage = (block: SubtitleBlock) => {
    return images.find(img => img.id === block.matchedRightImageId);
  };

  const getMatchedImages = (block: SubtitleBlock) => {
    let list: CharacterImage[] = [];
    if (block.matchedImageIds && block.matchedImageIds.length > 0) {
      list = block.matchedImageIds.map(id => images.find(img => img.id === id)).filter(Boolean) as CharacterImage[];
    } else {
      const left = images.find(img => img.id === block.matchedLeftImageId);
      if (left) list.push(left);
      const right = images.find(img => img.id === block.matchedRightImageId);
      if (right && right.id !== block.matchedLeftImageId) {
        list.push(right);
      }
    }

    if (list.length <= 1) return list;

    const mode = config?.singleKeywordMode || 'pair';
    if (mode === 'no_split') {
      return list.slice(0, 1);
    }

    const matchedKws = Array.from(new Set([
      block.matchedLeftKeyword,
      block.matchedRightKeyword,
      ...(block.matchedKeywordsList || [])
    ].filter(Boolean) as string[]));

    if (matchedKws.length === 1 || (block.matchedLeftKeyword && block.matchedLeftKeyword === block.matchedRightKeyword)) {
      const shouldPair = checkShouldPairForKw(block.id);
      if (!shouldPair) {
        return list.slice(0, 1);
      }
    }
    return list;
  };

  const formatSecs = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  // Filter subtitles list
  const filteredBlocks = subtitles.filter(block => {
    const hasMatch = !!block.matchedLeftKeyword || !!block.matchedRightKeyword;
    if (activeFilter === 'matched' && !hasMatch) return false;
    if (activeFilter === 'unmatched' && hasMatch) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const textMatch = block.text.toLowerCase().includes(q);
      const kwMatch = block.matchedLeftKeyword?.toLowerCase().includes(q) || 
                       block.matchedRightKeyword?.toLowerCase().includes(q) || false;
      const leftNameMatch = getLeftImage(block)?.name.toLowerCase().includes(q) || false;
      const rightNameMatch = getRightImage(block)?.name.toLowerCase().includes(q) || false;
      return textMatch || kwMatch || leftNameMatch || rightNameMatch;
    }

    return true;
  });

  const matchedCount = subtitles.filter(s => !!s.matchedLeftKeyword || !!s.matchedRightKeyword).length;
  const unmatchedCount = subtitles.length - matchedCount;

  const currentBlock = subtitles.find(b => b.id === selectedBlockId);
  const filteredSelectorImages = images.filter(img => 
    img.name.toLowerCase().includes(imageSelectorSearch.toLowerCase()) ||
    img.keywords.some(kw => kw.toLowerCase().includes(imageSelectorSearch.toLowerCase()))
  );

  return (
    <div className="bg-[#0E0E11] border border-white/10 rounded-2xl p-6 shadow-xl" id="sub-matcher-card">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-md font-semibold text-white font-sans tracking-tight flex items-center gap-2">
            Liên kết Subtitle với Ảnh Split-Screen (Bên Trái &amp; Bên Phải)
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            Dựa trên từ khóa phụ đề, chọn lọc các hình ảnh 640x720 để tự động ghép thành khung hình 1280x720 hoàn chỉnh
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAutoMatch}
            disabled={images.length === 0 || subtitles.length === 0}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-blue-600/15 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
          >
            <RefreshCw size={12} />
            Tự động Khớp Lại
          </button>
        </div>
      </div>

      {subtitles.length === 0 ? (
        <div className="py-8 text-center text-xs text-white/45 border border-white/10 rounded-xl bg-[#050505]/20">
          Hãy nạp đầy đủ file phụ đề SRT và hình ảnh để bắt đầu bóc tách khớp khối
        </div>
      ) : (
        <>
          {aiError && (
            <div className="mb-4 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl flex items-center justify-between text-xs text-rose-300">
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{aiError}</span>
              </div>
              <button onClick={() => setAiError(null)} className="text-rose-400 hover:text-rose-200 cursor-pointer">
                <X size={14} />
              </button>
            </div>
          )}
          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2.5 mb-5 text-center">
            <div className="bg-[#050505]/40 rounded-xl p-2.5 border border-white/10">
              <span className="text-[10px] text-white/40 block font-medium">Tổng câu Sub</span>
              <span className="text-sm font-bold text-white font-mono mt-0.5 block">{subtitles.length}</span>
            </div>
            <div className="bg-[#050505]/40 rounded-xl p-2.5 border border-white/10">
              <span className="text-[10px] text-blue-400 block font-medium">Khớp Từ Khóa</span>
              <span className="text-sm font-bold text-blue-400 font-mono mt-0.5 block">{matchedCount}</span>
            </div>
            <div className="bg-[#050505]/40 rounded-xl p-2.5 border border-white/10">
              <span className="text-[10px] text-amber-400 block font-medium">Không Khớp (Ngẫu Nhiên)</span>
              <span className="text-sm font-bold text-amber-400 font-mono mt-0.5 block">{unmatchedCount}</span>
            </div>
          </div>

          {/* Filtering tabs and search bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex bg-[#050505] p-1 rounded-lg border border-white/10 text-xs text-white/40">
              <button
                onClick={() => setActiveFilter('all')}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  activeFilter === 'all' ? 'bg-[#111114] text-white font-semibold border border-white/5' : 'hover:text-white'
                }`}
              >
                Tất cả ({subtitles.length})
              </button>
              <button
                onClick={() => setActiveFilter('matched')}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  activeFilter === 'matched' ? 'bg-[#111114] text-white font-semibold border border-white/5' : 'hover:text-white'
                }`}
              >
                Đã Khớp Từ Khóa ({matchedCount})
              </button>
              <button
                onClick={() => setActiveFilter('unmatched')}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  activeFilter === 'unmatched' ? 'bg-[#111114] text-white font-semibold border border-white/5' : 'hover:text-white'
                }`}
              >
                Dự Phòng ({unmatchedCount})
              </button>
            </div>

            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-white/40">
                <Search size={13} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Lọc dòng sub..."
                className="w-full sm:w-48 pl-8 pr-3 py-1.5 text-xs bg-[#050505] border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          {/* Table representing all synced elements */}
          <div className="border border-white/10 rounded-xl overflow-hidden max-h-[600px] overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs text-white/90">
              <thead className="bg-[#050505] text-white/50 uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 font-medium border-none w-[12%]">STT &amp; Thời gian</th>
                  <th className="px-4 py-3 font-medium border-none w-[20%]">Từ khóa được chọn</th>
                  <th className="px-4 py-3 font-medium border-none w-[35%]">Nội dung phụ đề</th>
                  <th className="px-4 py-3 font-medium border-none w-[25%]">Ghép Cảnh Phân Chia (640x720)</th>
                  <th className="px-4 py-3 font-medium text-right border-none w-[8%]">Căn chỉnh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 bg-[#050505]/20">
                {filteredBlocks.map((block) => {
                  const leftImg = getLeftImage(block);
                  const rightImg = getRightImage(block);
                  return (
                    <tr key={block.id} className="hover:bg-white/5 transition-all group">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono text-white/50 flex items-center gap-2">
                          <span className="text-white/30 font-bold">#{block.id}</span>
                          <span className="bg-white/5 px-2 py-0.5 rounded text-[10px] border border-white/5 text-blue-400">
                            {formatSecs(block.startTime)}
                          </span>
                        </div>
                        <div className="text-[10px] text-white/30 font-mono mt-0.5">
                          Độ dài: {(block.endTime - block.startTime).toFixed(1)}s
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5 max-w-[140px]">
                          {(() => {
                            const matchedKws = Array.from(new Set([
                              block.matchedLeftKeyword,
                              block.matchedRightKeyword,
                              ...(block.matchedKeywordsList || [])
                            ].filter(Boolean) as string[]));

                            if (matchedKws.length > 0) {
                              return (
                                <>
                                  <div className="flex flex-wrap gap-1">
                                    {matchedKws.slice(0, 3).map((kw) => {
                                      const charImg = images.find(img => 
                                        img.keywords?.some(k => k.toLowerCase() === kw.toLowerCase()) ||
                                        (img.characterName && img.characterName.toLowerCase() === kw.toLowerCase())
                                      );
                                      const isInSub = block.text.toLowerCase().includes(kw.toLowerCase());
                                      return (
                                        <div key={kw} className={`flex items-center gap-1.5 hover:bg-[#201507] group/tag border rounded px-1.5 py-1 select-none text-[10px] ${isInSub ? 'bg-[#1A1105]/60 border-[#FBBF24]/20' : 'bg-rose-500/10 border-rose-500/30'}`} title={isInSub ? kw : `Từ khóa kế thừa: ${kw}`}>
                                          {charImg ? (
                                            <img
                                              src={charImg.url}
                                              alt={kw}
                                              className="w-5 h-6 object-cover rounded border border-white/10 shrink-0"
                                              referrerPolicy="no-referrer"
                                            />
                                          ) : (
                                            <div className="w-5 h-6 bg-yellow-500/10 text-yellow-500/60 font-mono text-[9px] rounded flex items-center justify-center border border-yellow-500/10 shrink-0">
                                              ?
                                            </div>
                                          )}
                                          <span className={`${isInSub ? 'text-yellow-400' : 'text-rose-400'} font-bold truncate max-w-[70px] flex items-center`}>
                                            {!isInSub && <span className="text-rose-500 font-extrabold mr-1 animate-pulse" title="Từ khóa kế thừa / không chứa trực tiếp trong văn bản">!</span>}
                                            {kw}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {block.isAiPredicted && (
                                    <span className="text-[8px] font-sans font-semibold text-amber-400/90 flex items-center gap-1 leading-tight" title={block.aiExplanation}>
                                      🧠 AI Dự Đoán Gợi Ý
                                    </span>
                                  )}
                                </>
                              );
                            } else {
                              return <span className="text-[10px] text-white/30 italic">Không khớp</span>;
                            }
                          })()}
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <p className="font-sans text-sm text-white font-semibold leading-relaxed pr-4">
                          {(() => {
                            const matchedKws = Array.from(new Set([
                              block.matchedLeftKeyword,
                              block.matchedRightKeyword,
                              ...(block.matchedKeywordsList || [])
                            ].filter(Boolean) as string[]));
                            return renderHighlightedText(block.text, matchedKws);
                          })()}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {(() => {
                            const blockImages = getMatchedImages(block);
                            const mode = config?.singleKeywordMode || 'pair';
                            const isSingleKwBlock = (() => {
                              const kws = Array.from(new Set([
                                block.matchedLeftKeyword,
                                block.matchedRightKeyword,
                                ...(block.matchedKeywordsList || [])
                              ].filter(Boolean) as string[]));
                              return kws.length <= 1;
                            })();
                            const shouldPair = mode !== 'no_split' && (!isSingleKwBlock || checkShouldPairForKw(block.id));

                            if (blockImages.length === 0) {
                              return (
                                <div className="flex gap-2">
                                  {shouldPair ? (
                                    <>
                                      <button
                                        onClick={() => {
                                          setSelectorPosition('left');
                                          setSelectedBlockId(block.id);
                                        }}
                                        className="cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/5 transition-all flex items-center gap-1 border border-dashed border-white/10 bg-[#050505]/40 p-1.5 px-2.5 rounded-lg text-[9px] text-white/50 active:scale-95 font-semibold"
                                      >
                                        + Chọn Trái
                                      </button>
                                      <button
                                        onClick={() => {
                                          setSelectorPosition('right');
                                          setSelectedBlockId(block.id);
                                        }}
                                        className="cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all flex items-center gap-1 border border-dashed border-white/10 bg-[#050505]/40 p-1.5 px-2.5 rounded-lg text-[9px] text-white/50 active:scale-95 font-semibold"
                                      >
                                        + Chọn Phải
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setSelectorPosition('left');
                                        setSelectedBlockId(block.id);
                                      }}
                                      className="cursor-pointer hover:border-blue-500/40 hover:bg-blue-500/5 transition-all flex items-center gap-1 border border-dashed border-white/10 bg-[#050505]/40 p-1.5 px-2.5 rounded-lg text-[9px] text-white/50 active:scale-95 font-semibold"
                                    >
                                      + Chọn ảnh nhân vật
                                    </button>
                                  )}
                                </div>
                              );
                            }
                            return blockImages.map((img, idx) => {
                              let label = `CỘT ${idx + 1}`;
                              let labelClass = 'text-amber-400 font-bold font-mono';
                              if (blockImages.length === 1) {
                                label = 'ẢNH ĐƠN';
                                labelClass = 'text-blue-400 font-bold font-mono';
                              } else if (blockImages.length === 2) {
                                label = idx === 0 ? 'BÊN TRÁI' : 'BÊN PHẢI';
                                labelClass = idx === 0 ? 'text-blue-400 font-bold font-mono' : 'text-emerald-450 font-bold font-mono';
                              } else if (blockImages.length === 3) {
                                label = idx === 0 ? 'BÊN TRÁI' : idx === 1 ? 'Ở GIỮA' : 'BÊN PHẢI';
                                labelClass = idx === 0 ? 'text-blue-400 font-bold font-mono' : idx === 1 ? 'text-amber-400 font-bold font-mono' : 'text-emerald-450 font-bold font-mono';
                              }

                              return (
                                <button
                                  key={`${img.id}-${idx}`}
                                  onClick={() => {
                                    setSelectorPosition(idx === 0 ? 'left' : 'right');
                                    setSelectedBlockId(block.id);
                                  }}
                                  className="flex items-center gap-2 border border-white/10 bg-[#050505]/60 hover:bg-[#0c0c0e] hover:border-blue-500/50 p-1.5 rounded-lg flex-1 min-w-[110px] max-w-[150px] cursor-pointer text-left transition-all active:scale-[0.98]"
                                  title={blockImages.length === 1 ? 'Bấm để đổi ảnh' : `Bấm để đổi ảnh cho bên ${idx === 0 ? 'TRÁI' : 'PHẢI'}`}
                                >
                                  <img
                                    src={img.url}
                                    alt={label}
                                    className="w-10 h-12 object-cover rounded border border-white/10 bg-black shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="text-[9px] min-w-0 leading-tight">
                                    <span className={labelClass}>{label}</span>
                                    <p className="text-white/50 truncate mt-0.5 font-medium" title={img.name}>
                                      {img.name}
                                    </p>
                                  </div>
                                </button>
                              );
                            });
                          })()}
                        </div>

                        {/* Keyword metadata lines */}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {block.matchedLeftKeyword && (
                            <span className="text-[8px] font-mono text-blue-450 bg-blue-500/10 border border-blue-500/15 px-1.5 rounded">
                              L: {block.matchedLeftKeyword}
                            </span>
                          )}
                          {block.matchedRightKeyword && (
                            <span className="text-[8px] font-mono text-emerald-450 bg-emerald-500/10 border border-emerald-500/15 px-1.5 rounded">
                              R: {block.matchedRightKeyword}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              if (onPreviewTimeSelect) {
                                onPreviewTimeSelect(block.startTime);
                              }
                              setTryPreviewBlock(block);
                            }}
                            className="p-1 px-3 text-[10px] text-white hover:text-white bg-blue-600 hover:bg-blue-500 rounded border border-blue-500/30 transition-colors flex items-center gap-1 font-bold shadow cursor-pointer"
                            title="Xem thử ghép cảnh & phụ đề"
                          >
                            <Play size={10} fill="currentColor" /> Thử
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredBlocks.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-white/40 font-sans text-xs">
                      Không tìm thấy phụ đề nào trùng khớp với tiêu chí tìm kiếm
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Manual Choice Overlay Modal Box */}
      {selectedBlockId !== null && currentBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" id="manual-image-modal">
          <div className="bg-[#0E0E11] border border-white/10 rounded-2xl w-full max-w-xl flex flex-col max-h-[85vh] shadow-2xl">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                  Chọn ảnh <span className={selectorPosition === 'left' ? 'text-blue-400' : 'text-emerald-400 font-bold'}>{selectorPosition === 'left' ? 'BÊN TRÁI (L)' : 'BÊN PHẢI (R)'}</span> cho câu Sub #{currentBlock.id}
                </h3>
                <p className="text-xs text-white/40 mt-1 line-clamp-1 max-w-[420px]">
                  Phụ đề: "{currentBlock.text}"
                </p>
              </div>
              <button
                onClick={() => setSelectedBlockId(null)}
                className="p-1.5 text-white/55 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 bg-[#050505]/40 border-b border-white/10 flex gap-2">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-white/40">
                  <Search size={13} />
                </span>
                <input
                  type="text"
                  value={imageSelectorSearch}
                  onChange={(e) => setImageSelectorSearch(e.target.value)}
                  placeholder="Lọc ảnh theo từ khóa hoặc tên file..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#050505] border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              {imageSelectorSearch && (
                <button
                  onClick={() => setImageSelectorSearch('')}
                  className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/5"
                >
                  Xóa
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
              {filteredSelectorImages.map((img) => {
                const isSelected = selectorPosition === 'left' 
                  ? currentBlock.matchedLeftImageId === img.id
                  : currentBlock.matchedRightImageId === img.id;
                return (
                  <button
                    key={img.id}
                    onClick={() => handleManualImageSelect(currentBlock.id, img.id)}
                    className={`group relative text-left rounded-xl overflow-hidden border aspect-[64/72] transition-all flex flex-col ${
                      isSelected
                        ? 'border-blue-500 ring-2 ring-blue-500/20 ring-offset-2 ring-offset-black shadow-md'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full h-full object-cover flex-1"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-1.5">
                      <p className="text-[9px] text-white/70 font-mono truncate">
                        {img.name}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 bg-blue-500 text-white p-0.5 rounded-full">
                        <CheckCircle size={10} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
              {filteredSelectorImages.length === 0 && (
                <div className="col-span-full text-center py-12 text-white/40 text-xs">
                  Không tìm thấy ảnh nhân vật nào phù hợp với từ khóa lọc
                </div>
              )}
            </div>

             <div className="p-4 border-t border-white/10 bg-[#050505]/20 text-right flex items-center justify-between text-xs text-white/40">
              <span>Đang hiển thị {filteredSelectorImages.length} bức ảnh</span>
              <button
                onClick={() => setSelectedBlockId(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/5 rounded-lg transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Try Preview Mode Dynamic Overlay */}
      {tryPreviewBlock !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md" id="try-preview-modal">
          <div className="bg-[#0E0E11] border border-white/10 rounded-2xl w-full max-w-3xl flex flex-col max-h-[90vh] shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                  Xem Thử Ghép Cảnh - Câu Sub #{tryPreviewBlock.id}
                </h3>
                <p className="text-xs text-white/40 mt-1">
                  Mốc thoại: {(tryPreviewBlock.endTime - tryPreviewBlock.startTime).toFixed(1)} giây ({formatSecs(tryPreviewBlock.startTime)} - {formatSecs(tryPreviewBlock.endTime)})
                </p>
              </div>
              <button
                onClick={() => setTryPreviewBlock(null)}
                className="p-1.5 text-white/55 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center justify-center bg-[#070709]/55 overflow-y-auto">
              {/* Scale proportionate 16:9 box simulating video renderer output */}
              <div className="w-full aspect-video bg-[#000000] border border-white/15 rounded-xl relative overflow-hidden shadow-2xl max-w-2xl">
                {(() => {
                  const blockImages = getMatchedImages(tryPreviewBlock);
                  if (blockImages.length === 0) {
                    return (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20 select-none">
                        <ImageIcon size={48} strokeWidth={1} className="mb-2" />
                        <span className="text-xs font-sans">Chưa liên kết ảnh nhân vật cho câu này</span>
                      </div>
                    );
                  }
                  
                  const numCols = blockImages.length;
                  return (
                    <div className="absolute inset-0 flex">
                      {blockImages.map((img, colIndex) => {
                        let shouldFlip = false;
                        if (numCols === 2) {
                          if (colIndex === 1) shouldFlip = true;
                        } else if (numCols === 3) {
                          if (colIndex === 2) {
                            shouldFlip = true;
                          } else if (colIndex === 1) {
                            shouldFlip = (tryPreviewBlock.id % 2 === 0);
                          }
                        } else if (numCols === 4) {
                          if (colIndex === 2 || colIndex === 3) {
                            shouldFlip = true;
                          }
                        } else if (numCols > 4) {
                          const half = Math.floor(numCols / 2);
                          if (colIndex >= numCols - half) {
                            shouldFlip = true;
                          }
                        }

                        if (numCols === 1) {
                          return (
                            <div 
                              key={`${img.id}-${colIndex}`} 
                              className="h-full w-full relative overflow-hidden"
                              style={{ width: '100%' }}
                            >
                              <img 
                                src={img.url}
                                alt="back-blurred"
                                className={`absolute inset-0 w-full h-full object-cover blur-xl opacity-40 select-none ${shouldFlip ? 'scale-x-[-1]' : ''}`}
                                referrerPolicy="no-referrer"
                              />
                              <img 
                                src={img.url}
                                alt={img.name}
                                className={`w-full h-full object-contain relative z-10 select-none ${shouldFlip ? 'scale-x-[-1]' : ''}`}
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute top-2 left-2 z-20 bg-black/75 px-2 py-0.5 rounded text-[8px] font-mono text-white/60 border border-white/5 uppercase select-none">
                                {img.characterName || 'Chưa đặt tên'} (ĐƠN)
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div 
                            key={`${img.id}-${colIndex}`} 
                            className="h-full relative overflow-hidden border-r border-white/5 last:border-r-0"
                            style={{ width: `${100 / numCols}%` }}
                          >
                            <img 
                              src={img.url}
                              alt={img.name}
                              className={`w-full h-full object-cover select-none ${shouldFlip ? 'scale-x-[-1]' : ''}`}
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute top-2 left-2 bg-black/75 px-2 py-0.5 rounded text-[8px] font-mono text-white/60 border border-white/5 uppercase select-none">
                              {colIndex === 0 && numCols === 2 ? 'L: ' : (colIndex === 1 && numCols === 2 ? 'R: ' : '')}{img.characterName || 'Chưa đặt tên'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Subtitle simulation Overlay matching formatting strictly */}
                <div className="absolute inset-x-4 bottom-8 flex flex-col items-center select-none pointer-events-none">
                  <p 
                    className="px-4 py-1.5 text-center text-white"
                    style={{
                      fontFamily: '"Josefin Sans", sans-serif',
                      fontSize: '22px', // scaled proportionally for beautiful preview aspect aspect ration
                      fontWeight: '700',
                      textShadow: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000',
                      lineHeight: '1.2'
                    }}
                  >
                    {(() => {
                      const words = tryPreviewBlock.text.split(' ');
                      const matchedKws = Array.from(new Set([
                        tryPreviewBlock.matchedLeftKeyword,
                        tryPreviewBlock.matchedRightKeyword,
                        ...(tryPreviewBlock.matchedKeywordsList || [])
                      ].filter(Boolean) as string[]));

                      const lowerKws = matchedKws.map(k => k.toLowerCase());

                      return words.map((w, idx) => {
                        let cleaned = w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").toLowerCase();
                        const isKeyword = lowerKws.includes(cleaned);
                        return (
                          <span 
                            key={idx} 
                            className={isKeyword ? "text-[#EAB308]" : "text-white"}
                            style={isKeyword ? { color: '#EAB308' } : undefined}
                          >
                            {w}{' '}
                          </span>
                        );
                      });
                    })()}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-white/10 flex items-center justify-between text-xs text-white/40 bg-[#050507]">
              <div className="flex gap-2 text-[10px]">
                <span>Phân giải ghép cảnh: <strong className="text-white">640x720</strong> mỗi cột</span>
                <span>•</span>
                <span>Font mặc định: <strong className="text-white">Josefin Sans</strong> (40px)</span>
                <span>•</span>
                <span>Bo viền: <strong className="text-white">Mỏng (1.5px)</strong></span>
              </div>
              <button
                onClick={() => setTryPreviewBlock(null)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
