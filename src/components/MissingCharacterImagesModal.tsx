import React, { useState } from 'react';
import { Sparkles, Upload, X, CheckCircle2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { CharacterImage } from '../types';

interface MissingCharInfo {
  characterName: string;
  matchedKeywords: string[];
}

interface MissingCharacterImagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  missingCharacters: MissingCharInfo[];
  onImagesAdded: (newImages: CharacterImage[], skipRemap?: boolean) => void;
  allImages: CharacterImage[];
}

// Resizer and optimizer helper - preserves original size while compressing
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

const extractKeywords = (fileName: string, relativePath?: string): string[] => {
  const parts = [
    fileName.replace(/\.[^/.]+$/, ""), // remove extension
    ...(relativePath ? relativePath.split('/') : [])
  ];
  const combined = parts.join(' ').toLowerCase();
  const rawWords = combined.split(/[^a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]+/);
  return Array.from(new Set(rawWords.filter(w => w.length >= 2)));
};

export default function MissingCharacterImagesModal({
  isOpen,
  onClose,
  missingCharacters,
  onImagesAdded,
  allImages
}: MissingCharacterImagesModalProps) {
  const [uploadingChar, setUploadingChar] = useState<string | null>(null);
  const [successUploaded, setSuccessUploaded] = useState<Record<string, number>>({});

  if (!isOpen) return null;

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>, charName: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingChar(charName);
    const acceptedFiles: File[] = [];
    const imageRegex = /\.(png|jpe?g|webp|gif|bmp)$/i;

    for (let i = 0; i < files.length; i++) {
      if (imageRegex.test(files[i].name)) {
        acceptedFiles.push(files[i]);
      }
    }

    if (acceptedFiles.length === 0) {
      setUploadingChar(null);
      e.target.value = '';
      return;
    }

    const loaded: CharacterImage[] = [];

    try {
      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        const path = file.webkitRelativePath || file.name;
        const keywords = extractKeywords(file.name, path);
        const id = `img_missing_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`;

        // Optimize and compress
        const { blob, url } = await compressAndResizeImage(file);
        const compressedFile = new File([blob], file.name, { type: 'image/jpeg' });

        const customKeywords = new Set([...keywords]);
        charName.split(/\s+/).forEach(word => {
          if (word.length >= 2) customKeywords.add(word);
        });

        loaded.push({
          id,
          name: file.name,
          path,
          url,
          file: compressedFile,
          keywords: Array.from(customKeywords),
          characterName: charName
        });
      }

      if (loaded.length > 0) {
        // Automatically save to IndexedDB and state via the onImagesAdded callback
        // We set skipRemap to true during individual uploads so the screen doesn't jitter, 
        // we will trigger remap when they click done or finished.
        onImagesAdded(loaded, true);
        
        setSuccessUploaded(prev => ({
          ...prev,
          [charName]: (prev[charName] || 0) + loaded.length
        }));
      }
    } catch (err) {
      console.error("Lỗi khi tải ảnh lên:", err);
    } finally {
      setUploadingChar(null);
      e.target.value = '';
    }
  };

  // Get current state count of images for a character
  const getCharacterImageCount = (charName: string) => {
    return allImages.filter(img => img.characterName === charName).length;
  };

  // Dynamically filter active missing characters (having 0 images)
  const activeMissingCharacters = missingCharacters.filter(
    (char) => getCharacterImageCount(char.characterName) === 0
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div 
        className="w-full max-w-4xl bg-[#0E0E12] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl animate-in scale-in duration-200"
        id="missing-char-images-dialog"
      >
        {/* Header */}
        <div className="p-8 border-b border-white/5 flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-amber-400">
              <Sparkles className="animate-pulse" size={24} />
              <h2 className="text-lg md:text-xl font-black text-white uppercase tracking-wider">
                Thiếu ảnh {activeMissingCharacters.length} nhân vật bổ trợ
              </h2>
            </div>
            <p className="text-xs md:text-sm text-white/60 leading-relaxed max-w-2xl">
              Phát hiện tên nhân vật có trong phụ đề kịch bản <code className="bg-slate-900 px-1.5 py-1 rounded text-white font-mono text-xs">.srt</code> tương thích với Danh bạ nhưng chưa có ảnh hoặc thiếu ảnh. Vui lòng bổ sung để AI ghép cảnh thông minh.
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 px-3 border border-white/10 bg-zinc-900/50 hover:bg-zinc-800 text-white/70 hover:text-white rounded-lg transition-all text-xs md:text-sm font-medium"
          >
            Đóng
          </button>
        </div>

        {/* Missing Characters List */}
        <div className="p-8 overflow-y-auto max-h-[55vh] space-y-6">
          {activeMissingCharacters.length > 0 ? (
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-white/40 text-xs uppercase font-bold tracking-wider">
                  <th className="py-3 px-4">Tên Nhân Vật ({activeMissingCharacters.length})</th>
                  <th className="py-3 px-4">Từ khóa đã khớp</th>
                  <th className="py-3 px-4 text-center">Đã nạp</th>
                  <th className="py-3 px-4 text-right">Tải ảnh lên</th>
                </tr>
              </thead>
              <tbody>
                {activeMissingCharacters.map((char) => {
                  const imgCount = getCharacterImageCount(char.characterName);
                  const hasUploadedSome = imgCount > 0;
                  
                  return (
                    <tr 
                      key={char.characterName} 
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group"
                    >
                      <td className="py-4 px-4 font-bold text-white/95 text-base">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                          {char.characterName}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1.5 matches-list">
                          {char.matchedKeywords.map(kw => (
                            <span 
                              key={kw} 
                              className="bg-white/5 border border-white/10 text-slate-200 text-xs px-2.5 py-1 rounded-md font-medium"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        {hasUploadedSome ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 size={12} />
                            <span>{imgCount} ảnh</span>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-400 font-bold bg-amber-500/5 border border-amber-500/10 px-3 py-1 rounded-full">
                            0 ảnh (Trống)
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <label 
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs md:text-sm font-black transition-all shadow-md cursor-pointer select-none ${
                            uploadingChar === char.characterName 
                              ? 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed pointer-events-none' 
                              : hasUploadedSome
                              ? 'bg-zinc-900 border-emerald-500/30 hover:border-emerald-500 hover:bg-zinc-850 text-emerald-400 hover:text-emerald-300'
                              : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/40 hover:border-amber-400 text-amber-300 hover:text-amber-200'
                          }`}
                        >
                          {uploadingChar === char.characterName ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              <span>Đang tối ưu...</span>
                            </>
                          ) : (
                            <>
                              <Upload size={14} />
                              <span>+ Chọn ảnh</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => handleFilesSelected(e, char.characterName)}
                            className="hidden"
                            disabled={uploadingChar !== null}
                          />
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-4 animate-in fade-in duration-300">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 animate-bounce">
                <CheckCircle2 size={32} />
              </div>
              <div className="space-y-1">
                <p className="text-base font-bold text-white">Đã nạp đủ dữ liệu ảnh!</p>
                <p className="text-sm text-white/50">Tất cả nhân vật trong kịch bản đều đã được bổ sung đầy đủ ảnh.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Area with actionable triggers */}
        <div className="p-8 bg-[#111114] border-t border-white/5 flex items-center justify-between">
          <div className="text-xs text-white/40 font-mono">
            * Sau khi tải lên, ảnh mới sẽ được tự động tích hợp vào KHO ẢNH gốc của bạn.
          </div>
          <button
            onClick={onClose}
            className="px-8 py-3 rounded-xl text-xs md:text-sm bg-blue-600 hover:bg-blue-500 text-white font-black transition-transform active:scale-[0.98] shadow-lg shadow-blue-500/20"
          >
            Xác nhận & Hoàn tất
          </button>
        </div>
      </div>
    </div>
  );
}
