/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubtitleBlock, CharacterImage, RenderConfig, SubtitlePreset } from '../types';

/**
 * Helper to pre-load a browser Object URL into an HTMLImageElement
 */
export function preloadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Failed to load image: ' + url));
    img.src = url;
  });
}


/**
 * A highly robust, uniform, 100% deterministic 32-bit seeded PRNG (Mulberry32)
 * derived from a MurmurHash3 seed hash. This eliminates correlation and sinusoidal
 * bias artifacts common to Math.sin() and guarantees smooth, distributed random selections.
 */
export function createSeededRandom(seedStr: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  if (h === 0) h = 1;

  return () => {
    let z = (h += 0x6D2B79F5) >>> 0;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Identify and extract date/time patterns from text
 */
export function getHighlightCustomText(text: string, config: RenderConfig): string | null {
  if (config.testHighlightText) {
    return 'KATIE';
  }
  if (!text) return null;

  const matches: string[] = [];

  // Date matching is now handled by the Behavior No.11 (Calendar) as requested.
  // We strictly highlight only capslock words here (minimum of 4 characters as requested).
  if (config.highlightTextModeCaps) {
    const capsRegex = /\b[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐĨŨƠẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲÝỴỶỸ]{4,}(?:\s+[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐĨŨƠẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲÝỴỶỸ]{4,})*\b/g;
    let match;
    while ((match = capsRegex.exec(text)) !== null) {
      const matchedString = match[0];
      const isSubOfExisting = matches.some(m => m.toLowerCase().includes(matchedString.toLowerCase()));
      if (!isSubOfExisting) {
        matches.push(matchedString);
      }
    }
  }

  if (matches.length > 0) {
    return matches[0];
  }
  return null;
}

/**
 * Identify and extract date/time patterns from text
 */
export function getHighlightDateText(text: string): string | null {
  return getHighlightCustomText(text, {
    enableHighlightDate: true,
    highlightTextModeDate: true,
    highlightTextModeCaps: false
  } as any);
}

/**
 * Helper to get a stable, pseudo-random transition type for an image pair
 */
function getDeterministicTransitionType(
  prevImgSrc: string, 
  activeImgSrc: string
): 'fade' | 'zoom' | 'slide' | 'slide_left' | 'slide_right' | 'slide_up' | 'slide_down' | 'zoom_fade' | 'wipe_left' | 'wipe_right' | 'wipe_up' | 'wipe_down' | 'rotate_fade' | 'curtain_open' | 'curtain_close' | 'grid_dissolve' | 'ripple_fade' | 'cross_zoom' {
  const combined = prevImgSrc + activeImgSrc;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % 17;
  const types = [
    'fade', 'zoom', 'slide_left', 'slide_right', 'slide_up', 'slide_down', 'zoom_fade',
    'wipe_left', 'wipe_right', 'wipe_up', 'wipe_down',
    'rotate_fade', 'curtain_open', 'curtain_close', 'grid_dissolve', 'ripple_fade', 'cross_zoom'
  ] as const;
  return types[index];
}

/**
 * Helper to get a stable, pseudo-random image motion effect per slide/block
 */
function getDeterministicImageEffect(imgSrc: string, colIndex: number): string {
  const combined = imgSrc + colIndex;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash << 5) - hash + combined.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % 14;
  const effects = [
    'zoom_in', 'zoom_out', 
    'pan_left', 'pan_right', 'pan_up', 'pan_down', 
    'pan_up_left', 'pan_up_right', 'pan_down_left', 'pan_down_right',
    'rotate_slow_cw', 'rotate_slow_ccw',
    'zoom_pulse', 'shiver'
  ];
  return effects[index];
}

/**
 * Draws one vertical column element of the split-screen layout on the canvas
 */
const drawColumnFrame = (
  ctx: CanvasRenderingContext2D,
  colIndex: number,
  totalCols: number,
  width: number,
  height: number,
  activeImg: HTMLImageElement | null,
  prevImg: HTMLImageElement | null,
  activeBlock: SubtitleBlock | null,
  prevBlock: SubtitleBlock | null,
  isTransitioning: boolean,
  transitionProgress: number,
  config: RenderConfig,
  time: number,
  images: CharacterImage[],
  imageCache: Map<string, HTMLImageElement>,
  shouldFlip: boolean
) => {
  const colWidth = width / totalCols;
  const startX = colIndex * colWidth;

  // Clip workspace coordinates so image animations never bleed onto other columns
  ctx.save();
  ctx.beginPath();
  ctx.rect(startX, 0, colWidth, height);
  ctx.clip();

  const drawImageOnCol = (
    img: HTMLImageElement,
    alpha: number,
    blockStartTime: number,
    blockEndTime: number,
    isPrev: boolean = false,
    transProgressValue: number = 1,
    activeTransType?: string
  ) => {
    ctx.save();
    ctx.globalAlpha = alpha;

    // Apply Transition Clipping Masks (at parent coordinates before translations)
    const currentTransType = activeTransType || config.transitionType;
    if (isTransitioning && currentTransType) {
      if (currentTransType === 'wipe_left' && !isPrev) {
        ctx.beginPath();
        ctx.rect(startX + colWidth * (1 - transProgressValue), 0, colWidth * transProgressValue, height);
        ctx.clip();
      } else if (currentTransType === 'wipe_right' && !isPrev) {
        ctx.beginPath();
        ctx.rect(startX, 0, colWidth * transProgressValue, height);
        ctx.clip();
      } else if (currentTransType === 'wipe_up' && !isPrev) {
        ctx.beginPath();
        ctx.rect(startX, height * (1 - transProgressValue), colWidth, height * transProgressValue);
        ctx.clip();
      } else if (currentTransType === 'wipe_down' && !isPrev) {
        ctx.beginPath();
        ctx.rect(startX, 0, colWidth, height * transProgressValue);
        ctx.clip();
      } else if (currentTransType === 'curtain_open' && isPrev) {
        ctx.beginPath();
        const half = colWidth / 2;
        ctx.rect(startX, 0, half * (1 - transProgressValue), height);
        ctx.rect(startX + half + half * transProgressValue, 0, half * (1 - transProgressValue), height);
        ctx.clip();
      } else if (currentTransType === 'curtain_close' && !isPrev) {
        ctx.beginPath();
        const half = colWidth / 2;
        ctx.rect(startX, 0, half * transProgressValue, height);
        ctx.rect(startX + colWidth - half * transProgressValue, 0, half * transProgressValue, height);
        ctx.clip();
      } else if (currentTransType === 'grid_dissolve' && !isPrev) {
        ctx.beginPath();
        const numStrips = 8;
        const stripWidth = colWidth / numStrips;
        for (let s = 0; s < numStrips; s++) {
          ctx.rect(startX + s * stripWidth, 0, stripWidth * transProgressValue, height);
        }
        ctx.clip();
      }
    }

    // Apply horizontal flip rule centering coordinates around the column center
    const centerX = startX + colWidth / 2;
    const centerY = height / 2;

    // Subtle motion and transition rotation calculations relative to column boundaries
    let scale = 1.05; // Marginally upscale to prevent edge-lines
    let dx = 0;
    let dy = 0;
    let rot = 0;

    let activeImgEffect = config.imageEffect || 'random';
    if (activeImgEffect === 'random') {
      activeImgEffect = getDeterministicImageEffect(img.src, colIndex) as any;
    }

    if (activeImgEffect !== 'none') {
      const blockDuration = blockEndTime - blockStartTime || 5;
      const elapsedTime = time - blockStartTime;
      const percent = Math.min(Math.max(elapsedTime / blockDuration, 0), 1);

      // t is continuous progress for the animation
      const t = isPrev ? (percent + 1) * 0.5 : percent * 0.5;

      switch (activeImgEffect) {
        case 'zoom_in':
          scale = 1.02 + 0.12 * t;
          break;
        case 'zoom_out':
          scale = 1.14 - 0.12 * t;
          break;
        case 'pan_left':
          scale = 1.10;
          dx = 15 - 30 * t;
          break;
        case 'pan_right':
          scale = 1.10;
          dx = -15 + 30 * t;
          break;
        case 'pan_up':
          scale = 1.10;
          dy = 15 - 30 * t;
          break;
        case 'pan_down':
          scale = 1.10;
          dy = -15 + 30 * t;
          break;
        case 'pan_up_left':
          scale = 1.12;
          dx = 12 - 24 * t;
          dy = 12 - 24 * t;
          break;
        case 'pan_up_right':
          scale = 1.12;
          dx = -12 + 24 * t;
          dy = 12 - 24 * t;
          break;
        case 'pan_down_left':
          scale = 1.12;
          dx = 12 - 24 * t;
          dy = -12 + 24 * t;
          break;
        case 'pan_down_right':
          scale = 1.12;
          dx = -12 + 24 * t;
          dy = -12 + 24 * t;
          break;
        case 'rotate_slow_cw':
          scale = 1.08;
          rot = 0.04 * t - 0.02;
          break;
        case 'rotate_slow_ccw':
          scale = 1.08;
          rot = -0.04 * t + 0.02;
          break;
        case 'zoom_pulse':
          const pulse = Math.sin(t * Math.PI * 4);
          scale = 1.06 + 0.04 * pulse;
          break;
        case 'shiver':
          scale = 1.08;
          dx = Math.sin(t * Math.PI * 40) * 1.5;
          dy = Math.cos(t * Math.PI * 35) * 1.5;
          break;
        default:
          scale = 1.05;
      }
    } else {
      // Fallback to enableKenBurns if imageEffect is none but enabled
      if (config.enableKenBurns) {
        const blockDuration = blockEndTime - blockStartTime || 5;
        const elapsedTime = time - blockStartTime;
        const percent = Math.min(Math.max(elapsedTime / blockDuration, 0), 1);
        if (isPrev) {
          scale = 1.05 + 0.04 * (1 - percent);
          dx = -4 * (1 - percent);
        } else {
          scale = 1.02 + 0.05 * percent;
          dy = 4 * percent;
        }
      } else {
        scale = 1.02;
      }
    }

    // Apply Transition Motion Overlays inside coordinates
    if (isTransitioning) {
      if (currentTransType === 'rotate_fade' && !isPrev) {
        rot += (1 - transProgressValue) * 0.4;
      } else if (currentTransType === 'ripple_fade' && !isPrev) {
        scale *= (1 + (1 - transProgressValue) * 0.15);
        rot += (1 - transProgressValue) * 0.12;
      } else if (currentTransType === 'cross_zoom') {
        if (isPrev) {
          scale *= (1.0 + transProgressValue * 0.3);
        } else {
          scale *= (0.7 + transProgressValue * 0.3);
        }
      }
    }

    ctx.translate(centerX, centerY);
    if (shouldFlip) {
      ctx.scale(-1, 1);
    }
    if (rot !== 0) {
      ctx.rotate(rot);
    }

    const iw = img.naturalWidth || 640;
    const ih = img.naturalHeight || 720;

    // Cover calculation inside colWidth x height
    const scaleX = colWidth / iw;
    const scaleY = height / ih;
    const baseScale = Math.max(scaleX, scaleY);

    const dw = iw * baseScale * scale;
    const dh = ih * baseScale * scale;

    // Drawing coordinates centered at 0, 0 of our Translated Context
    const drawX = -dw / 2 + dx;
    const drawY = -dh / 2 + dy;

    if (totalCols === 1) {
      // 1. Blurred background image
      ctx.save();
      // Apply canvas filter if supported in the rendering browser context
      if ('filter' in ctx) {
        ctx.filter = 'blur(16px)';
      }
      ctx.globalAlpha = alpha * 0.45;
      
      if (isTransitioning) {
        if (currentTransType === 'slide_left' && !isPrev) {
          const slideX = (1 - transProgressValue) * colWidth;
          ctx.drawImage(img, drawX + slideX, drawY, dw, dh);
        } else if (currentTransType === 'slide_right' && !isPrev) {
          const slideX = -(1 - transProgressValue) * colWidth;
          ctx.drawImage(img, drawX + slideX, drawY, dw, dh);
        } else if (currentTransType === 'slide_up' && !isPrev) {
          const slideY = (1 - transProgressValue) * height;
          ctx.drawImage(img, drawX, drawY + slideY, dw, dh);
        } else if (currentTransType === 'slide_down' && !isPrev) {
          const slideY = -(1 - transProgressValue) * height;
          ctx.drawImage(img, drawX, drawY + slideY, dw, dh);
        } else if (currentTransType === 'zoom' && !isPrev) {
          const zoomScale = 0.82 + 0.18 * transProgressValue;
          ctx.drawImage(img, drawX * zoomScale, drawY * zoomScale, dw * zoomScale, dh * zoomScale);
        } else if (currentTransType === 'zoom_fade' && !isPrev) {
          const zoomScale = 0.85 + 0.15 * transProgressValue;
          ctx.drawImage(img, drawX * zoomScale, drawY * zoomScale, dw * zoomScale, dh * zoomScale);
        } else {
          ctx.drawImage(img, drawX, drawY, dw, dh);
        }
      } else {
        ctx.drawImage(img, drawX, drawY, dw, dh);
      }
      ctx.restore();

      // 2. Sharp centered image containing and keeping ratio
      ctx.save();
      ctx.globalAlpha = alpha;
      
      const containScale = Math.min(colWidth / iw, height / ih) * (scale / 1.05);
      const cw = iw * containScale;
      const ch = ih * containScale;
      const cx = -cw / 2 + dx;
      const cy = -ch / 2 + dy;

      if (isTransitioning) {
        if (currentTransType === 'slide_left' && !isPrev) {
          const slideX = (1 - transProgressValue) * colWidth;
          ctx.drawImage(img, cx + slideX, cy, cw, ch);
        } else if (currentTransType === 'slide_right' && !isPrev) {
          const slideX = -(1 - transProgressValue) * colWidth;
          ctx.drawImage(img, cx + slideX, cy, cw, ch);
        } else if (currentTransType === 'slide_up' && !isPrev) {
          const slideY = (1 - transProgressValue) * height;
          ctx.drawImage(img, cx, cy + slideY, cw, ch);
        } else if (currentTransType === 'slide_down' && !isPrev) {
          const slideY = -(1 - transProgressValue) * height;
          ctx.drawImage(img, cx, cy + slideY, cw, ch);
        } else if (currentTransType === 'zoom' && !isPrev) {
          const zoomScale = 0.82 + 0.18 * transProgressValue;
          ctx.drawImage(img, cx * zoomScale, cy * zoomScale, cw * zoomScale, ch * zoomScale);
        } else if (currentTransType === 'zoom_fade' && !isPrev) {
          const zoomScale = 0.85 + 0.15 * transProgressValue;
          ctx.drawImage(img, cx * zoomScale, cy * zoomScale, cw * zoomScale, ch * zoomScale);
        } else {
          ctx.drawImage(img, cx, cy, cw, ch);
        }
      } else {
        ctx.drawImage(img, cx, cy, cw, ch);
      }
      ctx.restore();
    } else {
      // Draw normal full cover crop in case of split layout (totalCols >= 2)
      if (isTransitioning) {
        if (currentTransType === 'slide') {
          const slideX = (1 - transProgressValue) * colWidth * (colIndex % 2 === 0 ? -1 : 1);
          ctx.drawImage(img, drawX + slideX, drawY, dw, dh);
        } else if (currentTransType === 'slide_left' && !isPrev) {
          const slideX = (1 - transProgressValue) * colWidth;
          ctx.drawImage(img, drawX + slideX, drawY, dw, dh);
        } else if (currentTransType === 'slide_right' && !isPrev) {
          const slideX = -(1 - transProgressValue) * colWidth;
          ctx.drawImage(img, drawX + slideX, drawY, dw, dh);
        } else if (currentTransType === 'slide_up' && !isPrev) {
          const slideY = (1 - transProgressValue) * height;
          ctx.drawImage(img, drawX, drawY + slideY, dw, dh);
        } else if (currentTransType === 'slide_down' && !isPrev) {
          const slideY = -(1 - transProgressValue) * height;
          ctx.drawImage(img, drawX, drawY + slideY, dw, dh);
        } else if (currentTransType === 'zoom' && !isPrev) {
          const zoomScale = 0.82 + 0.18 * transProgressValue;
          const zw = dw * zoomScale;
          const zh = dh * zoomScale;
          const zx = -zw / 2;
          const zy = -zh / 2;
          ctx.drawImage(img, zx, zy, zw, zh);
        } else if (currentTransType === 'zoom_fade' && !isPrev) {
          const zoomScale = 0.85 + 0.15 * transProgressValue;
          const zw = dw * zoomScale;
          const zh = dh * zoomScale;
          const zx = -zw / 2;
          const zy = -zh / 2;
          ctx.drawImage(img, zx, zy, zw, zh);
        } else {
          ctx.drawImage(img, drawX, drawY, dw, dh);
        }
      } else {
        ctx.drawImage(img, drawX, drawY, dw, dh);
      }
    }

    ctx.restore();
  };

  let resolvedActive = activeImg;
  let resolvedPrev = prevImg;

  // General fallback to first assets if absolutely nothing matched
  if (!resolvedActive && !resolvedPrev && images.length > 0) {
    const fallbackIndex = Math.min(colIndex, images.length - 1);
    resolvedActive = imageCache.get(images[fallbackIndex].id) || null;
  }

  if (config.transitionType !== 'none' && isTransitioning && resolvedPrev && resolvedActive && resolvedPrev.src !== resolvedActive.src) {
    const chosenType = (config.transitionType === 'random_all') 
      ? getDeterministicTransitionType(resolvedPrev.src, resolvedActive.src) 
      : config.transitionType;

    if (chosenType === 'fade' || chosenType === 'zoom_fade' || chosenType === 'rotate_fade' || chosenType === 'ripple_fade') {
      drawImageOnCol(resolvedPrev, 1 - transitionProgress, prevBlock!.startTime, prevBlock!.endTime, true, 1.0, chosenType);
      drawImageOnCol(resolvedActive, transitionProgress, activeBlock!.startTime, activeBlock!.endTime, false, transitionProgress, chosenType);
    } else if (chosenType === 'slide' || chosenType === 'slide_left' || chosenType === 'slide_right' || chosenType === 'slide_up' || chosenType === 'slide_down') {
      drawImageOnCol(resolvedPrev, 1.0, prevBlock!.startTime, prevBlock!.endTime, true, 1.0, chosenType);
      drawImageOnCol(resolvedActive, 1.0, activeBlock!.startTime, activeBlock!.endTime, false, transitionProgress, chosenType);
    } else if (chosenType === 'zoom') {
      drawImageOnCol(resolvedPrev, 1 - transitionProgress, prevBlock!.startTime, prevBlock!.endTime, true, 1.0, chosenType);
      drawImageOnCol(resolvedActive, 1.0, activeBlock!.startTime, activeBlock!.endTime, false, transitionProgress, chosenType);
    } else if (chosenType === 'wipe_left' || chosenType === 'wipe_right' || chosenType === 'wipe_up' || chosenType === 'wipe_down' || chosenType === 'grid_dissolve' || chosenType === 'curtain_close') {
      drawImageOnCol(resolvedPrev, 1.0, prevBlock!.startTime, prevBlock!.endTime, true, 1.0, chosenType);
      drawImageOnCol(resolvedActive, 1.0, activeBlock!.startTime, activeBlock!.endTime, false, transitionProgress, chosenType);
    } else if (chosenType === 'curtain_open') {
      drawImageOnCol(resolvedActive, 1.0, activeBlock!.startTime, activeBlock!.endTime, false, 1.0, chosenType);
      drawImageOnCol(resolvedPrev, 1.0, prevBlock!.startTime, prevBlock!.endTime, true, transitionProgress, chosenType);
    } else if (chosenType === 'cross_zoom') {
      drawImageOnCol(resolvedPrev, 1 - transitionProgress, prevBlock!.startTime, prevBlock!.endTime, true, transitionProgress, chosenType);
      drawImageOnCol(resolvedActive, transitionProgress, activeBlock!.startTime, activeBlock!.endTime, false, transitionProgress, chosenType);
    } else {
      drawImageOnCol(resolvedActive, 1.0, activeBlock!.startTime, activeBlock!.endTime, false);
    }
  } else if (resolvedActive) {
    drawImageOnCol(resolvedActive, 1.0, activeBlock ? activeBlock.startTime : 0, activeBlock ? activeBlock.endTime : 5, false);
  } else if (resolvedPrev) {
    drawImageOnCol(resolvedPrev, 1.0, prevBlock ? prevBlock.startTime : 0, prevBlock ? prevBlock.endTime : 5, true);
  } else {
    // Solid background if no assets at all
    ctx.fillStyle = colIndex % 2 === 0 ? '#111827' : '#1F2937';
    ctx.fillRect(startX, 0, colWidth, height);
  }

  // Draw subtle split separator rule for columns (excluding the last one)
  if (colIndex < totalCols - 1) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX + colWidth, 0);
    ctx.lineTo(startX + colWidth, height);
    ctx.stroke();
  }

  ctx.restore();
};

/**
 * Draws an Intro or Outro screen on the canvas
 */
function drawIntroOutroScreen(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  title: string,
  subtitle: string,
  bgColor: string,
  textColor: string,
  imageId: string,
  imageCache: Map<string, HTMLImageElement>,
  screenType: 'intro' | 'outro',
  videoCache?: Map<string, HTMLVideoElement>,
  timeOffset = 0
) {
  let drewVideo = false;

  if (videoCache) {
    const video = videoCache.get(screenType);
    if (video) {
      try {
        ctx.drawImage(video, 0, 0, width, height);
        drewVideo = true;
      } catch (err) {
        console.warn("Could not draw video frame:", err);
      }
    }
  }

  if (!drewVideo) {
    let bgImg: HTMLImageElement | null = null;
    if (imageId && imageId !== 'none') {
      bgImg = imageCache.get(imageId) || null;
    }

    if (bgImg) {
      const iw = bgImg.naturalWidth || 640;
      const ih = bgImg.naturalHeight || 720;
      const scaleX = width / iw;
      const scaleY = height / ih;
      const baseScale = Math.max(scaleX, scaleY);
      const dw = iw * baseScale;
      const dh = ih * baseScale;
      const x = (width - dw) / 2;
      const y = (height - dh) / 2;
      ctx.drawImage(bgImg, x, y, dw, dh);
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }
  }
}

export function detectDateAndRangeInText(text: string): { startDay: number, endDay: number, month: number, year: number } | null {
  if (!text) return null;
  const t = text.trim();
  const lowerText = t.toLowerCase();

  const monthsEng = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const findEnglishMonth = (str: string): number => {
    for (let i = 0; i < monthsEng.length; i++) {
      if (str.includes(monthsEng[i])) {
        return (i % 12) + 1;
      }
    }
    return -1;
  };

  // 1. Dạng English Month range: "June 1 to June 19", "June 1 to 19", "June 8-12", "8-12 June"
  let mEng = findEnglishMonth(lowerText);
  if (mEng !== -1) {
    const rangeWordMatch = lowerText.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\s+(?:to|and|\-|đến)\s+(?:(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+)?(\d{1,2})/);
    if (rangeWordMatch) {
      const d1 = parseInt(rangeWordMatch[1], 10);
      const d2 = parseInt(rangeWordMatch[2], 10);
      const yMatch = t.match(/\b(202\d|203\d)\b/);
      const year = yMatch ? parseInt(yMatch[1], 10) : 2026;
      if (d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
        return { startDay: Math.min(d1, d2), endDay: Math.max(d1, d2), month: mEng, year };
      }
    }

    const hyphenMatch = lowerText.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
    if (hyphenMatch) {
      const d1 = parseInt(hyphenMatch[1], 10);
      const d2 = parseInt(hyphenMatch[2], 10);
      const yMatch = t.match(/\b(202\d|203\d)\b/);
      const year = yMatch ? parseInt(yMatch[1], 10) : 2026;
      if (d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
        return { startDay: Math.min(d1, d2), endDay: Math.max(d1, d2), month: mEng, year };
      }
    }

    const singleMatch = lowerText.match(/(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\b/);
    if (singleMatch) {
      const d = parseInt(singleMatch[1], 10);
      const yMatch = t.match(/\b(202\d|203\d)\b/);
      const year = yMatch ? parseInt(yMatch[1], 10) : 2026;
      if (d >= 1 && d <= 31) {
        return { startDay: d, endDay: d, month: mEng, year };
      }
    }

    const singleMatchReverse = lowerText.match(/\b(\d{1,2})\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/);
    if (singleMatchReverse) {
      const d = parseInt(singleMatchReverse[1], 10);
      const yMatch = t.match(/\b(202\d|203\d)\b/);
      const year = yMatch ? parseInt(yMatch[1], 10) : 2026;
      if (d >= 1 && d <= 31) {
        return { startDay: d, endDay: d, month: mEng, year };
      }
    }
  }

  // 2. Dạng Tiếng Việt range: "ngày 1 đến ngày 19 tháng 6", "ngày 8-12 tháng 6", "từ 8 đến 12 tháng 6"
  const vnRangeMatch = lowerText.match(/ngày\s+(\d{1,2})\s*(?:đến|-|to|and)\s*(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})/i);
  if (vnRangeMatch) {
    const d1 = parseInt(vnRangeMatch[1], 10);
    const d2 = parseInt(vnRangeMatch[2], 10);
    const m = parseInt(vnRangeMatch[3], 10);
    const yMatch = t.match(/năm\s+(\d{2,4})/i) || t.match(/\b(202\d|203\d)\b/);
    let year = 2026;
    if (yMatch) {
      const yVal = parseInt(yMatch[1], 10);
      year = yVal < 100 ? 2000 + yVal : yVal;
    }
    if (d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31 && m >= 1 && m <= 12) {
      return { startDay: Math.min(d1, d2), endDay: Math.max(d1, d2), month: m, year };
    }
  }

  const vnRangeNoPrefix = lowerText.match(/(?:từ|ngày)?\s*(\d{1,2})\s*(?:đến|-|-\s*>)\s*(\d{1,2})\s*tháng\s*(\d{1,2})/i);
  if (vnRangeNoPrefix) {
    const d1 = parseInt(vnRangeNoPrefix[1], 10);
    const d2 = parseInt(vnRangeNoPrefix[2], 10);
    const m = parseInt(vnRangeNoPrefix[3], 10);
    const yMatch = t.match(/năm\s+(\d{2,4})/i) || t.match(/\b(202\d|203\d)\b/);
    let year = 2026;
    if (yMatch) {
      const yVal = parseInt(yMatch[1], 10);
      year = yVal < 100 ? 2000 + yVal : yVal;
    }
    if (d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31 && m >= 1 && m <= 12) {
      return { startDay: Math.min(d1, d2), endDay: Math.max(d1, d2), month: m, year };
    }
  }

  const vnSingleMatch = lowerText.match(/ngày\s+(\d{1,2})(?:\s+tháng\s+(\d{1,2}))?(?:\s+năm\s+(\d{2,4}))?/i);
  if (vnSingleMatch) {
    const d = parseInt(vnSingleMatch[1], 10);
    const m = vnSingleMatch[2] ? parseInt(vnSingleMatch[2], 10) : 6;
    const y = vnSingleMatch[3] ? parseInt(vnSingleMatch[3], 10) : 2026;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return { startDay: d, endDay: d, month: m, year: y < 100 ? 2000 + y : y };
    }
  }

  // 3. Dạng số dd/mm - dd/mm or dd/mm/yyyy - dd/mm/yyyy
  const numericRangeMatch = lowerText.match(/\b(\d{1,2})[/\-.](\d{1,2})\s*(?:đến|-|and|to)\s*(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/);
  if (numericRangeMatch) {
    const d1 = parseInt(numericRangeMatch[1], 10);
    const m1 = parseInt(numericRangeMatch[2], 10);
    const d2 = parseInt(numericRangeMatch[3], 10);
    const m2 = parseInt(numericRangeMatch[4], 10);
    const y = numericRangeMatch[5] ? parseInt(numericRangeMatch[5], 10) : 2026;
    if (d1 >= 1 && d1 <= 31 && m1 >= 1 && m1 <= 12 && d2 >= 1 && d2 <= 31 && m2 >= 1 && m2 <= 12) {
      return { startDay: d1, endDay: d2, month: m1, year: y < 100 ? 2000 + y : y };
    }
  }

  const numericMatch = lowerText.match(/\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/);
  if (numericMatch) {
    const d = parseInt(numericMatch[1], 10);
    const m = parseInt(numericMatch[2], 10);
    const y = numericMatch[3] ? parseInt(numericMatch[3], 10) : 2026;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return { startDay: d, endDay: d, month: m, year: y < 100 ? 2000 + y : y };
    }
  }

  // 4. Các từ khóa thời gian nhạy cảm khác
  if (/ngày|tháng|năm|lịch|calendar|date|month|year|today|yesterday|tomorrow|timeline|deadline|thứ\s+[2-7]|thứ\s+hai|thứ\s+ba|thứ\s+tư|thứ\s+năm|thứ\s+sáu|thứ\s+bảy|chủ\s+nhật|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(t)) {
    let h = 0;
    for (let i = 0; i < t.length; i++) {
      h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
    }
    const d = (Math.abs(h) % 20) + 1;
    const rangeLen = (Math.abs(h >> 3) % 4);
    const d2 = d + rangeLen;
    const m = (Math.abs(h >> 5) % 12) + 1;
    const y = 2026;
    return { startDay: d, endDay: d2, month: m, year: y };
  }

  return null;
}

export function detectDateInText(text: string): { day: number, month: number, year: number } | null {
  const result = detectDateAndRangeInText(text);
  if (!result) return null;
  return { day: result.startDay, month: result.month, year: result.year };
}

/**
 * Draw a single frame to a canvas representing a specific timestamp
 */
export function drawVideoFrame(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  time: number,
  subtitles: SubtitleBlock[],
  images: CharacterImage[],
  imageCache: Map<string, HTMLImageElement>,
  config: RenderConfig,
  totalDuration: number,
  videoCache?: Map<string, HTMLVideoElement>,
  presets: SubtitlePreset[] = []
) {
  const { width, height, introDuration, outroDuration } = config;
  const scaleFactor = height / 720;

  const filterImageIdsForMode = (block: SubtitleBlock, ids: string[]): string[] => {
    if (ids.length <= 1) return ids;
    const mode = config.singleKeywordMode || 'pair';
    if (mode === 'no_split') {
      return ids.slice(0, 1);
    }
    const matchedKws = Array.from(new Set([
      block.matchedLeftKeyword,
      block.matchedRightKeyword,
      ...(block.matchedKeywordsList || [])
    ].filter(Boolean) as string[]));

    // Check if it qualifies as single word / character block
    if (matchedKws.length === 1 || (block.matchedLeftKeyword && block.matchedLeftKeyword === block.matchedRightKeyword)) {
      // Determine if we should pair
      const seed = (block.id * 17 + 13) % 100;
      let shouldPair = true;
      if (mode === 'single') shouldPair = false;
      else if (mode === 'percent_50_50') shouldPair = seed < 50;
      else if (mode === 'percent_25_75') shouldPair = seed < 25;
      else if (mode === 'percent_75_25') shouldPair = seed < 75;

      if (!shouldPair) {
        return ids.slice(0, 1);
      }
    }
    return ids;
  };
  
  // 1. Solid clear background
  ctx.fillStyle = '#09090B';
  ctx.fillRect(0, 0, width, height);
  
  // Check for Intro sequence
  if (introDuration > 0 && time < introDuration) {
    drawIntroOutroScreen(
      ctx,
      width,
      height,
      config.introTitle,
      config.introSubtitle,
      config.introBgColor,
      config.introTextColor,
      config.introImageId,
      imageCache,
      'intro',
      videoCache,
      time
    );
    return;
  }

  // Check for Outro sequence
  if (outroDuration > 0 && time >= (totalDuration - outroDuration)) {
    drawIntroOutroScreen(
      ctx,
      width,
      height,
      config.outroTitle,
      config.outroSubtitle,
      config.outroBgColor,
      config.outroTextColor,
      config.outroImageId,
      imageCache,
      'outro',
      videoCache,
      time - (totalDuration - outroDuration)
    );
    return;
  }

  // Content offset calculation
  const adjustedTime = time - introDuration;

  // 2. Find currently active subtitle block and previous subtitle block
  let activeBlockIdx = -1;
  for (let i = 0; i < subtitles.length; i++) {
    if (adjustedTime >= subtitles[i].startTime && adjustedTime <= subtitles[i].endTime) {
      activeBlockIdx = i;
      break;
    }
  }
  
  let activeBlock: SubtitleBlock | null = null;
  let prevBlock: SubtitleBlock | null = null;
  
  if (activeBlockIdx !== -1) {
    activeBlock = subtitles[activeBlockIdx];
    prevBlock = activeBlockIdx > 0 ? subtitles[activeBlockIdx - 1] : null;
  } else {
    for (let i = 0; i < subtitles.length; i++) {
      if (subtitles[i].startTime > adjustedTime) {
        prevBlock = i > 0 ? subtitles[i - 1] : null;
        break;
      }
      if (i === subtitles.length - 1) {
        prevBlock = subtitles[i];
      }
    }
  }

  // Simple check of enabled behaviors for a block (avoid logic priority sequence)
  const getEnabledBehaviorsForBlock = (bNum: number, blockText: string) => {
    const list: string[] = [];
    if (config.enableFakeNews && config.fakeNewsBlocks) {
      const match = config.fakeNewsBlocks.split(',').map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x)).includes(bNum);
      if (match) list.push('fakeNews');
    }
    if (config.enableHandWrite && config.handWriteBlocks) {
      const match = config.handWriteBlocks.split(',').map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x)).includes(bNum);
      if (match) list.push('handWrite');
    }
    if (config.enableFakeComment && config.fakeCommentBlocks) {
      const match = config.fakeCommentBlocks.split(',').map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x)).includes(bNum);
      if (match) list.push('fakeComment');
    }
    if (config.enableFakeWebsite && config.fakeWebsiteBlocks) {
      const match = config.fakeWebsiteBlocks.split(',').map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x)).includes(bNum);
      if (match) list.push('fakeWebsite');
    }
    if (config.enableFakeVideoEditor && config.fakeVideoEditorBlocks) {
      const match = config.fakeVideoEditorBlocks.split(',').map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x)).includes(bNum);
      if (match) list.push('fakeVideoEditor');
    }
    
    // Tự động kích hoạt hành vi Lịch nếu phụ đề của block chứa thông tin ngày tháng VÀ đã bật hành vi số 11
    if (config.enableFakeCalendar && detectDateInText(blockText)) {
      list.push('fakeCalendar');
    }
    return list;
  };

  const getSelectedBehavior = (bNum: number, blockText: string) => {
    const list = getEnabledBehaviorsForBlock(bNum, blockText);
    if (list.length === 0) return null;
    
    // Seeded random based on block number and block text to ensure no frame-level flicker across renderings of parent components
    const rand = createSeededRandom(blockText + bNum);
    const randVal = rand();
    const chosenIdx = Math.floor(randVal * list.length);
    return list[chosenIdx];
  };

  let chosenBehavior: string | null = null;
  if (activeBlockIdx !== -1 && activeBlock) {
    chosenBehavior = getSelectedBehavior(activeBlockIdx + 1, activeBlock.text);
  }

  // Keep Fake News, Handwriting, Fake Comment, Fake Website, or Fake Video Editor active during trailing gap or silence to eliminate flicker
  let prevBlockIdx = -1;
  if (activeBlockIdx === -1 && prevBlock) {
    prevBlockIdx = subtitles.findIndex(b => b.id === prevBlock.id);
    if (prevBlockIdx !== -1) {
      const pNum = prevBlockIdx + 1;
      const prevBehavior = getSelectedBehavior(pNum, prevBlock.text);
      if (prevBehavior) {
        activeBlock = prevBlock;
        activeBlockIdx = prevBlockIdx;
        chosenBehavior = prevBehavior;
      }
    }
  }
  
  // Render Fake News Human Behavior (No image panels, draws a premium newspaper)
  let isFakeNewsActive = chosenBehavior === 'fakeNews';
  let isFakeCalendarActive = chosenBehavior === 'fakeCalendar';

  if (isFakeNewsActive && activeBlock) {
    // 10 custom fully stylized newspaper templates with unique colors, filters, borders, and fillers
    const newsTemplates = [
      // 1. Classic Soap Opera Weekly (Original layout)
      {
        paperColor: '#fdfbf7',
        vignette: ['rgba(253, 251, 247, 0.0)', 'rgba(244, 238, 224, 0.22)', 'rgba(215, 203, 178, 0.52)'],
        borderColor: 'rgba(0, 0, 0, 0.08)',
        textColor: 'rgba(15, 15, 15, 0.95)',
        textBlurs: ['rgba(55, 55, 55, 0.55)', 'rgba(75, 75, 75, 0.35)', 'rgba(95, 95, 95, 0.20)', 'rgba(110, 110, 110, 0.12)'],
        fontFamily: '"Georgia", serif',
        fontStyle: 'italic',
        fontSizeCoeff: 29,
        headerLeft: "SOAP OPERA WEEKLY",
        headerRight: "DAILY SPOILER JOURNAL",
        headerCenter: "EXCLUSIVE TELEVISION SOAP OPERA SPOILERS & UPDATE BULLETIN",
        headerFont: (sf: number) => `bold ${10 * sf}px "Georgia", serif`,
        preFiller: "In daytime television drama disclosures this week, long-running storylines witnessed shocking alliances and unexpected confrontations across national networks that had loyal audiences gasping. Inside the central narrative thread of the show, the highly anticipated ",
        postFiller: " emerged as the paramount television spoiler, completely redefining the daytime soap opera landscape, guaranteeing mass viewership spikes, and leaving dedicated fanbases with unforgettable emotional cliffhangers for upcoming series.",
        highlightColor: 'rgba(255, 235, 59, 0.92)',
        highlightShadow: 'rgba(255, 235, 59, 0.45)',
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf);
          ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf);
          ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      },
      // 2. Financial Times style (Business Salmon)
      {
        paperColor: '#fbeee6',
        vignette: ['rgba(251, 238, 230, 0.0)', 'rgba(240, 223, 213, 0.25)', 'rgba(215, 192, 178, 0.48)'],
        borderColor: 'rgba(40, 20, 10, 0.12)',
        textColor: 'rgba(28, 32, 42, 0.96)',
        textBlurs: ['rgba(58, 62, 72, 0.58)', 'rgba(78, 82, 92, 0.38)', 'rgba(98, 102, 112, 0.22)', 'rgba(118, 122, 132, 0.12)'],
        fontFamily: '"Georgia", serif',
        fontStyle: 'italic',
        fontSizeCoeff: 27,
        headerLeft: "THE FINANCIAL CHRONICLE",
        headerRight: "GLOBAL MARKET INDICATOR",
        headerCenter: "WORLD COMMODITIES, FISCAL OUTLOOKS, AND HIGH-FREQUENCY TRANSACTIONS BULLETIN",
        headerFont: (sf: number) => `bold ${10 * sf}px "Georgia", serif`,
        preFiller: "In high-stakes macroeconomic policymaking and volatile trading cycles across multinational corporate exchanges, leading market analysts report that the unexpected valuation spike surrounding the ",
        postFiller: " emerged as the central paradigm-shifting asset disclosure, prompting portfolio reorganizations, regulatory interest rate deliberations, and massive volume shifts across trading desks.",
        highlightColor: 'rgba(33, 150, 243, 0.45)',
        highlightShadow: 'rgba(33, 150, 243, 0.2)',
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(40, 20, 10, 0.12)';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf);
          ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf);
          ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
          
          // Double top line
          ctx.strokeStyle = 'rgba(40, 20, 10, 0.06)';
          ctx.beginPath();
          ctx.moveTo(20 * sf, 46 * sf);
          ctx.lineTo(w - 20 * sf, 46 * sf);
          ctx.stroke();
        }
      },
      // 3. Techart Cyber Gazette (Sci-Fi/Retro Green Terminal printout)
      {
        paperColor: '#e8f4ed',
        vignette: ['rgba(232, 244, 237, 0.0)', 'rgba(212, 234, 221, 0.22)', 'rgba(175, 208, 189, 0.48)'],
        borderColor: 'rgba(10, 60, 30, 0.1)',
        textColor: 'rgba(10, 35, 21, 0.95)',
        textBlurs: ['rgba(35, 65, 45, 0.58)', 'rgba(65, 95, 75, 0.38)', 'rgba(95, 125, 105, 0.22)', 'rgba(120, 140, 125, 0.11)'],
        fontFamily: '"Courier New", Courier, monospace',
        fontStyle: 'normal',
        fontSizeCoeff: 24,
        headerLeft: "TECHART NEWS // SYS_VER_7.02",
        headerRight: "CYBER GAZETTE [ID-28A]",
        headerCenter: "QUANTUM INFONET CHRONICLES & DIGITAL ARCHIVE TRANSMISSION",
        headerFont: (sf: number) => `bold ${9 * sf}px "Courier New", Courier, monospace`,
        preFiller: "Following systemic deep-space telemetry diagnostic arrays and network security overhauls across cloud servers, the highly sensitive localized decryption process for the ",
        postFiller: " was identified as the critical system kernel anomaly, requiring terminal reboot cycles and immediate architectural patches.",
        highlightColor: 'rgba(0, 255, 255, 0.45)',
        highlightShadow: 'rgba(0, 255, 255, 0.2)',
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(10, 60, 30, 0.12)';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf);
          ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf);
          ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();

          // Dotted tech subline
          ctx.strokeStyle = 'rgba(10, 60, 30, 0.06)';
          ctx.setLineDash([4 * sf, 4 * sf]);
          ctx.beginPath();
          ctx.moveTo(20 * sf, 48 * sf);
          ctx.lineTo(w - 20 * sf, 48 * sf);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      },
      // 4. The Retro Herald (1884 Aged Antique Parchment)
      {
        paperColor: '#eedebf',
        vignette: ['rgba(238, 222, 191, 0.0)', 'rgba(224, 200, 160, 0.3)', 'rgba(180, 150, 110, 0.58)'],
        borderColor: 'rgba(33, 21, 16, 0.15)',
        textColor: 'rgba(33, 21, 16, 0.95)',
        textBlurs: ['rgba(70, 50, 40, 0.55)', 'rgba(90, 70, 60, 0.35)', 'rgba(120, 100, 90, 0.20)', 'rgba(140, 120, 110, 0.12)'],
        fontFamily: '"Georgia", serif',
        fontStyle: 'italic',
        fontSizeCoeff: 28,
        headerLeft: "THE RETRO HERALD (ESTD. 1884)",
        headerRight: "WEEKLY CONGLOMERATE PRINT",
        headerCenter: "DISPATCHING DAILY TIDINGS, STRANGE NEWS, AND GENERAL CIRCULATION",
        headerFont: (sf: number) => `bold ${9 * sf}px "Georgia", serif`,
        preFiller: "Let it be known to all citizens and patrons of the state that, after much public debate and civic assembly in the village square this Tuesday, the extraordinary incident of the ",
        postFiller: " has been recorded as the epoch-defining declaration of the decade, altering the course of local history and commerce forevermore.",
        highlightColor: 'rgba(183, 28, 28, 0.35)',
        highlightShadow: 'rgba(183, 28, 28, 0.15)',
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(33, 21, 16, 0.18)';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf);
          ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf);
          ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
          
          // Baroque extra borders
          ctx.lineWidth = 0.5 * sf;
          ctx.strokeRect(22 * sf, 45 * sf, w - 44 * sf, h - 83 * sf);
        }
      },
      // 5. Cosmic Observer (Deep Space/Sci-Fi broadsheet)
      {
        paperColor: '#131a28',
        vignette: ['rgba(19, 26, 40, 0.0)', 'rgba(12, 18, 30, 0.35)', 'rgba(4, 6, 12, 0.72)'],
        borderColor: 'rgba(130, 177, 255, 0.15)',
        textColor: 'rgba(227, 242, 253, 0.95)',
        textBlurs: ['rgba(130, 177, 255, 0.55)', 'rgba(100, 140, 220, 0.35)', 'rgba(70, 100, 180, 0.20)', 'rgba(50, 70, 140, 0.12)'],
        fontFamily: '"Trebuchet MS", "Arial", sans-serif',
        fontStyle: 'normal',
        fontSizeCoeff: 27,
        headerLeft: "COSMIC OBSERVER SYSTEM",
        headerRight: "METROPOLIS ASTRO BOARD",
        headerCenter: "DEEP SPACE COMMUNICATIONS, ORBITAL MATRIXES AND SURVEY SIGNALS",
        headerFont: (sf: number) => `bold ${9 * sf}px "Trebuchet MS", sans-serif`,
        preFiller: "After detailed deep-sector stellar sensor grids finalized scanning along the external perimeter of the core jump gates, the anomalous presence of the ",
        postFiller: " has been classified as an unexplained planetary singularity, necessitating immediate hyperspace reconnaissance maneuvers.",
        highlightColor: 'rgba(233, 30, 99, 0.52)',
        highlightShadow: 'rgba(233, 30, 99, 0.35)',
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(130, 177, 255, 0.22)';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf);
          ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf);
          ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();

          // Left/Right vertical grid lines
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf);
          ctx.lineTo(20 * sf, h - 35 * sf);
          ctx.moveTo(w - 20 * sf, 42 * sf);
          ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      },
      // 6. The Gourmet Muse (Premium Golden Lifestyle Quarterly)
      {
        paperColor: '#fefcf3',
        vignette: ['rgba(254, 252, 243, 0.0)', 'rgba(244, 239, 220, 0.22)', 'rgba(220, 205, 170, 0.45)'],
        borderColor: 'rgba(212, 175, 55, 0.15)',
        textColor: 'rgba(43, 27, 23, 0.96)',
        textBlurs: ['rgba(90, 70, 60, 0.55)', 'rgba(110, 90, 80, 0.35)', 'rgba(140, 120, 110, 0.20)', 'rgba(160, 140, 130, 0.12)'],
        fontFamily: '"Georgia", serif',
        fontStyle: 'italic',
        fontSizeCoeff: 28,
        headerLeft: "THE GOURMET MUSE",
        headerRight: "EPICUREAN QUARTERLY",
        headerCenter: "CURATING REFINED TASTE, GASTRONOMY AND MAJESTIC RETREATS WORLDWIDE",
        headerFont: (sf: number) => `bold italic ${9 * sf}px "Georgia", serif`,
        preFiller: "In our seasonal exploration of fine culinary craft, curated vineyards, and spectacular sensory dining adventures across the European coastline, the elusive signature masterpiece known as the ",
        postFiller: " remains the absolute pinnacle of sensory refinement, enchanting international food critics and defining the ultimate art of living.",
        highlightColor: 'rgba(212, 175, 55, 0.42)',
        highlightShadow: 'rgba(212, 175, 55, 0.2)',
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(212, 175, 55, 0.35)';
          ctx.lineWidth = 0.5 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf);
          ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf);
          ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      },
      // 7. Sporting Arena Dispatch (Heavy Sports Bold)
      {
        paperColor: '#f0f2f5',
        vignette: ['rgba(240, 242, 245, 0.0)', 'rgba(218, 222, 229, 0.25)', 'rgba(180, 190, 200, 0.45)'],
        borderColor: 'rgba(229, 57, 53, 0.2)',
        textColor: 'rgba(11, 11, 11, 0.95)',
        textBlurs: ['rgba(50, 50, 50, 0.55)', 'rgba(80, 80, 80, 0.35)', 'rgba(110, 110, 110, 0.20)', 'rgba(140, 140, 140, 0.12)'],
        fontFamily: '"Impact", "Arial Black", sans-serif',
        fontStyle: 'normal',
        fontSizeCoeff: 25,
        headerLeft: "SPORTING ARENA DISPATCH",
        headerRight: "CHAMPIONSHIP MATCHES",
        headerCenter: "ALL-SEASON HIGHLIGHT EVENTS, ATHLETE COVERAGE & PLAYER TRADE HIGHLIGHTS",
        headerFont: (sf: number) => `bold ${9 * sf}px "Arial Black", sans-serif`,
        preFiller: "Following hours of intense high-stakes play, locker-room tactical strategic deliberations, and deafening roars from packed professional tournament stadiums, the sensational ",
        postFiller: " secured its position as the ultimate championship MVP performance of the decade, breaking all historical league records.",
        highlightColor: 'rgba(0, 230, 118, 0.48)',
        highlightShadow: 'rgba(0, 230, 118, 0.25)',
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(229, 57, 53, 0.5)';
          ctx.lineWidth = 3 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf);
          ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf);
          ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      },
      // 8. Midnight Crime Gazette (Noir vintage novel / charcoal casefile)
      {
        paperColor: '#222222',
        vignette: ['rgba(34, 34, 34, 0.0)', 'rgba(24, 24, 24, 0.45)', 'rgba(10, 10, 10, 0.75)'],
        borderColor: 'rgba(229, 57, 53, 0.3)',
        textColor: 'rgba(229, 229, 229, 0.95)',
        textBlurs: ['rgba(180, 180, 180, 0.55)', 'rgba(130, 130, 130, 0.35)', 'rgba(90, 90, 90, 0.20)', 'rgba(60, 60, 60, 0.12)'],
        fontFamily: '"Courier New", Courier, monospace',
        fontStyle: 'normal',
        fontSizeCoeff: 23,
        headerLeft: "MIDNIGHT CRIME GAZETTE",
        headerRight: "NOTORIOUS CASE FILE",
        headerCenter: "CONFIDENTIAL DETECTIVE AGENCY INTELLIGENCE BRIEFINGS",
        headerFont: (sf: number) => `bold ${9 * sf}px "Courier New", Courier, monospace`,
        preFiller: "Under the cold glow of rain-soaked neon streetlights and shadowed alleys behind the old industrial warehouse docks, the sudden discovery of the ",
        postFiller: " emerged as the single missing link in the unresolved central conspiracy, sending shockwaves through the local syndicate.",
        highlightColor: 'rgba(255, 235, 59, 0.42)',
        highlightShadow: 'rgba(255, 235, 59, 0.2)',
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(229, 57, 53, 0.4)'; // Blood red line marker
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf);
          ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf);
          ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();

          // Typed underscores at the bottom
          ctx.fillStyle = 'rgba(229, 229, 229, 0.1)';
          ctx.font = `bold ${8 * sf}px "Courier New", monospace`;
          ctx.fillText("CLASSIFIED ____________________________________________________ CONFIDENTIAL", w / 2, h - 18 * sf);
        }
      },
      // 9. Scholastic Science Quarterly (Prisinte Academic)
      {
        paperColor: '#fafafa',
        vignette: ['rgba(250, 250, 250, 0.0)', 'rgba(235, 238, 243, 0.22)', 'rgba(205, 215, 225, 0.4)'],
        borderColor: 'rgba(20, 30, 45, 0.12)',
        textColor: 'rgba(17, 22, 37, 0.95)',
        textBlurs: ['rgba(60, 70, 90, 0.55)', 'rgba(90, 100, 120, 0.35)', 'rgba(120, 130, 150, 0.20)', 'rgba(150, 160, 180, 0.12)'],
        fontFamily: '"Georgia", serif',
        fontStyle: 'normal',
        fontSizeCoeff: 28,
        headerLeft: "SCHOLASTIC SCIENCE QUARTERLY",
        headerRight: "PEER-REVIEWED ARCHIVES [VOL. 43]",
        headerCenter: "PROCEEDING DOCUMENTATION OF ACCREDITED NATURAL PHENOMENA AND METHODOLOGY",
        headerFont: (sf: number) => `bold ${8.5 * sf}px "Georgia", serif`,
        preFiller: "In our recent peer-reviewed longitudinal study examining complex thermal kinetics, molecular orbital configurations, and biological cell structures, the empirical observation of the ",
        postFiller: " has been formally documented as the primary research breakthrough, suggesting novel theoretical directions for future doctoral dissertations.",
        highlightColor: 'rgba(179, 136, 255, 0.48)',
        highlightShadow: 'rgba(179, 136, 255, 0.2)',
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(20, 30, 45, 0.12)';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 38 * sf);
          ctx.lineTo(w - 20 * sf, 38 * sf);
          ctx.moveTo(20 * sf, 42 * sf);
          ctx.lineTo(w - 20 * sf, 42 * sf);
          
          ctx.moveTo(20 * sf, h - 35 * sf);
          ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      },
      // 10. The Daily Whispers (Pink Gossip Column)
      {
        paperColor: '#fff0f5',
        vignette: ['rgba(255, 240, 245, 0.0)', 'rgba(245, 215, 230, 0.25)', 'rgba(220, 180, 205, 0.48)'],
        borderColor: 'rgba(194, 59, 134, 0.15)',
        textColor: 'rgba(51, 12, 47, 0.96)',
        textBlurs: ['rgba(100, 40, 90, 0.58)', 'rgba(130, 60, 115, 0.38)', 'rgba(160, 80, 140, 0.22)', 'rgba(190, 110, 170, 0.12)'],
        fontFamily: '"Georgia", serif',
        fontStyle: 'italic',
        fontSizeCoeff: 28,
        headerLeft: "THE DAILY WHISPERS",
        headerRight: "VIP EXCLUSIVE REPORT",
        headerCenter: "TOP-SECRET CELEBRITY ACCUSATIONS, GLAMOROUS GALAS, AND RED CARPET CONFESSIONS",
        headerFont: (sf: number) => `bold italic ${9 * sf}px "Georgia", serif`,
        preFiller: "Word has officially leaked out from the exclusive pre-gala dressing rooms that behind closed double doors at the movie premiere after-party, the shocking gossip regarding the ",
        postFiller: " is now the single biggest red-carpet scandal of the summer season, leaving supermodel circles completely shell-shocked.",
        highlightColor: 'rgba(244, 143, 177, 0.55)',
        highlightShadow: 'rgba(244, 143, 177, 0.3)',
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(194, 59, 134, 0.15)';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf);
          ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf);
          ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      },
      // 11-20: Styles with IMAGES (B&W and color varieties)
      // 11. Old Vintage B&W Broadsheet (1930s Times with image)
      {
        paperColor: '#f1f1ee',
        vignette: ['rgba(241, 241, 238, 0.0)', 'rgba(220, 220, 215, 0.22)', 'rgba(180, 180, 175, 0.52)'],
        borderColor: 'rgba(0, 0, 0, 0.15)',
        textColor: 'rgba(25, 25, 25, 0.95)',
        textBlurs: ['rgba(70, 70, 70, 0.55)', 'rgba(92, 92, 92, 0.35)', 'rgba(120, 120, 120, 0.20)', 'rgba(140, 140, 140, 0.12)'],
        fontFamily: '"Georgia", serif',
        fontStyle: 'normal',
        fontSizeCoeff: 24,
        headerLeft: "THE NATION CHRONICLE",
        headerRight: "METROPOLITAN EDITION",
        headerCenter: "DAILY TRUTH CHRONICLE - VOL. LXXXVII",
        headerFont: (sf: number) => `bold ${9 * sf}px "Georgia", serif`,
        preFiller: "In dramatic legislative and civic disclosures witnessed this very morning within public administrative councils, eyewitness correspondents confirmed inside reports regarding the ",
        postFiller: " which became the definitive photo-documented event of the month, triggering intensive inquiries and altering ongoing local investigations indefinitely.",
        highlightColor: 'rgba(30, 30, 30, 0.15)',
        highlightShadow: 'rgba(0, 0, 0, 0.05)',
        hasImage: true,
        imagePosition: 'right',
        imageFilter: 'grayscale(100%) contrast(140%) brightness(95%)',
        photoCaption: "Figure 1.1: Recovered Photographic Documentation.",
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
          ctx.lineWidth = 1.5 * sf;
          ctx.strokeRect(18 * sf, 42 * sf, w - 36 * sf, h - 77 * sf);
        }
      },
      // 12. Modern Green Eco-Inquirer (with image)
      {
        paperColor: '#f6faf6',
        vignette: ['rgba(246, 250, 246, 0.0)', 'rgba(220, 235, 220, 0.25)', 'rgba(185, 205, 185, 0.45)'],
        borderColor: 'rgba(30, 80, 45, 0.12)',
        textColor: 'rgba(15, 45, 25, 0.96)',
        textBlurs: ['rgba(35, 80, 50, 0.55)', 'rgba(60, 110, 75, 0.35)', 'rgba(90, 140, 105, 0.20)', 'rgba(120, 160, 130, 0.12)'],
        fontFamily: '"Trebuchet MS", "Arial", sans-serif',
        fontStyle: 'normal',
        fontSizeCoeff: 23,
        headerLeft: "ECO-INQUIRER JOURNAL",
        headerRight: "GREEN PLANET INSIGHT",
        headerCenter: "BIODIVERSITY RESEARCH AND ECO-TECTONICS GLOBAL TELEMETRY",
        headerFont: (sf: number) => `bold ${9 * sf}px "Trebuchet MS", sans-serif`,
        preFiller: "With severe atmospheric shifts and environmental telemetry parameters drawing focus from scientific institutes, the sudden detection of the ",
        postFiller: " has emerged as the foremost high-altitude biological marker, prompting urgent field studies and ecosystem research expeditions.",
        highlightColor: 'rgba(76, 175, 80, 0.42)',
        highlightShadow: 'rgba(76, 175, 80, 0.2)',
        hasImage: true,
        imagePosition: 'left',
        imageFilter: 'contrast(115%) hue-rotate(50deg) saturate(95%)',
        photoCaption: "Plate 4b: Ecological field surveillance imagery.",
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(30, 80, 45, 0.15)';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf); ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf); ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      },
      // 13. Retro Arcade & Synthwave Chronicle (with image)
      {
        paperColor: '#1d122b',
        vignette: ['rgba(29, 18, 43, 0.0)', 'rgba(20, 10, 32, 0.45)', 'rgba(10, 4, 18, 0.85)'],
        borderColor: 'rgba(233, 30, 99, 0.25)',
        textColor: 'rgba(245, 235, 255, 0.95)',
        textBlurs: ['rgba(233, 30, 99, 0.55)', 'rgba(156, 39, 176, 0.35)', 'rgba(103, 58, 183, 0.20)', 'rgba(50, 20, 100, 0.12)'],
        fontFamily: '"Courier New", Courier, monospace',
        fontStyle: 'normal',
        fontSizeCoeff: 22,
        headerLeft: "RGB_RETRO Arcade//SYS",
        headerRight: "NEON DISCORD GATEWAY",
        headerCenter: "GRID SIGNAL INTERCEPT AND HARDWARE MEMORY EXPANSION DATA",
        headerFont: (sf: number) => `bold ${8.5 * sf}px "Courier New", monospace`,
        preFiller: "Analyzing real-time graphic core frame buffers and deep neon system memory nodes under active emulation vector environments, the mysterious launch sequence of the ",
        postFiller: " was detected leaking across the main bus terminal, causing system overflows and triggering localized frame-buffer shifts.",
        highlightColor: 'rgba(0, 229, 255, 0.52)',
        highlightShadow: 'rgba(0, 229, 255, 0.3)',
        hasImage: true,
        imagePosition: 'right',
        imageFilter: 'hue-rotate(270deg) saturate(180%) contrast(125%)',
        photoCaption: "CAM_INPUT_08: Holographic telemetry frame.",
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(233, 30, 99, 0.3)';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf); ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf); ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      },
      // 14. Golden Imperial Crown Gazette (with image)
      {
        paperColor: '#fffef0',
        vignette: ['rgba(255, 254, 240, 0.0)', 'rgba(245, 235, 210, 0.22)', 'rgba(215, 195, 150, 0.48)'],
        borderColor: 'rgba(184, 134, 11, 0.18)',
        textColor: 'rgba(46, 33, 11, 0.95)',
        textBlurs: ['rgba(110, 85, 45, 0.55)', 'rgba(140, 115, 75, 0.35)', 'rgba(175, 150, 110, 0.20)', 'rgba(200, 180, 140, 0.12)'],
        fontFamily: '"Georgia", serif',
        fontStyle: 'italic',
        fontSizeCoeff: 24,
        headerLeft: "THE COURT CITADEL HERALD",
        headerRight: "GOLDEN ROYAL DISPATCH",
        headerCenter: "WEEKLY MEMOIRS AND CHRONICLES OF CORONATION AND COURTLY AFFAIR",
        headerFont: (sf: number) => `bold italic ${9 * sf}px "Georgia", serif`,
        preFiller: "By direct decree and parchment order issued from the majestic high sovereign throne room on this historic morning, the grand presentation describing the ",
        postFiller: " was officially recorded into the empire archives, establishing absolute peace and prosperous commerce across the realm.",
        highlightColor: 'rgba(212, 175, 55, 0.45)',
        highlightShadow: 'rgba(212, 175, 55, 0.2)',
        hasImage: true,
        imagePosition: 'left',
        imageFilter: 'sepia(100%) hue-rotate(5deg) contrast(120%) brightness(95%)',
        photoCaption: "Figure II: Handcrafted copperplate illustration.",
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(184, 134, 11, 0.25)';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf); ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf); ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      },
      // 15. Minimalist Swiss Design Pressepapier (with image)
      {
        paperColor: '#fafafa',
        vignette: ['rgba(250, 250, 250, 0.0)', 'rgba(235, 235, 235, 0.18)', 'rgba(200, 200, 200, 0.38)'],
        borderColor: '#111111',
        textColor: '#1a1a1a',
        textBlurs: ['rgba(40, 40, 40, 0.58)', 'rgba(70, 70, 70, 0.38)', 'rgba(110, 110, 110, 0.22)', 'rgba(150, 150, 150, 0.12)'],
        fontFamily: '"Arial", sans-serif',
        fontStyle: 'normal',
        fontSizeCoeff: 23,
        headerLeft: "NEUE SCHWEIZER PRESSE",
        headerRight: "ZÜRICH DESIGN REPORT",
        headerCenter: "STRUCTURAL ARCHITECTURE, MODERN TYPOGRAPHY AND MINIMALIST GRAPHICS BULLETIN",
        headerFont: (sf: number) => `bold ${9 * sf}px "Arial", sans-serif`,
        preFiller: "Analyzing high-density architectural modules and clean structural spatial layouts across Swiss design academies, the pure grid implementation of the ",
        postFiller: " emerged as the absolute supreme masterwork of the season, validating strict grid lines and proving functional visual principles.",
        highlightColor: 'rgba(229, 57, 53, 0.4)',
        highlightShadow: 'rgba(229, 57, 53, 0.15)',
        hasImage: true,
        imagePosition: 'right',
        imageFilter: 'grayscale(100%) contrast(150%) brightness(95%)',
        photoCaption: "No. 7: High-contrast silver-gelatin photographic proof.",
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = '#111111';
          ctx.lineWidth = 2 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf); ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf); ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      },
      // 16. Bold Headline Tabloid (with image)
      {
        paperColor: '#faf7ed',
        vignette: ['rgba(250, 247, 237, 0.0)', 'rgba(230, 220, 205, 0.25)', 'rgba(200, 180, 160, 0.45)'],
        borderColor: 'rgba(211, 47, 47, 0.18)',
        textColor: '#1a0505',
        textBlurs: ['rgba(70, 40, 40, 0.55)', 'rgba(100, 70, 70, 0.35)', 'rgba(130, 100, 100, 0.20)', 'rgba(160, 130, 130, 0.12)'],
        fontFamily: '"Impact", "Arial Black", sans-serif',
        fontStyle: 'normal',
        fontSizeCoeff: 24,
        headerLeft: "THE DAILY MIRROR SENSATIONALS",
        headerRight: "EYEWITNESS INSIDER EXCLUSIVE",
        headerCenter: "SHOCK ACCUSATIONS, WILD CLAIMS AND SPECTACULAR SIGHTINGS UNCOVERED DAILY",
        headerFont: (sf: number) => `bold ${8 * sf}px "Arial Black", sans-serif`,
        preFiller: "LOOSE LIPS AND SHOCK REPORTING! Crowds were left completely speechless as undercover cameras captured concrete evidence verifying that the hidden ",
        postFiller: " is officially the biggest news scandal of the year, triggering massive public panic and causing corporate heads to roll this morning!",
        highlightColor: 'rgba(255, 235, 59, 0.88)',
        highlightShadow: 'rgba(255, 235, 59, 0.4)',
        hasImage: true,
        imagePosition: 'left',
        imageFilter: 'saturate(160%) contrast(115%) brightness(100%)',
        photoCaption: "EXCLUSIVE: Hidden telescope camera capture.",
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = '#d32f2f';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 38 * sf); ctx.lineTo(w - 20 * sf, 38 * sf);
          ctx.moveTo(20 * sf, 42 * sf); ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf); ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      },
      // 17. Deep Oceanic Explorer log (with image)
      {
        paperColor: '#101e26',
        vignette: ['rgba(16, 30, 38, 0.0)', 'rgba(10, 20, 26, 0.42)', 'rgba(4, 8, 12, 0.82)'],
        borderColor: 'rgba(0, 188, 212, 0.18)',
        textColor: '#e0f7fa',
        textBlurs: ['rgba(0, 188, 212, 0.55)', 'rgba(0, 150, 136, 0.35)', 'rgba(0, 121, 107, 0.20)', 'rgba(0, 77, 64, 0.12)'],
        fontFamily: '"Trebuchet MS", "Arial", sans-serif',
        fontStyle: 'normal',
        fontSizeCoeff: 23,
        headerLeft: "OCEANIC SURVEY LOG // ID_DEEP",
        headerRight: "SUB-SURFACE SECTOR V",
        headerCenter: "DEEP ABYSSAL SUBMERSIBLE SURVEY, THERMAL ANOMALIES AND MARINE SPECIES LOG",
        headerFont: (sf: number) => `bold ${8.5 * sf}px "Trebuchet MS", sans-serif`,
        preFiller: "During deep underwater sonar sweeps and optical submarine scans along the hydrothermal vents of Mariana Basin, the glowing emergence of the ",
        postFiller: " has been officially captured and classified as an unrecognized deep-sea creature of unprecedented scientific significance.",
        highlightColor: 'rgba(0, 188, 212, 0.52)',
        highlightShadow: 'rgba(0, 188, 212, 0.3)',
        hasImage: true,
        imagePosition: 'right',
        imageFilter: 'contrast(125%) hue-rotate(180deg) brightness(85%)',
        photoCaption: "Frame #409: High-exposure underwater strobe scan.",
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(0, 188, 212, 0.22)';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf); ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf); ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      },
      // 18. Blushing Rose Editorial (with image)
      {
        paperColor: '#fff4f6',
        vignette: ['rgba(255, 244, 246, 0.0)', 'rgba(245, 220, 225, 0.22)', 'rgba(215, 180, 190, 0.48)'],
        borderColor: 'rgba(233, 30, 99, 0.15)',
        textColor: '#3e1b24',
        textBlurs: ['rgba(194, 24, 91, 0.55)', 'rgba(216, 27, 96, 0.35)', 'rgba(240, 98, 146, 0.20)', 'rgba(248, 187, 208, 0.12)'],
        fontFamily: '"Georgia", serif',
        fontStyle: 'italic',
        fontSizeCoeff: 24,
        headerLeft: "ROSE & ELEGANTE EDITORIAL",
        headerRight: "HAUTE PARISIEN COUTURE",
        headerCenter: "CURATING LUXURY SCENTS, ENCHANTING DESIGNERS AND MAJESTIC COUTURE HOUSES",
        headerFont: (sf: number) => `bold italic ${9 * sf}px "Georgia", serif`,
        preFiller: "In our seasonal showcase exploring refined spring patterns, glamorous runways, and exquisite lace designs on the Parisian stage, the gorgeous debut of the ",
        postFiller: " is celebrated as the absolute peak of modern feminine elegance, completely capturing the heart of international critics this season.",
        highlightColor: 'rgba(244, 143, 177, 0.45)',
        highlightShadow: 'rgba(244, 143, 177, 0.18)',
        hasImage: true,
        imagePosition: 'left',
        imageFilter: 'contrast(105%) sepia(30%) hue-rotate(330deg) saturate(110%)',
        photoCaption: "Page 89: Editorial shoot capture, Spring Series.",
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(233, 30, 99, 0.18)';
          ctx.lineWidth = 0.5 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf); ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf); ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      },
      // 19. Classified Agency Case Docket (Beige Dossier with image)
      {
        paperColor: '#ecdcb9',
        vignette: ['rgba(236, 220, 185, 0.0)', 'rgba(215, 195, 160, 0.22)', 'rgba(170, 145, 110, 0.6)'],
        borderColor: 'rgba(84, 110, 122, 0.3)',
        textColor: '#263238',
        textBlurs: ['rgba(55, 71, 79, 0.58)', 'rgba(90, 107, 115, 0.38)', 'rgba(120, 144, 156, 0.22)', 'rgba(176, 190, 197, 0.12)'],
        fontFamily: '"Courier New", Courier, monospace',
        fontStyle: 'normal',
        fontSizeCoeff: 22,
        headerLeft: "INTEL_AGENCY_BRIEF [CASE #90B]",
        headerRight: "STATUS: TOP_SECRET_DOCKET",
        headerCenter: "CLASSIFIED RECONNAISSANCE DOSSIER // RECOVERED DOCUMENTS AND HIGH-VALUE INTEL",
        headerFont: (sf: number) => `bold ${8.5 * sf}px "Courier New", monospace`,
        preFiller: "WARNING: DISSEMINATION IS STRICTLY PROHIBITED. Following intensive satellite sweeps inside quarantined coordinates, the visual confirmation of the ",
        postFiller: " has been added to the case files as prime documentary evidence of illegal border activities, requiring immediate defensive containment.",
        highlightColor: 'rgba(255, 235, 59, 0.45)',
        highlightShadow: 'rgba(255, 235, 59, 0.2)',
        hasImage: true,
        imagePosition: 'right',
        imageFilter: 'grayscale(100%) sepia(35%) contrast(125%) brightness(90%)',
        photoCaption: "EXHIBIT 8A: Quarantined aerial surveillance capture.",
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(84, 110, 122, 0.35)';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf); ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf); ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      },
      // 20. Epic Volcanic Ash Gothic Gazette (with image)
      {
        paperColor: '#1c1b1f',
        vignette: ['rgba(28, 27, 31, 0.0)', 'rgba(15, 14, 18, 0.45)', 'rgba(5, 4, 8, 0.85)'],
        borderColor: 'rgba(183, 28, 28, 0.25)',
        textColor: '#e0e0e0',
        textBlurs: ['rgba(183, 28, 28, 0.55)', 'rgba(229, 115, 115, 0.35)', 'rgba(117, 117, 117, 0.20)', 'rgba(66, 66, 66, 0.12)'],
        fontFamily: '"Georgia", serif',
        fontStyle: 'normal',
        fontSizeCoeff: 23,
        headerLeft: "ARCANUM OBSCURA HERALD",
        headerRight: "NOCTURNAL DISPATCH",
        headerCenter: "DARK SURVEYS, ANCIENT RUNES CHRONICLES AND CELESTIAL ALIGNMENTS SURVEYS",
        headerFont: (sf: number) => `bold ${9 * sf}px "Georgia", serif`,
        preFiller: "Behold, as shadow patterns finalise their alignments under cold dark sky-gazes, the legendary manifestations and strange sightings detailing the ancient ",
        postFiller: " has surfaced once again, sealing the fate of the old cathedral realm and closing the chapters of forgotten epoch chronicles.",
        highlightColor: 'rgba(183, 28, 28, 0.42)',
        highlightShadow: 'rgba(183, 28, 28, 0.2)',
        hasImage: true,
        imagePosition: 'left',
        imageFilter: 'grayscale(90%) brightness(75%) contrast(140%) hue-rotate(5deg)',
        photoCaption: "Plate IX: Infrared cathedral alignments documentation.",
        drawBorders: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          ctx.strokeStyle = 'rgba(183, 28, 28, 0.35)';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(20 * sf, 42 * sf); ctx.lineTo(w - 20 * sf, 42 * sf);
          ctx.moveTo(20 * sf, h - 35 * sf); ctx.lineTo(w - 20 * sf, h - 35 * sf);
          ctx.stroke();
        }
      }
    ];

    // Select template stably but randomly using a non-flickering hash based on block id and block text
    const rFnNews = createSeededRandom((activeBlock ? activeBlock.text : "") + activeBlockIdx);
    const tIdx = activeBlock ? Math.floor(rFnNews() * newsTemplates.length) : 0;
    const currentTemplate = newsTemplates[tIdx];

    // 1. Draw solid real newsprint paper
    ctx.fillStyle = currentTemplate.paperColor;
    ctx.fillRect(0, 0, width, height);

    // 1.2 Draw subtle paper vignetting for deep texture
    ctx.save();
    const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.22, width / 2, height / 2, width * 0.65);
    vignette.addColorStop(0, currentTemplate.vignette[0]);
    vignette.addColorStop(0.72, currentTemplate.vignette[1]);
    vignette.addColorStop(1, currentTemplate.vignette[2]);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    // 2. Draw subtle newspaper header borders
    ctx.save();
    currentTemplate.drawBorders(ctx, width, height, scaleFactor);
    ctx.restore();

    // 2.2 Draw Newspaper header info labels
    ctx.save();
    ctx.fillStyle = currentTemplate.textColor;
    ctx.font = currentTemplate.headerFont(scaleFactor);
    
    ctx.textAlign = 'left';
    ctx.fillText(currentTemplate.headerLeft, 25 * scaleFactor, 28 * scaleFactor);
    
    ctx.textAlign = 'right';
    ctx.fillText(currentTemplate.headerRight, width - 25 * scaleFactor, 28 * scaleFactor);
    
    ctx.textAlign = 'center';
    ctx.fillText(currentTemplate.headerCenter, width / 2, 28 * scaleFactor);
    ctx.restore();

    // 3. Weave the subtitle text organically into a single continuous scholastic paper paragraph
    const preFiller = currentTemplate.preFiller;
    const postFiller = currentTemplate.postFiller;

    const preWords = preFiller.split(/\s+/).filter(Boolean);
    const activeWords = activeBlock.text.split(/\s+/).filter(Boolean);
    const postWords = postFiller.split(/\s+/).filter(Boolean);

    // Identify exactly 2 focal words to highlight (priorities to numbers or middle keywords)
    const focusIndices: number[] = [];
    const containsNumber = /[0-9]+/;
    const numericWordIdx = activeWords.findIndex(w => containsNumber.test(w));
    if (numericWordIdx !== -1) {
      focusIndices.push(numericWordIdx);
      if (numericWordIdx + 1 < activeWords.length) {
        focusIndices.push(numericWordIdx + 1);
      } else if (numericWordIdx - 1 >= 0) {
        focusIndices.push(numericWordIdx - 1);
      }
    } else {
      const mid = Math.floor(activeWords.length / 2);
      if (activeWords.length <= 2) {
        for (let k = 0; k < activeWords.length; k++) {
          focusIndices.push(k);
        }
      } else {
        focusIndices.push(mid - 1, mid);
      }
    }

    // Assembly unified word array
    const allWordObjects: Array<{
      text: string;
      source: 'pre' | 'active' | 'post';
      globalIdxInActive: number;
      isHighlight: boolean;
      renderX?: number;
      renderY?: number;
      width?: number;
    }> = [];

    preWords.forEach(w => {
      allWordObjects.push({ text: w, source: 'pre', globalIdxInActive: -1, isHighlight: false });
    });

    activeWords.forEach((w, idx) => {
      const isHigh = focusIndices.includes(idx);
      allWordObjects.push({ text: w, source: 'active', globalIdxInActive: idx, isHighlight: isHigh });
    });

    postWords.forEach(w => {
      allWordObjects.push({ text: w, source: 'post', globalIdxInActive: -1, isHighlight: false });
    });

    // Compute line wrap structure accurately 
    const paperFont = `${currentTemplate.fontStyle} ${currentTemplate.fontSizeCoeff * scaleFactor}px ${currentTemplate.fontFamily}`;
    ctx.save();
    ctx.font = paperFont;
    
    // Check if image frame is active for layout shift
    const isImageTemplate = !!currentTemplate.hasImage;
    const imagePosition = currentTemplate.imagePosition || 'left';

    const padding = 35 * scaleFactor;
    const imageBoxW = 380 * scaleFactor;
    const imageBoxH = 280 * scaleFactor;

    let maxWidth = width * 0.86;
    if (isImageTemplate) {
      maxWidth = width - (padding * 2) - imageBoxW - (24 * scaleFactor);
    }

    const lines: Array<{
      words: typeof allWordObjects;
      lineWidth: number;
    }> = [];
    
    let currentLineWords: typeof allWordObjects = [];
    let currentLineWidth = 0;
    const spaceWidth = ctx.measureText(' ').width;

    allWordObjects.forEach((wordObj) => {
      const wordWidth = ctx.measureText(wordObj.text).width;
      const addedWidth = currentLineWidth === 0 ? wordWidth : spaceWidth + wordWidth;
      
      if (currentLineWidth + addedWidth > maxWidth) {
        if (currentLineWords.length > 0) {
          lines.push({ words: currentLineWords, lineWidth: currentLineWidth });
          currentLineWords = [wordObj];
          currentLineWidth = wordWidth;
        } else {
          currentLineWords = [wordObj];
          currentLineWidth = wordWidth;
          lines.push({ words: currentLineWords, lineWidth: currentLineWidth });
          currentLineWords = [];
          currentLineWidth = 0;
        }
      } else {
        currentLineWords.push(wordObj);
        currentLineWidth += addedWidth;
      }
    });
    if (currentLineWords.length > 0) {
      lines.push({ words: currentLineWords, lineWidth: currentLineWidth });
    }

    // Center layout of paragraph based on active lines vertical focus
    let firstActiveLineIdx = -1;
    let lastActiveLineIdx = -1;
    lines.forEach((line, lineIdx) => {
      const hasActive = line.words.some(w => w.source === 'active');
      if (hasActive) {
        if (firstActiveLineIdx === -1) firstActiveLineIdx = lineIdx;
        lastActiveLineIdx = lineIdx;
      }
    });

    const activeCenterIdx = firstActiveLineIdx !== -1 ? (firstActiveLineIdx + lastActiveLineIdx) / 2 : lines.length / 2;
    const lineHeight = (currentTemplate.fontSizeCoeff * 1.85) * scaleFactor;
    const centerY = height / 2;

    let textBoxX = padding;
    if (isImageTemplate && imagePosition === 'left') {
      textBoxX = padding + imageBoxW + (24 * scaleFactor);
    }

    lines.forEach((line, lineIdx) => {
      const lineY = centerY + (lineIdx - activeCenterIdx) * lineHeight;
      let curX = isImageTemplate ? (textBoxX + (maxWidth - line.lineWidth) / 2) : ((width - line.lineWidth) / 2);
      
      line.words.forEach((wordObj) => {
        const wordW = ctx.measureText(wordObj.text).width;
        wordObj.renderX = curX;
        wordObj.renderY = lineY;
        wordObj.width = wordW;
        curX += wordW + spaceWidth;
      });
    });
    ctx.restore();

    // 3.5 Draw the block photo if it is an image-enabled template
    if (isImageTemplate) {
      // Find active block image
      let blockImgEl: HTMLImageElement | null = null;
      const imgIds = [
        activeBlock.matchedLeftImageId,
        activeBlock.matchedRightImageId,
        ...(activeBlock.matchedImageIds || [])
      ].filter(Boolean) as string[];

      for (const id of imgIds) {
        if (imageCache.has(id)) {
          blockImgEl = imageCache.get(id) || null;
          if (blockImgEl) break;
        }
      }

      // If no matching image, fall back to any downloaded image in cache to guarantee we show a photo
      if (!blockImgEl && imageCache.size > 0) {
        for (const [key, value] of imageCache.entries()) {
          if (key !== 'brand-logo' && value instanceof HTMLImageElement) {
            blockImgEl = value;
            break;
          }
        }
      }

      // Compute image box coordinate positions
      const imageX = imagePosition === 'left' ? padding : width - padding - imageBoxW;
      const imageY = centerY - imageBoxH / 2 - 12 * scaleFactor;

      // Draw paper photo frame border
      ctx.save();
      const isDarkPaper = currentTemplate.paperColor === '#131a28' || currentTemplate.paperColor === '#1d122b' || currentTemplate.paperColor === '#1c1b1f' || currentTemplate.paperColor === '#222222';
      ctx.fillStyle = isDarkPaper ? '#2c2c32' : '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
      ctx.shadowBlur = 8 * scaleFactor;
      ctx.fillRect(imageX, imageY, imageBoxW, imageBoxH);

      // Draw photo frame outline edge
      ctx.strokeStyle = currentTemplate.borderColor;
      ctx.lineWidth = 1 * scaleFactor;
      ctx.strokeRect(imageX, imageY, imageBoxW, imageBoxH);

      const framePadding = 8 * scaleFactor;
      const innerX = imageX + framePadding;
      const innerY = imageY + framePadding;
      const innerW = imageBoxW - framePadding * 2;
      const innerH = imageBoxH - framePadding * 2;

      if (blockImgEl) {
        ctx.save();
        // Set image filter for vintage print look
        if (ctx.filter !== undefined) {
          ctx.filter = currentTemplate.imageFilter || 'none';
        }
        
        // Calculate crop/fill object fit
        const imgW = blockImgEl.naturalWidth || blockImgEl.width;
        const imgH = blockImgEl.naturalHeight || blockImgEl.height;
        const targetRatio = innerW / innerH;
        const srcRatio = imgW / imgH;
        let sx = 0, sy = 0, sw = imgW, sh = imgH;
        if (srcRatio > targetRatio) {
          sw = imgH * targetRatio;
          sx = (imgW - sw) / 2;
        } else {
          sh = imgW / targetRatio;
          sy = (imgH - sh) / 2;
        }

        ctx.drawImage(blockImgEl, sx, sy, sw, sh, innerX, innerY, innerW, innerH);
        ctx.restore();
      } else {
        // Draw a beautiful hand-drawn ink landscape as an artistic placeholder fallback
        ctx.save();
        ctx.fillStyle = isDarkPaper ? '#121214' : '#faf8f5';
        ctx.fillRect(innerX, innerY, innerW, innerH);

        ctx.strokeStyle = currentTemplate.borderColor;
        ctx.lineWidth = 1.2 * scaleFactor;
        
        // Draw double frame border
        ctx.strokeRect(innerX + 3 * scaleFactor, innerY + 3 * scaleFactor, innerW - 6 * scaleFactor, innerH - 6 * scaleFactor);

        // Procedural decorative landscape engraving
        ctx.beginPath();
        // Mountains
        ctx.moveTo(innerX + innerW * 0.15, innerY + innerH * 0.75);
        ctx.lineTo(innerX + innerW * 0.45, innerY + innerH * 0.35);
        ctx.lineTo(innerX + innerW * 0.75, innerY + innerH * 0.75);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(innerX + innerW * 0.35, innerY + innerH * 0.75);
        ctx.lineTo(innerX + innerW * 0.6, innerY + innerH * 0.48);
        ctx.lineTo(innerX + innerW * 0.85, innerY + innerH * 0.75);
        ctx.stroke();

        // Sun
        ctx.beginPath();
        ctx.arc(innerX + innerW * 0.65, innerY + innerH * 0.38, 14 * scaleFactor, 0, Math.PI * 2);
        ctx.stroke();

        // Horizon lines / sea hatching
        ctx.beginPath();
        ctx.moveTo(innerX + innerW * 0.1, innerY + innerH * 0.75);
        ctx.lineTo(innerX + innerW * 0.9, innerY + innerH * 0.75);
        ctx.moveTo(innerX + innerW * 0.15, innerY + innerH * 0.8);
        ctx.lineTo(innerX + innerW * 0.85, innerY + innerH * 0.8);
        ctx.stroke();

        // Technical camera register mark in center
        ctx.font = `italic ${9 * scaleFactor}px ${currentTemplate.fontFamily || 'monospace'}`;
        ctx.fillStyle = currentTemplate.textColor;
        ctx.textAlign = 'center';
        ctx.fillText("[ ARCHIVAL PHOTO ]", innerX + innerW / 2, innerY + innerH * 0.22);

        ctx.restore();
      }

      // Draw photo caption text
      ctx.save();
      ctx.fillStyle = currentTemplate.textColor;
      ctx.font = `italic ${9 * scaleFactor}px ${currentTemplate.fontFamily || 'Georgia, serif'}`;
      ctx.textAlign = 'center';
      ctx.fillText(currentTemplate.photoCaption || "PHOTOGRAPHIC TRANSMISSION", imageX + imageBoxW / 2, imageY + imageBoxH + 16 * scaleFactor);
      ctx.restore();
      ctx.restore();
    }

    // 4. Draw marker highlighter underlays in absolute coordinates
    const duration = Math.max(0.5, activeBlock.endTime - activeBlock.startTime);
    const elapsed = adjustedTime - activeBlock.startTime;
    const progress = Math.min(1.0, Math.max(0.0, elapsed / duration));

    // Dynamic typewriter-like sweep starts at 10% progress and expands continuously to 85% progress
    const highlightProgress = Math.min(1.0, Math.max(0.0, (progress - 0.1) / 0.75));

    let p1 = 0;
    let p2 = 0;
    if (focusIndices.length === 1) {
      p1 = highlightProgress;
    } else if (focusIndices.length >= 2) {
      p1 = Math.min(1.0, Math.max(0.0, highlightProgress / 0.45));
      p2 = Math.min(1.0, Math.max(0.0, (highlightProgress - 0.45) / 0.45));
    }

    ctx.save();
    lines.forEach((line) => {
      line.words.forEach((wordObj) => {
        if (wordObj.source === 'active' && wordObj.isHighlight && wordObj.renderX !== undefined && wordObj.renderY !== undefined && wordObj.width !== undefined) {
          const hIdx = focusIndices.indexOf(wordObj.globalIdxInActive);
          let p = 0;
          if (hIdx === 0) p = p1;
          else if (hIdx === 1) p = p2;
          else if (hIdx > 1) p = p2;
          
          if (p > 0) {
            ctx.save();
            ctx.fillStyle = currentTemplate.highlightColor;
            ctx.shadowColor = currentTemplate.highlightShadow;
            ctx.shadowBlur = 5 * scaleFactor;
            
            const markerH = 35 * scaleFactor;
            const markerY = wordObj.renderY - 19 * scaleFactor;
            const markerW = wordObj.width * p;
            
            if (ctx.roundRect) {
              ctx.beginPath();
              ctx.roundRect(wordObj.renderX - 4 * scaleFactor, markerY, markerW + 8 * scaleFactor, markerH, 4 * scaleFactor);
              ctx.fill();
            } else {
              ctx.fillRect(wordObj.renderX - 4 * scaleFactor, markerY, markerW + 8 * scaleFactor, markerH);
            }
            ctx.restore();
          }
        }
      });
    });
    ctx.restore();

    // 5. Draw all the text words on top with unique lens bokeh blurs per word
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = paperFont;

    lines.forEach((line, lineIdx) => {
      const distFromCenter = Math.abs(lineIdx - activeCenterIdx);

      line.words.forEach((wordObj) => {
        if (wordObj.renderX === undefined || wordObj.renderY === undefined) return;

        let blurVal = 0;
        let textColor = currentTemplate.textColor;

        if (wordObj.source === 'active') {
          blurVal = 0;
          textColor = currentTemplate.textColor;
        } else {
          if (distFromCenter === 0) {
            blurVal = 1.0 * scaleFactor;
            textColor = currentTemplate.textBlurs[0];
          } else if (distFromCenter <= 1) {
            blurVal = 2.4 * scaleFactor;
            textColor = currentTemplate.textBlurs[1];
          } else if (distFromCenter <= 2) {
            blurVal = 4.2 * scaleFactor;
            textColor = currentTemplate.textBlurs[2];
          } else {
            blurVal = 5.8 * scaleFactor;
            textColor = currentTemplate.textBlurs[3];
          }
        }

        ctx.save();
        ctx.fillStyle = textColor;
        if (blurVal > 0 && ctx.filter !== undefined) {
          ctx.filter = `blur(${blurVal}px)`;
        } else if (ctx.filter !== undefined) {
          ctx.filter = 'none';
        }

        ctx.fillText(wordObj.text, wordObj.renderX, wordObj.renderY);
        ctx.restore();
      });
    });
    ctx.restore();

    // 6. Support branding logo overlay on top of Fake News visual
    if (config.logoUrl) {
      const logoImg = imageCache.get('brand-logo');
      if (logoImg) {
        const scaleX = (config.logoX !== undefined ? config.logoX : 85) / 100;
        const scaleY = (config.logoY !== undefined ? config.logoY : 15) / 100;
        const logoSize = config.logoSize !== undefined ? config.logoSize : 80;
        const opacity = config.logoOpacity !== undefined ? config.logoOpacity : 0.9;
        const logoX = width * scaleX - logoSize / 2;
        const logoY = height * scaleY - logoSize / 2;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        ctx.restore();
      }
    }

    return; // Bypass normal background rendering & standard split screen
  }

  // Render Fake Comment Human Behavior (No standard panels, scrolls comment feed popup viewport with cursor selection)
  let isFakeCommentActive = chosenBehavior === 'fakeComment';

  if (isFakeCommentActive && activeBlock) {
    // 0. Use deterministic seeded random generator based on the subtitle text so comment feeds differ across videos/segments
    const rand = createSeededRandom(activeBlock.text + activeBlockIdx);

    // Dynamic pool of English comments, usernames, and profiles
    const usernamesPool = [
      "@alex_ventures", "@spark_mindset", "@nova_crafter", "@clara_peaks", 
      "@dustin_media", "@daily_motivator", "@grace_harmony", "@intellect_hub",
      "@ethan_peaks", "@chloe_insights", "@mason_grid", "@sophia_ideas",
      "@lucas_vibe", "@olivia_wisdom", "@liam_creations", "@emma_perspectives",
      "@tech_guru", "@vortex_art", "@urban_echo", "@zenith_lines",
      "@sarah_writes", "@wanderlust_99", "@pixel_architect", "@leo_dreamer",
      "@maya_creatives", "@atlas_insights", "@luna_eclipse", "@phoenix_brand",
      "@kai_studio", "@lucid_pacing", "@hannah_flows", "@derek_visuals",
      "@olivia_lens", "@jake_builders", "@zoe_chronicles", "@ryan_frames",
      "@natalie_peaks", "@gavin_focus", "@fiona_vibe", "@cooper_designs"
    ];

    const avatarColorsPool = [
      "#f43f5e", "#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", 
      "#14b8a6", "#6366f1", "#06b6d4", "#a855f7"
    ];

    const genericEnglishComments = [
      "This is absolutely brilliant! Saved for later.",
      "I've watched this section five times already! 🤯",
      "Wait, this makes so much sense when you explain it this way.",
      "The attention to detail in this video is next level.",
      "Can we talk about how clean the presentation is? Subscribed!",
      "Exactly what I was looking for today. Incredible value.",
      "This is easily the best content on my feed right now.",
      "One of the most precise explanations of this topic ever.",
      "This clicked instantly. Pure gold! 🌟",
      "Such a simple way to look at a complex problem. Kudos!",
      "I'm genuinely impressed by the production quality here.",
      "No fluff, just straight facts. Love it!",
      "Keeping this on repeat, thank you so much for sharing! 🔥",
      "The alignment between audio and visuals is so satisfying.",
      "This is a masterpiece of content creation!",
      "Who else is here before this goes viral? 🚀",
      "The pacing of this video is spot-on. Not a single wasted second.",
      "Highly informative, engaging, and beautifully designed.",
      "This perspective changed my whole outlook on the subject.",
      "10/10 content. Need more videos like this, please!",
      "I can't stop thinking about this. Genuinely mind-blowing.",
      "The graphics are stunning and perfectly support the message.",
      "A perfect blend of educational value and entertainment.",
      "Such an elegant layout! Which software did you use?",
      "I have never understood this concept so clearly before.",
      "Shared this with my core team immediately. Excellent work!",
      "This is why I love this channel. Always delivering quality.",
      "Simple, concise, and incredibly powerful. Well done!",
      "I'm literally blown away by the clarity of this video.",
      "Every single frame is packed with real insight. 📈",
      "A masterclass in delivering concise information!",
      "The background music fits the vibe perfectly.",
      "This deserves millions of views. Absolutely stellar.",
      "My respect for the creator of this video just went up!",
      "Incredibly well-researched and structured. Kudos to you.",
      "This is the content we need more of. Thank you!",
      "So satisfying to watch and listen to. Perfect combo!",
      "A flawless execution from start to finish. Bravo!",
      "This is beautiful! How long did it take to render?",
      "My jaw actually dropped during this specific section.",
      "Such profound wisdom in a short clip. Magnificent.",
      "This is direct, actionable, and super clean. Cheers!",
      "An absolute gem of a find! Following immediately.",
      "I'm saving this to my favorites. Unmatched style.",
      "The pacing, the design, the message—everything is perfect.",
      "This is high-key some of the best advice I've heard this year.",
      "The visual translation of these ideas is phenomenal.",
      "So polished and clean. Loving the color aesthetic! 🎨",
      "I had to pause and think about that first line. Deep stuff.",
      "Phenomenal work! Keep these coming, admin!",
      "This feels like a premium documentary. Incredible!",
      "The typography and design choices are top-tier.",
      "I'm obsessed with this layout. So professional.",
      "This is so satisfying to look at. Great design sense!",
      "This blew my expectations out of the water.",
      "A beautifully crafted piece of art. Well done!",
      "I didn't think I'd learn something new today, but here we are.",
      "Such a refreshing take on this. Love the energy. 🔋",
      "This is standard-setting quality right here.",
      "Incredible depth for such a short duration.",
      "I am absolutely mesmerized by how clean this is.",
      "Extremely high value density. No empty words.",
      "This is pure art. The editing must have taken ages.",
      "Exactly what I needed to hear at this exact moment.",
      "This is a perfect summary. Simple yet profound.",
      "Every second is so engaging. I didn't click away once.",
      "The structure is pristine. Very easy to follow.",
      "This feels so fluid and polished. Incredible render!",
      "Absolutely top-of-the-line editing style. I'm a fan.",
      "This clicked so fast. Thank you for this presentation!",
      "This is outstanding. Truly an oasis of good design.",
      "This layout is super pleasing to the eyes. Very pleasant.",
      "This actually resolved a doubt I had for a long time.",
      "No wasted words, maximum impact. Outstanding! 💯",
      "I'm in awe of how smooth this transition is.",
      "A brilliant display of creative talent. Subscribed!",
      "The sound design is superb. Goes so well with the slides.",
      "This is genuinely incredible. Definitely recommend!",
      "Extremely smart presentation. Keep doing what you do!",
      "This is so eye-opening, literally mind-bent!",
      "The most professional video on this topic yet.",
      "I've shared this with everyone. They all loved it!",
      "The visual hierarchy is spot on. Very easy to read.",
      "This is just therapeutic to watch. Loving these colors!",
      "This has so much style, it's unreal. Absolutely amazing.",
      "Brilliant concept executed to perfection.",
      "This is the gold standard for video production.",
      "I've learned more in 30 seconds than in an hour class.",
      "Every scene layout is so balanced. High taste!",
      "Perfect delivery of a very interesting point.",
      "The aesthetic here is just sublime. Very neat.",
      "Could watch this all day. Excellent flow.",
      "This is extremely clever. Well played, creator!",
      "Perfect timing, perfect message, perfect style.",
      "This video is worth its weight in gold. Seriously.",
      "One of those rare clips you can watch repeatedly.",
      "The logic is ironclad and so elegantly presented.",
      "An absolute masterclass in editing. Love your work!",
      "Genuinely helpful and highly aesthetic.",
      "Hands down the most well-produced piece of content here."
    ];

    interface CommentStyleScenario {
      id: string;
      name: string;
      backdropBg: string;
      gridLineColor: string;
      panelBg: string;
      panelBorderColor: string;
      headerTitleColor: string;
      headerBadgeColor: string;
      closeButtonColor: string;
      dividerColor: string;
      inputBarBg: string;
      inputBarBorderColor: string;
      innerInputBg: string;
      innerInputPlaceholderColor: string;
      smileIconColor: string;
      sendIconColor: string;
      highlightBoxBg: string;
      usernameColor: string;
      avatarInitialsColor: string;
      verifiedBadgeColor: string;
      timeLabelColor: string;
      targetCommentTextColor: string;
      normalCommentTextColor: string;
      heartIconColor: string;
      likesColor: string;
    }

    // 20 rich and diverse Comment Style Scenarios (both dark, light, and stylized colors)
    const styleScenarios: CommentStyleScenario[] = [
      {
        id: "tiktok_dark",
        name: "Classic TikTok Dark",
        backdropBg: "#0d0d0d",
        gridLineColor: "rgba(255, 255, 255, 0.012)",
        panelBg: "rgba(18, 18, 18, 0.96)",
        panelBorderColor: "rgba(255, 255, 255, 0.08)",
        headerTitleColor: "#ffffff",
        headerBadgeColor: "rgba(255, 255, 255, 0.45)",
        closeButtonColor: "rgba(255, 255, 255, 0.4)",
        dividerColor: "rgba(255, 255, 255, 0.08)",
        inputBarBg: "#121212",
        inputBarBorderColor: "rgba(255, 255, 255, 0.08)",
        innerInputBg: "#2c2c2c",
        innerInputPlaceholderColor: "rgba(255, 255, 255, 0.4)",
        smileIconColor: "rgba(255, 255, 255, 0.4)",
        sendIconColor: "#ff0050",
        highlightBoxBg: "rgba(22, 240, 240, 0.35)",
        usernameColor: "#ffffff",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#00f2fe",
        timeLabelColor: "rgba(255, 255, 255, 0.4)",
        targetCommentTextColor: "#ffffff",
        normalCommentTextColor: "rgba(255, 255, 255, 0.85)",
        heartIconColor: "rgba(255, 255, 255, 0.3)",
        likesColor: "rgba(255, 255, 255, 0.4)"
      },
      {
        id: "insta_light",
        name: "Instagram Light",
        backdropBg: "#fafafa",
        gridLineColor: "rgba(0, 0, 0, 0.015)",
        panelBg: "#ffffff",
        panelBorderColor: "rgba(0, 0, 0, 0.08)",
        headerTitleColor: "#262626",
        headerBadgeColor: "rgba(0, 0, 0, 0.4)",
        closeButtonColor: "rgba(0, 0, 0, 0.5)",
        dividerColor: "rgba(0, 0, 0, 0.08)",
        inputBarBg: "#ffffff",
        inputBarBorderColor: "rgba(0, 0, 0, 0.08)",
        innerInputBg: "#fafafa",
        innerInputPlaceholderColor: "rgba(0, 0, 0, 0.38)",
        smileIconColor: "rgba(0, 0, 0, 0.5)",
        sendIconColor: "#0095f6",
        highlightBoxBg: "rgba(254, 44, 85, 0.22)",
        usernameColor: "#262626",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#0095f6",
        timeLabelColor: "rgba(0, 0, 0, 0.4)",
        targetCommentTextColor: "#262626",
        normalCommentTextColor: "rgba(38, 38, 38, 0.82)",
        heartIconColor: "rgba(0, 0, 0, 0.3)",
        likesColor: "rgba(0, 0, 0, 0.4)"
      },
      {
        id: "cyberpunk_neon",
        name: "Cyberpunk Neon",
        backdropBg: "#03001e",
        gridLineColor: "rgba(247, 37, 133, 0.04)",
        panelBg: "rgba(12, 5, 23, 0.95)",
        panelBorderColor: "#f72585",
        headerTitleColor: "#4cc9f0",
        headerBadgeColor: "#7209b7",
        closeButtonColor: "#f72585",
        dividerColor: "rgba(247, 37, 133, 0.25)",
        inputBarBg: "#0c0517",
        inputBarBorderColor: "rgba(247, 37, 133, 0.25)",
        innerInputBg: "#1a0f30",
        innerInputPlaceholderColor: "rgba(76, 201, 240, 0.4)",
        smileIconColor: "#4cc9f0",
        sendIconColor: "#f72585",
        highlightBoxBg: "rgba(114, 9, 183, 0.45)",
        usernameColor: "#4cc9f0",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#f72585",
        timeLabelColor: "rgba(224, 251, 252, 0.5)",
        targetCommentTextColor: "#ffffff",
        normalCommentTextColor: "rgba(224, 251, 252, 0.85)",
        heartIconColor: "#f72585",
        likesColor: "#4cc9f0"
      },
      {
        id: "royal_purple",
        name: "Vibrant Royal Purple",
        backdropBg: "#120921",
        gridLineColor: "rgba(168, 85, 247, 0.03)",
        panelBg: "rgba(30, 18, 51, 0.96)",
        panelBorderColor: "rgba(168, 85, 247, 0.2)",
        headerTitleColor: "#f3e8ff",
        headerBadgeColor: "rgba(168, 85, 247, 0.4)",
        closeButtonColor: "rgba(168, 85, 247, 0.6)",
        dividerColor: "rgba(168, 85, 247, 0.15)",
        inputBarBg: "#160d29",
        inputBarBorderColor: "rgba(168, 85, 247, 0.2)",
        innerInputBg: "#271945",
        innerInputPlaceholderColor: "rgba(243, 232, 255, 0.4)",
        smileIconColor: "rgba(243, 232, 255, 0.5)",
        sendIconColor: "#c084fc",
        highlightBoxBg: "rgba(168, 85, 247, 0.38)",
        usernameColor: "#d8b4fe",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#a855f7",
        timeLabelColor: "rgba(243, 232, 255, 0.4)",
        targetCommentTextColor: "#ffffff",
        normalCommentTextColor: "rgba(243, 232, 255, 0.82)",
        heartIconColor: "rgba(168, 85, 247, 0.4)",
        likesColor: "rgba(168, 85, 247, 0.5)"
      },
      {
        id: "vintage_sepia",
        name: "Vintage Sepia",
        backdropBg: "#2d241c",
        gridLineColor: "rgba(67, 52, 34, 0.04)",
        panelBg: "#f4ecd8",
        panelBorderColor: "#d9cbaf",
        headerTitleColor: "#433422",
        headerBadgeColor: "rgba(67, 52, 34, 0.4)",
        closeButtonColor: "rgba(67, 52, 34, 0.5)",
        dividerColor: "rgba(67, 52, 34, 0.12)",
        inputBarBg: "#ebdcb9",
        inputBarBorderColor: "#d9cbaf",
        innerInputBg: "#fcf8eb",
        innerInputPlaceholderColor: "rgba(67, 52, 34, 0.4)",
        smileIconColor: "rgba(67, 52, 34, 0.5)",
        sendIconColor: "#8c6239",
        highlightBoxBg: "rgba(197, 160, 89, 0.35)",
        usernameColor: "#72563c",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#8c6239",
        timeLabelColor: "rgba(67, 52, 34, 0.5)",
        targetCommentTextColor: "#2a1e12",
        normalCommentTextColor: "#4a3b2c",
        heartIconColor: "rgba(140, 98, 57, 0.4)",
        likesColor: "rgba(140, 98, 57, 0.5)"
      },
      {
        id: "emerald_glass",
        name: "Emerald Glass",
        backdropBg: "#022c22",
        gridLineColor: "rgba(16, 185, 129, 0.03)",
        panelBg: "rgba(6, 78, 59, 0.96)",
        panelBorderColor: "rgba(16, 185, 129, 0.2)",
        headerTitleColor: "#d1fae5",
        headerBadgeColor: "rgba(16, 185, 129, 0.4)",
        closeButtonColor: "rgba(16, 185, 129, 0.6)",
        dividerColor: "rgba(16, 185, 129, 0.15)",
        inputBarBg: "#043f30",
        inputBarBorderColor: "rgba(16, 185, 129, 0.2)",
        innerInputBg: "#0a5c48",
        innerInputPlaceholderColor: "rgba(209, 250, 229, 0.4)",
        smileIconColor: "rgba(209, 250, 229, 0.5)",
        sendIconColor: "#34d399",
        highlightBoxBg: "rgba(52, 211, 153, 0.35)",
        usernameColor: "#a7f3d0",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#10b981",
        timeLabelColor: "rgba(209, 250, 229, 0.4)",
        targetCommentTextColor: "#ffffff",
        normalCommentTextColor: "rgba(209, 250, 229, 0.85)",
        heartIconColor: "rgba(16, 185, 129, 0.4)",
        likesColor: "rgba(16, 185, 129, 0.5)"
      },
      {
        id: "midnight_ocean",
        name: "Midnight Ocean",
        backdropBg: "#030f26",
        gridLineColor: "rgba(56, 189, 248, 0.03)",
        panelBg: "rgba(7, 29, 73, 0.96)",
        panelBorderColor: "rgba(56, 189, 248, 0.2)",
        headerTitleColor: "#e0f2fe",
        headerBadgeColor: "rgba(56, 189, 248, 0.4)",
        closeButtonColor: "rgba(56, 189, 248, 0.6)",
        dividerColor: "rgba(56, 189, 248, 0.15)",
        inputBarBg: "#05163a",
        inputBarBorderColor: "rgba(56, 189, 248, 0.2)",
        innerInputBg: "#0a265c",
        innerInputPlaceholderColor: "rgba(224, 242, 254, 0.4)",
        smileIconColor: "rgba(224, 242, 254, 0.5)",
        sendIconColor: "#38bdf8",
        highlightBoxBg: "rgba(14, 165, 233, 0.38)",
        usernameColor: "#bae6fd",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#0ea5e9",
        timeLabelColor: "rgba(224, 242, 254, 0.4)",
        targetCommentTextColor: "#ffffff",
        normalCommentTextColor: "rgba(224, 242, 254, 0.82)",
        heartIconColor: "rgba(56, 189, 248, 0.4)",
        likesColor: "rgba(56, 189, 248, 0.5)"
      },
      {
        id: "minimal_sand",
        name: "Minimalist Sand",
        backdropBg: "#e5e5e0",
        gridLineColor: "rgba(0, 0, 0, 0.012)",
        panelBg: "#f5f5f0",
        panelBorderColor: "rgba(0, 0, 0, 0.06)",
        headerTitleColor: "#2d2c2a",
        headerBadgeColor: "rgba(0, 0, 0, 0.35)",
        closeButtonColor: "rgba(0, 0, 0, 0.45)",
        dividerColor: "rgba(0, 0, 0, 0.06)",
        inputBarBg: "#eaeae4",
        inputBarBorderColor: "rgba(0, 0, 0, 0.06)",
        innerInputBg: "#f9f9f6",
        innerInputPlaceholderColor: "rgba(0, 0, 0, 0.35)",
        smileIconColor: "rgba(0, 0, 0, 0.45)",
        sendIconColor: "#8b8577",
        highlightBoxBg: "rgba(170, 160, 140, 0.32)",
        usernameColor: "#5c5850",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#8b8577",
        timeLabelColor: "rgba(0, 0, 0, 0.35)",
        targetCommentTextColor: "#1f1e1c",
        normalCommentTextColor: "rgba(61, 60, 58, 0.85)",
        heartIconColor: "rgba(139, 133, 119, 0.35)",
        likesColor: "rgba(139, 133, 119, 0.45)"
      },
      {
        id: "volcanic_flame",
        name: "Volcanic Flame",
        backdropBg: "#1a0a05",
        gridLineColor: "rgba(249, 115, 22, 0.03)",
        panelBg: "rgba(45, 19, 10, 0.96)",
        panelBorderColor: "rgba(249, 115, 22, 0.25)",
        headerTitleColor: "#ffedd5",
        headerBadgeColor: "rgba(249, 115, 22, 0.4)",
        closeButtonColor: "rgba(249, 115, 22, 0.6)",
        dividerColor: "rgba(249, 115, 22, 0.15)",
        inputBarBg: "#220e07",
        inputBarBorderColor: "rgba(249, 115, 22, 0.2)",
        innerInputBg: "#3b1a0e",
        innerInputPlaceholderColor: "rgba(255, 237, 213, 0.4)",
        smileIconColor: "rgba(255, 237, 213, 0.5)",
        sendIconColor: "#f97316",
        highlightBoxBg: "rgba(249, 115, 22, 0.35)",
        usernameColor: "#ffedd5",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#f97316",
        timeLabelColor: "rgba(255, 237, 213, 0.4)",
        targetCommentTextColor: "#ffffff",
        normalCommentTextColor: "rgba(255, 237, 213, 0.85)",
        heartIconColor: "rgba(249, 115, 22, 0.4)",
        likesColor: "rgba(249, 115, 22, 0.5)"
      },
      {
        id: "sweet_sakura",
        name: "Sweet Sakura",
        backdropBg: "#fff1f2",
        gridLineColor: "rgba(251, 113, 133, 0.02)",
        panelBg: "#fffbfa",
        panelBorderColor: "#fecdd3",
        headerTitleColor: "#9f1239",
        headerBadgeColor: "rgba(159, 18, 57, 0.4)",
        closeButtonColor: "rgba(159, 18, 57, 0.5)",
        dividerColor: "#ffe4e6",
        inputBarBg: "#fff5f5",
        inputBarBorderColor: "#fecdd3",
        innerInputBg: "#fffbff",
        innerInputPlaceholderColor: "rgba(159, 18, 57, 0.35)",
        smileIconColor: "rgba(159, 18, 57, 0.45)",
        sendIconColor: "#fb7185",
        highlightBoxBg: "rgba(251, 113, 133, 0.28)",
        usernameColor: "#be123c",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#fb7185",
        timeLabelColor: "rgba(159, 18, 57, 0.4)",
        targetCommentTextColor: "#31000e",
        normalCommentTextColor: "#4c0519",
        heartIconColor: "rgba(251, 113, 133, 0.4)",
        likesColor: "rgba(159, 18, 57, 0.45)"
      },
      {
        id: "electric_blue",
        name: "Electric Blue",
        backdropBg: "#020617",
        gridLineColor: "rgba(96, 165, 250, 0.03)",
        panelBg: "rgba(11, 19, 43, 0.96)",
        panelBorderColor: "rgba(96, 165, 250, 0.15)",
        headerTitleColor: "#60a5fa",
        headerBadgeColor: "rgba(96, 165, 250, 0.4)",
        closeButtonColor: "rgba(96, 165, 250, 0.6)",
        dividerColor: "rgba(96, 165, 250, 0.12)",
        inputBarBg: "#070c1e",
        inputBarBorderColor: "rgba(96, 165, 250, 0.15)",
        innerInputBg: "#1c2541",
        innerInputPlaceholderColor: "rgba(96, 165, 250, 0.4)",
        smileIconColor: "rgba(96, 165, 250, 0.5)",
        sendIconColor: "#3b82f6",
        highlightBoxBg: "rgba(37, 99, 235, 0.45)",
        usernameColor: "#93c5fd",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#2563eb",
        timeLabelColor: "rgba(96, 165, 250, 0.4)",
        targetCommentTextColor: "#ffffff",
        normalCommentTextColor: "rgba(191, 219, 254, 0.85)",
        heartIconColor: "rgba(96, 165, 250, 0.4)",
        likesColor: "rgba(96, 165, 250, 0.5)"
      },
      {
        id: "forest_shadow",
        name: "Forest Shadow",
        backdropBg: "#0f1710",
        gridLineColor: "rgba(16, 185, 129, 0.03)",
        panelBg: "rgba(20, 34, 22, 0.96)",
        panelBorderColor: "rgba(16, 185, 129, 0.15)",
        headerTitleColor: "#a7f3d0",
        headerBadgeColor: "rgba(16, 185, 129, 0.35)",
        closeButtonColor: "rgba(16, 185, 129, 0.55)",
        dividerColor: "rgba(16, 185, 129, 0.1)",
        inputBarBg: "#0b150f",
        inputBarBorderColor: "rgba(16, 185, 129, 0.12)",
        innerInputBg: "#172b1d",
        innerInputPlaceholderColor: "rgba(167, 243, 208, 0.4)",
        smileIconColor: "rgba(167, 243, 208, 0.5)",
        sendIconColor: "#10b981",
        highlightBoxBg: "rgba(74, 222, 128, 0.3)",
        usernameColor: "#d1fae5",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#10b981",
        timeLabelColor: "rgba(167, 243, 208, 0.35)",
        targetCommentTextColor: "#ffffff",
        normalCommentTextColor: "rgba(167, 243, 208, 0.82)",
        heartIconColor: "rgba(16, 185, 129, 0.35)",
        likesColor: "rgba(16, 185, 129, 0.45)"
      },
      {
        id: "plum_dream",
        name: "Plum Dream",
        backdropBg: "#1f0b24",
        gridLineColor: "rgba(236, 72, 153, 0.03)",
        panelBg: "rgba(53, 21, 59, 0.96)",
        panelBorderColor: "rgba(219, 39, 119, 0.2)",
        headerTitleColor: "#fbcfe8",
        headerBadgeColor: "rgba(219, 39, 119, 0.4)",
        closeButtonColor: "rgba(219, 39, 119, 0.6)",
        dividerColor: "rgba(219, 39, 119, 0.15)",
        inputBarBg: "#19081d",
        inputBarBorderColor: "rgba(219, 39, 119, 0.2)",
        innerInputBg: "#2d0f32",
        innerInputPlaceholderColor: "rgba(251, 207, 232, 0.4)",
        smileIconColor: "rgba(251, 207, 232, 0.5)",
        sendIconColor: "#ec4899",
        highlightBoxBg: "rgba(236, 72, 153, 0.38)",
        usernameColor: "#f472b6",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#db2777",
        timeLabelColor: "rgba(251, 207, 232, 0.4)",
        targetCommentTextColor: "#ffffff",
        normalCommentTextColor: "rgba(251, 207, 232, 0.82)",
        heartIconColor: "rgba(219, 39, 119, 0.4)",
        likesColor: "rgba(219, 39, 119, 0.5)"
      },
      {
        id: "ice_blizzard",
        name: "Ice Blizzard",
        backdropBg: "#f0f9ff",
        gridLineColor: "rgba(14, 165, 233, 0.02)",
        panelBg: "#e0f2fe",
        panelBorderColor: "#bae6fd",
        headerTitleColor: "#0369a1",
        headerBadgeColor: "rgba(3, 105, 161, 0.4)",
        closeButtonColor: "rgba(3, 105, 161, 0.5)",
        dividerColor: "#bae6fd",
        inputBarBg: "#d0eafc",
        inputBarBorderColor: "#bae6fd",
        innerInputBg: "#f0f9ff",
        innerInputPlaceholderColor: "rgba(3, 105, 161, 0.38)",
        smileIconColor: "rgba(3, 105, 161, 0.5)",
        sendIconColor: "#0ea5e9",
        highlightBoxBg: "rgba(14, 165, 233, 0.25)",
        usernameColor: "#0284c7",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#0ea5e9",
        timeLabelColor: "rgba(3, 105, 161, 0.4)",
        targetCommentTextColor: "#082f49",
        normalCommentTextColor: "#0c4a6e",
        heartIconColor: "rgba(14, 165, 233, 0.4)",
        likesColor: "rgba(3, 105, 161, 0.45)"
      },
      {
        id: "hacker_terminal",
        name: "Hacker Console",
        backdropBg: "#000000",
        gridLineColor: "rgba(57, 255, 20, 0.015)",
        panelBg: "rgba(8, 12, 8, 0.98)",
        panelBorderColor: "#0f380f",
        headerTitleColor: "#39ff14",
        headerBadgeColor: "rgba(57, 255, 20, 0.4)",
        closeButtonColor: "#39ff14",
        dividerColor: "#0f380f",
        inputBarBg: "#040604",
        inputBarBorderColor: "#0f380f",
        innerInputBg: "#0b140b",
        innerInputPlaceholderColor: "rgba(57, 255, 20, 0.35)",
        smileIconColor: "rgba(57, 255, 20, 0.5)",
        sendIconColor: "#39ff14",
        highlightBoxBg: "rgba(57, 255, 20, 0.25)",
        usernameColor: "#4af626",
        avatarInitialsColor: "#000000",
        verifiedBadgeColor: "#39ff14",
        timeLabelColor: "rgba(57, 255, 20, 0.4)",
        targetCommentTextColor: "#39ff14",
        normalCommentTextColor: "rgba(74, 246, 38, 0.85)",
        heartIconColor: "rgba(57, 255, 20, 0.4)",
        likesColor: "rgba(57, 255, 20, 0.5)"
      },
      {
        id: "solarized_dark",
        name: "Solarized Dark",
        backdropBg: "#002b36",
        gridLineColor: "rgba(147, 161, 161, 0.02)",
        panelBg: "rgba(7, 54, 66, 0.96)",
        panelBorderColor: "#586e75",
        headerTitleColor: "#93a1a1",
        headerBadgeColor: "rgba(147, 161, 161, 0.4)",
        closeButtonColor: "#93a1a1",
        dividerColor: "#586e75",
        inputBarBg: "#00212b",
        inputBarBorderColor: "#586e75",
        innerInputBg: "#002b36",
        innerInputPlaceholderColor: "rgba(147, 161, 161, 0.4)",
        smileIconColor: "rgba(147, 161, 161, 0.5)",
        sendIconColor: "#2aa198",
        highlightBoxBg: "rgba(45, 135, 135, 0.45)",
        usernameColor: "#268bd2",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#2aa198",
        timeLabelColor: "rgba(147, 161, 161, 0.4)",
        targetCommentTextColor: "#fdf6e3",
        normalCommentTextColor: "rgba(147, 161, 161, 0.85)",
        heartIconColor: "rgba(147, 161, 161, 0.35)",
        likesColor: "rgba(147, 161, 161, 0.45)"
      },
      {
        id: "charcoal_premium",
        name: "Charcoal Elegance",
        backdropBg: "#181818",
        gridLineColor: "rgba(255, 255, 255, 0.012)",
        panelBg: "rgba(33, 33, 33, 0.96)",
        panelBorderColor: "#333333",
        headerTitleColor: "#e0e0e0",
        headerBadgeColor: "rgba(255, 255, 255, 0.4)",
        closeButtonColor: "rgba(255, 255, 255, 0.5)",
        dividerColor: "#333333",
        inputBarBg: "#1f1f1f",
        inputBarBorderColor: "#333333",
        innerInputBg: "#2c2c2c",
        innerInputPlaceholderColor: "rgba(255, 255, 255, 0.4)",
        smileIconColor: "rgba(255, 255, 255, 0.5)",
        sendIconColor: "#9e9e9e",
        highlightBoxBg: "rgba(255, 255, 255, 0.15)",
        usernameColor: "#ffffff",
        avatarInitialsColor: "#212121",
        verifiedBadgeColor: "#9e9e9e",
        timeLabelColor: "rgba(255, 255, 255, 0.4)",
        targetCommentTextColor: "#ffffff",
        normalCommentTextColor: "rgba(224, 224, 224, 0.85)",
        heartIconColor: "rgba(255, 255, 255, 0.35)",
        likesColor: "rgba(255, 255, 255, 0.45)"
      },
      {
        id: "sunset_warmth",
        name: "Sunset Warmth",
        backdropBg: "#241405",
        gridLineColor: "rgba(245, 158, 11, 0.02)",
        panelBg: "rgba(58, 31, 10, 0.96)",
        panelBorderColor: "#5f370e",
        headerTitleColor: "#fef3c7",
        headerBadgeColor: "rgba(245, 158, 11, 0.4)",
        closeButtonColor: "rgba(245, 158, 11, 0.5)",
        dividerColor: "#5f370e",
        inputBarBg: "#1e0f03",
        inputBarBorderColor: "#5f370e",
        innerInputBg: "#2e1908",
        innerInputPlaceholderColor: "rgba(254, 243, 199, 0.4)",
        smileIconColor: "rgba(254, 243, 199, 0.5)",
        sendIconColor: "#f59e0b",
        highlightBoxBg: "rgba(245, 158, 11, 0.38)",
        usernameColor: "#fde68a",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#d97706",
        timeLabelColor: "rgba(254, 243, 199, 0.4)",
        targetCommentTextColor: "#ffffff",
        normalCommentTextColor: "rgba(254, 243, 199, 0.82)",
        heartIconColor: "rgba(245, 158, 11, 0.4)",
        likesColor: "rgba(245, 158, 11, 0.5)"
      },
      {
        id: "royal_gold",
        name: "Royal Gold",
        backdropBg: "#1c1917",
        gridLineColor: "rgba(234, 179, 8, 0.02)",
        panelBg: "rgba(46, 37, 22, 0.96)",
        panelBorderColor: "rgba(234, 179, 8, 0.2)",
        headerTitleColor: "#fef08a",
        headerBadgeColor: "rgba(234, 179, 8, 0.4)",
        closeButtonColor: "rgba(234, 179, 8, 0.5)",
        dividerColor: "rgba(234, 179, 8, 0.15)",
        inputBarBg: "#18130a",
        inputBarBorderColor: "rgba(234, 179, 8, 0.15)",
        innerInputBg: "#292011",
        innerInputPlaceholderColor: "rgba(254, 240, 138, 0.4)",
        smileIconColor: "rgba(254, 240, 138, 0.5)",
        sendIconColor: "#ca8a04",
        highlightBoxBg: "rgba(234, 179, 8, 0.32)",
        usernameColor: "#fde047",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#ca8a04",
        timeLabelColor: "rgba(254, 240, 138, 0.4)",
        targetCommentTextColor: "#ffffff",
        normalCommentTextColor: "rgba(254, 240, 138, 0.82)",
        heartIconColor: "rgba(234, 179, 8, 0.35)",
        likesColor: "rgba(234, 179, 8, 0.45)"
      },
      {
        id: "facebook_light",
        name: "Classic Facebook Blue",
        backdropBg: "#f0f2f5",
        gridLineColor: "rgba(24, 119, 242, 0.015)",
        panelBg: "#ffffff",
        panelBorderColor: "#e4e6eb",
        headerTitleColor: "#1c1e21",
        headerBadgeColor: "rgba(0, 0, 0, 0.4)",
        closeButtonColor: "rgba(0, 0, 0, 0.45)",
        dividerColor: "#e4e6eb",
        inputBarBg: "#ffffff",
        inputBarBorderColor: "#e4e6eb",
        innerInputBg: "#f0f2f5",
        innerInputPlaceholderColor: "rgba(0, 0, 0, 0.4)",
        smileIconColor: "rgba(0, 0, 0, 0.45)",
        sendIconColor: "#1877f2",
        highlightBoxBg: "rgba(24, 119, 242, 0.2)",
        usernameColor: "#050505",
        avatarInitialsColor: "#ffffff",
        verifiedBadgeColor: "#1877f2",
        timeLabelColor: "rgba(0, 0, 0, 0.4)",
        targetCommentTextColor: "#050505",
        normalCommentTextColor: "rgba(5, 5, 5, 0.85)",
        heartIconColor: "rgba(24, 119, 242, 0.35)",
        likesColor: "rgba(24, 119, 242, 0.45)"
      }
    ];

    // Select style scenario randomly yet deterministically based on seed
    const selectedStyleIdx = Math.floor(rand() * styleScenarios.length);
    const style = styleScenarios[selectedStyleIdx];

    const shuffledUsernames = shuffleArray(usernamesPool);
    const shuffledColors = shuffleArray(avatarColorsPool);
    const shuffledComments = shuffleArray(genericEnglishComments);

    // Helper to shuffle array deterministically via the seed random
    function shuffleArray<T>(arr: T[]): T[] {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const temp = copy[i];
        copy[i] = copy[j];
        copy[j] = temp;
      }
      return copy;
    }

    // Extract dynamic previous subtitle quote if available
    let prevSubText = "";
    if (activeBlockIdx > 0 && subtitles && subtitles[activeBlockIdx - 1]) {
      const rawText = subtitles[activeBlockIdx - 1].text.trim();
      const words = rawText.split(/\s+/).filter(Boolean);
      // Limit to 8 words for a clean realistic quote representation
      prevSubText = words.slice(0, 8).join(" ");
      if (words.length > 8) prevSubText += "...";
    }

    const fakeCommentsData: Array<{
      username: string;
      text: string;
      time: string;
      avatarColor: string;
      initials: string;
      likes: string;
      isTarget?: boolean;
    }> = [];

    let commentPoolIdx = 0;
    for (let i = 0; i < 8; i++) {
      if (i === 3) {
        // Target comment (current displaying subtitle block)
        fakeCommentsData.push({
          username: "@creative_mind",
          text: activeBlock.text,
          time: "Just now",
          avatarColor: "#4f46e5",
          initials: "C",
          likes: `${Math.floor(rand() * 400) + 600}`,
          isTarget: true
        });
      } else {
        const u = shuffledUsernames[i % shuffledUsernames.length];
        const color = shuffledColors[i % shuffledColors.length];
        const init = u.charAt(1).toUpperCase();
        const likesNum = Math.floor(rand() * 150) + 5;
        
        // Let some comments quote previous subtitles for hyper-realism
        let commentText = "";
        if (prevSubText && rand() > 0.6 && i !== 0) {
          const quotes = [
            `Ý hay từ đoạn trước cực: "${prevSubText}" ❤️`,
            `"${prevSubText}" - đoạn này tâm đắc quá!`,
            `Tới clip này thấy câu "${prevSubText}" quá thấm.`
          ];
          commentText = quotes[Math.floor(rand() * quotes.length)];
        } else {
          commentText = shuffledComments[commentPoolIdx % shuffledComments.length];
          commentPoolIdx++;
        }

        const mins = Math.floor(rand() * 45) + 5;
        const timeStr = rand() > 0.5 ? `${i + 1}h trước` : `${mins}phút trước`;

        fakeCommentsData.push({
          username: u,
          text: commentText,
          time: timeStr,
          avatarColor: color,
          initials: init,
          likes: likesNum.toString()
        });
      }
    }

    // 1. Core scaling metrics
    const feedWidth = Math.min(width * 0.9, 680 * scaleFactor);
    const feedLeft = (width - feedWidth) / 2;

    const subWords = activeBlock.text.trim().split(/\s+/).filter(Boolean);
    const maxTextWidth = feedWidth - 110 * scaleFactor;
    const wordObjects: Array<{
      text: string;
      width: number;
      spaceW: number;
      lineIdx: number;
      x: number;
      y: number;
    }> = [];

    ctx.save();
    ctx.font = `500 ${23 * scaleFactor}px sans-serif`;
    const spaceW = ctx.measureText(" ").width;
    let currentLineIdx = 0;
    let currentLineX = 0;
    
    subWords.forEach((wordText) => {
      const wordW = ctx.measureText(wordText).width;
      if (currentLineX + wordW > maxTextWidth && currentLineX > 0) {
        currentLineIdx++;
        currentLineX = 0;
      }
      wordObjects.push({
        text: wordText,
        width: wordW,
        spaceW: spaceW,
        lineIdx: currentLineIdx,
        x: currentLineX,
        y: 0
      });
      currentLineX += wordW + spaceW;
    });
    ctx.restore();

    // Fill alignment relative offsets
    wordObjects.forEach((word) => {
      word.y = word.lineIdx * (35 * scaleFactor);
    });

    const commentBodyHeight = (currentLineIdx + 1) * (35 * scaleFactor);
    const targetCommentHeight = 70 * scaleFactor + commentBodyHeight;

    const commentsHeights = fakeCommentsData.map((cmt) => {
      if (cmt.isTarget) {
        return targetCommentHeight;
      } else {
        const lineEstimate = (cmt.text.length > 55) ? 2 : 1;
        return 65 * scaleFactor + lineEstimate * (28 * scaleFactor);
      }
    });

    // 2. Metrics & timing progressions
    const duration = Math.max(0.5, activeBlock.endTime - activeBlock.startTime);
    const elapsed = adjustedTime - activeBlock.startTime;
    const progress = Math.min(1.0, Math.max(0.0, elapsed / duration));

    // Scroll interpolation over first 1 second
    const scrollProgress = Math.min(1.0, elapsed / 1.0);
    const scrollEase = 1 - Math.pow(1 - scrollProgress, 3); // Smooth cubic ease-out
    const scrollYOffset = (1.0 - scrollEase) * (200 * scaleFactor); // scroll 200px down

    const targetCommentCenterY = height / 2;
    const targetYTop = targetCommentCenterY - targetCommentHeight / 2 + scrollYOffset;

    const commentsY: number[] = [];
    commentsY[3] = targetYTop;
    for (let i = 2; i >= 0; i--) {
      commentsY[i] = commentsY[i + 1] - commentsHeights[i] - 12 * scaleFactor;
    }
    for (let i = 4; i < fakeCommentsData.length; i++) {
      commentsY[i] = commentsY[i - 1] + commentsHeights[i - 1] + 12 * scaleFactor;
    }

    // 3. Highlight coordinates calculations
    // Find consecutive words on the SAME LINE in the MIDDLE or END of the sentence sequence to highlight
    const totalWords = wordObjects.length;
    let hStart = -1;
    let hEnd = -1;
    if (totalWords > 0) {
      const pairs: Array<[number, number]> = [];
      for (let i = 0; i < totalWords - 1; i++) {
        if (wordObjects[i].lineIdx === wordObjects[i + 1].lineIdx) {
          pairs.push([i, i + 1]);
        }
      }

      if (pairs.length > 0) {
        // Preferred range: start at least 35% of the way through, and never at index 0 (if other options exist)
        const minPreferredIndex = Math.max(1, Math.min(totalWords - 1, Math.floor(totalWords * 0.35)));
        const preferredPairs = pairs.filter(([start]) => start >= minPreferredIndex);
        
        if (preferredPairs.length > 0) {
          // Select one of the preferred pairs deterministically using the rand() generator
          const chosenIdx = Math.floor(rand() * preferredPairs.length);
          hStart = preferredPairs[chosenIdx][0];
          hEnd = preferredPairs[chosenIdx][1];
        } else {
          // Fallback: choose any pair that doesn't start at index 0
          const fallbackPairs = pairs.filter(([start]) => start > 0);
          if (fallbackPairs.length > 0) {
            hStart = fallbackPairs[0][0];
            hEnd = fallbackPairs[0][1];
          } else {
            // Absolute fallback (e.g. only one pair on the first line starting at index 0)
            hStart = pairs[0][0];
            hEnd = pairs[0][1];
          }
        }
      } else {
        // No same-line pairs at all - choose a single word in the middle or end
        const midIdx = Math.max(0, Math.min(totalWords - 1, Math.floor(totalWords * 0.6)));
        hStart = midIdx;
        hEnd = midIdx;
      }
    }

    const startWord = wordObjects[hStart];
    const endWord = wordObjects[hEnd];

    const textBaseX = feedLeft + 85 * scaleFactor;

    // Calculate highlight regions relative to the outer untranslated canvas coord
    let hlStartX = textBaseX;
    let hlEndX = textBaseX;
    let hlY = commentsY[3] + 52 * scaleFactor;
    const hlHeight = 28 * scaleFactor;

    if (startWord && endWord) {
      hlStartX = textBaseX + startWord.x;
      hlEndX = textBaseX + endWord.x + endWord.width;
      hlY = commentsY[3] + 52 * scaleFactor + startWord.y;
    }

    // 4. Cursor animations coordinates
    let mouseX = feedLeft + feedWidth * 0.8;
    let mouseY = height * 0.9;
    
    if (progress < 0.3) {
      // Phase 1: Move to start of selected phrase
      const p = progress / 0.3;
      const ease = Math.sin(p * Math.PI / 2);
      mouseX = (1 - ease) * (feedLeft + feedWidth * 0.8) + ease * (hlStartX - 3 * scaleFactor);
      mouseY = (1 - ease) * (height * 0.9) + ease * (hlY + hlHeight / 2);
    } else if (progress < 0.65) {
      // Phase 2: Drag select to highlight the words
      const p = (progress - 0.3) / 0.35;
      mouseX = (1 - p) * (hlStartX - 3 * scaleFactor) + p * hlEndX;
      mouseY = hlY + hlHeight / 2;
    } else if (progress < 0.95) {
      // Phase 3: Complete select & float/hover
      mouseX = hlEndX;
      mouseY = hlY + hlHeight / 2 + Math.sin(elapsed * 4) * 1.5 * scaleFactor;
    } else {
      // Phase 4: Drift out slightly
      const p = (progress - 0.95) / 0.05;
      mouseX = hlEndX + p * 30 * scaleFactor;
      mouseY = hlY + hlHeight / 2 - p * 20 * scaleFactor;
    }

    // 5. Drawing of backdrop list interface
    ctx.save();
    ctx.fillStyle = style.backdropBg;
    ctx.fillRect(0, 0, width, height);
    
    // Abstract grid graphics lines
    ctx.fillStyle = style.gridLineColor;
    for (let x = 0; x < width; x += 60 * scaleFactor) {
      ctx.fillRect(x, 0, 1 * scaleFactor, height);
    }
    
    // Draw centered Comments Panel container
    ctx.fillStyle = style.panelBg;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 40 * scaleFactor;
    
    const panelX = feedLeft - 20 * scaleFactor;
    const panelW = feedWidth + 40 * scaleFactor;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(panelX, 8 * scaleFactor, panelW, height - 16 * scaleFactor, 16 * scaleFactor);
      ctx.fill();
    } else {
      ctx.fillRect(panelX, 8 * scaleFactor, panelW, height - 16 * scaleFactor);
    }
    ctx.strokeStyle = style.panelBorderColor;
    ctx.lineWidth = 1 * scaleFactor;
    ctx.strokeRect(panelX, 8 * scaleFactor, panelW, height - 16 * scaleFactor);
    ctx.restore();

    // 6. Comments Header Panel drawing
    ctx.save();
    ctx.fillStyle = style.headerTitleColor;
    ctx.font = `bold ${24 * scaleFactor}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Comments', feedLeft + 15 * scaleFactor, 55 * scaleFactor);
    
    // counter badge
    ctx.fillStyle = style.headerBadgeColor;
    ctx.font = `500 ${18 * scaleFactor}px sans-serif`;
    ctx.fillText('•  8', feedLeft + 135 * scaleFactor, 55 * scaleFactor);
    
    // close button X
    ctx.strokeStyle = style.closeButtonColor;
    ctx.lineWidth = 2 * scaleFactor;
    const closeX = feedLeft + feedWidth - 25 * scaleFactor;
    const closeY = 55 * scaleFactor;
    ctx.beginPath();
    ctx.moveTo(closeX - 8 * scaleFactor, closeY - 8 * scaleFactor);
    ctx.lineTo(closeX + 8 * scaleFactor, closeY + 8 * scaleFactor);
    ctx.moveTo(closeX + 8 * scaleFactor, closeY - 8 * scaleFactor);
    ctx.lineTo(closeX - 8 * scaleFactor, closeY + 8 * scaleFactor);
    ctx.stroke();
    
    // dividing header line
    ctx.strokeStyle = style.dividerColor;
    ctx.lineWidth = 1 * scaleFactor;
    ctx.beginPath();
    ctx.moveTo(feedLeft - 20 * scaleFactor, 95 * scaleFactor);
    ctx.lineTo(feedLeft + feedWidth + 20 * scaleFactor, 95 * scaleFactor);
    ctx.stroke();
    ctx.restore();

    // Helper drawcomment inline function definition
    const drawCommentCard = (
      cctx: CanvasRenderingContext2D,
      idx: number,
      yPos: number,
      cmtH: number,
      cmtObj: typeof fakeCommentsData[0]
    ) => {
      const left = feedLeft + 15 * scaleFactor;
      const right = feedLeft + feedWidth - 15 * scaleFactor;
      const avatarX = left + 15 * scaleFactor;
      const avatarY = yPos + 15 * scaleFactor;
      const contentLeft = left + 75 * scaleFactor;
      
      // Draw Avatar circle
      cctx.save();
      cctx.fillStyle = cmtObj.avatarColor;
      cctx.beginPath();
      cctx.arc(avatarX + 20 * scaleFactor, avatarY + 20 * scaleFactor, 20 * scaleFactor, 0, Math.PI * 2);
      cctx.fill();
      
      // Draw Avatar initials
      cctx.fillStyle = style.avatarInitialsColor;
      cctx.font = `600 ${18 * scaleFactor}px sans-serif`;
      cctx.textAlign = 'center';
      cctx.textBaseline = 'middle';
      cctx.fillText(cmtObj.initials, avatarX + 20 * scaleFactor, avatarY + 21 * scaleFactor);
      cctx.restore();
      
      // User Info header text
      cctx.save();
      cctx.fillStyle = style.usernameColor;
      cctx.font = `bold ${19 * scaleFactor}px sans-serif`;
      cctx.textAlign = 'left';
      cctx.textBaseline = 'top';
      cctx.fillText(cmtObj.username, contentLeft, yPos + 15 * scaleFactor);
      const usernameW = cctx.measureText(cmtObj.username).width;
      cctx.restore();
      
      // Verified check badge symbol
      if (cmtObj.isTarget) {
        cctx.save();
        cctx.fillStyle = style.verifiedBadgeColor;
        cctx.beginPath();
        cctx.arc(contentLeft + usernameW + 15 * scaleFactor, yPos + 25 * scaleFactor, 7 * scaleFactor, 0, Math.PI * 2);
        cctx.fill();
        cctx.strokeStyle = style.avatarInitialsColor === "#000000" ? "#000000" : "#ffffff";
        cctx.lineWidth = 1.2 * scaleFactor;
        cctx.beginPath();
        cctx.moveTo(contentLeft + usernameW + 12 * scaleFactor, yPos + 25 * scaleFactor);
        cctx.lineTo(contentLeft + usernameW + 14.5 * scaleFactor, yPos + 27.5 * scaleFactor);
        cctx.lineTo(contentLeft + usernameW + 18 * scaleFactor, yPos + 23 * scaleFactor);
        cctx.stroke();
        cctx.restore();
      }
      
      // Relational Time label
      cctx.save();
      cctx.fillStyle = style.timeLabelColor;
      cctx.font = `${14 * scaleFactor}px sans-serif`;
      cctx.textAlign = 'left';
      cctx.textBaseline = 'top';
      const labelX = cmtObj.isTarget ? (contentLeft + usernameW + 30 * scaleFactor) : (contentLeft + usernameW + 12 * scaleFactor);
      cctx.fillText(cmtObj.time, labelX, yPos + 18 * scaleFactor);
      cctx.restore();
      
      // Comment text string paragraphs
      if (cmtObj.isTarget) {
        cctx.save();
        cctx.fillStyle = style.targetCommentTextColor;
        cctx.font = `500 ${23 * scaleFactor}px sans-serif`;
        cctx.textBaseline = 'top';
        cctx.textAlign = 'left';
        
        // Correct target comment subtitle position (Rendered local to the translated coordinate)
        wordObjects.forEach((word) => {
          cctx.fillText(word.text, textBaseX + word.x, yPos + 52 * scaleFactor + word.y);
        });
        cctx.restore();
      } else {
        cctx.save();
        cctx.fillStyle = style.normalCommentTextColor;
        cctx.font = `${20 * scaleFactor}px sans-serif`;
        cctx.textBaseline = 'top';
        cctx.textAlign = 'left';
        
        const wordsArr = cmtObj.text.split(" ");
        const textWidthLimit = feedWidth - 110 * scaleFactor;
        let lineX = contentLeft;
        let lineY = yPos + 46 * scaleFactor;
        
        wordsArr.forEach((word) => {
          const w = cctx.measureText(word + " ").width;
          if (lineX + w > left + textWidthLimit && lineX > contentLeft) {
            lineX = contentLeft;
            lineY += 28 * scaleFactor;
          }
          cctx.fillText(word, lineX, lineY);
          lineX += w;
        });
        cctx.restore();
      }
      
      // Heart feedback count on the far right
      cctx.save();
      const heartX = right - 22 * scaleFactor;
      const heartY = yPos + 20 * scaleFactor;
      cctx.strokeStyle = style.heartIconColor;
      cctx.lineWidth = 1.3 * scaleFactor;
      
      cctx.beginPath();
      cctx.moveTo(heartX, heartY + 4 * scaleFactor);
      cctx.bezierCurveTo(heartX - 6 * scaleFactor, heartY - 2 * scaleFactor, heartX - 10 * scaleFactor, heartY + 4 * scaleFactor, heartX, heartY + 11 * scaleFactor);
      cctx.bezierCurveTo(heartX + 10 * scaleFactor, heartY + 4 * scaleFactor, heartX + 6 * scaleFactor, heartY - 2 * scaleFactor, heartX, heartY + 4 * scaleFactor);
      cctx.stroke();
      
      cctx.fillStyle = style.likesColor;
      cctx.font = `${13 * scaleFactor}px sans-serif`;
      cctx.textAlign = 'center';
      cctx.fillText(cmtObj.likes || "12", heartX, heartY + 22 * scaleFactor);
      cctx.restore();
    };

    // 7. Render dynamic feed containing list of comments
    ctx.save();
    const clipTop = 96 * scaleFactor;
    const clipBottom = height - 90 * scaleFactor;
    ctx.beginPath();
    ctx.rect(feedLeft - 20 * scaleFactor, clipTop, feedWidth + 40 * scaleFactor, clipBottom - clipTop);
    ctx.clip();
    
    fakeCommentsData.forEach((cmt, i) => {
      // Highlight selection overlay box
      if (cmt.isTarget && progress >= 0.3 && startWord && endWord) {
        const currentDragX = progress < 0.65 
          ? (hlStartX + ((progress - 0.3) / 0.35) * (hlEndX - hlStartX))
          : hlEndX;
          
        ctx.save();
        ctx.fillStyle = style.highlightBoxBg; // customized high-fidelity selection highlight
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(hlStartX - 3 * scaleFactor, hlY - 2 * scaleFactor, (currentDragX - hlStartX) + 6 * scaleFactor, hlHeight + 4 * scaleFactor, 4 * scaleFactor);
          ctx.fill();
        } else {
          ctx.fillRect(hlStartX - 3 * scaleFactor, hlY - 2 * scaleFactor, (currentDragX - hlStartX) + 6 * scaleFactor, hlHeight + 4 * scaleFactor);
        }
        ctx.restore();
      }
      
      // Draw background comment cards
      ctx.save();
      ctx.translate(0, commentsY[i]);
      drawCommentCard(ctx, i, 0, commentsHeights[i], cmt);
      ctx.restore();
    });
    ctx.restore();

    // 8. Render bottom text input bar box
    ctx.save();
    ctx.fillStyle = style.inputBarBg;
    ctx.fillRect(feedLeft - 20 * scaleFactor, height - 90 * scaleFactor, feedWidth + 40 * scaleFactor, 90 * scaleFactor);
    
    ctx.strokeStyle = style.inputBarBorderColor;
    ctx.lineWidth = 1 * scaleFactor;
    ctx.beginPath();
    ctx.moveTo(feedLeft - 20 * scaleFactor, height - 90 * scaleFactor);
    ctx.lineTo(feedLeft + feedWidth + 20 * scaleFactor, height - 90 * scaleFactor);
    ctx.stroke();
    
    const inputX = feedLeft + 15 * scaleFactor;
    const inputY = height - 72 * scaleFactor;
    const inputW = feedWidth - 110 * scaleFactor;
    const inputH = 48 * scaleFactor;
    
    ctx.fillStyle = style.innerInputBg;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(inputX, inputY, inputW, inputH, 24 * scaleFactor);
      ctx.fill();
    } else {
      ctx.fillRect(inputX, inputY, inputW, inputH);
    }
    
    ctx.fillStyle = style.innerInputPlaceholderColor;
    ctx.font = `500 ${18 * scaleFactor}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Thêm bình luận...', inputX + 22 * scaleFactor, inputY + inputH / 2);
    
    const smileX = inputX + inputW - 35 * scaleFactor;
    const smileY = inputY + inputH / 2;
    ctx.strokeStyle = style.smileIconColor;
    ctx.lineWidth = 1.3 * scaleFactor;
    ctx.beginPath();
    ctx.arc(smileX, smileY, 9 * scaleFactor, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(smileX, smileY + 1 * scaleFactor, 5 * scaleFactor, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
    
    const sendX = feedLeft + feedWidth - 45 * scaleFactor;
    const sendY = height - 48 * scaleFactor;
    ctx.save();
    ctx.strokeStyle = style.sendIconColor;
    ctx.lineWidth = 1.8 * scaleFactor;
    ctx.beginPath();
    ctx.moveTo(sendX - 8 * scaleFactor, sendY - 10 * scaleFactor);
    ctx.lineTo(sendX + 12 * scaleFactor, sendY);
    ctx.lineTo(sendX - 8 * scaleFactor, sendY + 10 * scaleFactor);
    ctx.lineTo(sendX - 3 * scaleFactor, sendY);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
    ctx.restore();

    // 9. Draw the classic cursor cursor arrow
    ctx.save();
    ctx.translate(mouseX, mouseY);
    const cursorSizeMultiplier = 2.4 * scaleFactor;
    
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 4 * scaleFactor;
    ctx.shadowOffsetX = 2 * scaleFactor;
    ctx.shadowOffsetY = 2 * scaleFactor;
    
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5 * scaleFactor;
    ctx.fillStyle = '#ffffff';
    
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 7 * cursorSizeMultiplier);
    ctx.lineTo(2 * cursorSizeMultiplier, 5 * cursorSizeMultiplier);
    ctx.lineTo(4.5 * cursorSizeMultiplier, 9 * cursorSizeMultiplier);
    ctx.lineTo(6.2 * cursorSizeMultiplier, 8.2 * cursorSizeMultiplier);
    ctx.lineTo(3.8 * cursorSizeMultiplier, 4.2 * cursorSizeMultiplier);
    ctx.lineTo(6.5 * cursorSizeMultiplier, 4.2 * cursorSizeMultiplier);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // 10. Support logo overlays
    if (config.logoUrl) {
      const logoImg = imageCache.get('brand-logo');
      if (logoImg) {
        const scaleX = (config.logoX !== undefined ? config.logoX : 85) / 100;
        const scaleY = (config.logoY !== undefined ? config.logoY : 15) / 100;
        const logoSize = config.logoSize !== undefined ? config.logoSize : 80;
        const opacity = config.logoOpacity !== undefined ? config.logoOpacity : 0.9;
        const logoX = width * scaleX - logoSize / 2;
        const logoY = height * scaleY - logoSize / 2;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        ctx.restore();
      }
    }

    return; // Bypass normal background rendering
  }

  // Render Handwriting Behavior (No standard panels, draws a premium student graph notebook and real-time writing hand)
  let isHandWriteActive = chosenBehavior === 'handWrite';

  if (isHandWriteActive && activeBlock) {
    // Dynamically define the 10 custom handwriting and serif typography options
    const FONTS = [
      { fontString: (s: number) => `italic 600 ${s}px "Georgia", serif`, sizeMultiplier: 1.0 },
      { fontString: (s: number) => `${s}px "Pacifico", cursive`, sizeMultiplier: 0.90 },
      { fontString: (s: number) => `${s}px "Lobster", cursive`, sizeMultiplier: 1.10 },
      { fontString: (s: number) => `600 ${s}px "Comfortaa", cursive`, sizeMultiplier: 0.95 },
      { fontString: (s: number) => `700 ${s}px "Caveat", cursive`, sizeMultiplier: 1.25 },
      { fontString: (s: number) => `${s}px "Patrick Hand", cursive`, sizeMultiplier: 1.15 },
      { fontString: (s: number) => `700 ${s}px "Dancing Script", cursive`, sizeMultiplier: 1.15 },
      { fontString: (s: number) => `700 ${s * 1.55}px "Amatic SC", cursive`, sizeMultiplier: 1.45 },
      { fontString: (s: number) => `${s}px "Itim", cursive`, sizeMultiplier: 1.12 },
      { fontString: (s: number) => `600 ${s}px "Playpen Sans", cursive`, sizeMultiplier: 1.02 }
    ];

    // Dynamically define the 10 custom paper background options
    const PAPERS = [
      // 1. Classic Light-Cream Vietnamese Student Grid ("Ô ly học sinh xanh ngọc")
      {
        bg: '#faf8f2',
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          const gridSpacing = 44 * sf;
          const subSpacing = gridSpacing / 4;
          ctx.strokeStyle = 'rgba(0, 150, 255, 0.05)';
          ctx.lineWidth = 0.5 * sf;
          for (let x = 0; x < w; x += subSpacing) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
          }
          for (let y = 0; y < h; y += subSpacing) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(0, 120, 255, 0.12)';
          ctx.lineWidth = 0.75 * sf;
          for (let x = 0; x < w; x += gridSpacing) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
          }
          for (let y = 0; y < h; y += gridSpacing) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          }
          const marginX = w * 0.14;
          ctx.strokeStyle = 'rgba(235, 75, 75, 0.32)';
          ctx.lineWidth = 1.0 * sf;
          ctx.beginPath(); ctx.moveTo(marginX, 0); ctx.lineTo(marginX, h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(marginX - 4 * sf, 0); ctx.lineTo(marginX - 4 * sf, h); ctx.stroke();
        }
      },
      // 2. Elegant Clear French Ruled Note ("Giấy kẻ ngang Seyes")
      {
        bg: '#fbfbf9',
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          const step = 48 * sf;
          ctx.strokeStyle = 'rgba(50, 90, 160, 0.08)';
          ctx.lineWidth = 0.5 * sf;
          for (let y = 0; y < h; y += step / 4) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(30, 70, 140, 0.20)';
          ctx.lineWidth = 1.0 * sf;
          for (let y = 0; y < h; y += step) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          }
          const marginX = w * 0.12;
          ctx.strokeStyle = 'rgba(235, 60, 60, 0.38)';
          ctx.lineWidth = 1.1 * sf;
          ctx.beginPath(); ctx.moveTo(marginX, 0); ctx.lineTo(marginX, h); ctx.stroke();
        }
      },
      // 3. Vintage Sepia Aged Manuscript ("Giấy da bò cổ xưa")
      {
        bg: '#ebd9b9',
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          const step = 50 * sf;
          ctx.strokeStyle = 'rgba(95, 70, 45, 0.16)';
          ctx.lineWidth = 0.8 * sf;
          for (let y = step; y < h; y += step) {
            ctx.beginPath(); ctx.moveTo(40 * sf, y); ctx.lineTo(w - 40 * sf, y); ctx.stroke();
          }
          const marginX = w * 0.15;
          ctx.strokeStyle = 'rgba(135, 40, 40, 0.32)';
          ctx.lineWidth = 1.2 * sf;
          ctx.beginPath(); ctx.moveTo(marginX, 0); ctx.lineTo(marginX, h); ctx.stroke();
        }
      },
      // 4. Sweet Lavender Pink Memo Page ("Sổ tay ngọt ngào")
      {
        bg: '#fff0f4',
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          const step = 46 * sf;
          ctx.strokeStyle = 'rgba(200, 90, 130, 0.12)';
          ctx.lineWidth = 0.8 * sf;
          for (let y = step; y < h; y += step) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          }
          const marginX = w * 0.16;
          ctx.strokeStyle = 'rgba(210, 50, 100, 0.35)';
          ctx.lineWidth = 1.2 * sf;
          ctx.beginPath(); ctx.moveTo(marginX, 0); ctx.lineTo(marginX, h); ctx.stroke();
        }
      },
      // 5. Soft Mint Moss Green Student Grid ("Vở kẻ mầm non lá phong")
      {
        bg: '#effbf2',
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          const spacing = 40 * sf;
          ctx.strokeStyle = 'rgba(40, 160, 90, 0.07)';
          ctx.lineWidth = 0.5 * sf;
          for (let x = 0; x < w; x += spacing / 4) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
          }
          for (let y = 0; y < h; y += spacing / 4) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(30, 130, 70, 0.20)';
          ctx.lineWidth = 0.85 * sf;
          for (let x = 0; x < w; x += spacing) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
          }
          for (let y = 0; y < h; y += spacing) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          }
        }
      },
      // 6. Warm Yellow Legal Scratchpad ("Giấy ghi chú vàng ấm")
      {
        bg: '#f8f1d7',
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          const step = 45 * sf;
          ctx.strokeStyle = 'rgba(125, 95, 30, 0.14)';
          ctx.lineWidth = 0.7 * sf;
          for (let y = step; y < h; y += step) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          }
          const marginX = w * 0.11;
          ctx.strokeStyle = 'rgba(215, 80, 30, 0.33)';
          ctx.lineWidth = 1.2 * sf;
          ctx.beginPath(); ctx.moveTo(marginX, 0); ctx.lineTo(marginX, h); ctx.stroke();
        }
      },
      // 7. Dark School Slate Blackboard ("Bảng đen trường lớp")
      {
        bg: '#1e242a',
        isDark: true,
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          const step = 48 * sf;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
          ctx.lineWidth = 0.75 * sf;
          for (let y = step; y < h; y += step) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          }
        }
      },
      // 8. Elegant Dotted Bullet Diary ("Sổ tay Bullet Journal mộc")
      {
        bg: '#fafaf6',
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          const dotSpacing = 38 * sf;
          ctx.fillStyle = 'rgba(90, 90, 110, 0.22)';
          for (let x = dotSpacing; x < w; x += dotSpacing) {
            for (let y = dotSpacing; y < h; y += dotSpacing) {
              ctx.beginPath();
              ctx.arc(x, y, 1.2 * sf, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      },
      // 9. Engineering Technical Blueprint Grid ("Bản vẽ thiết kế xanh")
      {
        bg: '#002244',
        isDark: true,
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          const step = 44 * sf;
          ctx.strokeStyle = 'rgba(0, 150, 255, 0.14)';
          ctx.lineWidth = 0.7 * sf;
          for (let x = 0; x < w; x += step) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
          }
          for (let y = 0; y < h; y += step) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          }
        }
      },
      // 10. High-density Millimeter Drafting Grid ("Giấy vẽ kĩ thuật hồng sữa")
      {
        bg: '#fcfcfc',
        draw: (ctx: CanvasRenderingContext2D, w: number, h: number, sf: number) => {
          const major = 60 * sf;
          ctx.strokeStyle = 'rgba(235, 100, 100, 0.06)';
          ctx.lineWidth = 0.4 * sf;
          for (let x = 0; x < w; x += major / 10) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
          }
          for (let y = 0; y < h; y += major / 10) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(235, 100, 100, 0.22)';
          ctx.lineWidth = 0.9 * sf;
          for (let x = 0; x < w; x += major) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
          }
          for (let y = 0; y < h; y += major) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          }
        }
      }
    ];

    // 10 custom pen styles with unique flow settings, colors and shadows
    const PENS: Array<{
      color: string;
      shadowColor?: string;
      shadowBlur?: number;
      draw: (ctx: CanvasRenderingContext2D, sf: number, inkColor: string) => void;
    }> = [
      // 1. Classic Golden fountain pen
      {
        color: '#0f2c59',
        draw: (ctx: CanvasRenderingContext2D, sf: number, inkColor: string) => {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'miter';
          
          // Outer gold nib
          ctx.fillStyle = '#d4af37';
          ctx.strokeStyle = '#8a6d1c';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-6 * sf, -18 * sf);
          ctx.lineTo(-7 * sf, -32 * sf);
          ctx.lineTo(7 * sf, -32 * sf);
          ctx.lineTo(6 * sf, -18 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Silver middle plating
          ctx.fillStyle = '#e0e0e0';
          ctx.strokeStyle = '#9e9e9e';
          ctx.beginPath();
          ctx.moveTo(-3 * sf, -18 * sf);
          ctx.lineTo(-3.5 * sf, -28 * sf);
          ctx.lineTo(3.5 * sf, -28 * sf);
          ctx.lineTo(3 * sf, -18 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Breather hole and slit
          ctx.fillStyle = '#111111';
          ctx.beginPath();
          ctx.arc(0, -22 * sf, 1.2 * sf, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.strokeStyle = '#111111';
          ctx.lineWidth = 0.8 * sf;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -21 * sf);
          ctx.stroke();

          // Black Plastic Collar / Grip
          ctx.fillStyle = '#1c1c1c';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(-8 * sf, -32 * sf);
          ctx.lineTo(8 * sf, -32 * sf);
          ctx.lineTo(10 * sf, -50 * sf);
          ctx.lineTo(-10 * sf, -50 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Shiny golden body barrel
          const bodyGrad = ctx.createLinearGradient(-12 * sf, 0, 12 * sf, 0);
          bodyGrad.addColorStop(0, '#aa8010');
          bodyGrad.addColorStop(0.3, '#f7dfa3');
          bodyGrad.addColorStop(0.7, '#eec86b');
          bodyGrad.addColorStop(1, '#996f05');
          ctx.fillStyle = bodyGrad;
          ctx.strokeStyle = '#6e5004';
          ctx.beginPath();
          ctx.moveTo(-10 * sf, -50 * sf);
          ctx.lineTo(10 * sf, -50 * sf);
          ctx.lineTo(12 * sf, -180 * sf);
          ctx.lineTo(-12 * sf, -180 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Golden end ring trims
          ctx.fillStyle = '#faf0be';
          ctx.fillRect(-10.5 * sf, -54 * sf, 21 * sf, 4 * sf);
        }
      },
      // 2. Hexagonal Yellow Pencil 2B
      {
        color: '#3d3d3d',
        shadowColor: 'rgba(61, 61, 61, 0.4)',
        shadowBlur: 1,
        draw: (ctx: CanvasRenderingContext2D, sf: number) => {
          // Lead tip
          ctx.fillStyle = '#3d3d3d';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-2.2 * sf, -6 * sf);
          ctx.lineTo(2.2 * sf, -6 * sf);
          ctx.closePath();
          ctx.fill();

          // Sharpened wood tip cone
          ctx.fillStyle = '#e8cfa1';
          ctx.beginPath();
          ctx.moveTo(-2.2 * sf, -6 * sf);
          ctx.lineTo(2.2 * sf, -6 * sf);
          ctx.lineTo(7 * sf, -24 * sf);
          ctx.lineTo(-7 * sf, -24 * sf);
          ctx.closePath();
          ctx.fill();

          // Hexagonal yellow wood barrel body
          ctx.fillStyle = '#c89504';
          ctx.beginPath();
          ctx.moveTo(-7 * sf, -24 * sf);
          ctx.lineTo(-2.3 * sf, -24 * sf);
          ctx.lineTo(-3.5 * sf, -170 * sf);
          ctx.lineTo(-9 * sf, -170 * sf);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#fcca1a';
          ctx.beginPath();
          ctx.moveTo(-2.3 * sf, -24 * sf);
          ctx.lineTo(2.3 * sf, -24 * sf);
          ctx.lineTo(3.5 * sf, -170 * sf);
          ctx.lineTo(-3.5 * sf, -170 * sf);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#e5b306';
          ctx.beginPath();
          ctx.moveTo(2.3 * sf, -24 * sf);
          ctx.lineTo(7 * sf, -24 * sf);
          ctx.lineTo(9 * sf, -170 * sf);
          ctx.lineTo(3.5 * sf, -170 * sf);
          ctx.closePath();
          ctx.fill();

          // Silver metal ferrule
          const ferruleGrad = ctx.createLinearGradient(-9 * sf, 0, 9 * sf, 0);
          ferruleGrad.addColorStop(0, '#9e9e9e');
          ferruleGrad.addColorStop(0.5, '#eaeaea');
          ferruleGrad.addColorStop(1, '#7a7a7a');
          ctx.fillStyle = ferruleGrad;
          ctx.beginPath();
          ctx.moveTo(-9 * sf, -170 * sf);
          ctx.lineTo(9 * sf, -170 * sf);
          ctx.lineTo(9.5 * sf, -188 * sf);
          ctx.lineTo(-9.5 * sf, -188 * sf);
          ctx.closePath();
          ctx.fill();

          // Ferrule black stripe
          ctx.fillStyle = '#111111';
          ctx.fillRect(-9.2 * sf, -178 * sf, 18.4 * sf, 2 * sf);

          // Pink rubber eraser
          const eraserGrad = ctx.createLinearGradient(-9.5 * sf, 0, 9.5 * sf, 0);
          eraserGrad.addColorStop(0, '#da7a80');
          eraserGrad.addColorStop(0.3, '#ff9fa5');
          eraserGrad.addColorStop(1, '#c25a60');
          ctx.fillStyle = eraserGrad;
          ctx.beginPath();
          ctx.moveTo(-9.5 * sf, -188 * sf);
          ctx.lineTo(9.5 * sf, -188 * sf);
          ctx.bezierCurveTo(9.5 * sf, -204 * sf, -9.5 * sf, -204 * sf, -9.5 * sf, -188 * sf);
          ctx.closePath();
          ctx.fill();
        }
      },
      // 3. Clear Ballpoint Pen
      {
        color: '#16142c',
        draw: (ctx: CanvasRenderingContext2D, sf: number, inkColor: string) => {
          // Metal point needle tip
          ctx.fillStyle = '#c2c2c2';
          ctx.strokeStyle = '#6e6e6e';
          ctx.lineWidth = 0.8 * sf;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-1.5 * sf, -4 * sf);
          ctx.lineTo(1.5 * sf, -4 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Metal cone tip holder
          ctx.fillStyle = '#e0e0e0';
          ctx.beginPath();
          ctx.moveTo(-1.5 * sf, -4 * sf);
          ctx.lineTo(1.5 * sf, -4 * sf);
          ctx.lineTo(5 * sf, -15 * sf);
          ctx.lineTo(-5 * sf, -15 * sf);
          ctx.closePath();
          ctx.fill();

          // Translucent blue plastic tip collar
          ctx.fillStyle = 'rgba(0, 100, 220, 0.35)';
          ctx.strokeStyle = 'rgba(0, 80, 200, 0.65)';
          ctx.beginPath();
          ctx.moveTo(-5 * sf, -15 * sf);
          ctx.lineTo(5 * sf, -15 * sf);
          ctx.lineTo(7 * sf, -32 * sf);
          ctx.lineTo(-7 * sf, -32 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Clear glass/plastic transparent hexagon barrel
          ctx.fillStyle = 'rgba(235, 245, 255, 0.4)';
          ctx.strokeStyle = 'rgba(150, 190, 230, 0.6)';
          ctx.beginPath();
          ctx.moveTo(-7 * sf, -32 * sf);
          ctx.lineTo(7 * sf, -32 * sf);
          ctx.lineTo(8.5 * sf, -175 * sf);
          ctx.lineTo(-8.5 * sf, -175 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Inside core ink carriage refill tube
          ctx.fillStyle = inkColor;
          ctx.fillRect(-2 * sf, -32 * sf, 4 * sf, 110 * sf);

          // Translucent cap/plug inside core back
          ctx.fillStyle = 'rgba(200, 200, 200, 0.5)';
          ctx.fillRect(-2 * sf, -142 * sf, 4 * sf, 32 * sf);

          // Blue plastic back plug cap
          ctx.fillStyle = '#014ba0';
          ctx.strokeStyle = '#002f6c';
          ctx.beginPath();
          ctx.moveTo(-8.5 * sf, -175 * sf);
          ctx.lineTo(8.5 * sf, -175 * sf);
          ctx.lineTo(7 * sf, -190 * sf);
          ctx.lineTo(-7 * sf, -190 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      },
      // 4. Giant Neon Yellow Highlighter
      {
        color: '#aa1050',
        draw: (ctx: CanvasRenderingContext2D, sf: number) => {
          // Felt chisel flat tip
          ctx.fillStyle = '#eaff05';
          ctx.beginPath();
          ctx.moveTo(-1 * sf, 0);
          ctx.lineTo(4 * sf, -3 * sf);
          ctx.lineTo(7 * sf, -14 * sf);
          ctx.lineTo(-7 * sf, -14 * sf);
          ctx.closePath();
          ctx.fill();

          // Black plastic core tip frame
          ctx.fillStyle = '#222222';
          ctx.beginPath();
          ctx.moveTo(-7 * sf, -14 * sf);
          ctx.lineTo(7 * sf, -14 * sf);
          ctx.lineTo(9 * sf, -28 * sf);
          ctx.lineTo(-9 * sf, -28 * sf);
          ctx.closePath();
          ctx.fill();

          // Chonky flat oval barrel highlighter shape
          const highGrad = ctx.createLinearGradient(-15 * sf, 0, 15 * sf, 0);
          highGrad.addColorStop(0, '#c7ef00');
          highGrad.addColorStop(0.3, '#f2ff47');
          highGrad.addColorStop(0.7, '#dffd13');
          highGrad.addColorStop(1, '#aed100');
          ctx.fillStyle = highGrad;
          ctx.strokeStyle = '#8ca800';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath();
          ctx.moveTo(-11 * sf, -28 * sf);
          ctx.lineTo(11 * sf, -28 * sf);
          ctx.lineTo(16 * sf, -165 * sf);
          ctx.lineTo(-16 * sf, -165 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Brand imprint stripe
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-11 * sf, -85 * sf, 22 * sf, 14 * sf);
          ctx.fillStyle = '#111111';
          ctx.font = `italic bold ${8 * sf}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('NEON', 0, -78 * sf);
        }
      },
      // 5. Stylized Minimalist MUJI White Gel Pen
      {
        color: '#111111',
        draw: (ctx: CanvasRenderingContext2D, sf: number, inkColor: string) => {
          // Silver round writing tip
          ctx.fillStyle = '#dadada';
          ctx.strokeStyle = '#7c7c7c';
          ctx.lineWidth = 0.5 * sf;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-1.8 * sf, -5 * sf);
          ctx.lineTo(1.8 * sf, -5 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Matte white plastic grip taper (Minimalist MUJI vibe)
          ctx.fillStyle = '#fafaf9';
          ctx.strokeStyle = '#e2e2df';
          ctx.beginPath();
          ctx.moveTo(-1.8 * sf, -5 * sf);
          ctx.lineTo(1.8 * sf, -5 * sf);
          ctx.lineTo(6.5 * sf, -30 * sf);
          ctx.lineTo(-6.5 * sf, -30 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Matte translucent white rubber grip section
          ctx.fillStyle = '#ecebe7';
          ctx.beginPath();
          ctx.moveTo(-6.5 * sf, -30 * sf);
          ctx.lineTo(6.5 * sf, -30 * sf);
          ctx.lineTo(8 * sf, -72 * sf);
          ctx.lineTo(-8 * sf, -72 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Minimalist sleek white opaque body
          const bodyGrad = ctx.createLinearGradient(-9 * sf, 0, 9 * sf, 0);
          bodyGrad.addColorStop(0, '#f2f2f0');
          bodyGrad.addColorStop(0.4, '#ffffff');
          bodyGrad.addColorStop(1, '#dededd');
          ctx.fillStyle = bodyGrad;
          ctx.beginPath();
          ctx.moveTo(-8 * sf, -72 * sf);
          ctx.lineTo(8 * sf, -72 * sf);
          ctx.lineTo(9.5 * sf, -180 * sf);
          ctx.lineTo(-9.5 * sf, -180 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Small indicator stripe showing ink color at the top cap boundary
          ctx.fillStyle = inkColor;
          ctx.fillRect(-9.1 * sf, -172 * sf, 18.2 * sf, 6 * sf);
        }
      },
      // 6. Classroom Dustless Chalk Stick
      {
        color: '#c00303', // Revision Ruby Chalk
        draw: (ctx: CanvasRenderingContext2D, sf: number, inkColor: string) => {
          // Chalk cylinder tip
          ctx.fillStyle = inkColor;
          ctx.beginPath();
          ctx.moveTo(-6 * sf, -5 * sf);
          ctx.lineTo(7 * sf, 0);
          ctx.lineTo(9 * sf, -8 * sf);
          ctx.lineTo(-7 * sf, -12 * sf);
          ctx.closePath();
          ctx.fill();

          // Chalk dust lighting texture
          const chalkGrad = ctx.createLinearGradient(-11 * sf, 0, 11 * sf, 0);
          chalkGrad.addColorStop(0, 'rgba(0,0,0,0.18)');
          chalkGrad.addColorStop(0.4, 'rgba(255,255,255,0.45)');
          chalkGrad.addColorStop(1, 'rgba(0,0,0,0.22)');

          // Body cylinder
          ctx.fillStyle = inkColor;
          ctx.beginPath();
          ctx.moveTo(-7 * sf, -10 * sf);
          ctx.lineTo(8 * sf, -7 * sf);
          ctx.lineTo(10.5 * sf, -135 * sf);
          ctx.lineTo(-10.5 * sf, -135 * sf);
          ctx.closePath();
          ctx.fill();

          // Drawing dust highlight overlay
          ctx.fillStyle = chalkGrad;
          ctx.beginPath();
          ctx.moveTo(-7 * sf, -10 * sf);
          ctx.lineTo(8 * sf, -7 * sf);
          ctx.lineTo(10.5 * sf, -135 * sf);
          ctx.lineTo(-10.5 * sf, -135 * sf);
          ctx.closePath();
          ctx.fill();

          // Paper wrapper
          ctx.fillStyle = '#faf5e8';
          ctx.strokeStyle = 'rgba(100, 100, 100, 0.25)';
          ctx.lineWidth = 0.5 * sf;
          ctx.beginPath();
          ctx.moveTo(-9 * sf, -48 * sf);
          ctx.lineTo(9 * sf, -46 * sf);
          ctx.lineTo(10.5 * sf, -135 * sf);
          ctx.lineTo(-10.5 * sf, -135 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Brand seal star on chalk wrapper
          ctx.fillStyle = '#cc2200';
          ctx.beginPath();
          ctx.arc(0, -90 * sf, 3 * sf, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      // 7. Elegant Bamboo Calligraphy Brush
      {
        color: '#4a118f', // Ink purple rose brush
        draw: (ctx: CanvasRenderingContext2D, sf: number, inkColor: string) => {
          // Calligraphy hair tip (tapered thin point of brush)
          const hairGrad = ctx.createLinearGradient(0, 0, 0, -32 * sf);
          hairGrad.addColorStop(0, inkColor);
          hairGrad.addColorStop(0.7, '#222222');
          hairGrad.addColorStop(1, '#888888');

          ctx.fillStyle = hairGrad;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(-4 * sf, -10 * sf, -8 * sf, -20 * sf, -6 * sf, -30 * sf);
          ctx.lineTo(6 * sf, -30 * sf);
          ctx.bezierCurveTo(8 * sf, -20 * sf, 4 * sf, -10 * sf, 0, 0);
          ctx.closePath();
          ctx.fill();

          // Black brush socket hair collar
          ctx.fillStyle = '#0f0f10';
          ctx.strokeStyle = '#2d2d30';
          ctx.lineWidth = 0.5 * sf;
          ctx.beginPath();
          ctx.moveTo(-6 * sf, -30 * sf);
          ctx.lineTo(6 * sf, -30 * sf);
          ctx.lineTo(7 * sf, -44 * sf);
          ctx.lineTo(-7 * sf, -44 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Bamboo wood stem shaft body
          const stemGrad = ctx.createLinearGradient(-9 * sf, 0, 9 * sf, 0);
          stemGrad.addColorStop(0, '#a1814a');
          stemGrad.addColorStop(0.3, '#d4c092');
          stemGrad.addColorStop(0.7, '#e4d2aa');
          stemGrad.addColorStop(1, '#8a6a2c');
          ctx.fillStyle = stemGrad;
          ctx.strokeStyle = '#6e511b';
          ctx.lineWidth = 0.8 * sf;
          ctx.beginPath();
          ctx.moveTo(-6 * sf, -44 * sf);
          ctx.lineTo(6 * sf, -44 * sf);
          ctx.lineTo(7 * sf, -210 * sf);
          ctx.lineTo(-7 * sf, -210 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Bamboo notches
          ctx.strokeStyle = '#5a4215';
          ctx.lineWidth = 1 * sf;
          ctx.beginPath(); ctx.moveTo(-6.5 * sf, -90 * sf); ctx.lineTo(6.5 * sf, -90 * sf); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-6.8 * sf, -145 * sf); ctx.lineTo(6.8 * sf, -145 * sf); ctx.stroke();
        }
      },
      // 8. Heavy Luxury Executive Gold Trim Pen
      {
        color: '#005f24',
        draw: (ctx: CanvasRenderingContext2D, sf: number) => {
          // Heavy solid silver writing metal cone
          ctx.fillStyle = '#eeeeee';
          ctx.strokeStyle = '#777777';
          ctx.lineWidth = 0.8 * sf;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-1.8 * sf, -6 * sf);
          ctx.lineTo(1.8 * sf, -6 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#cccccc';
          ctx.beginPath();
          ctx.moveTo(-1.8 * sf, -6 * sf);
          ctx.lineTo(1.8 * sf, -6 * sf);
          ctx.lineTo(6.5 * sf, -25 * sf);
          ctx.lineTo(-6.5 * sf, -25 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Gold accent trim line
          ctx.fillStyle = '#dca110';
          ctx.fillRect(-6.8 * sf, -28 * sf, 13.6 * sf, 4 * sf);

          // Deep Piano glossy black lacquer barrel body
          const lacquerGrad = ctx.createLinearGradient(-12 * sf, 0, 12 * sf, 0);
          lacquerGrad.addColorStop(0, '#111111');
          lacquerGrad.addColorStop(0.3, '#5c5c5c');
          lacquerGrad.addColorStop(0.5, '#262626');
          lacquerGrad.addColorStop(1, '#000000');
          ctx.fillStyle = lacquerGrad;
          ctx.beginPath();
          ctx.moveTo(-6.8 * sf, -28 * sf);
          ctx.lineTo(6.8 * sf, -28 * sf);
          ctx.lineTo(11 * sf, -190 * sf);
          ctx.lineTo(-11 * sf, -190 * sf);
          ctx.closePath();
          ctx.fill();

          // Gold trim band middle
          ctx.fillStyle = '#dca110';
          ctx.fillRect(-9 * sf, -110 * sf, 18 * sf, 6 * sf);
        }
      },
      // 9. Primary Chunky Crayon wax stick
      {
        color: '#4e2f0d',
        draw: (ctx: CanvasRenderingContext2D, sf: number, inkColor: string) => {
          // Wax writing tip dome
          ctx.fillStyle = inkColor;
          ctx.beginPath();
          ctx.arc(0, -9 * sf, 9 * sf, Math.PI, 0);
          ctx.closePath();
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(-9 * sf, -9 * sf);
          ctx.lineTo(9 * sf, -9 * sf);
          ctx.lineTo(0, 0);
          ctx.closePath();
          ctx.fill();

          // Chunky wax cylinder body
          ctx.fillRect(-9 * sf, -40 * sf, 18 * sf, 31 * sf);

          // Colorful paper wrapper covering the rest of the crayon
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.lineWidth = 0.5 * sf;
          ctx.beginPath();
          ctx.moveTo(-9.5 * sf, -40 * sf);
          ctx.lineTo(9.5 * sf, -40 * sf);
          ctx.lineTo(11 * sf, -130 * sf);
          ctx.lineTo(-11 * sf, -130 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Pattern print on crayon wrapper
          ctx.fillStyle = inkColor;
          ctx.fillRect(-9.8 * sf, -65 * sf, 19.6 * sf, 10 * sf);
          ctx.fillRect(-10.2 * sf, -100 * sf, 20.4 * sf, 10 * sf);

          ctx.fillStyle = '#111111';
          ctx.font = `bold ${8 * sf}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('CRAYON', 0, -82 * sf);
        }
      },
      // 10. Technical Needle Fine-liner
      {
        color: '#d34300',
        draw: (ctx: CanvasRenderingContext2D, sf: number) => {
          // Micro ultra thin steel metal tube tip
          ctx.fillStyle = '#c0c0c0';
          ctx.strokeStyle = '#555555';
          ctx.lineWidth = 0.5 * sf;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-0.8 * sf, -10 * sf);
          ctx.lineTo(0.8 * sf, -10 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Silver needle container collar
          ctx.fillStyle = '#d6d6d6';
          ctx.beginPath();
          ctx.moveTo(-1.2 * sf, -10 * sf);
          ctx.lineTo(1.2 * sf, -10 * sf);
          ctx.lineTo(4.5 * sf, -25 * sf);
          ctx.lineTo(-4.5 * sf, -25 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Cool grey high-density industrial polymer plastic body barrel
          const techGrad = ctx.createLinearGradient(-9 * sf, 0, 9 * sf, 0);
          techGrad.addColorStop(0, '#53565a');
          techGrad.addColorStop(0.3, '#7d8084');
          techGrad.addColorStop(1, '#3a3c3e');
          ctx.fillStyle = techGrad;
          ctx.strokeStyle = '#27282a';
          ctx.beginPath();
          ctx.moveTo(-4.5 * sf, -25 * sf);
          ctx.lineTo(4.5 * sf, -25 * sf);
          ctx.lineTo(8 * sf, -170 * sf);
          ctx.lineTo(-8 * sf, -170 * sf);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Iconic warning red ring near tip
          ctx.fillStyle = '#e4002b';
          ctx.fillRect(-5.2 * sf, -33 * sf, 10.4 * sf, 3 * sf);

          // Technical tip label print
          ctx.fillStyle = '#ffffff';
          ctx.font = `500 ${7 * sf}px "JetBrains Mono"`;
          ctx.textAlign = 'center';
          ctx.fillText('0.5', 0, -75 * sf);
        }
      }
    ];

    // Light neon overlays to paint on dark chalkboards or blue blueprints
    const LIGHT_CLASS_INKS = [
      '#ffffff', // Chalk White
      '#ffff33', // Neon Gold Yellow
      '#33ffff', // Electric Cyan
      '#ffacd9', // Cool Candy Pink
      '#adff2f', // Lime Green
      '#e0b2ff', // Soft Violet Orchid
      '#ffe5cc', // Peach Powder
      '#ffffff', // Slate Chalk
      '#feffd0', // Cozy Light Lemon
      '#ffd8a8'  // Golden Cream
    ];

    // Generate deterministic index configs utilizing a seeded random based on actual block text and sequence index
    const rFnHW = createSeededRandom((activeBlock ? activeBlock.text : "") + activeBlockIdx);
    const fontIdx = Math.floor(rFnHW() * FONTS.length);
    const paperIdx = Math.floor(rFnHW() * PAPERS.length);
    const penIdx = Math.floor(rFnHW() * PENS.length);

    const currentFont = FONTS[fontIdx];
    const currentPaper = PAPERS[paperIdx];
    const currentPen = PENS[penIdx];

    // Auto-contrast resolver: override to clean glowing ink if the paper is dark!
    const activeInkColor = currentPaper.isDark 
      ? LIGHT_CLASS_INKS[penIdx % LIGHT_CLASS_INKS.length] 
      : currentPen.color;

    // A. Draw the designated notebook paper canvas background
    ctx.fillStyle = currentPaper.bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    currentPaper.draw(ctx, width, height, scaleFactor);
    ctx.restore();

    // Setup margins & padding coordinates
    const marginX = width * 0.14;
    const gridSpacing = 44 * scaleFactor;

    // B. Segment and wrap text using the customized size-multiplier and selected style font
    const sizeMultiplier = currentFont.sizeMultiplier;
    const paperFontSize = 28 * scaleFactor * sizeMultiplier;
    const maxTextW = width - marginX - 80 * scaleFactor;

    const rawWords = activeBlock.text.split(/\s+/).filter(Boolean);
    const textLines: string[] = [];
    let curLine = '';

    ctx.save();
    ctx.font = currentFont.fontString(paperFontSize);
    
    rawWords.forEach((word) => {
      const testLine = curLine ? curLine + ' ' + word : word;
      if (ctx.measureText(testLine).width > maxTextW) {
        if (curLine) textLines.push(curLine);
        curLine = word;
      } else {
        curLine = testLine;
      }
    });
    if (curLine) {
      textLines.push(curLine);
    }
    ctx.restore();

    // Calculate beginning height
    const totalLines = textLines.length;
    const centerGridY = Math.floor((height / 2) / gridSpacing) * gridSpacing;
    const startGridY = centerGridY - Math.floor(totalLines / 2) * gridSpacing * 2;

    const charPositions: Array<{ char: string; x: number; y: number }> = [];

    ctx.save();
    ctx.font = currentFont.fontString(paperFontSize);
    textLines.forEach((lineText, lIdx) => {
      const lineY = startGridY + lIdx * gridSpacing * 2 - 4 * scaleFactor;
      const lineX = marginX + 35 * scaleFactor;
      let accumulatedX = lineX;
      for (let i = 0; i < lineText.length; i++) {
        const char = lineText[i];
        charPositions.push({ char, x: accumulatedX, y: lineY });
        accumulatedX += ctx.measureText(char).width;
      }
    });
    ctx.restore();

    // C. Visibility metrics based on progress time
    const duration = Math.max(0.5, activeBlock.endTime - activeBlock.startTime);
    const elapsed = adjustedTime - activeBlock.startTime;
    const progress = Math.min(1.0, Math.max(0.0, elapsed / duration));
    
    const writeProgress = Math.min(1.0, progress / 0.95);
    const totalChars = charPositions.length;
    const visibleCount = Math.floor(writeProgress * totalChars);

    // D. Render written text words
    ctx.save();
    ctx.font = currentFont.fontString(paperFontSize);
    ctx.fillStyle = activeInkColor;

    if (currentPen.shadowColor && !currentPaper.isDark) {
      ctx.shadowColor = currentPen.shadowColor;
      ctx.shadowBlur = (currentPen.shadowBlur || 0) * scaleFactor;
    }
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    for (let j = 0; j < visibleCount; j++) {
      const element = charPositions[j];
      ctx.fillText(element.char, element.x, element.y);
    }
    ctx.restore();

    // E. Calculate current pen active drawing coordinates (tip location)
    let tipX = marginX + 35 * scaleFactor;
    let tipY = startGridY - 4 * scaleFactor;

    if (totalChars > 0) {
      if (visibleCount === 0) {
        tipX = charPositions[0].x;
        tipY = charPositions[0].y;
      } else if (visibleCount < totalChars) {
        const activeChar = charPositions[visibleCount - 1];
        tipX = activeChar.x;
        tipY = activeChar.y;
      } else {
        const lastChar = charPositions[totalChars - 1];
        tipX = lastChar.x + 15 * scaleFactor;
        tipY = lastChar.y;
        
        // Gentle float away upon completion
        const finishProgress = Math.min(1.0, (progress - 0.95) / 0.05);
        tipX += 25 * scaleFactor * finishProgress;
        tipY -= 20 * scaleFactor * finishProgress;
      }
    }

    // Insert tiny realistic vibration oscillations while writing is active
    const isWriting = progress > 0.0 && progress < 0.95;
    const oscX = isWriting ? Math.sin(elapsed * 45) * 1.5 * scaleFactor : 0;
    const oscY = isWriting ? Math.cos(elapsed * 45) * 1.5 * scaleFactor : 0;
    const activeTipX = tipX + oscX;
    const activeTipY = tipY + oscY;

    // F. Draw the active pen structure at comfortable holding angle
    ctx.save();
    ctx.translate(activeTipX, activeTipY);
    // Draw the pen tilted at a comfortable holding angle
    const penAngle = -0.83; 
    ctx.rotate(penAngle);

    // Apply drop shadow for the pen to feel three-dimensional on top of the paper
    ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
    ctx.shadowBlur = 10 * scaleFactor;
    ctx.shadowOffsetX = 6 * scaleFactor;
    ctx.shadowOffsetY = 8 * scaleFactor;

    // Execute custom vector pen paint
    currentPen.draw(ctx, scaleFactor, activeInkColor);

    ctx.restore();

    // 7. Support branding logo overlay on top of Handwriting visual
    if (config.logoUrl) {
      const logoImg = imageCache.get('brand-logo');
      if (logoImg) {
        const scaleX = (config.logoX !== undefined ? config.logoX : 85) / 100;
        const scaleY = (config.logoY !== undefined ? config.logoY : 15) / 100;
        const logoSize = config.logoSize !== undefined ? config.logoSize : 80;
        const opacity = config.logoOpacity !== undefined ? config.logoOpacity : 0.9;
        const logoX = width * scaleX - logoSize / 2;
        const logoY = height * scaleY - logoSize / 2;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        ctx.restore();
      }
    }

    return; // Bypass normal background rendering
  }

  // Render Fake Website Human Behavior (No standard panels, draws a premium news/blog website, scrolls, blurs background, highlights 2 target words of subtitle text)
  let isFakeWebsiteActive = chosenBehavior === 'fakeWebsite';

  if (isFakeWebsiteActive && activeBlock) {
    const scaleFactor = height / 1080;
    const blockDuration = activeBlock.endTime - activeBlock.startTime;
    const elapsed = Math.max(0, adjustedTime - activeBlock.startTime);
    const progress = Math.max(0, Math.min(1.0, elapsed / blockDuration));

    // A0. Seeded deterministic generator to randomize styles per segment
    const rand = createSeededRandom(activeBlock.text + activeBlockIdx);

    // Dynamic 20 unique high-fidelity website configurations
    const templates = [
      {
        name: "THE CHRONICLE JOURNAL",
        bg: "#FAF8F5",
        accent: "#990000",
        textMain: "#111111",
        textMuted: "#666666",
        quoteBg: "#FFFFFF",
        quoteBorder: "#2563EB",
        highlightColor: "rgba(37, 99, 235, 0.24)",
        tag: "MARKET OBSERVER",
        fontHeader: '"Georgia", serif',
        fontBody: '"Inter", sans-serif',
        headline: "MARKETS REACH ALL-TIME HIGH IN HISTORIC SURGE",
        adGrad: ["#E11D48", "#F59E0B"],
        adTitle: "MEGA OFFER!",
        adDesc: "Unlock Premium Trading Pro",
        adButtonBg: "#1E293B",
        adButtonText: "#FFFFFF"
      },
      {
        name: "TECHVANGUARD CO.",
        bg: "#0A0F1D",
        accent: "#10B981",
        textMain: "#F1F5F9",
        textMuted: "#94A3B8",
        quoteBg: "#111827",
        quoteBorder: "#10B981",
        highlightColor: "rgba(16, 185, 129, 0.25)",
        tag: "SYSTEM TELEMETRY",
        fontHeader: '"JetBrains Mono", monospace',
        fontBody: '"JetBrains Mono", monospace',
        headline: "QUANTUM CHIPS REACH STABLE ROOM TEMPERATURE LIMITS",
        adGrad: ["#3B82F6", "#8B5CF6"],
        adTitle: "COGNITIVE UPGRADE",
        adDesc: "Build with Next-Gen Neural SDK",
        adButtonBg: "#10B981",
        adButtonText: "#0F172A"
      },
      {
        name: "THE WALL STREET GRAPH",
        bg: "#FBF3EB",
        accent: "#C2410C",
        textMain: "#1E293B",
        textMuted: "#475569",
        quoteBg: "#FFFFFF",
        quoteBorder: "#C2410C",
        highlightColor: "rgba(194, 65, 12, 0.22)",
        tag: "RECURRING FORECASTS",
        fontHeader: '"Georgia", serif',
        fontBody: '"Inter", sans-serif',
        headline: "GOVERNMENT BONDS RECOVERY EXPECTED BY WINTER",
        adGrad: ["#0284C7", "#0D9488"],
        adTitle: "PORTFOLIO RADAR",
        adDesc: "Beat the Inflation Curve",
        adButtonBg: "#0F172A",
        adButtonText: "#FFFFFF"
      },
      {
        name: "LE MONDE LITTÉRAIRE",
        bg: "#F5EFE6",
        accent: "#1B4332",
        textMain: "#1C1917",
        textMuted: "#78716C",
        quoteBg: "#FAF8F5",
        quoteBorder: "#1B4332",
        highlightColor: "rgba(27, 67, 50, 0.23)",
        tag: "CRITIQUE LITTÉRAIRE",
        fontHeader: '"Georgia", serif',
        fontBody: '"Georgia", serif',
        headline: "LA RECHERCHE DES PERSPECTIVES PERDUES DE L'ESPRIT",
        adGrad: ["#451A03", "#78350F"],
        adTitle: "PARCHMENT CO.",
        adDesc: "Receive handbound leather logs",
        adButtonBg: "#1B4332",
        adButtonText: "#F5EFE6"
      },
      {
        name: "COSMOS RESEARCH PORTAL",
        bg: "#05060B",
        accent: "#06B6D4",
        textMain: "#ECFDF5",
        textMuted: "#6B7280",
        quoteBg: "#0B0F19",
        quoteBorder: "#06B6D4",
        highlightColor: "rgba(6, 182, 212, 0.25)",
        tag: "ASTROPHYSICS DIVISION",
        fontHeader: '"Space Grotesk", sans-serif',
        fontBody: '"Inter", sans-serif',
        headline: "WEBB OBSERVES EXOPLANET WATER CLOUDS 120 LY AWAY",
        adGrad: ["#EC4899", "#8B5CF6"],
        adTitle: "DEEP SPACE TOUR",
        adDesc: "Book Your Simulated Orbital Cruise",
        adButtonBg: "#06B6D4",
        adButtonText: "#05060B"
      },
      {
        name: "ZENITH INTEGRATIVE LIFE",
        bg: "#F0FDF4",
        accent: "#16A34A",
        textMain: "#14532D",
        textMuted: "#166534",
        quoteBg: "#FFFFFF",
        quoteBorder: "#16A34A",
        highlightColor: "rgba(22, 163, 74, 0.20)",
        tag: "OPTIMIZATION INDEX",
        fontHeader: '"Outfit", sans-serif',
        fontBody: '"Inter", sans-serif',
        headline: "MINDFUL BREATH CYCLE PROVED TO REPAIR BIOMETRIC DECAY",
        adGrad: ["#34D399", "#059669"],
        adTitle: "PURE AIR FLOW",
        adDesc: "Upgrade Your Home Filter Grid",
        adButtonBg: "#16A34A",
        adButtonText: "#FFFFFF"
      },
      {
        name: "TOKYO METRIC REVIEW",
        bg: "#111115",
        accent: "#F97316",
        textMain: "#E4E4E7",
        textMuted: "#71717A",
        quoteBg: "#18181B",
        quoteBorder: "#F97316",
        highlightColor: "rgba(249, 115, 22, 0.25)",
        tag: "DISTRIBUTED NETWORKS",
        fontHeader: '"Fira Code", monospace',
        fontBody: '"Inter", sans-serif',
        headline: "DATABASE RETRIES REACH MULTIPLE GIGABYTE CAPACITY",
        adGrad: ["#3F3F46", "#18181B"],
        adTitle: "HARDWARE RUSH",
        adDesc: "Reserve custom milled keycaps",
        adButtonBg: "#F97316",
        adButtonText: "#111115"
      },
      {
        name: "THE INVESTIGATOR NEWS",
        bg: "#F4F4F5",
        accent: "#B91C1C",
        textMain: "#09090B",
        textMuted: "#52525B",
        quoteBg: "#FFFFFF",
        quoteBorder: "#B91C1C",
        highlightColor: "rgba(185, 28, 28, 0.22)",
        tag: "URGENT REPORT",
        fontHeader: '"Georgia", serif',
        fontBody: '"Georgia", serif',
        headline: "CONSPIRACY DETECTED CONCERNING REGIONAL STORAGE HUBS",
        adGrad: ["#111827", "#1E293B"],
        adTitle: "SAFE ENCRYPT",
        adDesc: "Hardened Flash Storage Locks",
        adButtonBg: "#B91C1C",
        adButtonText: "#FFFFFF"
      },
      {
        name: "SPIRE DESIGN QUARTERLY",
        bg: "#F9F6F0",
        accent: "#D97706",
        textMain: "#1C1917",
        textMuted: "#78716C",
        quoteBg: "#FFFFFF",
        quoteBorder: "#D97706",
        highlightColor: "rgba(217, 119, 6, 0.18)",
        tag: "SCHEDULING SYMMETRY",
        fontHeader: '"Playfair Display", serif',
        fontBody: '"Inter", sans-serif',
        headline: "THE BALANCED RHYTHM OF BRUTALIST ARCHITECTURAL SHAPES",
        adGrad: ["#78716C", "#44403C"],
        adTitle: "MINIMALIST CLAY",
        adDesc: "Sponsor structural custom building molds",
        adButtonBg: "#D97706",
        adButtonText: "#FFFFFF"
      },
      {
        name: "APEX STADIUM SPORTS",
        bg: "#0B132B",
        accent: "#EAB308",
        textMain: "#FFFFFF",
        textMuted: "#8DA9C4",
        quoteBg: "#1C2541",
        quoteBorder: "#EAB308",
        highlightColor: "rgba(234, 179, 8, 0.24)",
        tag: "CHAMPIONSHIP SUMMARY",
        fontHeader: '"Outfit", sans-serif',
        fontBody: '"Inter", sans-serif',
        headline: "OLYMPIC TRAINING CENTERS REPORT RECORD ATHLETIC STREAKS",
        adGrad: ["#EF4444", "#3B82F6"],
        adTitle: "ADRENALINE SHOT",
        adDesc: "High Protein Amino Concentrate Formula",
        adButtonBg: "#EAB308",
        adButtonText: "#0B132B"
      },
      {
        name: "WANDERLUST REVIEW",
        bg: "#FFFBEB",
        accent: "#F97316",
        textMain: "#451A03",
        textMuted: "#B45309",
        quoteBg: "#FFFFFF",
        quoteBorder: "#F97316",
        highlightColor: "rgba(249, 115, 22, 0.20)",
        tag: "EXPLORE MATRIX",
        fontHeader: '"Georgia", serif',
        fontBody: '"Inter", sans-serif',
        headline: "EXPLORERS UNCOVER HIDDEN WATERFALL WITHIN RICE VALLEYS",
        adGrad: ["#FB923C", "#EC4899"],
        adTitle: "PASSPORT CRUISE",
        adDesc: "Save $400 on South Seas Cruises",
        adButtonBg: "#F97316",
        adButtonText: "#FFFFFF"
      },
      {
        name: "NATURA INTEGRATED SCIENCE",
        bg: "#F1F5F1",
        accent: "#15803D",
        textMain: "#14532D",
        textMuted: "#166534",
        quoteBg: "#FFFFFF",
        quoteBorder: "#15803D",
        highlightColor: "rgba(21, 128, 61, 0.21)",
        tag: "BOTANY EXPEDITIONS",
        fontHeader: '"Georgia", serif',
        fontBody: '"Inter", sans-serif',
        headline: "FOREST MYCELIUM CHAT NETWORKS SHOW EXTREME CORRELATION",
        adGrad: ["#65A30D", "#047857"],
        adTitle: "SPORE CULTURE",
        adDesc: "Grow edible rare oyster clusters",
        adButtonBg: "#15803D",
        adButtonText: "#FFFFFF"
      },
      {
        name: "VOGUE INT. STYLE",
        bg: "#FFFFFF",
        accent: "#000000",
        textMain: "#000000",
        textMuted: "#888888",
        quoteBg: "#F9F9F9",
        quoteBorder: "#000000",
        highlightColor: "rgba(0, 0, 0, 0.12)",
        tag: "COUTURIST FORUM",
        fontHeader: '"Georgia", serif',
        fontBody: '"Georgia", serif',
        headline: "CONTEMPORARY CHROME CHOSEN AS KEY FASHION HIGHLIGHT",
        adGrad: ["#000000", "#333333"],
        adTitle: "PRESTIGE PARFUM",
        adDesc: "Sample Obsidian absolute room spray",
        adButtonBg: "#000000",
        adButtonText: "#FFFFFF"
      },
      {
        name: "GAMER RIFT GUILD",
        bg: "#0B0914",
        accent: "#EC4899",
        textMain: "#F472B6",
        textMuted: "#6D28D9",
        quoteBg: "#1E1B4B",
        quoteBorder: "#EC4899",
        highlightColor: "rgba(236, 72, 153, 0.25)",
        tag: "ESPORTS INTRUSION",
        fontHeader: '"Space Grotesk", sans-serif',
        fontBody: '"Inter", sans-serif',
        headline: "CONCURRENT REWARDS PEAK AT TEN MILLION CONVENTIONS",
        adGrad: ["#E11D48", "#4F46E5"],
        adTitle: "MYTHIC PACKS",
        adDesc: "Unwrap legendary golden cards",
        adButtonBg: "#EC4899",
        adButtonText: "#0B0914"
      },
      {
        name: "METROPOLIS METRO POST",
        bg: "#FAF9F5",
        accent: "#111827",
        textMain: "#000000",
        textMuted: "#4B5563",
        quoteBg: "#FEF08A",
        quoteBorder: "#000000",
        highlightColor: "rgba(0, 0, 0, 0.20)",
        tag: "METRO TRANSIT CHIPS",
        fontHeader: '"Inter", sans-serif',
        fontBody: '"Inter", sans-serif',
        headline: "COMMUTER TRAFFIC UP 14% FOLLOWING AIR VENT OVERHAUL",
        adGrad: ["#F59E0B", "#B45309"],
        adTitle: "WEEK PASS PLUS",
        adDesc: "Reload unlimited travel tokens",
        adButtonBg: "#111827",
        adButtonText: "#FFFFFF"
      },
      {
        name: "THE MATRIX CRYPTO JOURNAL",
        bg: "#040D08",
        accent: "#10B981",
        textMain: "#D1FAE5",
        textMuted: "#065F46",
        quoteBg: "#064E3B",
        quoteBorder: "#10B981",
        highlightColor: "rgba(16, 185, 129, 0.25)",
        tag: "ON-CHAIN LEDGERS",
        fontHeader: '"JetBrains Mono", monospace',
        fontBody: '"Fira Code", monospace',
        headline: "GAS COSTS DROP TO LOWEST SECTOR RECORD IN DECADE",
        adGrad: ["#022C22", "#115E59"],
        adTitle: "CRYPTO VAULT",
        adDesc: "Cold key authentication protocols",
        adButtonBg: "#10B981",
        adButtonText: "#040D08"
      },
      {
        name: "HERITAGE COURIER",
        bg: "#F2EAD8",
        accent: "#78350F",
        textMain: "#451B03",
        textMuted: "#9A3412",
        quoteBg: "#FAF4EB",
        quoteBorder: "#78350F",
        highlightColor: "rgba(120, 53, 15, 0.20)",
        tag: "ANTIQUE FINDINGS",
        fontHeader: '"Georgia", serif',
        fontBody: '"Georgia", serif',
        headline: "RESTORERS SALVAGE BRONZE SUN DIAL MAP FROM OLD EXPEDITIONS",
        adGrad: ["#78350F", "#9A3412"],
        adTitle: "WAX CREST KIT",
        adDesc: "Hot wax monogram emboss stamps",
        adButtonBg: "#78350F",
        adButtonText: "#F2EAD8"
      },
      {
        name: "THE SYNAPSE GREEN REVENUE",
        bg: "#F7FEE7",
        accent: "#4D7C0F",
        textMain: "#1A2E05",
        textMuted: "#3F6212",
        quoteBg: "#FFFFFF",
        quoteBorder: "#4D7C0F",
        highlightColor: "rgba(77, 124, 15, 0.22)",
        tag: "ECOLOGY SYNAPSES",
        fontHeader: '"Outfit", sans-serif',
        fontBody: '"Inter", sans-serif',
        headline: "SOLAR VOLTAGE NETWORKS REACH MAXIMUM INDEPENDENCE RATIO",
        adGrad: ["#A3E635", "#15803D"],
        adTitle: "BEE GIVING",
        adDesc: "Sponsor custom wild beehive grids",
        adButtonBg: "#4D7C0F",
        adButtonText: "#FFFFFF"
      },
      {
        name: "QUANTUM THEORY BULLETIN",
        bg: "#020202",
        accent: "#22C55E",
        textMain: "#4ADE80",
        textMuted: "#166534",
        quoteBg: "#0D0D0D",
        quoteBorder: "#22C55E",
        highlightColor: "rgba(34, 197, 94, 0.25)",
        tag: "QUANTUM TELEMETRY",
        fontHeader: '"Fira Code", monospace',
        fontBody: '"Fira Code", monospace',
        headline: "EMBRYONIC PARTICLE COLLISION COMPILATION DETECTED LIVE",
        adGrad: ["#052E16", "#14532D"],
        adTitle: "NODE CLOUDS",
        adDesc: "Pre-book server time on cooling grids",
        adButtonBg: "#22C55E",
        adButtonText: "#020202"
      },
      {
        name: "CREATIVE NEXUS PLATFORM",
        bg: "#FAF5FF",
        accent: "#A855F7",
        textMain: "#1E1B4B",
        textMuted: "#6B21A8",
        quoteBg: "#FFFFFF",
        quoteBorder: "#A855F7",
        highlightColor: "rgba(168, 85, 247, 0.22)",
        tag: "EDITORIAL GRID PATTERNS",
        fontHeader: '"Space Grotesk", sans-serif',
        fontBody: '"Inter", sans-serif',
        headline: "ASYMMETRICAL GRAPHIC COLUMNS REDEFINE THE MODERN INTERACTIVE CANVAS",
        adGrad: ["#D946EF", "#6366F1"],
        adTitle: "WIRE SPRINT",
        adDesc: "Join active collaborative mockup blocks",
        adButtonBg: "#A855F7",
        adButtonText: "#FFFFFF"
      }
    ];

    // Select style and layout randomly using seeded random parameters
    const templateIdx = Math.floor(rand() * templates.length);
    const template = templates[templateIdx];

    const layoutRoll = rand();
    let layoutMode: 'full' | 'split_left' | 'split_right' | 'overlay' = 'full';
    if (layoutRoll < 0.35) {
      layoutMode = 'full';
    } else if (layoutRoll < 0.55) {
      layoutMode = 'split_left';
    } else if (layoutRoll < 0.75) {
      layoutMode = 'split_right';
    } else {
      layoutMode = 'overlay';
    }

    // Determine target bounding box coordinates of current fake website view
    let webX = 0;
    let webY = 0;
    let webW = width;
    let webH = height;

    if (layoutMode === "split_left") {
      webX = width / 2;
      webW = width / 2;
    } else if (layoutMode === "split_right") {
      webW = width / 2;
    } else if (layoutMode === "overlay") {
      webX = width * 0.12;
      webY = height * 0.1;
      webW = width * 0.76;
      webH = height * 0.8;
    }

    // Helpers to render graphics inside our block
    const drawRoundedRect = (
      c: CanvasRenderingContext2D,
      rx: number,
      ry: number,
      rw: number,
      rh: number,
      radius: number
    ) => {
      if (typeof c.roundRect === 'function') {
        c.beginPath();
        c.roundRect(rx, ry, rw, rh, radius);
      } else {
        c.beginPath();
        c.moveTo(rx + radius, ry);
        c.lineTo(rx + rw - radius, ry);
        c.arcTo(rx + rw, ry, rx + rw, ry + radius, radius);
        c.lineTo(rx + rw, ry + rh - radius);
        c.arcTo(rx + rw, ry + rh, rx + rw - radius, ry + rh, radius);
        c.lineTo(rx + radius, ry + rh);
        c.arcTo(rx, ry + rh, rx, ry + rh - radius, radius);
        c.lineTo(rx, ry + radius);
        c.arcTo(rx, ry, rx + radius, ry, radius);
        c.closePath();
      }
    };

    const wrapTextSimple = (
      c: CanvasRenderingContext2D,
      paragraph: string,
      startX: number,
      maxWidth: number
    ): string[] => {
      const words = paragraph.split(' ');
      const lines: string[] = [];
      let currentLine = '';

      for (let i = 0; i < words.length; i++) {
        const testLine = currentLine ? currentLine + ' ' + words[i] : words[i];
        const testWidth = c.measureText(testLine).width;
        if (testWidth > maxWidth && i > 0) {
          lines.push(currentLine);
          currentLine = words[i];
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
      return lines;
    };

    interface WordPosition {
      word: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }

    const wrapTextWithPositions = (
      c: CanvasRenderingContext2D,
      text: string,
      startX: number,
      startY: number,
      lineHeight: number,
      maxWidth: number
    ): { linesCount: number; wordPositions: WordPosition[] } => {
      const words = text.split(/\s+/).filter(Boolean);
      const wordPositions: WordPosition[] = [];
      let currentX = startX;
      let currentY = startY;
      const spaceWidth = c.measureText(" ").width;

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordWidth = c.measureText(word).width;

        if (currentX + wordWidth > startX + maxWidth && currentX > startX) {
          currentX = startX;
          currentY += lineHeight;
        }

        wordPositions.push({
          word,
          x: currentX,
          y: currentY,
          w: wordWidth,
          h: lineHeight
        });

        currentX += wordWidth + spaceWidth;
      }

      return {
        linesCount: Math.ceil((currentY - startY) / lineHeight) + 1,
        wordPositions
      };
    };

    // A1. Drawing standard character backgrounds inside split or overlay areas
    const drawOriginalBlockBackground = (bx: number, by: number, bw: number, bh: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.clip();

      let targetImgId: string | null = null;
      if (activeBlock.matchedImageIds && activeBlock.matchedImageIds.length > 0) {
        targetImgId = activeBlock.matchedImageIds[0];
      } else if (activeBlock.matchedLeftImageId) {
        targetImgId = activeBlock.matchedLeftImageId;
      } else if (activeBlock.matchedRightImageId) {
        targetImgId = activeBlock.matchedRightImageId;
      }

      const activeImgEl = targetImgId ? imageCache.get(targetImgId) : null;
      if (activeImgEl) {
        const iw = activeImgEl.naturalWidth || 640;
        const ih = activeImgEl.naturalHeight || 720;
        const scaleX = bw / iw;
        const scaleY = bh / ih;
        const baseScale = Math.max(scaleX, scaleY);
        const dw = iw * baseScale;
        const dh = ih * baseScale;
        const dx = bx + (bw - dw) / 2;
        const dy = by + (bh - dh) / 2;
        ctx.drawImage(activeImgEl, dx, dy, dw, dh);
      } else {
        ctx.fillStyle = config.introBgColor || '#09090B';
        ctx.fillRect(bx, by, bw, bh);
      }
      ctx.restore();
    };

    // Render underlying standard layouts based on mode
    if (layoutMode === "split_left") {
      drawOriginalBlockBackground(0, 0, width / 2, height);
    } else if (layoutMode === "split_right") {
      drawOriginalBlockBackground(width / 2, 0, width / 2, height);
    } else if (layoutMode === "overlay") {
      drawOriginalBlockBackground(0, 0, width, height);
      ctx.save();
      ctx.filter = `blur(${16 * scaleFactor}px)`;
      drawOriginalBlockBackground(0, 0, width, height);
      ctx.restore();
      ctx.fillStyle = "rgba(10, 10, 15, 0.45)";
      ctx.fillRect(0, 0, width, height);
    }

    // Scroll progress timelines: scroll occurs smoothly between 10% and 50%
    const scrollDistance = 220 * scaleFactor;
    let scrollProgress = 0;
    if (progress > 0.1 && progress < 0.5) {
      scrollProgress = (progress - 0.1) / 0.4;
    } else if (progress >= 0.5) {
      scrollProgress = 1.0;
    }
    const currentScrollY = scrollProgress * scrollDistance;

    // Draw Website Background Block inside outer container bounds
    ctx.save();
    ctx.beginPath();
    ctx.rect(webX, webY, webW, webH);
    ctx.clip();

    if (layoutMode === "overlay") {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 32 * scaleFactor;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 16 * scaleFactor;
    }
    ctx.fillStyle = template.bg;
    ctx.fillRect(webX, webY, webW, webH);

    // Subtle alignment browser grids
    ctx.strokeStyle = 'rgba(0,0,0,0.02)';
    ctx.lineWidth = 1 * scaleFactor;
    for (let gx = webX; gx < webX + webW; gx += 64 * scaleFactor) {
      ctx.beginPath();
      ctx.moveTo(gx, webY);
      ctx.lineTo(gx, webY + webH);
      ctx.stroke();
    }

    // DRAW THE BLURRED LAYER (Headline, Header, Side Menu, filler columns, Ads)
    ctx.save();
    ctx.filter = `blur(${12 * scaleFactor}px)`;

    // Draw navbar header
    const headerY = webY + 120 * scaleFactor - currentScrollY;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 2 * scaleFactor;
    ctx.beginPath();
    ctx.moveTo(webX + 30 * scaleFactor, headerY + 40 * scaleFactor);
    ctx.lineTo(webX + webW - 30 * scaleFactor, headerY + 40 * scaleFactor);
    ctx.stroke();

    // Large main site title
    ctx.font = `600 italic ${26 * scaleFactor}px ${template.fontHeader}`;
    ctx.fillStyle = template.accent;
    ctx.textAlign = 'left';
    ctx.fillText(template.name, webX + 45 * scaleFactor, headerY + 15 * scaleFactor);

    // Nav bars menu
    const menuX = webX + Math.min(webW * 0.4, 400 * scaleFactor);
    ctx.font = `600 ${12 * scaleFactor}px "Inter", sans-serif`;
    ctx.fillStyle = template.textMuted;
    ctx.fillText("WORLD     POLITICS     ECONOMY     SCIENCE     CULTURE", menuX, headerY + 12 * scaleFactor);

    // Live red/neon alert dot
    ctx.fillStyle = template.accent;
    ctx.beginPath();
    ctx.arc(webX + webW - 140 * scaleFactor, headerY + 8 * scaleFactor, 5 * scaleFactor, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = `bold ${9 * scaleFactor}px "Inter", sans-serif`;
    ctx.fillStyle = template.accent;
    ctx.fillText("LIVE FEEDS", webX + webW - 126 * scaleFactor, headerY + 12 * scaleFactor);

    // Title banner block
    const contentStartY = webY + 240 * scaleFactor - currentScrollY;
    ctx.font = `bold ${32 * scaleFactor}px ${template.fontHeader}`;
    ctx.fillStyle = template.textMain;
    
    // Fit headline width in current website viewport bounds
    const maxHeadlineW = webW - 90 * scaleFactor;
    const headlineLines = wrapTextSimple(ctx, template.headline, webX + 45 * scaleFactor, maxHeadlineW);
    let curHeadY = contentStartY;
    headlineLines.forEach(hLine => {
      ctx.fillText(hLine, webX + 45 * scaleFactor, curHeadY);
      curHeadY += 38 * scaleFactor;
    });

    ctx.font = `500 ${13 * scaleFactor}px "Inter", sans-serif`;
    ctx.fillStyle = template.textMuted;
    ctx.fillText(`Updated June 4, 2026 • By S. Alexander • 4 min read`, webX + 45 * scaleFactor, curHeadY);

    // Render Side Advertisement Banner Responsively
    const hasSidebar = webW > 680 * scaleFactor;
    const adW = hasSidebar ? 220 * scaleFactor : webW - 90 * scaleFactor;
    const adH = hasSidebar ? 320 * scaleFactor : 130 * scaleFactor;
    const adX = hasSidebar ? webX + webW - adW - 45 * scaleFactor : webX + 45 * scaleFactor;
    const adY = hasSidebar ? contentStartY + 140 * scaleFactor : curHeadY + 40 * scaleFactor;

    const adGradient = ctx.createLinearGradient(adX, adY, adX + adW, adY + adH);
    adGradient.addColorStop(0, template.adGrad[0]);
    adGradient.addColorStop(1, template.adGrad[1]);
    ctx.fillStyle = adGradient;
    drawRoundedRect(ctx, adX, adY, adW, adH, 10 * scaleFactor);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${hasSidebar ? 20 * scaleFactor : 16 * scaleFactor}px "Inter", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(template.adTitle, adX + adW / 2, adY + (hasSidebar ? 55 * scaleFactor : 35 * scaleFactor));

    ctx.font = `bold ${hasSidebar ? 28 * scaleFactor : 20 * scaleFactor}px "Inter", sans-serif`;
    ctx.fillText("75% SPECIAL", adX + adW / 2, adY + (hasSidebar ? 105 * scaleFactor : 65 * scaleFactor));

    ctx.font = `500 ${12 * scaleFactor}px "Inter", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(template.adDesc, adX + adW / 2, adY + (hasSidebar ? 150 * scaleFactor : 90 * scaleFactor));

    ctx.fillStyle = template.adButtonBg;
    drawRoundedRect(ctx, adX + (hasSidebar ? 20 * scaleFactor : 40 * scaleFactor), adY + (hasSidebar ? 200 * scaleFactor : 100 * scaleFactor), adW - (hasSidebar ? 40 * scaleFactor : 80 * scaleFactor), 35 * scaleFactor, 6 * scaleFactor);
    ctx.fill();

    ctx.fillStyle = template.adButtonText || '#ffffff';
    ctx.font = `bold ${10 * scaleFactor}px "Inter", sans-serif`;
    ctx.fillText("SUBSCRIBE NOW", adX + adW / 2, adY + (hasSidebar ? 222 * scaleFactor : 122 * scaleFactor));

    // Trending titles inside sidebar
    if (hasSidebar) {
      ctx.textAlign = 'left';
      ctx.fillStyle = template.textMain;
      ctx.font = `bold ${16 * scaleFactor}px ${template.fontHeader}`;
      ctx.fillText("POPULAR REPORTINGS", adX, adY + adH + 45 * scaleFactor);
      ctx.fillStyle = template.textMuted;
      ctx.font = `${12 * scaleFactor}px "Inter", sans-serif`;
      ctx.fillText("1. Ecological indicators evaluated", adX, adY + adH + 75 * scaleFactor);
      ctx.fillText("2. Architectural curves in Paris", adX, adY + adH + 105 * scaleFactor);
      ctx.fillText("3. Deep learning retries capped", adX, adY + adH + 135 * scaleFactor);
    }

    // Left column filler news article paragraphs flow
    const articleX = webX + 45 * scaleFactor;
    const articleW = hasSidebar ? webW - adW - 140 * scaleFactor : webW - 90 * scaleFactor;

    let fy = curHeadY + 40 * scaleFactor;
    if (!hasSidebar) {
      fy = adY + adH + 20 * scaleFactor;
    }

    // 1. Paragraph A (blurred filler text)
    const paraA = "In a startling development early Tuesday morning, local researchers concluded their long-running study concerning indicators. The empirical dataset showcases an unprecedented shift in distribution, leaving multiple agencies pleasantly surprised.";
    ctx.fillStyle = template.textMuted;
    ctx.font = `${18 * scaleFactor}px ${template.fontBody}`;
    ctx.textAlign = 'left';
    const linesA = wrapTextSimple(ctx, paraA, articleX, articleW);
    linesA.forEach(line => {
      ctx.fillText(line, articleX, fy);
      fy += 28 * scaleFactor;
    });
    fy += 20 * scaleFactor;

    // Cache start position for the sharp inline Paragraph B
    const pBStartValY = fy;

    // Estimate the height Paragraph B (subtitle) will take so we can space Paragraph C below it
    ctx.font = `italic 500 ${26 * scaleFactor}px ${template.fontBody}`;
    const wrapTest = wrapTextWithPositions(
      ctx,
      activeBlock.text,
      articleX,
      fy + 20 * scaleFactor,
      38 * scaleFactor,
      articleW
    );
    const pBHeight = wrapTest.linesCount * 38 * scaleFactor;
    fy += pBHeight + 28 * scaleFactor;

    // 2. Paragraph C (blurred filler text below Paragraph B)
    const paraC = "Indeed, as several leading experts remarked during the central panel discussion, the underlying architecture must support highly resilient flows so that the final product reaches its targeted audience with zero friction. The focus must strictly remain on quality rather than sheer volume.";
    ctx.fillStyle = template.textMuted;
    ctx.font = `${18 * scaleFactor}px ${template.fontBody}`;
    const linesC = wrapTextSimple(ctx, paraC, articleX, articleW);
    linesC.forEach(line => {
      ctx.fillText(line, articleX, fy);
      fy += 28 * scaleFactor;
    });

    ctx.restore(); // Restore filter to remove blur! Everything below is razor sharp

    // D. RENDER THE SHARP ACTIVE SUBTITLE SEGMENT INTEGRATED INLINE WITH THE ARTICLE TEXT
    const textStartX = articleX;
    const textStartY = pBStartValY + 20 * scaleFactor;

    ctx.save();
    // Render the active paragraph text razor sharp and beautifully styled
    ctx.font = `italic 500 ${26 * scaleFactor}px ${template.fontBody}`;
    ctx.fillStyle = template.textMain;

    const { linesCount, wordPositions } = wrapTextWithPositions(
      ctx,
      activeBlock.text,
      textStartX,
      textStartY,
      38 * scaleFactor,
      articleW
    );

    wordPositions.forEach(item => {
      ctx.textAlign = 'left';
      ctx.fillText(item.word, item.x, item.y);
    });
    ctx.restore();

    // E. PERFORM SELECTION PHASES DESIGN OVER 2 EXTRACTED WORDS
    let firstIdx = -1;
    let secondIdx = -1;
    if (wordPositions.length > 0) {
      const lastIndex = wordPositions.length - 1;
      // Selecting roughly around 55% in
      firstIdx = Math.floor(wordPositions.length * 0.55);
      if (firstIdx >= lastIndex && lastIndex > 0) {
        firstIdx = lastIndex - 1;
      }
      secondIdx = Math.min(lastIndex, firstIdx + 1);
    }

    // Drag timeline multiplier: select from progress 0.6 to 0.85
    let dragProgress = 0;
    if (progress > 0.6 && progress < 0.85) {
      dragProgress = (progress - 0.6) / 0.25;
    } else if (progress >= 0.85) {
      dragProgress = 1.0;
    }

    if (dragProgress > 0 && firstIdx !== -1) {
      ctx.save();
      const w1 = wordPositions[firstIdx];
      const w2 = wordPositions[secondIdx];

      ctx.fillStyle = template.highlightColor;

      if (w1.y === w2.y) {
        const leftBoundary = w1.x;
        const totalW = (w2.x + w2.w) - w1.x;
        const currentW = totalW * dragProgress;
        ctx.fillRect(leftBoundary, w1.y - 22 * scaleFactor, currentW, 28 * scaleFactor);

        // Highlight visual contrast overlay text
        ctx.fillStyle = template.accent;
        ctx.font = `bold italic 500 ${26 * scaleFactor}px ${template.fontBody}`;
        ctx.fillText(w1.word, w1.x, w1.y);
        if (dragProgress > 0.5) {
          ctx.fillText(w2.word, w2.x, w2.y);
        }
      } else {
        const d1 = Math.min(1.0, dragProgress / 0.5);
        ctx.fillRect(w1.x, w1.y - 22 * scaleFactor, w1.w * d1, 28 * scaleFactor);

        if (dragProgress > 0.5) {
          const d2 = (dragProgress - 0.5) / 0.5;
          ctx.fillRect(w2.x, w2.y - 22 * scaleFactor, w2.w * d2, 28 * scaleFactor);
        }

        ctx.fillStyle = template.accent;
        ctx.font = `bold italic 500 ${26 * scaleFactor}px ${template.fontBody}`;
        if (d1 > 0.8) ctx.fillText(w1.word, w1.x, w1.y);
        if (dragProgress > 0.9) ctx.fillText(w2.word, w2.x, w2.y);
      }
      ctx.restore();
    }

    // F. PRECISE TARGET CURSOR ALIGNMENT COORDINATE ENGINE
    const startCursorX = webX + webW * 0.75;
    const startCursorY = webY + 120 * scaleFactor;

    const w1 = firstIdx !== -1 ? wordPositions[firstIdx] : { x: textStartX, y: textStartY, w: 40, h: 26 };
    const w2 = secondIdx !== -1 ? wordPositions[secondIdx] : w1;

    // Word target hotspot offset (pointing at the middle vertical profile of the character boundary)
    const targetCursorX = w1.x;
    const targetCursorY = w1.y - 14 * scaleFactor;

    let cursorX = startCursorX;
    let cursorY = startCursorY;

    if (progress <= 0.15) {
      cursorX = startCursorX;
      cursorY = startCursorY;
    } else if (progress > 0.15 && progress <= 0.6) {
      // Hover path going smoothly from resting coordinates to the start target letter
      const moveProgress = (progress - 0.15) / 0.45;
      cursorX = startCursorX + (targetCursorX - startCursorX) * moveProgress;
      cursorY = startCursorY + (targetCursorY - startCursorY) * moveProgress;
    } else if (progress > 0.6 && progress <= 0.85) {
      // Dragging path exactly tracking highlight limits
      const dragWordProgress = (progress - 0.6) / 0.25;
      const endCursorX = w2.x + w2.w;
      const endCursorY = w2.y - 14 * scaleFactor;

      cursorX = targetCursorX + (endCursorX - targetCursorX) * dragWordProgress;
      cursorY = targetCursorY + (endCursorY - targetCursorY) * dragWordProgress;
    } else {
      // Hovering at end coordinate
      cursorX = w2.x + w2.w;
      cursorY = w2.y - 14 * scaleFactor;
    }

    const drawCursor = (cx: number, cy: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.shadowColor = 'rgba(0,0,0,0.18)';
      ctx.shadowBlur = 4 * scaleFactor;
      ctx.shadowOffsetX = 2 * scaleFactor;
      ctx.shadowOffsetY = 2 * scaleFactor;

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2 * scaleFactor;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 18 * scaleFactor);
      ctx.lineTo(5 * scaleFactor, 14 * scaleFactor);
      ctx.lineTo(11 * scaleFactor, 22 * scaleFactor);
      ctx.lineTo(14 * scaleFactor, 20 * scaleFactor);
      ctx.lineTo(8 * scaleFactor, 12 * scaleFactor);
      ctx.lineTo(13 * scaleFactor, 12 * scaleFactor);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    drawCursor(cursorX, cursorY);

    ctx.restore(); // Restore clip region boundary

    // Drawing outer crisp borders around viewport splits if applicable
    if (layoutMode === "split_left" || layoutMode === "split_right") {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.lineWidth = 2 * scaleFactor;
      ctx.strokeRect(webX, webY, webW, webH);
    }

    // G. BRANDING WATERMARK
    if (config.logoUrl) {
      const logoImg = imageCache.get('brand-logo');
      if (logoImg) {
        const scaleX = (config.logoX !== undefined ? config.logoX : 85) / 100;
        const scaleY = (config.logoY !== undefined ? config.logoY : 15) / 100;
        const logoSize = config.logoSize !== undefined ? config.logoSize : 80;
        const opacity = config.logoOpacity !== undefined ? config.logoOpacity : 0.9;
        const logoX = width * scaleX - logoSize / 2;
        const logoY = height * scaleY - logoSize / 2;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        ctx.restore();
      }
    }

    return; // Bypass normal background rendering
  }

  // Render Fake Video Editor Human Behavior (No standard panels, draws a premium professional video editor interface e.g. Premiere / CapCut)
  let isFakeVideoEditorActive = chosenBehavior === 'fakeVideoEditor';

  if (isFakeVideoEditorActive && activeBlock) {
    const scaleFactor = height / 1080;
    const blockDuration = activeBlock.endTime - activeBlock.startTime;
    const elapsed = Math.max(0, adjustedTime - activeBlock.startTime);
    const progress = Math.max(0, Math.min(1.0, elapsed / blockDuration));

    // Seeded deterministic random generator
    const r = createSeededRandom(activeBlock.text + activeBlockIdx);

    // Rounded rectangle helper
    const drawRRect = (
      c: CanvasRenderingContext2D,
      rx: number,
      ry: number,
      rw: number,
      rh: number,
      radius: number
    ) => {
      c.beginPath();
      c.moveTo(rx + radius, ry);
      c.lineTo(rx + rw - radius, ry);
      c.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
      c.lineTo(rx + rw, ry + rh - radius);
      c.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
      c.lineTo(rx + radius, ry + rh);
      c.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
      c.lineTo(rx, ry + radius);
      c.quadraticCurveTo(rx, ry, rx + radius, ry);
      c.closePath();
    };

    // Style configuration based on 20 dynamic presets of professional video editing platforms
    const videoPresets = [
      {
        name: "Premiere Pro CC (Standard Space)",
        workspaceBg: "#141416",
        panelBg: "#181822",
        itemBorder: "#2A2A38",
        textMuted: "#71718A",
        headerBg: "#16161F",
        accentColor: "#3b82f6",
        accentText: "#818CF8",
        timecodeColor: "#34D399",
        sliderColor: "#6366F1",
        innerMonitorBg: "#09090D",
        boxBorder: "rgba(56, 189, 248, 0.75)",
        editSqColor: "#0284C7",
        selectionBg: "rgba(56, 189, 248, 0.35)",
        selectionText: "#38BDF8",
        trackLabelBg: "#161622",
        trackV1Bg: "rgba(99, 102, 241, 0.25)",
        trackV1Border: "rgba(129, 140, 248, 0.5)",
        trackA1Bg: "rgba(52, 211, 153, 0.2)",
        trackA1Border: "rgba(52, 211, 153, 0.6)",
        trackA1Wave: "#34D399",
        trackCapBg: "rgba(245, 158, 11, 0.65)",
        trackCapBorder: "#F59E0B",
        playbackHead: "#EF4444",
        playbackHeadTop: "#3B82F6",
        cursorPulse: "rgba(244, 63, 94, 0.6)",
        cursorBg: "#ffffff",
        workspaceTag: "PREMIERE PRO CC - WORKSPACE MAIN"
      },
      {
        name: "DaVinci Resolve Pro 18 (Edit Deck)",
        workspaceBg: "#0f0f12",
        panelBg: "#16161d",
        itemBorder: "#24242d",
        textMuted: "#66667d",
        headerBg: "#121217",
        accentColor: "#ff7a00",
        accentText: "#fb923c",
        timecodeColor: "#ff7a00",
        sliderColor: "#ff7a00",
        innerMonitorBg: "#040407",
        boxBorder: "rgba(255, 122, 0, 0.8)",
        editSqColor: "#ea580c",
        selectionBg: "rgba(255, 122, 0, 0.3)",
        selectionText: "#ff9d43",
        trackLabelBg: "#111116",
        trackV1Bg: "rgba(251, 146, 60, 0.25)",
        trackV1Border: "rgba(251, 146, 60, 0.5)",
        trackA1Bg: "rgba(6, 182, 212, 0.25)",
        trackA1Border: "rgba(6, 182, 212, 0.6)",
        trackA1Wave: "#06b6d4",
        trackCapBg: "rgba(168, 85, 247, 0.7)",
        trackCapBorder: "#9333ea",
        playbackHead: "#ff7a00",
        playbackHeadTop: "#a855f7",
        cursorPulse: "rgba(244, 63, 94, 0.6)",
        cursorBg: "#ff7a00",
        workspaceTag: "DAVINCI RESOLVE PRO 18 - EDIT CONSOLE"
      },
      {
        name: "Final Cut Pro X (Cinematic Suite)",
        workspaceBg: "#1e1e1e",
        panelBg: "#282828",
        itemBorder: "#3a3a3a",
        textMuted: "#888888",
        headerBg: "#1f1f1f",
        accentColor: "#10b981",
        accentText: "#34d399",
        timecodeColor: "#10b981",
        sliderColor: "#10b981",
        innerMonitorBg: "#0d0d0d",
        boxBorder: "rgba(16, 185, 129, 0.85)",
        editSqColor: "#059669",
        selectionBg: "rgba(16, 185, 129, 0.35)",
        selectionText: "#6ee7b7",
        trackLabelBg: "#202020",
        trackV1Bg: "rgba(16, 185, 129, 0.25)",
        trackV1Border: "rgba(16, 185, 129, 0.5)",
        trackA1Bg: "rgba(244, 63, 94, 0.25)",
        trackA1Border: "rgba(244, 63, 94, 0.6)",
        trackA1Wave: "#f43f5e",
        trackCapBg: "rgba(6, 182, 212, 0.75)",
        trackCapBorder: "#0891b2",
        playbackHead: "#10b981",
        playbackHeadTop: "#06b6d4",
        cursorPulse: "rgba(16, 185, 129, 0.5)",
        cursorBg: "#e2e8f0",
        workspaceTag: "FINAL CUT PRO - CINEMATIC TIMELINE"
      },
      {
        name: "CapCut Desktop Classic (Fast Engine)",
        workspaceBg: "#0c0d0f",
        panelBg: "#14151a",
        itemBorder: "#22252a",
        textMuted: "#5a5e66",
        headerBg: "#0f1013",
        accentColor: "#22c55e",
        accentText: "#4ade80",
        timecodeColor: "#34d399",
        sliderColor: "#22c55e",
        innerMonitorBg: "#050608",
        boxBorder: "rgba(34, 197, 94, 0.8)",
        editSqColor: "#15803d",
        selectionBg: "rgba(34, 197, 94, 0.3)",
        selectionText: "#86efac",
        trackLabelBg: "#101114",
        trackV1Bg: "rgba(34, 197, 94, 0.25)",
        trackV1Border: "rgba(34, 197, 94, 0.5)",
        trackA1Bg: "rgba(234, 179, 8, 0.25)",
        trackA1Border: "rgba(234, 179, 8, 0.6)",
        trackA1Wave: "#eab308",
        trackCapBg: "rgba(236, 72, 153, 0.75)",
        trackCapBorder: "#db2777",
        playbackHead: "#eab308",
        playbackHeadTop: "#ec4899",
        cursorPulse: "rgba(236, 72, 153, 0.5)",
        cursorBg: "#ffffff",
        workspaceTag: "CAPCUT DESKTOP - SIMPLE EDIT CREATOR"
      },
      {
        name: "Avid Media Composer Ultimate",
        workspaceBg: "#121214",
        panelBg: "#1a1a1f",
        itemBorder: "#27272c",
        textMuted: "#6b6b7a",
        headerBg: "#15151a",
        accentColor: "#f43f5e",
        accentText: "#fb7185",
        timecodeColor: "#f43f5e",
        sliderColor: "#f43f5e",
        innerMonitorBg: "#0b0b0d",
        boxBorder: "rgba(244, 63, 94, 0.8)",
        editSqColor: "#be123c",
        selectionBg: "rgba(244, 63, 94, 0.3)",
        selectionText: "#fda4af",
        trackLabelBg: "#141418",
        trackV1Bg: "rgba(244, 63, 94, 0.25)",
        trackV1Border: "rgba(244, 63, 94, 0.5)",
        trackA1Bg: "rgba(139, 92, 246, 0.25)",
        trackA1Border: "rgba(139, 92, 246, 0.6)",
        trackA1Wave: "#a78bfa",
        trackCapBg: "rgba(245, 158, 11, 0.75)",
        trackCapBorder: "#d97706",
        playbackHead: "#f43f5e",
        playbackHeadTop: "#8b5cf6",
        cursorPulse: "rgba(244, 63, 94, 0.6)",
        cursorBg: "#f43f5e",
        workspaceTag: "AVID MEDIA COMPOSER - ENTERPRISE ENGINE"
      },
      {
        name: "VEGAS Pro v21 Studio Console",
        workspaceBg: "#16181f",
        panelBg: "#212530",
        itemBorder: "#2d3445",
        textMuted: "#79849c",
        headerBg: "#1a1d26",
        accentColor: "#6366f1",
        accentText: "#818cf8",
        timecodeColor: "#10b981",
        sliderColor: "#6366f1",
        innerMonitorBg: "#0a0c10",
        boxBorder: "rgba(99, 102, 241, 0.8)",
        editSqColor: "#4338ca",
        selectionBg: "rgba(99, 102, 241, 0.35)",
        selectionText: "#a5b4fc",
        trackLabelBg: "#1b1e27",
        trackV1Bg: "rgba(99, 102, 241, 0.25)",
        trackV1Border: "rgba(99, 102, 241, 0.5)",
        trackA1Bg: "rgba(14, 116, 144, 0.25)",
        trackA1Border: "rgba(14, 116, 144, 0.6)",
        trackA1Wave: "#06b6d4",
        trackCapBg: "rgba(16, 185, 129, 0.75)",
        trackCapBorder: "#059669",
        playbackHead: "#10b981",
        playbackHeadTop: "#6366f1",
        cursorPulse: "rgba(99, 102, 241, 0.5)",
        cursorBg: "#ffffff",
        workspaceTag: "VEGAS PRO CONSOLE - AUDIO & VIDEO ENGINE"
      },
      {
        name: "iMovie Deluxe (Simple Designer)",
        workspaceBg: "#1c1c1e",
        panelBg: "#2c2c2e",
        itemBorder: "#3a3a3c",
        textMuted: "#8e8e93",
        headerBg: "#232326",
        accentColor: "#db2777",
        accentText: "#f472b6",
        timecodeColor: "#db2777",
        sliderColor: "#db2777",
        innerMonitorBg: "#141416",
        boxBorder: "rgba(219, 39, 119, 0.75)",
        editSqColor: "#be185d",
        selectionBg: "rgba(219, 39, 119, 0.35)",
        selectionText: "#f9a8d4",
        trackLabelBg: "#262629",
        trackV1Bg: "rgba(219, 39, 119, 0.25)",
        trackV1Border: "rgba(219, 39, 119, 0.5)",
        trackA1Bg: "rgba(59, 130, 246, 0.25)",
        trackA1Border: "rgba(59, 130, 246, 0.6)",
        trackA1Wave: "#3b82f6",
        trackCapBg: "rgba(16, 185, 129, 0.75)",
        trackCapBorder: "#059669",
        playbackHead: "#db2777",
        playbackHeadTop: "#3b82f6",
        cursorPulse: "rgba(219, 39, 119, 0.5)",
        cursorBg: "#db2777",
        workspaceTag: "IMOVIE CONSOLE - DIRECT CRADLE RUSH"
      },
      {
        name: "Camtasia Workspace Suite v24",
        workspaceBg: "#131614",
        panelBg: "#1a211b",
        itemBorder: "#273229",
        textMuted: "#687a6c",
        headerBg: "#161d18",
        accentColor: "#4ade80",
        accentText: "#86efac",
        timecodeColor: "#4ade80",
        sliderColor: "#4ade80",
        innerMonitorBg: "#0a0d0b",
        boxBorder: "rgba(74, 222, 128, 0.8)",
        editSqColor: "#166534",
        selectionBg: "rgba(74, 222, 128, 0.3)",
        selectionText: "#bbf7d0",
        trackLabelBg: "#161b17",
        trackV1Bg: "rgba(74, 222, 128, 0.25)",
        trackV1Border: "rgba(74, 222, 128, 0.5)",
        trackA1Bg: "rgba(20, 184, 166, 0.25)",
        trackA1Border: "rgba(20, 184, 166, 0.6)",
        trackA1Wave: "#14b8a6",
        trackCapBg: "rgba(59, 130, 246, 0.75)",
        trackCapBorder: "#2563eb",
        playbackHead: "#593be3",
        playbackHeadTop: "#4ade80",
        cursorPulse: "rgba(74, 222, 128, 0.5)",
        cursorBg: "#ffffff",
        workspaceTag: "CAMTASIA SUITE - SCREEN CAPTURE DESIGN"
      },
      {
        name: "Filmora Cinematic Creative",
        workspaceBg: "#0b1319",
        panelBg: "#121d27",
        itemBorder: "#1b2c3c",
        textMuted: "#5b748c",
        headerBg: "#0f1a23",
        accentColor: "#06b6d4",
        accentText: "#22d3ee",
        timecodeColor: "#06b6d4",
        sliderColor: "#06b6d4",
        innerMonitorBg: "#060a0e",
        boxBorder: "rgba(6, 182, 212, 0.8)",
        editSqColor: "#0891b2",
        selectionBg: "rgba(6, 182, 212, 0.35)",
        selectionText: "#67e8f9",
        trackLabelBg: "#0f1921",
        trackV1Bg: "rgba(6, 182, 212, 0.25)",
        trackV1Border: "rgba(6, 182, 212, 0.5)",
        trackA1Bg: "rgba(139, 92, 246, 0.25)",
        trackA1Border: "rgba(139, 92, 246, 0.6)",
        trackA1Wave: "#8b5cf6",
        trackCapBg: "rgba(244, 63, 94, 0.75)",
        trackCapBorder: "#e11d48",
        playbackHead: "#06b6d4",
        playbackHeadTop: "#ec4899",
        cursorPulse: "rgba(6, 182, 212, 0.5)",
        cursorBg: "#06b6d4",
        workspaceTag: "FILMORA CREATIVE - FAST GENERATION MOCK"
      },
      {
        name: "After Effects CC (Motion Engine)",
        workspaceBg: "#121016",
        panelBg: "#1a1622",
        itemBorder: "#272133",
        textMuted: "#675b7a",
        headerBg: "#16121c",
        accentColor: "#a855f7",
        accentText: "#c084fc",
        timecodeColor: "#34d399",
        sliderColor: "#a855f7",
        innerMonitorBg: "#09080b",
        boxBorder: "rgba(168, 85, 247, 0.8)",
        editSqColor: "#7e22ce",
        selectionBg: "rgba(168, 85, 247, 0.35)",
        selectionText: "#d8b4fe",
        trackLabelBg: "#17131e",
        trackV1Bg: "rgba(168, 85, 247, 0.25)",
        trackV1Border: "rgba(168, 85, 247, 0.5)",
        trackA1Bg: "rgba(236, 72, 153, 0.25)",
        trackA1Border: "rgba(236, 72, 153, 0.6)",
        trackA1Wave: "#f472b6",
        trackCapBg: "rgba(59, 130, 246, 0.75)",
        trackCapBorder: "#2563eb",
        playbackHead: "#a855f7",
        playbackHeadTop: "#2563eb",
        cursorPulse: "rgba(168, 85, 247, 0.5)",
        cursorBg: "#ffffff",
        workspaceTag: "AFTER EFFECTS CC - MOTION VFX PIPELINE"
      },
      {
        name: "Premiere Elements v24 Light Studio",
        workspaceBg: "#171a17",
        panelBg: "#222722",
        itemBorder: "#343c34",
        textMuted: "#798c79",
        headerBg: "#1a1e1a",
        accentColor: "#14b8a6",
        accentText: "#2dd4bf",
        timecodeColor: "#14b8a6",
        sliderColor: "#14b8a6",
        innerMonitorBg: "#0e100e",
        boxBorder: "rgba(20, 184, 166, 0.8)",
        editSqColor: "#0f766e",
        selectionBg: "rgba(20, 184, 166, 0.3)",
        selectionText: "#5eead4",
        trackLabelBg: "#1f231f",
        trackV1Bg: "rgba(20, 184, 166, 0.25)",
        trackV1Border: "rgba(20, 184, 166, 0.5)",
        trackA1Bg: "rgba(168, 85, 247, 0.25)",
        trackA1Border: "rgba(168, 85, 247, 0.6)",
        trackA1Wave: "#c084fc",
        trackCapBg: "rgba(245, 158, 11, 0.75)",
        trackCapBorder: "#d97706",
        playbackHead: "#14b8a6",
        playbackHeadTop: "#d97706",
        cursorPulse: "rgba(20, 184, 166, 0.5)",
        cursorBg: "#ffffff",
        workspaceTag: "PREMIERE ELEMENTS - SIMPLEX MODE"
      },
      {
        name: "HitFilm Pro VFX Suite",
        workspaceBg: "#1b1414",
        panelBg: "#271d1d",
        itemBorder: "#3d2e2e",
        textMuted: "#967575",
        headerBg: "#201818",
        accentColor: "#ef4444",
        accentText: "#f87171",
        timecodeColor: "#ef4444",
        sliderColor: "#ef4444",
        innerMonitorBg: "#100c0c",
        boxBorder: "rgba(239, 68, 68, 0.8)",
        editSqColor: "#b91c1c",
        selectionBg: "rgba(239, 68, 68, 0.35)",
        selectionText: "#fca5a5",
        trackLabelBg: "#231a1a",
        trackV1Bg: "rgba(239, 68, 68, 0.25)",
        trackV1Border: "rgba(239, 68, 68, 0.5)",
        trackA1Bg: "rgba(245, 158, 11, 0.25)",
        trackA1Border: "rgba(245, 158, 11, 0.6)",
        trackA1Wave: "#f59e0b",
        trackCapBg: "rgba(16, 185, 129, 0.75)",
        trackCapBorder: "#059669",
        playbackHead: "#ef4444",
        playbackHeadTop: "#10b981",
        cursorPulse: "rgba(239, 68, 68, 0.5)",
        cursorBg: "#ef4444",
        workspaceTag: "HITFILM CONSOLE - SPECIAL FX CREATOR"
      },
      {
        name: "CyberLink PowerDirector Ultra",
        workspaceBg: "#0c151d",
        panelBg: "#142230",
        itemBorder: "#1e334a",
        textMuted: "#5e7e9e",
        headerBg: "#0f1d2a",
        accentColor: "#3b82f6",
        accentText: "#60a5fa",
        timecodeColor: "#3b82f6",
        sliderColor: "#3b82f6",
        innerMonitorBg: "#070c11",
        boxBorder: "rgba(59, 130, 246, 0.8)",
        editSqColor: "#1d4ed8",
        selectionBg: "rgba(59, 130, 246, 0.35)",
        selectionText: "#93c5fd",
        trackLabelBg: "#121e2b",
        trackV1Bg: "rgba(59, 130, 246, 0.25)",
        trackV1Border: "rgba(59, 130, 246, 0.5)",
        trackA1Bg: "rgba(6, 182, 212, 0.25)",
        trackA1Border: "rgba(6, 182, 212, 0.6)",
        trackA1Wave: "#22d3ee",
        trackCapBg: "rgba(139, 92, 246, 0.75)",
        trackCapBorder: "#7c3aed",
        playbackHead: "#3b82f6",
        playbackHeadTop: "#7c3aed",
        cursorPulse: "rgba(59, 130, 246, 0.5)",
        cursorBg: "#e2e8f0",
        workspaceTag: "POWERDIRECTOR CONSOLE - ULTRA SEAMLESS"
      },
      {
        name: "DaVinci HDR Grading Theater",
        workspaceBg: "#0b0c0f",
        panelBg: "#121318",
        itemBorder: "#1e2027",
        textMuted: "#5c6575",
        headerBg: "#0e0f13",
        accentColor: "#eab308",
        accentText: "#fde047",
        timecodeColor: "#eab308",
        sliderColor: "#eab308",
        innerMonitorBg: "#050608",
        boxBorder: "rgba(234, 179, 8, 0.8)",
        editSqColor: "#a16207",
        selectionBg: "rgba(234, 179, 8, 0.35)",
        selectionText: "#fef08a",
        trackLabelBg: "#101115",
        trackV1Bg: "rgba(234, 179, 8, 0.25)",
        trackV1Border: "rgba(234, 179, 8, 0.5)",
        trackA1Bg: "rgba(239, 68, 68, 0.25)",
        trackA1Border: "rgba(239, 68, 68, 0.6)",
        trackA1Wave: "#f87171",
        trackCapBg: "rgba(6, 182, 212, 0.75)",
        trackCapBorder: "#0891b2",
        playbackHead: "#eab308",
        playbackHeadTop: "#0891b2",
        cursorPulse: "rgba(234, 179, 8, 0.5)",
        cursorBg: "#eab308",
        workspaceTag: "RESOLVE STUDIO - HDR COLOR CONSOLE"
      },
      {
        name: "Corel VideoStudio Advanced",
        workspaceBg: "#1d171d",
        panelBg: "#2b222b",
        itemBorder: "#403340",
        textMuted: "#967a96",
        headerBg: "#221a22",
        accentColor: "#d946ef",
        accentText: "#f0abfc",
        timecodeColor: "#d946ef",
        sliderColor: "#d946ef",
        innerMonitorBg: "#110e11",
        boxBorder: "rgba(217, 70, 239, 0.8)",
        editSqColor: "#a21caf",
        selectionBg: "rgba(217, 70, 239, 0.35)",
        selectionText: "#f5d0fe",
        trackLabelBg: "#261e26",
        trackV1Bg: "rgba(217, 70, 239, 0.25)",
        trackV1Border: "rgba(217, 70, 239, 0.5)",
        trackA1Bg: "rgba(99, 102, 241, 0.25)",
        trackA1Border: "rgba(99, 102, 241, 0.6)",
        trackA1Wave: "#818cf8",
        trackCapBg: "rgba(20, 184, 166, 0.75)",
        trackCapBorder: "#0d9488",
        playbackHead: "#d946ef",
        playbackHeadTop: "#0d9488",
        cursorPulse: "rgba(217, 70, 239, 0.5)",
        cursorBg: "#ffffff",
        workspaceTag: "VIDEOSTUDIO CONSOLE - ADVANCED PIPELINE"
      },
      {
        name: "Lightworks Cinema Pro Edition",
        workspaceBg: "#131313",
        panelBg: "#1e1e1e",
        itemBorder: "#303030",
        textMuted: "#808080",
        headerBg: "#171717",
        accentColor: "#e2e8f0",
        accentText: "#f1f5f9",
        timecodeColor: "#ffffff",
        sliderColor: "#e2e8f0",
        innerMonitorBg: "#080808",
        boxBorder: "rgba(226, 232, 240, 0.8)",
        editSqColor: "#475569",
        selectionBg: "rgba(226, 232, 240, 0.25)",
        selectionText: "#f8fafc",
        trackLabelBg: "#1a1a1a",
        trackV1Bg: "rgba(241, 245, 249, 0.25)",
        trackV1Border: "rgba(241, 245, 249, 0.5)",
        trackA1Bg: "rgba(75, 85, 99, 0.25)",
        trackA1Border: "rgba(75, 85, 99, 0.6)",
        trackA1Wave: "#9ca3af",
        trackCapBg: "rgba(239, 68, 68, 0.75)",
        trackCapBorder: "#b91c1c",
        playbackHead: "#e2e8f0",
        playbackHeadTop: "#b91c1c",
        cursorPulse: "rgba(255, 255, 255, 0.4)",
        cursorBg: "#ffffff",
        workspaceTag: "LIGHTWORKS PRO - CLASSIC CINEMA SUITE"
      },
      {
        name: "Shotcut Professional v25 Console",
        workspaceBg: "#15161c",
        panelBg: "#22232c",
        itemBorder: "#323440",
        textMuted: "#7a8099",
        headerBg: "#191a21",
        accentColor: "#cb5a25",
        accentText: "#f07a41",
        timecodeColor: "#cb5a25",
        sliderColor: "#cb5a25",
        innerMonitorBg: "#0d0e12",
        boxBorder: "rgba(203, 90, 37, 0.85)",
        editSqColor: "#a63f13",
        selectionBg: "rgba(203, 90, 37, 0.35)",
        selectionText: "#fca5a5",
        trackLabelBg: "#1e1f27",
        trackV1Bg: "rgba(203, 90, 37, 0.25)",
        trackV1Border: "rgba(203, 90, 37, 0.5)",
        trackA1Bg: "rgba(6, 182, 212, 0.2)",
        trackA1Border: "rgba(6, 182, 212, 0.6)",
        trackA1Wave: "#22d3ee",
        trackCapBg: "rgba(34, 197, 94, 0.75)",
        trackCapBorder: "#15803d",
        playbackHead: "#cb5a25",
        playbackHeadTop: "#15803d",
        cursorPulse: "rgba(203, 90, 37, 0.5)",
        cursorBg: "#ffffff",
        workspaceTag: "SHOTCUT MONITOR - OPEN SOURCE SUITE"
      },
      {
        name: "Pinnacle Studio Ultimate Dual-Deck",
        workspaceBg: "#1d120d",
        panelBg: "#2c1b14",
        itemBorder: "#452b1f",
        textMuted: "#966e5a",
        headerBg: "#231610",
        accentColor: "#f97316",
        accentText: "#fb923c",
        timecodeColor: "#f97316",
        sliderColor: "#f97316",
        innerMonitorBg: "#110a08",
        boxBorder: "rgba(249, 115, 22, 0.8)",
        editSqColor: "#c2410c",
        selectionBg: "rgba(249, 115, 22, 0.35)",
        selectionText: "#ffedd5",
        trackLabelBg: "#271812",
        trackV1Bg: "rgba(249, 115, 22, 0.25)",
        trackV1Border: "rgba(249, 115, 22, 0.5)",
        trackA1Bg: "rgba(234, 179, 8, 0.25)",
        trackA1Border: "rgba(234, 179, 8, 0.6)",
        trackA1Wave: "#fde047",
        trackCapBg: "rgba(79, 70, 229, 0.75)",
        trackCapBorder: "#4338ca",
        playbackHead: "#f97316",
        playbackHeadTop: "#4338ca",
        cursorPulse: "rgba(249, 115, 22, 0.5)",
        cursorBg: "#ffffff",
        workspaceTag: "PINNACLE CONSOLE - DUAL DECK RECORDER"
      },
      {
        name: "LumaFusion Slate Center",
        workspaceBg: "#111417",
        panelBg: "#1a1f24",
        itemBorder: "#2a323b",
        textMuted: "#6b7a8a",
        headerBg: "#14191d",
        accentColor: "#2563eb",
        accentText: "#60a5fa",
        timecodeColor: "#3b82f6",
        sliderColor: "#2563eb",
        innerMonitorBg: "#0a0c0e",
        boxBorder: "rgba(37, 99, 235, 0.8)",
        editSqColor: "#1d4ed8",
        selectionBg: "rgba(37, 99, 235, 0.35)",
        selectionText: "#93c5fd",
        trackLabelBg: "#171c20",
        trackV1Bg: "rgba(37, 99, 235, 0.25)",
        trackV1Border: "rgba(37, 99, 235, 0.5)",
        trackA1Bg: "rgba(16, 185, 129, 0.2)",
        trackA1Border: "rgba(16, 185, 129, 0.6)",
        trackA1Wave: "#34d399",
        trackCapBg: "rgba(219, 39, 119, 0.75)",
        trackCapBorder: "#be185d",
        playbackHead: "#2563eb",
        playbackHeadTop: "#be185d",
        cursorPulse: "rgba(37, 99, 235, 0.5)",
        cursorBg: "#ffffff",
        workspaceTag: "LUMAFUSION IPAD PRO - MULTITOUCH SUITE"
      },
      {
        name: "Pro Tools Master HD Mixing Console",
        workspaceBg: "#0d131a",
        panelBg: "#161f2b",
        itemBorder: "#233347",
        textMuted: "#5e7796",
        headerBg: "#101720",
        accentColor: "#60a5fa",
        accentText: "#93c5fd",
        timecodeColor: "#34d399",
        sliderColor: "#60a5fa",
        innerMonitorBg: "#080c10",
        boxBorder: "rgba(96, 165, 250, 0.8)",
        editSqColor: "#2563eb",
        selectionBg: "rgba(96, 165, 250, 0.35)",
        selectionText: "#dbeaf8",
        trackLabelBg: "#131b25",
        trackV1Bg: "rgba(96, 165, 250, 0.25)",
        trackV1Border: "rgba(96, 165, 250, 0.5)",
        trackA1Bg: "rgba(16, 185, 129, 0.2)",
        trackA1Border: "rgba(16, 185, 129, 0.6)",
        trackA1Wave: "#16a34a",
        trackCapBg: "rgba(245, 158, 11, 0.75)",
        trackCapBorder: "#d97706",
        playbackHead: "#60a5fa",
        playbackHeadTop: "#d97706",
        cursorPulse: "rgba(96, 165, 250, 0.5)",
        cursorBg: "#60a5fa",
        workspaceTag: "AVID AUDIO CONSOLE - HIGH DYNAMIC RESOLUTION"
      }
    ];

    const currentPreset = videoPresets[Math.floor(r() * videoPresets.length)];

    const workspaceColor = currentPreset.workspaceBg;
    const panelBg = currentPreset.panelBg;
    const itemBorder = currentPreset.itemBorder;
    const muteTextColor = currentPreset.textMuted;

    ctx.fillStyle = workspaceColor;
    ctx.fillRect(0, 0, width, height);

    // 1. TOP HEADER MENU BAR
    ctx.fillStyle = currentPreset.headerBg;
    ctx.fillRect(0, 0, width, 55 * scaleFactor);
    ctx.strokeStyle = itemBorder;
    ctx.lineWidth = 1 * scaleFactor;
    ctx.beginPath();
    ctx.moveTo(0, 55 * scaleFactor);
    ctx.lineTo(width, 55 * scaleFactor);
    ctx.stroke();

    // Menu text items
    ctx.font = `600 ${14 * scaleFactor}px "Inter", sans-serif`;
    ctx.fillStyle = "#E4E4E7";
    ctx.textAlign = "left";
    let menuX = 25 * scaleFactor;
    const menus = ["File", "Edit", "Clip", "Sequence", "Markers", "Graphics", "View", "Window", "Help"];
    menus.forEach(menu => {
      ctx.fillText(menu, menuX, 32 * scaleFactor);
      menuX += ctx.measureText(menu).width + 24 * scaleFactor;
    });

    // Central workspace tag
    ctx.font = `bold italic ${16 * scaleFactor}px "Inter", sans-serif`;
    ctx.fillStyle = currentPreset.accentText;
    ctx.fillText(currentPreset.workspaceTag, width * 0.44, 33 * scaleFactor);

    // Time ticker on the top right
    const rawSecs = Math.floor(adjustedTime);
    const ms = Math.floor((adjustedTime % 1) * 100);
    const timecodeStr = `00:0${Math.floor(rawSecs / 60)}:${(rawSecs % 60).toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
    ctx.font = `700 ${15 * scaleFactor}px "JetBrains Mono", monospace`;
    ctx.fillStyle = currentPreset.timecodeColor;
    ctx.textAlign = "right";
    ctx.fillText(timecodeStr, width - 25 * scaleFactor, 33 * scaleFactor);

    // 2. MAIN WORKSPACE SPLITS
    const mediaW = width * 0.22;
    const inspectorW = width * 0.23;
    const previewW = width - mediaW - inspectorW;
    const timelineH = height * 0.38;
    const viewPortH = height - timelineH - 55 * scaleFactor;

    // A. Left Media Library Bin
    const mediaX = 0;
    const mediaY = 55 * scaleFactor;
    const mediaH = viewPortH;
    ctx.fillStyle = panelBg;
    ctx.fillRect(mediaX, mediaY, mediaW, mediaH);
    ctx.strokeStyle = itemBorder;
    ctx.strokeRect(mediaX, mediaY, mediaW, mediaH);

    // Library items header
    ctx.font = `bold ${12 * scaleFactor}px "Inter", sans-serif`;
    ctx.fillStyle = "#94A3B8";
    ctx.textAlign = "left";
    ctx.fillText("PROJECT MEDIA (Active)", mediaX + 16 * scaleFactor, mediaY + 28 * scaleFactor);

    // Small mock visual media items (rows)
    ctx.fillStyle = currentPreset.workspaceBg;
    let mediaItemY = mediaY + 48 * scaleFactor;
    for (let i = 1; i <= 4; i++) {
      drawRRect(ctx, mediaX + 12 * scaleFactor, mediaItemY, mediaW - 24 * scaleFactor, 50 * scaleFactor, 6 * scaleFactor);
      ctx.fill();

      // Film / thumbnail indicators
      ctx.fillStyle = i === 1 ? currentPreset.accentColor : currentPreset.sliderColor;
      drawRRect(ctx, mediaX + 20 * scaleFactor, mediaItemY + 10 * scaleFactor, 50 * scaleFactor, 30 * scaleFactor, 4 * scaleFactor);
      ctx.fill();

      ctx.font = `500 ${11 * scaleFactor}px "JetBrains Mono", monospace`;
      ctx.fillStyle = i === 1 ? "#E2E8F0" : "#94A3B8";
      ctx.fillText(`Scene_Clips_0${i}.mp4`, mediaX + 78 * scaleFactor, mediaItemY + 24 * scaleFactor);
      
      ctx.font = `500 ${9 * scaleFactor}px "Inter", sans-serif`;
      ctx.fillStyle = muteTextColor;
      ctx.fillText("1080p • 29.97fps", mediaX + 78 * scaleFactor, mediaItemY + 38 * scaleFactor);

      ctx.fillStyle = currentPreset.workspaceBg;
      mediaItemY += 60 * scaleFactor;
    }

    // B. Inspector Panel (Right side)
    const inspectX = width - inspectorW;
    const inspectY = 55 * scaleFactor;
    const inspectH = viewPortH;
    ctx.fillStyle = panelBg;
    ctx.fillRect(inspectX, inspectY, inspectorW, inspectH);
    ctx.strokeRect(inspectX, inspectY, inspectorW, inspectH);

    ctx.font = `bold ${12 * scaleFactor}px "Inter", sans-serif`;
    ctx.fillStyle = "#94A3B8";
    ctx.fillText("EFFECT CONTROLS / INSPECTOR", inspectX + 16 * scaleFactor, inspectY + 28 * scaleFactor);

    // Mock sliders matching active edit behavior
    let sliderY = inspectY + 60 * scaleFactor;
    const sliders = [
      { name: "Font Size", val: 56 + Math.floor(Math.sin(progress * Math.PI) * 12), max: 100, color: currentPreset.accentColor },
      { name: "Tracking", val: 12, max: 50, color: currentPreset.sliderColor },
      { name: "Subtitle Opacity", val: 95, max: 100, color: currentPreset.timecodeColor },
      { name: "Position X", val: 540, max: 1080, color: currentPreset.playbackHead },
      { name: "Position Y", val: 820, max: 1080, color: currentPreset.playbackHead }
    ];

    sliders.forEach(slide => {
      ctx.font = `bold ${11 * scaleFactor}px "Inter", sans-serif`;
      ctx.fillStyle = "#C7D2FE";
      ctx.fillText(slide.name, inspectX + 16 * scaleFactor, sliderY);

      // Track background
      ctx.fillStyle = "#0F172A";
      drawRRect(ctx, inspectX + 16 * scaleFactor, sliderY + 10 * scaleFactor, inspectorW - 32 * scaleFactor, 6 * scaleFactor, 3 * scaleFactor);
      ctx.fill();

      // Sliders track thumb fill
      const percent = slide.val / slide.max;
      const fillW = (inspectorW - 32 * scaleFactor) * percent;
      ctx.fillStyle = slide.color;
      drawRRect(ctx, inspectX + 16 * scaleFactor, sliderY + 10 * scaleFactor, fillW, 6 * scaleFactor, 3 * scaleFactor);
      ctx.fill();

      // Circle tip
      ctx.beginPath();
      ctx.arc(inspectX + 16 * scaleFactor + fillW, sliderY + 13 * scaleFactor, 6 * scaleFactor, 0, Math.PI * 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();

      ctx.font = `600 ${10 * scaleFactor}px "JetBrains Mono", monospace`;
      ctx.fillStyle = "#A7F3D0";
      ctx.fillText(slide.val.toString(), inspectX + inspectorW - 40 * scaleFactor, sliderY);

      sliderY += 45 * scaleFactor;
    });

    // C. Center Preview Monitor viewport (Framing active image segment)
    const monitorX = mediaW;
    const monitorY = 55 * scaleFactor;
    const monitorW = previewW;
    const monitorH = viewPortH;
    ctx.fillStyle = currentPreset.innerMonitorBg; // Backdrop behind the virtual monitor
    ctx.fillRect(monitorX, monitorY, monitorW, monitorH);
    ctx.strokeStyle = itemBorder;
    ctx.strokeRect(monitorX, monitorY, monitorW, monitorH);

    // Inner viewport for active visual frames (Centered 16:9 inner layout frame)
    const outerMargin = 40 * scaleFactor;
    const innerW = monitorW - outerMargin * 2;
    const innerH = innerW * (9 / 16);
    const innerX = monitorX + (monitorW - innerW) / 2;
    const innerY = monitorY + (monitorH - innerH) / 2 - 20 * scaleFactor;

    // Viewport bezel drop shadows
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 16 * scaleFactor;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8 * scaleFactor;

    ctx.fillStyle = "#000000";
    ctx.fillRect(innerX, innerY, innerW, innerH);
    ctx.shadowBlur = 0; // Reset shadows

    // Retrieve active segment image and layout inside inner viewer
    ctx.save();
    ctx.beginPath();
    ctx.rect(innerX, innerY, innerW, innerH);
    ctx.clip();

    let targetImgId: string | null = null;
    if (activeBlock.matchedImageIds && activeBlock.matchedImageIds.length > 0) {
      targetImgId = activeBlock.matchedImageIds[0];
    } else if (activeBlock.matchedLeftImageId) {
      targetImgId = activeBlock.matchedLeftImageId;
    } else if (activeBlock.matchedRightImageId) {
      targetImgId = activeBlock.matchedRightImageId;
    }

    const activeImgEl = targetImgId ? imageCache.get(targetImgId) : null;
    if (activeImgEl) {
      const iw = activeImgEl.naturalWidth || 640;
      const ih = activeImgEl.naturalHeight || 720;
      const scaleX = innerW / iw;
      const scaleY = innerH / ih;
      const baseScale = Math.max(scaleX, scaleY);
      const dw = iw * baseScale;
      const dh = ih * baseScale;
      const dx = innerX + (innerW - dw) / 2;
      const dy = innerY + (innerH - dh) / 2;
      ctx.drawImage(activeImgEl, dx, dy, dw, dh);
    } else {
      // Draw grid backdrop inside preview
      ctx.fillStyle = currentPreset.workspaceBg;
      ctx.fillRect(innerX, innerY, innerW, innerH);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
      ctx.lineWidth = 1 * scaleFactor;
      for (let gridX = innerX; gridX < innerX + innerW; gridX += 30 * scaleFactor) {
        ctx.beginPath();
        ctx.moveTo(gridX, innerY);
        ctx.lineTo(gridX, innerY + innerH);
        ctx.stroke();
      }
    }

    // Overlay crop guide safe marks representing a camera viewport
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1 * scaleFactor;
    ctx.strokeRect(innerX + 30 * scaleFactor, innerY + 20 * scaleFactor, innerW - 60 * scaleFactor, innerH - 40 * scaleFactor);

    // Centre cross hairs
    ctx.beginPath();
    ctx.moveTo(innerX + innerW / 2 - 10 * scaleFactor, innerY + innerH / 2);
    ctx.lineTo(innerX + innerW / 2 + 10 * scaleFactor, innerY + innerH / 2);
    ctx.moveTo(innerX + innerW / 2, innerY + innerH / 2 - 10 * scaleFactor);
    ctx.lineTo(innerX + innerW / 2, innerY + innerH / 2 + 10 * scaleFactor);
    ctx.stroke();

    // ACTIVE SUBTITLES RENDERED OVER THE PREVIEW
    ctx.textAlign = 'center';
    
    // Size scales with progress to mimic text inspector transformations
    const currentSubFontSize = (32 + Math.floor(Math.sin(progress * Math.PI) * 4)) * scaleFactor;
    ctx.font = `bold ${currentSubFontSize}px sans-serif`;

    const subX = innerX + innerW / 2;
    const subY = innerY + innerH * 0.78;

    // Draw active bounding edit handle container for the subtitle text
    const textMetrics = ctx.measureText(activeBlock.text);
    const boxW = textMetrics.width + 40 * scaleFactor;
    const boxH = 55 * scaleFactor;
    
    ctx.strokeStyle = currentPreset.boxBorder; // Edit box border
    ctx.lineWidth = 1 * scaleFactor;
    ctx.setLineDash([4 * scaleFactor, 3 * scaleFactor]);
    ctx.strokeRect(subX - boxW / 2, subY - 38 * scaleFactor, boxW, boxH);
    ctx.setLineDash([0, 0]); // Reset line dashes

    // Tiny corner edit squares
    ctx.fillStyle = currentPreset.editSqColor;
    const editSqSize = 6 * scaleFactor;
    ctx.fillRect(subX - boxW / 2 - editSqSize / 2, subY - 38 * scaleFactor - editSqSize / 2, editSqSize, editSqSize);
    ctx.fillRect(subX + boxW / 2 - editSqSize / 2, subY - 38 * scaleFactor - editSqSize / 2, editSqSize, editSqSize);
    ctx.fillRect(subX - boxW / 2 - editSqSize / 2, subY + 17 * scaleFactor - editSqSize / 2, editSqSize, editSqSize);
    ctx.fillRect(subX + boxW / 2 - editSqSize / 2, subY + 17 * scaleFactor - editSqSize / 2, editSqSize, editSqSize);

    // Subtitle Word Layout & Highlight Drag-and-Select inside Preview Monitor
    const words = activeBlock.text.split(" ");
    let curX = subX - textMetrics.width / 2;
    const wordObjects: Array<{ word: string; x: number; y: number; w: number; h: number }> = [];

    // Map out coordinates inside the preview monitor
    words.forEach(word => {
      const wWidth = ctx.measureText(word + " ").width;
      wordObjects.push({
        word: word,
        x: curX,
        y: subY,
        w: ctx.measureText(word).width,
        h: 36 * scaleFactor
      });
      curX += wWidth;
    });

    // Draw background subtitle shadow for extreme readability
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillText(activeBlock.text, subX + 2, subY + 2);

    // Draw the clean base text inside the mock monitor
    ctx.fillStyle = "#E0E7FF"; // Pale white blue
    ctx.textAlign = 'left';
    wordObjects.forEach(w => {
      ctx.fillText(w.word, w.x, w.y);
    });

    // Select words during phase 5/6 (progress 0.5 to 1.0)
    let firstIdx = -1;
    let secondIdx = -1;
    if (wordObjects.length > 0) {
      firstIdx = Math.floor(wordObjects.length * 0.55);
      if (firstIdx >= wordObjects.length) firstIdx = wordObjects.length - 1;
      secondIdx = wordObjects.length - 1;
    }

    let selectScaleProgress = 0;
    if (progress > 0.65 && progress < 0.90) {
      selectScaleProgress = (progress - 0.65) / 0.25;
    } else if (progress >= 0.90) {
      selectScaleProgress = 1.0;
    }

    if (selectScaleProgress > 0 && firstIdx !== -1 && secondIdx !== -1) {
      const w1 = wordObjects[firstIdx];
      const w2 = wordObjects[secondIdx];
      
      ctx.fillStyle = currentPreset.selectionBg;
      const leftBound = w1.x;
      const totalEditW = (w2.x + w2.w) - w1.x;
      ctx.fillRect(leftBound, w1.y - 30 * scaleFactor, totalEditW * selectScaleProgress, w1.h);

      // Accent color overlapping selected text
      ctx.fillStyle = currentPreset.selectionText;
      ctx.font = `bold italic ${currentSubFontSize}px sans-serif`;
      ctx.fillText(w1.word, w1.x, w1.y);
      if (selectScaleProgress > 0.6) {
        ctx.fillText(w2.word, w2.x, w2.y);
      }
    }

    ctx.restore(); // Clear preview viewport clipping bounds

    // Controller navigation buttons under preview monitor viewport
    ctx.fillStyle = currentPreset.workspaceBg;
    ctx.fillRect(innerX, innerY + innerH + 10 * scaleFactor, innerW, 35 * scaleFactor);
    
    // Play button, back, forward icons
    ctx.fillStyle = "#A1A1AA";
    ctx.font = `bold ${11 * scaleFactor}px "Inter", sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText("◀◀   ■   ▶   ▶▶", innerX + 15 * scaleFactor, innerY + innerH + 32 * scaleFactor);
    
    ctx.textAlign = "right";
    ctx.font = `600 ${11 * scaleFactor}px "JetBrains Mono", monospace`;
    ctx.fillText(currentPreset.name.toUpperCase(), innerX + innerW - 15 * scaleFactor, innerY + innerH + 32 * scaleFactor);

    // 3. TIMELINE PANEL (Bottom)
    const tlX = 0;
    const tlY = height - timelineH;
    const tlW = width;
    ctx.fillStyle = panelBg; // Timeline backing matches panels
    ctx.fillRect(tlX, tlY, tlW, timelineH);
    ctx.strokeStyle = itemBorder;
    ctx.strokeRect(tlX, tlY, tlW, timelineH);

    // Timeline Ruler Tracks header
    ctx.fillStyle = currentPreset.headerBg;
    ctx.fillRect(tlX, tlY, tlW, 30 * scaleFactor);
    
    ctx.strokeStyle = currentPreset.itemBorder;
    ctx.beginPath();
    ctx.moveTo(tlX, tlY + 30 * scaleFactor);
    ctx.lineTo(tlX + tlW, tlY + 30 * scaleFactor);
    ctx.stroke();

    // Time Ruler Marks (ticks of frames)
    ctx.fillStyle = muteTextColor;
    ctx.font = `${9 * scaleFactor}px "JetBrains Mono", monospace`;
    ctx.textAlign = "center";
    for (let tx = 80 * scaleFactor; tx < width; tx += 120 * scaleFactor) {
      ctx.beginPath();
      ctx.moveTo(tx, tlY + 15 * scaleFactor);
      ctx.lineTo(tx, tlY + 30 * scaleFactor);
      ctx.stroke();

      const timeMarkLabel = `00:0${Math.floor(tx / 300)}:${Math.floor((tx % 300) / 5).toString().padStart(2, '0')}:00`;
      ctx.fillText(timeMarkLabel, tx, tlY + 12 * scaleFactor);
    }

    // Playback red line head (sweeps timeline gracefully)
    const startPlayheadX = width * 0.25;
    const endPlayheadX = width * 0.70;
    const playheadX = startPlayheadX + progress * (endPlayheadX - startPlayheadX);

    // MULTI-TRACK INTERFACES
    const trackStartY = tlY + 45 * scaleFactor;
    const trackH = 34 * scaleFactor;
    const names = ["V1 - Video", "A1 - Audio", "T1 - Captions"];

    // Draw lanes labels
    names.forEach((tName, tIdx) => {
      const ty = trackStartY + tIdx * 45 * scaleFactor;
      ctx.fillStyle = currentPreset.trackLabelBg;
      ctx.fillRect(tlX + 10 * scaleFactor, ty, 100 * scaleFactor, trackH);
      
      ctx.fillStyle = "#D4D4D8";
      ctx.font = `600 ${11 * scaleFactor}px "Inter", sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(tName, tlX + 22 * scaleFactor, ty + 22 * scaleFactor);
    });

    // Dynamic co-dãn Timeline block representing Drag & Drop resizing
    // Stretch starts at progress 0.15, peaks at 0.5
    let dragResizeProgress = 0;
    if (progress > 0.15 && progress < 0.50) {
      dragResizeProgress = (progress - 0.15) / 0.35;
    } else if (progress >= 0.50) {
      dragResizeProgress = 1.0;
    }

    // Subtitle timeline clip block dimensions
    const capTrackStartX = width * 0.32;
    const baseCapW = 200 * scaleFactor;
    const capStretch = 65 * scaleFactor * Math.sin(dragResizeProgress * Math.PI / 2);
    const activeCapClipW = baseCapW + capStretch;
    const capTrackY = trackStartY + 2 * 45 * scaleFactor;

    // Draw Lane 1 Content Block (Film thumbnails)
    const clipV1_Y = trackStartY;
    ctx.fillStyle = currentPreset.trackV1Bg;
    ctx.strokeStyle = currentPreset.trackV1Border;
    drawRRect(ctx, capTrackStartX, clipV1_Y, 340 * scaleFactor, trackH, 4 * scaleFactor);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#A5B4FC";
    ctx.font = `bold ${10 * scaleFactor}px "Inter", sans-serif`;
    ctx.fillText("RAW_CLIP_RECORDS.mp4", capTrackStartX + 12 * scaleFactor, clipV1_Y + 22 * scaleFactor);

    // Draw Lane 2 Content Block (Dynamic waveform spikes)
    const clipAll_Y = trackStartY + 45 * scaleFactor;
    ctx.fillStyle = currentPreset.trackA1Bg;
    ctx.strokeStyle = currentPreset.trackA1Border;
    drawRRect(ctx, capTrackStartX, clipAll_Y, 340 * scaleFactor, trackH, 4 * scaleFactor);
    ctx.fill();
    ctx.stroke();

    // Symmetrical audio wave peaks
    ctx.strokeStyle = currentPreset.trackA1Wave;
    ctx.lineWidth = 1.5 * scaleFactor;
    for (let waveX = capTrackStartX + 10 * scaleFactor; waveX < capTrackStartX + 325 * scaleFactor; waveX += 6 * scaleFactor) {
      const amplitude = 12 * r() * scaleFactor; // Random high-fidelity look
      ctx.beginPath();
      ctx.moveTo(waveX, clipAll_Y + trackH / 2 - amplitude);
      ctx.lineTo(waveX, clipAll_Y + trackH / 2 + amplitude);
      ctx.stroke();
    }

    // Draw Lane 3 (CAPTIONS TRACK SUB CLIPS)
    ctx.fillStyle = currentPreset.trackCapBg;
    ctx.strokeStyle = currentPreset.trackCapBorder;
    ctx.lineWidth = 2 * scaleFactor;
    drawRRect(ctx, capTrackStartX, capTrackY, activeCapClipW, trackH, 4 * scaleFactor);
    ctx.fill();
    ctx.stroke();

    // Show tooltip alert of drag trim values hovering immediately above the clip handle
    if (progress > 0.15 && progress < 0.50) {
      const tooltipX = capTrackStartX + activeCapClipW;
      const tooltipY = capTrackY - 14 * scaleFactor;
      
      ctx.fillStyle = "rgba(20, 20, 26, 0.9)";
      ctx.strokeStyle = currentPreset.trackCapBorder;
      ctx.lineWidth = 1 * scaleFactor;
      drawRRect(ctx, tooltipX - 60 * scaleFactor, tooltipY - 24 * scaleFactor, 120 * scaleFactor, 24 * scaleFactor, 4 * scaleFactor);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = currentPreset.trackCapBorder;
      ctx.font = `bold ${10 * scaleFactor}px "JetBrains Mono", monospace`;
      ctx.textAlign = "center";
      const secondsTrimmed = (capStretch / scaleFactor / 50).toFixed(2);
      ctx.fillText(`Trim: +${secondsTrimmed}s`, tooltipX, tooltipY - 8 * scaleFactor);
    }

    // Caption Clip Text
    ctx.fillStyle = "#0F172A"; // Slate main font
    ctx.font = `bold ${10 * scaleFactor}px sans-serif`;
    ctx.textAlign = "left";
    const truncText = activeBlock.text.length > 25 ? activeBlock.text.substring(0, 22) + "..." : activeBlock.text;
    ctx.fillText(`CAPTION: "${truncText}"`, capTrackStartX + 12 * scaleFactor, capTrackY + 22 * scaleFactor);

    // Draw Playhead red line across layout tracks
    ctx.strokeStyle = currentPreset.playbackHead;
    ctx.lineWidth = 2 * scaleFactor;
    ctx.beginPath();
    ctx.moveTo(playheadX, tlY);
    ctx.lineTo(playheadX, tlY + timelineH);
    ctx.stroke();

    // Blue pointer triangle sitting directly on top
    ctx.fillStyle = currentPreset.playbackHeadTop;
    ctx.beginPath();
    ctx.moveTo(playheadX - 8 * scaleFactor, tlY + 12 * scaleFactor);
    ctx.lineTo(playheadX + 8 * scaleFactor, tlY + 12 * scaleFactor);
    ctx.lineTo(playheadX, tlY + 24 * scaleFactor);
    ctx.closePath();
    ctx.fill();

    // 4. PRECISE TARGET CURSOR ENGINE INTERACTION (Drag and stretch handle, then selects text)
    // Resting position: Floating off viewer controls
    const restX = width * 0.82;
    const restY = height * 0.40;

    // Timeline Drag coordinate Target (the end resize handle of the caption block)
    const handleStartX = capTrackStartX + baseCapW;
    const handleStartY = capTrackY + trackH / 2;

    const handleCurrentX = capTrackStartX + activeCapClipW;

    // Subtitle Monitor select coordinate target
    const monitorWordTargetX = wordObjects[firstIdx !== -1 ? firstIdx : 0]?.x || subX;
    const monitorWordTargetY = wordObjects[firstIdx !== -1 ? firstIdx : 0]?.y - 12 * scaleFactor || subY;

    // Subtitle Monitor selection drag finish coordinate target
    const monitorWordEndX = wordObjects[secondIdx !== -1 ? secondIdx : 0]?.x + (wordObjects[secondIdx !== -1 ? secondIdx : 0]?.w || 40) || subX;
    const monitorWordEndY = wordObjects[secondIdx !== -1 ? secondIdx : 0]?.y - 12 * scaleFactor || subY;

    let cursorX = restX;
    let cursorY = restY;
    let isClicking = false;

    if (progress < 0.12) {
      // Hovering from resting coordinates down to subtitle block timeline handle
      const ratio = progress / 0.12;
      cursorX = restX + (handleStartX - restX) * ratio;
      cursorY = restY + (handleStartY - restY) * ratio;
    } else if (progress >= 0.12 && progress < 0.15) {
      // Resting on block handle clicking down
      cursorX = handleStartX;
      cursorY = handleStartY;
      isClicking = true;
    } else if (progress >= 0.15 && progress < 0.50) {
      // Currently DRAGGING timeline handle to stretch track boundaries
      cursorX = handleCurrentX;
      cursorY = handleStartY;
      isClicking = true;
    } else if (progress >= 0.50 && progress < 0.65) {
      // Disengages timeline handle, floats smoothly up to selection word in Preview Monitor
      const ratio = (progress - 0.50) / 0.15;
      const startX = capTrackStartX + activeCapClipW;
      cursorX = startX + (monitorWordTargetX - startX) * ratio;
      cursorY = handleStartY + (monitorWordTargetY - handleStartY) * ratio;
    } else if (progress >= 0.65 && progress < 0.90) {
      // Drags over subtitle words to commit highlight overlay selection
      const ratio = (progress - 0.65) / 0.25;
      cursorX = monitorWordTargetX + (monitorWordEndX - monitorWordTargetX) * ratio;
      cursorY = monitorWordTargetY + (monitorWordEndY - monitorWordTargetY) * ratio;
      isClicking = true;
    } else {
      // Resting satisfied on highlight bounds
      cursorX = monitorWordEndX;
      cursorY = monitorWordEndY;
    }

    // Floating double click indicator or selection circle clicks
    if (isClicking) {
      ctx.strokeStyle = currentPreset.cursorPulse; // Highlight pulse
      ctx.lineWidth = 1.5 * scaleFactor;
      ctx.beginPath();
      ctx.arc(cursorX, cursorY, (12 + Math.floor(adjustedTime % 1 * 10)) * scaleFactor, 0, Math.PI * 2);
      ctx.stroke();
    }

    // DRAW OS-STYLE MOCK EDITING MOUSE POINTER
    const drawCursor = (cx: number, cy: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-Math.PI / 8); 
      
      ctx.fillStyle = currentPreset.cursorBg;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2 * scaleFactor;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 18 * scaleFactor);
      ctx.lineTo(5 * scaleFactor, 14 * scaleFactor);
      ctx.lineTo(11 * scaleFactor, 22 * scaleFactor);
      ctx.lineTo(14 * scaleFactor, 20 * scaleFactor);
      ctx.lineTo(8 * scaleFactor, 12 * scaleFactor);
      ctx.lineTo(13 * scaleFactor, 12 * scaleFactor);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };

    drawCursor(cursorX, cursorY);

    // BRANDING WATERMARK
    if (config.logoUrl) {
      const logoImg = imageCache.get('brand-logo');
      if (logoImg) {
        const scaleX = (config.logoX !== undefined ? config.logoX : 85) / 100;
        const scaleY = (config.logoY !== undefined ? config.logoY : 15) / 100;
        const logoSize = config.logoSize !== undefined ? config.logoSize : 80;
        const opacity = config.logoOpacity !== undefined ? config.logoOpacity : 0.9;
        const logoX = width * scaleX - logoSize / 2;
        const logoY = height * scaleY - logoSize / 2;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        ctx.restore();
      }
    }

    return; // Bypass normal background and standard layout rendering
  }

  // Render Fake Calendar Human-like Behavior (Draws a gorgeous desktop with wooden background and a 3D desk calendar, circling the detected date with beautiful hand-drawn ink and camera zooms in!)
  if (isFakeCalendarActive && activeBlock) {
    const scaleFactor = height / 1080;
    const blockDuration = activeBlock.endTime - activeBlock.startTime;
    const elapsed = Math.max(0, adjustedTime - activeBlock.startTime);
    const progress = Math.min(1, Math.max(0, elapsed / (blockDuration || 1)));

    // Parse date range or single date from active block text
    const dateRange = detectDateAndRangeInText(activeBlock.text) || { startDay: 15, endDay: 15, month: 6, year: 2026 };
    const { startDay, endDay, month, year } = dateRange;
    const focusDay = Math.floor((startDay + endDay) / 2);

    const isVietnamese = false;

    // Use a high-entropy chaotic generator (sine wave randomizer) 
    // to scatter styles and layouts, preventing any repetition or predictable sequence.
    const rawVal = Math.sin(
      activeBlock.id * 83.17 + 
      activeBlock.text.length * 19.33 + 
      (activeBlock.startTime || 0) * 137.91 + 
      (subtitles.length || 0) * 443.23
    ) * 43758.5453;
    const rnd = Math.abs(rawVal) % 1;

    const seed = Math.floor(rnd * 100000);
    const styleIdx = Math.floor(rnd * 10);
    
    // layoutMode: 0 = Full-Screen, 1 = Half-Screen Split, 2 = Windowed Center Desk View
    const layoutMode = Math.floor((rnd * 100) % 3);
    const isFullScreen = (layoutMode === 0);
    const isHalfScreen = (layoutMode === 1);

    // Build the 10 gorgeous distinct design styles
    const styles = [
      {
        bgDraw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
          // 0. Classic Vintage Craft (Traditional Wood)
          const grad = ctx.createLinearGradient(0, 0, w, h);
          grad.addColorStop(0, '#2b1c0c');
          grad.addColorStop(0.5, '#402a16');
          grad.addColorStop(1, '#1b1107');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.lineWidth = 1.5 * scaleFactor;
          for (let y = 0; y < h; y += 12 * scaleFactor) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(w * 0.3, y + Math.sin(y) * 15 * scaleFactor, w * 0.7, y - Math.cos(y) * 20 * scaleFactor, w, y);
            ctx.stroke();
          }
        },
        paperColor: '#fcf8ec',
        textColor: '#362a1b',
        headerColor: '#8a2307',
        accentColor: '#b85f02',
        gridBorder: 'rgba(54, 42, 27, 0.12)',
        highlightInk: '#d32f2f',
        fontSans: '"Georgia", serif',
        fontTitle: '"Georgia", serif',
        label: isVietnamese ? "LỊCH TRÌNH CÁ NHÂN" : "VINTAGE SYSTEM MEMO",
        coilColor: '#c5a059',
        borderRadius: 8 * scaleFactor,
        isPaperTextStyled: true,
        isMonochromeSpecial: false,
        isPhosphorSpecial: false
      },
      {
        bgDraw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
          // 1. Modern Blue Slate (High-tech Professional)
          const grad = ctx.createRadialGradient(w/2, h/2, 50 * scaleFactor, w/2, h/2, w);
          grad.addColorStop(0, '#1e293b');
          grad.addColorStop(1, '#0f172a');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
          ctx.lineWidth = 1 * scaleFactor;
          for (let x = 0; x < w; x += 40 * scaleFactor) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
          }
          for (let y = 0; y < h; y += 40 * scaleFactor) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          }
        },
        paperColor: '#ffffff',
        textColor: '#0f172a',
        headerColor: '#1e3a8a',
        accentColor: '#3b82f6',
        gridBorder: 'rgba(15, 23, 42, 0.06)',
        highlightInk: '#ec4899', 
        fontSans: '"Inter", sans-serif',
        fontTitle: '"Inter", sans-serif',
        label: isVietnamese ? "LỊCH LÀM VIỆC" : "WORK PLANNER",
        coilColor: '#94a3b8',
        borderRadius: 16 * scaleFactor,
        isPaperTextStyled: false,
        isMonochromeSpecial: false,
        isPhosphorSpecial: false
      },
      {
        bgDraw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
          // 2. Botanical Sage (Nature/Organic)
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, '#d1fae5');
          grad.addColorStop(1, '#a7f3d0');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = 'rgba(16, 185, 129, 0.05)';
          ctx.beginPath();
          ctx.arc(100 * scaleFactor, 100 * scaleFactor, 150 * scaleFactor, 0, Math.PI * 2);
          ctx.arc(w - 150 * scaleFactor, h - 100 * scaleFactor, 220 * scaleFactor, 0, Math.PI * 2);
          ctx.fill();
        },
        paperColor: '#f9fbf9',
        textColor: '#143825',
        headerColor: '#047857',
        accentColor: '#10b981',
        gridBorder: 'rgba(20, 56, 37, 0.08)',
        highlightInk: '#14b8a6',
        fontSans: '"Georgia", serif',
        fontTitle: '"Georgia", serif',
        label: isVietnamese ? "NHẬT KÝ XANH" : "BOTANICAL DAILY",
        coilColor: '#6ee7b7',
        borderRadius: 12 * scaleFactor,
        isPaperTextStyled: true,
        isMonochromeSpecial: false,
        isPhosphorSpecial: false
      },
      {
        bgDraw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
          // 3. Cyberpunk Hologram (Neon/Sci-Fi)
          ctx.fillStyle = '#06060c';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = 'rgba(180, 70, 255, 0.1)';
          ctx.lineWidth = 1 * scaleFactor;
          for (let r = 80; r < w; r += 200 * scaleFactor) {
            ctx.beginPath();
            ctx.arc(w / 2, h / 2, r * scaleFactor, 0, Math.PI * 2);
            ctx.stroke();
          }
        },
        paperColor: '#090d16',
        textColor: '#e2e8f0',
        headerColor: '#a855f7',
        accentColor: '#a855f7',
        gridBorder: 'rgba(168, 85, 247, 0.18)',
        highlightInk: '#06b6d4', 
        fontSans: '"Courier New", monospace',
        fontTitle: '"Courier New", monospace',
        label: isVietnamese ? "LỊCH TRÌNH THỜI GIAN" : "DATAFEED SYNC",
        coilColor: '#a855f7',
        borderRadius: 4 * scaleFactor,
        isPaperTextStyled: true,
        isMonochromeSpecial: false,
        isPhosphorSpecial: false
      },
      {
        bgDraw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
          // 4. Dreamy Pastel Pink (Romantic/Cozy)
          const grad = ctx.createLinearGradient(0, 0, w, 0);
          grad.addColorStop(0, '#fbcfe8');
          grad.addColorStop(0.5, '#fce7f3');
          grad.addColorStop(1, '#ddd6fe');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        },
        paperColor: '#fffdfa',
        textColor: '#502e3c',
        headerColor: '#db2777',
        accentColor: '#f472b6',
        gridBorder: 'rgba(219, 39, 119, 0.1)',
        highlightInk: '#be185d',
        fontSans: '"Inter", sans-serif',
        fontTitle: '"Inter", sans-serif',
        label: isVietnamese ? "HÔM NAY CÓ GÌ?" : "DREAMY PLANNER",
        coilColor: '#fbcfe8',
        borderRadius: 20 * scaleFactor,
        isPaperTextStyled: false,
        isMonochromeSpecial: false,
        isPhosphorSpecial: false
      },
      {
        bgDraw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
          // 5. Autumn Terracotta Retro (Clay & Autumn)
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, '#78350f');
          grad.addColorStop(1, '#451a03');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = 'rgba(251, 146, 60, 0.05)';
          ctx.beginPath();
          ctx.arc(0, h, 300 * scaleFactor, 0, Math.PI * 2);
          ctx.fill();
        },
        paperColor: '#fdf6e2',
        textColor: '#4b2e1e',
        headerColor: '#9a3412',
        accentColor: '#ea580c',
        gridBorder: 'rgba(154, 52, 18, 0.15)',
        highlightInk: '#c2410c',
        fontSans: '"Georgia", serif',
        fontTitle: '"Georgia", serif',
        label: isVietnamese ? "ẤM ÁP MÙA THU" : "AUTUMN CLAY NOTE",
        coilColor: '#b45309',
        borderRadius: 14 * scaleFactor,
        isPaperTextStyled: true,
        isMonochromeSpecial: false,
        isPhosphorSpecial: false
      },
      {
        bgDraw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
          // 6. Midnight Gold (Carbon Black Luxury)
          ctx.fillStyle = '#0f1115';
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = 'rgba(234, 179, 8, 0.03)';
          ctx.lineWidth = 1 * scaleFactor;
          for (let i = -w; i < w; i += 30 * scaleFactor) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
          }
        },
        paperColor: '#17191e',
        textColor: '#e4e4e7',
        headerColor: '#eab308',
        accentColor: '#facc15',
        gridBorder: 'rgba(234, 179, 8, 0.12)',
        highlightInk: '#f59e0b',
        fontSans: '"Inter", sans-serif',
        fontTitle: '"Georgia", serif',
        label: isVietnamese ? "LỊCH TRÌNH VÀNG" : "MIDNIGHT LUXURY",
        coilColor: '#ca8a04',
        borderRadius: 10 * scaleFactor,
        isPaperTextStyled: true,
        isMonochromeSpecial: false,
        isPhosphorSpecial: false
      },
      {
        bgDraw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
          // 7. Artistic Watercolor (Creative Sky Stains)
          const grad = ctx.createRadialGradient(w/2, h/2, 100 * scaleFactor, w/2, h/2, w);
          grad.addColorStop(0, '#bfdbfe');
          grad.addColorStop(0.5, '#ddd6fe');
          grad.addColorStop(1, '#93c5fd');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = 'rgba(139, 92, 246, 0.1)';
          ctx.beginPath(); ctx.arc(w*0.2, h*0.3, 100*scaleFactor, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
          ctx.beginPath(); ctx.arc(w*0.8, h*0.7, 120*scaleFactor, 0, Math.PI*2); ctx.fill();
        },
        paperColor: '#ffffff',
        textColor: '#1e3a8a',
        headerColor: '#3b82f6',
        accentColor: '#8b5cf6',
        gridBorder: 'rgba(59, 130, 246, 0.1)',
        highlightInk: '#6366f1',
        fontSans: '"Inter", sans-serif',
        fontTitle: '"Inter", sans-serif',
        label: isVietnamese ? "XỨ SỞ NGHỆ THUẬT" : "ARTISTIC WATERCOLOR",
        coilColor: '#a5b4fc',
        borderRadius: 18 * scaleFactor,
        isPaperTextStyled: false,
        isMonochromeSpecial: false,
        isPhosphorSpecial: false
      },
      {
        bgDraw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
          // 8. Monochrome Sand Minimalist (Pure Concrete Sandy)
          const grad = ctx.createLinearGradient(0, 0, w, h);
          grad.addColorStop(0, '#f5f5f4');
          grad.addColorStop(1, '#e7e5e4');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, w, h);
        },
        paperColor: '#fafaf9',
        textColor: '#1c1917',
        headerColor: '#292524',
        accentColor: '#78716c',
        gridBorder: 'rgba(41, 37, 36, 0.08)',
        highlightInk: '#d6d3d1',
        fontSans: '"Inter", sans-serif',
        fontTitle: '"Inter", sans-serif',
        label: isVietnamese ? "TỐI GIẢN TĨNH LẶNG" : "SAND MONOCHROME",
        coilColor: '#a8a29e',
        borderRadius: 4 * scaleFactor,
        isPaperTextStyled: false,
        isMonochromeSpecial: true,
        isPhosphorSpecial: false
      },
      {
        bgDraw: (ctx: CanvasRenderingContext2D, w: number, h: number) => {
          // 9. Phosphor Terminal (80s CRT Command Slate)
          ctx.fillStyle = '#040d04';
          ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = 'rgba(34, 197, 94, 0.02)';
          ctx.beginPath(); ctx.arc(w/2, h/2, h*0.8, 0, Math.PI*2); ctx.fill();
        },
        paperColor: '#0c1a0c',
        textColor: '#4ade80',
        headerColor: '#22c55e',
        accentColor: '#15803d',
        gridBorder: 'rgba(34, 197, 94, 0.15)',
        highlightInk: '#22c55e',
        fontSans: '"Courier New", monospace',
        fontTitle: '"Courier New", monospace',
        label: isVietnamese ? "HỆ THỐNG PHỤ ĐỀ" : "MATRIX SYSTEM STAT",
        coilColor: '#15803d',
        borderRadius: 2 * scaleFactor,
        isPaperTextStyled: true,
        isMonochromeSpecial: false,
        isPhosphorSpecial: true
      }
    ];

    const s = styles[styleIdx];

    // If half-screen split layout is active, we render the full standard subtitle layout (columns frame and background particles) under the hood first, then overlay the calendar on the right half.
    if (isHalfScreen) {
      let activeImageIds: string[] = [];
      if (activeBlock) {
        if (activeBlock.matchedImageIds && activeBlock.matchedImageIds.length > 0) {
          activeImageIds = filterImageIdsForMode(activeBlock, activeBlock.matchedImageIds);
        } else {
          const basicIds = [activeBlock.matchedLeftImageId, activeBlock.matchedRightImageId].filter(Boolean) as string[];
          activeImageIds = filterImageIdsForMode(activeBlock, basicIds);
        }
      }

      let prevImageIds: string[] = [];
      if (prevBlock) {
        if (prevBlock.matchedImageIds && prevBlock.matchedImageIds.length > 0) {
          prevImageIds = filterImageIdsForMode(prevBlock, prevBlock.matchedImageIds);
        } else {
          const basicIds = [prevBlock.matchedLeftImageId, prevBlock.matchedRightImageId].filter(Boolean) as string[];
          prevImageIds = filterImageIdsForMode(prevBlock, basicIds);
        }
      }

      let numCols = Math.max(activeImageIds.length, prevImageIds.length);
      if (numCols < 1) {
        numCols = 2;
      }

      let transitionProgress = 1;
      let isTransitioning = false;
      const hasActiveImage = activeImageIds.some(id => imageCache.has(id));
      const hasPrevImage = prevImageIds.some(id => imageCache.has(id));

      if (activeBlock && hasPrevImage && hasActiveImage) {
        const timeSinceStart = adjustedTime - activeBlock.startTime;
        if (timeSinceStart >= 0 && timeSinceStart < config.transitionDuration) {
          transitionProgress = timeSinceStart / config.transitionDuration;
          isTransitioning = true;
        }
      }

      for (let colIndex = 0; colIndex < numCols; colIndex++) {
        const activeImgId = activeImageIds[colIndex];
        const prevImgId = prevImageIds[colIndex];
        const activeImgEl = activeImgId ? imageCache.get(activeImgId) : null;
        const prevImgEl = prevImgId ? imageCache.get(prevImgId) : null;

        let shouldFlip = false;
        if (numCols === 2) {
          if (colIndex === 1) shouldFlip = true;
        } else if (numCols === 3) {
          if (colIndex === 2) {
            shouldFlip = true;
          } else if (colIndex === 1) {
            const blockId = activeBlock ? activeBlock.id : 0;
            shouldFlip = (blockId % 2 === 0);
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

        drawColumnFrame(
          ctx,
          colIndex,
          numCols,
          width,
          height,
          activeImgEl || null,
          prevImgEl || null,
          activeBlock,
          prevBlock,
          isTransitioning,
          transitionProgress,
          config,
          adjustedTime,
          images,
          imageCache,
          shouldFlip
        );
      }

      // Render background particles
      if (config.bgEffect && config.bgEffect !== 'none') {
        let showEffect = true;
        const interval = Number(config.bgEffectInterval || 0);
        let consecutive = Number(config.bgEffectConsecutive || 0);

        if (interval > 0) {
          if (consecutive <= 0) {
            consecutive = 1;
          }
          let refIdx = activeBlockIdx;
          if (refIdx !== -1) {
            const totalCycle = interval + consecutive;
            showEffect = (refIdx % totalCycle) < consecutive;
          }
        }

        if (showEffect) {
          let activeEffect = config.bgEffect;
          if (activeEffect === 'random') {
            const effectsList = ['snow', 'snowflake', 'rain', 'sparks', 'lightning', 'lightning_clouds', 'sakura', 'bubbles', 'golden_dust', 'autumn_leaves', 'starry_glow', 'hearts', 'fireflies', 'matrix_rain', 'snow_storm', 'neon_stars'];
            const chosenId = Math.abs(activeBlockIdx !== -1 ? activeBlockIdx : Math.floor(adjustedTime / 8)) % effectsList.length;
            activeEffect = effectsList[chosenId] as any;
          }
          drawBackgroundEffect(ctx, activeEffect, width, height, adjustedTime);
        }
      }
    }

    // Calendar positions (Full-screen vs Windowed desk view vs Half-screen Split)
    let calWidth = 780 * scaleFactor;
    let calHeight = 600 * scaleFactor;
    let calX = (width - calWidth) / 2;
    let calY = (height - calHeight) / 2 + 30 * scaleFactor;
    let borderRadius = s.borderRadius;

    if (isFullScreen) {
      calWidth = width;
      calHeight = height;
      calX = 0;
      calY = 0;
      borderRadius = 0;
    } else if (isHalfScreen) {
      calWidth = width * 0.5;
      calHeight = height;
      calX = width * 0.5;
      calY = 0;
      borderRadius = 0;
    }

    // Define positions of Days in the grid
    const startDayOfWeek = (month * 3 + year) % 7; // Deterministic offset for realistic grid feel
    const daysInMonth = (month === 2) ? 28 : ([4, 6, 9, 11].includes(month) ? 30 : 31);

    // Compute grid layout parameters
    const headerSectionHeight = 120 * scaleFactor;
    const gridX = calX + 35 * scaleFactor;
    const gridY = calY + headerSectionHeight + 40 * scaleFactor;
    const gridWidth = calWidth - 70 * scaleFactor;
    const gridHeight = calHeight - headerSectionHeight - 70 * scaleFactor;
    
    const cellWidth = gridWidth / 7;
    const cellHeight = gridHeight / 6;

    // Find the cell coordinates (col, row) for focus day to target pan / zoom
    const dayGridIdx = startDayOfWeek + (focusDay - 1);
    const colCol = dayGridIdx % 7;
    const rowRow = Math.floor(dayGridIdx / 7);

    // Targeted cell coordinates
    const targetCellCenterX = gridX + colCol * cellWidth + cellWidth / 2;
    const targetCellCenterY = gridY + rowRow * cellHeight + cellHeight / 2;

    // Group days in range by row index to prepare horizontal highlighter capsules
    const rowRanges: { [r: number]: { cMin: number, cMax: number, y: number, cxMin: number, cxMax: number } } = {};
    let dCounter = 1;
    for (let rIdx = 0; rIdx < 6; rIdx++) {
       for (let cIdx = 0; cIdx < 7; cIdx++) {
          const flatIdx = rIdx * 7 + cIdx;
          if (flatIdx >= startDayOfWeek && dCounter <= daysInMonth) {
             if (dCounter >= startDay && dCounter <= endDay) {
                const cx = gridX + cIdx * cellWidth + cellWidth / 2;
                const cy = gridY + rIdx * cellHeight + cellHeight / 2;
                if (!rowRanges[rIdx]) {
                   rowRanges[rIdx] = { cMin: cIdx, cMax: cIdx, y: cy, cxMin: cx, cxMax: cx };
                } else {
                   rowRanges[rIdx].cMax = cIdx;
                   rowRanges[rIdx].cxMax = cx;
                }
             }
             dCounter++;
          }
       }
    }

    // 1. Establish Zoom parameters based on block progress
    const beginZoomProgress = 0.25;
    const peakZoomProgress = 0.65;
    const targetScale = isFullScreen ? 1.8 : (isHalfScreen ? 1.5 : 2.4); // lower scale for fullscreen/halfscreen since details are already large

    let currentScale = 1.0;
    let cameraCenterX = isHalfScreen ? width * 0.75 : width / 2;
    let cameraCenterY = height / 2;

    if (progress > beginZoomProgress) {
      // Transition from zoom-out to zoom-in
      const zoomRatio = Math.min(1, (progress - beginZoomProgress) / (peakZoomProgress - beginZoomProgress));
      // Smoothstep easing
      const smoothT = zoomRatio * zoomRatio * (3 - 2 * zoomRatio);

      currentScale = 1.0 + (targetScale - 1.0) * smoothT;
      const baseCenterX = isHalfScreen ? width * 0.75 : width / 2;
      cameraCenterX = baseCenterX + (targetCellCenterX - baseCenterX) * smoothT;
      cameraCenterY = (height / 2) + (targetCellCenterY - (height / 2)) * smoothT;
    }

    // Apply clipping path if halfscreen to restrict calendar background and drawing to right half
    if (isHalfScreen) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(width * 0.5, 0, width * 0.5, height);
      ctx.clip();
    }

    // 2. Draw outer desk environment if not fullscreen.
    // If fullscreen, the calendar card takes up the entire environment entirely, but drawing style's background anyway stabilizes layout.
    s.bgDraw(ctx, width, height);

    // 3. Coordinate system transformation for seamless Pan & Zoom effect!
    ctx.save();
    ctx.translate(isHalfScreen ? width * 0.75 : width / 2, height / 2);
    ctx.scale(currentScale, currentScale);
    ctx.translate(-cameraCenterX, -cameraCenterY);

    // 4. DRAW CALENDAR CONTAINER & COZY SHADOW
    if (!isFullScreen && !isHalfScreen) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.16)';
      ctx.shadowBlur = 32 * scaleFactor;
      ctx.shadowOffsetY = 15 * scaleFactor;
    }
    ctx.fillStyle = s.paperColor;
    
    // Draw rounded rectangular calendar card
    ctx.beginPath();
    if (borderRadius > 0) {
      ctx.roundRect(calX, calY, calWidth, calHeight, borderRadius);
    } else {
      ctx.rect(calX, calY, calWidth, calHeight);
    }
    ctx.fill();
    ctx.shadowColor = 'transparent'; // Reset standard shadows
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Draw stylish top binder / ring holes (reproducing coils beautifully if not fullscreen and not halfscreen)
    if (!isFullScreen && !isHalfScreen) {
      ctx.fillStyle = s.coilColor;
      const coilCount = 14;
      for (let i = 0; i < coilCount; i++) {
         const cx = calX + (calWidth / (coilCount + 1)) * (i + 1);
         const cy = calY;
         
         // Draw loop wire shadow
         ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)';
         ctx.lineWidth = 4 * scaleFactor;
         ctx.beginPath();
         ctx.ellipse(cx, cy - 10 * scaleFactor, 5 * scaleFactor, 18 * scaleFactor, 0, 0, Math.PI * 2);
         ctx.stroke();

         // Draw real shiny loop wires (3D metallic effect)
         ctx.strokeStyle = s.coilColor;
         ctx.lineWidth = 2.5 * scaleFactor;
         ctx.beginPath();
         ctx.ellipse(cx - 1 * scaleFactor, cy - 12 * scaleFactor, 4.5 * scaleFactor, 16 * scaleFactor, -Math.PI / 16, 0, Math.PI * 2);
         ctx.stroke();

         // Small loop highlights
         ctx.strokeStyle = '#ffffff';
         ctx.lineWidth = 0.8 * scaleFactor;
         ctx.beginPath();
         ctx.ellipse(cx - 2.5 * scaleFactor, cy - 14 * scaleFactor, 2 * scaleFactor, 12 * scaleFactor, -Math.PI / 16, Math.PI, Math.PI * 1.5);
         ctx.stroke();
      }
    }

    // 5. DRAW CALENDAR MONTH & YEAR HEADER
    ctx.fillStyle = s.headerColor;
    ctx.font = `bold ${isFullScreen ? 42 * scaleFactor : 32 * scaleFactor}px ${s.fontTitle}`;
    ctx.textAlign = 'center';
    
    const monthNamesEn = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
    
    const headerTitle = isVietnamese 
      ? `THÁNG ${month < 10 ? '0' + month : month} / ${year}`
      : `${monthNamesEn[month - 1]} ${year}`;
      
    ctx.fillText(headerTitle, calX + calWidth / 2, calY + (isFullScreen ? 75 * scaleFactor : 55 * scaleFactor));

    // Sub-banner label
    ctx.fillStyle = s.accentColor;
    ctx.font = `bold ${isFullScreen ? 12.5 * scaleFactor : 10.5 * scaleFactor}px ${s.fontSans}`;
    ctx.fillText(s.label, calX + calWidth / 2, calY + (isFullScreen ? 105 * scaleFactor : 82 * scaleFactor));

    // Decorative thin underline split
    ctx.strokeStyle = s.gridBorder;
    ctx.lineWidth = 1 * scaleFactor;
    ctx.beginPath();
    ctx.moveTo(calX + 40 * scaleFactor, calY + (isFullScreen ? 135 * scaleFactor : 105 * scaleFactor));
    ctx.lineTo(calX + calWidth - 40 * scaleFactor, calY + (isFullScreen ? 135 * scaleFactor : 105 * scaleFactor));
    ctx.stroke();

    // 6. DRAW WEEKDAYS LABELS IN COLUMNS (MON-SUN)
    const labelsVn = ["T.Hai", "T.Ba", "T.Tư", "T.Năm", "T.Sáu", "T.Bảy", "Chủ Nhật"];
    const labelsEn = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    const activeLabels = isVietnamese ? labelsVn : labelsEn;

    ctx.textAlign = 'center';
    ctx.font = `bold ${isFullScreen ? 16 * scaleFactor : 14 * scaleFactor}px ${s.fontSans}`;

    for (let c = 0; c < 7; c++) {
       const x = gridX + c * cellWidth + cellWidth / 2;
       const y = calY + headerSectionHeight + (isFullScreen ? 40 * scaleFactor : 15 * scaleFactor);
       
       // Saturdays are blue-ish, Sundays are red-ish to mimic clean realistic calendar standards
       if (c === 5) ctx.fillStyle = s.isPaperTextStyled ? '#2980b9' : '#0284c7';
       else if (c === 6) ctx.fillStyle = '#e74c3c';
       else ctx.fillStyle = s.textColor;

       ctx.fillText(activeLabels[c], x, y);
    }

    // 7. DRAW DAY NUMBERS GRID
    ctx.font = `bold ${isFullScreen ? 18 * scaleFactor : 16 * scaleFactor}px ${s.fontSans}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let dayCounter = 1;
    for (let rIdx = 0; rIdx < 6; rIdx++) {
       for (let cIdx = 0; cIdx < 7; cIdx++) {
          const flatIdx = rIdx * 7 + cIdx;
          if (flatIdx >= startDayOfWeek && dayCounter <= daysInMonth) {
             const cx = gridX + cIdx * cellWidth + cellWidth / 2;
             const cy = gridY + rIdx * cellHeight + cellHeight / 2;

             const isHighlighted = (dayCounter >= startDay && dayCounter <= endDay);
             const isFocusDayVal = (dayCounter === focusDay);
             
             // Base day indicator background if targetted
             if (isHighlighted) {
                // Soft glow under our range target to make it premium (10% translucent shade highlighter)
                ctx.fillStyle = s.highlightInk === '#d6d3d1' ? 'rgba(0, 0, 0, 0.08)' : (s.highlightInk + '1A');
                ctx.beginPath();
                ctx.roundRect(cx - cellWidth * 0.42, cy - cellHeight * 0.4, cellWidth * 0.84, cellHeight * 0.8, 6 * scaleFactor);
                ctx.fill();
             }

             // Render text of date
             if (isHighlighted) {
                if (s.isMonochromeSpecial) {
                  ctx.fillStyle = '#1c1917';
                } else if (s.isPhosphorSpecial) {
                  ctx.fillStyle = '#ffffff'; // terminal stark highlight
                } else {
                  ctx.fillStyle = s.highlightInk;
                }
             } else if (cIdx === 6) {
                ctx.fillStyle = s.isPhosphorSpecial ? 'rgba(231, 76, 60, 0.6)' : 'rgba(231, 76, 60, 0.8)';
             } else if (cIdx === 5) {
                ctx.fillStyle = s.isPhosphorSpecial ? 'rgba(34, 197, 94, 0.6)' : (s.isPaperTextStyled ? 'rgba(41, 128, 185, 0.8)' : 'rgba(2, 132, 199, 0.8)');
             } else {
                ctx.fillStyle = s.textColor;
             }

             ctx.fillText(dayCounter.toString(), cx, cy);
             dayCounter++;
          }
       }
    }

    // 8. HAND-DRAWN INK BOLD PEN MARKINGS OF DẢI NGÀY!
    const animStart = 0.45;
    const animDuration = 0.25;
    if (progress > animStart) {
       const circleProgress = Math.min(1, (progress - animStart) / animDuration);
       
       ctx.save();
       ctx.strokeStyle = s.highlightInk;
       ctx.lineWidth = isFullScreen ? 4.5 * scaleFactor : 3.5 * scaleFactor;
       if (s.isMonochromeSpecial) {
         ctx.strokeStyle = '#000000';
         ctx.lineWidth = 4 * scaleFactor;
       }
       ctx.lineCap = 'round';
       ctx.lineJoin = 'round';

       const rY = cellHeight * 0.42;

       // Draw an organic capsule for each row (perfect multi-day range support!)
       Object.keys(rowRanges).forEach((rKey) => {
          const rIdx = parseInt(rKey, 10);
          const data = rowRanges[rIdx];
          const cy = data.y;
          
          const x1 = data.cxMin;
          const x2 = data.cxMax;
          const halfW = (x2 - x1) / 2;
          const cx = x1 + halfW;
          const rX = halfW + cellWidth * 0.44;
          
          ctx.beginPath();
          // Double looping parametric capsule drawing
          const totalRotations = 1.25 * Math.PI * 2;
          const limitAng = circleProgress * totalRotations;
          
          for (let angle = 0; angle <= limitAng; angle += 0.08) {
             const xOffset = Math.cos(angle - Math.PI / 2);
             const yOffset = Math.sin(angle - Math.PI / 2);
             
             // Add hand-drawn jitter noise with trigonometric waves
             const noise = 0.95 + 0.06 * Math.sin(angle * 7 + seed % 10) + 0.03 * Math.cos(angle * 13 + seed % 5);
             const radiusScale = 1.0 + (angle / (Math.PI * 2)) * 0.02;

             const px = cx + xOffset * rX * noise * radiusScale;
             const py = cy + yOffset * rY * noise * radiusScale;

             if (angle === 0) {
                ctx.moveTo(px, py);
             } else {
                ctx.lineTo(px, py);
             }
          }
          ctx.stroke();
       });
       ctx.restore();

       // Draw a tiny cute handwritten memo notes beside the target focus day to look humanized!
       if (circleProgress > 0.8) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, (circleProgress - 0.8) * 5);
          ctx.fillStyle = s.isMonochromeSpecial ? '#1c1917' : s.highlightInk;
          ctx.font = `italic bold ${isFullScreen ? 12 * scaleFactor : 10 * scaleFactor}px ${s.fontSans}`;
          ctx.textAlign = 'left';
          
          const memoText = isVietnamese ? "★ Ngày này!" : "★ HERE!";
          ctx.fillText(memoText, targetCellCenterX + (cellWidth * 0.44) * 0.9, targetCellCenterY - rY * 0.6);
          ctx.restore();
       }
    }

    // Restore Coordinate transformations
    ctx.restore();

    // 9. COZY ENVIRONMENTAL REFRACTION OVERLAYS (GLASS GLOW OR AMBIENT VIGNETTE)
    const overlayGrad = ctx.createRadialGradient(width/2, height/2, width/4, width/2, height/2, width);
    overlayGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    overlayGrad.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
    ctx.fillStyle = overlayGrad;
    ctx.fillRect(0, 0, width, height);

    // 10. OVERLAY BRAND LOGO WATERMARK
    if (config.logoUrl) {
      const logoImg = imageCache.get('brand-logo');
      if (logoImg) {
        const scaleX = (config.logoX !== undefined ? config.logoX : 85) / 100;
        const scaleY = (config.logoY !== undefined ? config.logoY : 15) / 100;
        const logoSize = config.logoSize !== undefined ? config.logoSize : 80;
        const opacity = config.logoOpacity !== undefined ? config.logoOpacity : 0.9;
        const logoX = width * scaleX - logoSize / 2;
        const logoY = height * scaleY - logoSize / 2;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        ctx.restore();
      }
    }

    // Restore clip context if we opened it for Halfscreen
    if (isHalfScreen) {
      ctx.restore();
    }

    return; // Bypass traditional background rendering
  }

  let activeImageIds: string[] = [];
  if (activeBlock) {
    if (activeBlock.matchedImageIds && activeBlock.matchedImageIds.length > 0) {
      activeImageIds = filterImageIdsForMode(activeBlock, activeBlock.matchedImageIds);
    } else {
      const basicIds = [activeBlock.matchedLeftImageId, activeBlock.matchedRightImageId].filter(Boolean) as string[];
      activeImageIds = filterImageIdsForMode(activeBlock, basicIds);
    }
  }

  let prevImageIds: string[] = [];
  if (prevBlock) {
    if (prevBlock.matchedImageIds && prevBlock.matchedImageIds.length > 0) {
      prevImageIds = filterImageIdsForMode(prevBlock, prevBlock.matchedImageIds);
    } else {
      const basicIds = [prevBlock.matchedLeftImageId, prevBlock.matchedRightImageId].filter(Boolean) as string[];
      prevImageIds = filterImageIdsForMode(prevBlock, basicIds);
    }
  }

  // The number of split-screen columns depends on how many images have been mapped
  let numCols = Math.max(activeImageIds.length, prevImageIds.length);
  if (numCols < 1) {
    numCols = 2; // fallback
  }

  // Determine if we are inside a transition window
  let transitionProgress = 1;
  let isTransitioning = false;
  
  const hasActiveImage = activeImageIds.some(id => imageCache.has(id));
  const hasPrevImage = prevImageIds.some(id => imageCache.has(id));

  if (activeBlock && hasPrevImage && hasActiveImage) {
    const timeSinceStart = adjustedTime - activeBlock.startTime;
    if (timeSinceStart >= 0 && timeSinceStart < config.transitionDuration) {
      transitionProgress = timeSinceStart / config.transitionDuration;
      isTransitioning = true;
    }
  }
  
  // Draw each column split cell
  for (let colIndex = 0; colIndex < numCols; colIndex++) {
    const activeImgId = activeImageIds[colIndex];
    const prevImgId = prevImageIds[colIndex];

    const activeImgEl = activeImgId ? imageCache.get(activeImgId) : null;
    const prevImgEl = prevImgId ? imageCache.get(prevImgId) : null;

    // Determine the horizontal flipping rule:
    // 2 columns: Right always flipped (index 1)
    // 3 columns: Rightmost always flipped (index 2), Middle randomly/deterministically flipped (index 1)
    // 4 columns: The 2 rightmost columns always flipped (indexes 2 and 3)
    // >4 columns: The right half of the columns always flipped
    let shouldFlip = false;
    if (numCols === 2) {
      if (colIndex === 1) shouldFlip = true;
    } else if (numCols === 3) {
      if (colIndex === 2) {
        shouldFlip = true;
      } else if (colIndex === 1) {
        const blockId = activeBlock ? activeBlock.id : 0;
        shouldFlip = (blockId % 2 === 0);
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

    drawColumnFrame(
      ctx,
      colIndex,
      numCols,
      width,
      height,
      activeImgEl || null,
      prevImgEl || null,
      activeBlock,
      prevBlock,
      isTransitioning,
      transitionProgress,
      config,
      adjustedTime,
      images,
      imageCache,
      shouldFlip
    );
  }
  
  // 5.5 Render background overlay particles on top of the images/columns
  if (config.bgEffect && config.bgEffect !== 'none') {
    let showEffect = true;
    const interval = Number(config.bgEffectInterval || 0);
    let consecutive = Number(config.bgEffectConsecutive || 0);

    // If interval is specified, we must apply the filtering constraint
    if (interval > 0) {
      if (consecutive <= 0) {
        consecutive = 1; // Default to 1 consecutive block of effect if interval is specified
      }

      let refIdx = activeBlockIdx;
      if (refIdx === -1) {
        // Find nearest block index in subtitles based on timeline adjustedTime
        let minDist = Infinity;
        for (let i = 0; i < subtitles.length; i++) {
          const dist = Math.min(Math.abs(adjustedTime - subtitles[i].startTime), Math.abs(adjustedTime - subtitles[i].endTime));
          if (dist < minDist) {
            minDist = dist;
            refIdx = i;
          }
        }
      }

      if (refIdx !== -1) {
        // Chu kỳ đầy đủ bao gồm số đoạn nghỉ (interval) và số đoạn có hiệu ứng (consecutive)
        const totalCycle = interval + consecutive;
        showEffect = (refIdx % totalCycle) < consecutive;
      }
    }

    if (showEffect) {
      let activeEffect = config.bgEffect;
      if (activeEffect === 'random') {
        const effectsList = ['snow', 'snowflake', 'rain', 'sparks', 'lightning', 'lightning_clouds', 'sakura', 'bubbles', 'golden_dust', 'autumn_leaves', 'starry_glow', 'hearts', 'fireflies', 'matrix_rain', 'snow_storm', 'neon_stars'];
        let effectChoiceSeedIdx = activeBlockIdx;
        if (effectChoiceSeedIdx === -1) {
          effectChoiceSeedIdx = Math.floor(adjustedTime / 8);
        }
        const chosenId = Math.abs(effectChoiceSeedIdx) % effectsList.length;
        activeEffect = effectsList[chosenId] as any;
      }

      drawBackgroundEffect(ctx, activeEffect, width, height, adjustedTime);
    }
  }

  // Define block sequence number (1-based index) if active
  const blockNum = activeBlockIdx !== -1 ? activeBlockIdx + 1 : -1;

  // 5.6 Render Human Behavior 1: Red Arrow and Target Circle
  if (config.enableHumanArrow && config.humanArrowBlocks && activeBlock && blockNum !== -1) {
    const isArrowBlock = config.humanArrowBlocks
      .split(',')
      .map(x => parseInt(x.trim(), 10))
      .filter(x => !isNaN(x))
      .includes(blockNum);

    if (isArrowBlock) {
      // Create stable seeded values based on block ID
      const seedVal = activeBlock.id * 13 + 7;
      let seedRand = Math.abs(Math.sin(seedVal));
      seedRand = seedRand - Math.floor(seedRand);
      let seedAngle = Math.abs(Math.cos(seedVal * 2));
      seedAngle = seedAngle - Math.floor(seedAngle);

      // Target position within central area
      const targetX = width * (0.25 + 0.5 * seedRand);
      const targetY = height * (0.25 + 0.5 * seedAngle);

      const duration = Math.max(0.5, activeBlock.endTime - activeBlock.startTime);
      const elapsed = adjustedTime - activeBlock.startTime;

      // Pulse alpha flash continuously over current segment
      const flashAlpha = 0.45 + 0.55 * Math.abs(Math.sin(elapsed * 12));

      const circleRadius = 85;

      // 1. Draw inner glowing spotlight area (makes the inside of the circle brighter and highly visible)
      ctx.save();
      ctx.globalAlpha = flashAlpha;
      const grad = ctx.createRadialGradient(targetX, targetY, 0, targetX, targetY, circleRadius);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');   // bright white glow at the absolute center
      grad.addColorStop(0.4, 'rgba(255, 255, 100, 0.2)');  // radiant bright gold middle layer
      grad.addColorStop(0.8, 'rgba(255, 0, 80, 0.12)');    // vibrant crimson red outer edge
      grad.addColorStop(1, 'rgba(255, 0, 80, 0)');         // fade completely to transparent
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(targetX, targetY, circleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Draw ultra-vibrant neon red circle contour (with high shadow glow!)
      ctx.save();
      ctx.strokeStyle = '#ff0033'; // Vibrant neon cherry red
      ctx.lineWidth = 11;
      ctx.globalAlpha = flashAlpha;
      ctx.shadowColor = 'rgba(255, 0, 50, 0.8)'; // Neon aura shadow glow
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(targetX, targetY, circleRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Draw red arrow pointing to the circle (Upscaled size by 1.8x factor with continuous flashing)
      const arrowP = Math.min(1, elapsed / (duration * 0.45)); // fly-in takes up 45% of duration

      // Arrow start position outside canvas
      const arrowStartAngle = seedAngle * Math.PI * 2;
      const startX = targetX + Math.cos(arrowStartAngle) * Math.max(width, height);
      const startY = targetY + Math.sin(arrowStartAngle) * Math.max(width, height);

      // We want the arrow tip to point exactly at the boundary of the circle,
      // rather than pointing at the center (which overlaps the glowing inner area).
      const angle = Math.atan2(targetY - startY, targetX - startX);

      // Offset tip target to circumference of circle with a small gap margin (+18px)
      const paddingRadius = circleRadius + 18;
      const destX = targetX - paddingRadius * Math.cos(angle);
      const destY = targetY - paddingRadius * Math.sin(angle);

      // Interpolate current position
      const currArrowX = startX + (destX - startX) * arrowP;
      const currArrowY = startY + (destY - startY) * arrowP;

      ctx.save();
      ctx.translate(currArrowX, currArrowY);
      ctx.rotate(angle);
      ctx.scale(1.8, 1.8); // Scale arrows by 1.8x to make prominent
      ctx.globalAlpha = flashAlpha;
      
      ctx.fillStyle = '#ff0033'; // Vibrant red fill
      ctx.strokeStyle = '#80001a'; // Crimson-dark borders
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(255, 0, 50, 0.6)';
      ctx.shadowBlur = 10;

      // Draw arrow pointing to (0,0) offsetted slightly outwards
      ctx.beginPath();
      ctx.moveTo(-90, -14);
      ctx.lineTo(-35, -14);
      ctx.lineTo(-35, -28);
      ctx.lineTo(-5, 0); // pointing tip
      ctx.lineTo(-35, 28);
      ctx.lineTo(-35, 14);
      ctx.lineTo(-90, 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // 5.7 Render Human Behavior 3: Keyword-based Smart Stickers (Draws EXACTLY 1 random sticker from the group per segment)
  if (config.enableHumanStickers && config.humanStickerGroups && config.humanStickerGroups.length > 0 && activeBlock) {
    const subTextLower = activeBlock.text.toLowerCase();
    
    // Find matching sticker group using exact standalone word boundaries (no substring partial matches like 'winning' for 'win')
    const matchedGroup = config.humanStickerGroups.find(group => {
      if (!group.keywords || group.images.length === 0) return false;
      const kwList = group.keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
      return kwList.some(kw => {
        try {
          const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const rx = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'ui');
          return rx.test(subTextLower);
        } catch (e) {
          // Safe fallback for standard word boundary checks
          const index = subTextLower.indexOf(kw);
          if (index === -1) return false;
          const beforeChar = index > 0 ? subTextLower[index - 1] : '';
          const afterChar = index + kw.length < subTextLower.length ? subTextLower[index + kw.length] : '';
          const isWordChar = (char: string) => /[a-zA-Z0-9_\u00C0-\u1EF9]/i.test(char);
          return !isWordChar(beforeChar) && !isWordChar(afterChar);
        }
      });
    });

    if (matchedGroup && matchedGroup.images.length > 0) {
      const duration = Math.max(0.5, activeBlock.endTime - activeBlock.startTime);
      const elapsed = adjustedTime - activeBlock.startTime;
      const animP = Math.min(1, elapsed / (duration * 0.45)); // flies in quickly over 45% of duration
      const easeOutP = 1 - Math.pow(1 - animP, 3); // cubic ease out

      // Selection: exactly 1 sticker image using pseudo-random index based on subtitle ID
      const imgIdx = activeBlock.id % matchedGroup.images.length;
      const item = matchedGroup.images[imgIdx];
      const stickerCacheKey = `sticker-${item.id}`;
      let stickerImg = imageCache.get(stickerCacheKey);
      if (!stickerImg && item.base64) {
        stickerImg = new Image();
        stickerImg.src = item.base64;
         imageCache.set(stickerCacheKey, stickerImg);
      }

      if (stickerImg && stickerImg.complete && stickerImg.naturalWidth > 0) {
        // Decide left or right central area placement randomly based on subtitle block ID
        const isLeftSide = (activeBlock.id % 2 === 0);
        let currX = 0;
        let currY = 0;
        let bounceAngle = 0;
        let scaleBounce = 1.0;

        if (isLeftSide) {
          // Seed unique random location inside LEFT central area
          const seedVal = activeBlock.id * 53 + 31;
          let seedRandX = Math.abs(Math.sin(seedVal));
          seedRandX = seedRandX - Math.floor(seedRandX);
          let seedRandY = Math.abs(Math.cos(seedVal * 1.5));
          seedRandY = seedRandY - Math.floor(seedRandY);

          const targetX = width * (0.15 + 0.3 * seedRandX);
          const targetY = height * (0.2 + 0.5 * seedRandY);

          // Origin off-screen (Left side)
          const startX = -300;
          const startY = targetY;

          currX = startX + (targetX - startX) * easeOutP;
          currY = startY + (targetY - startY) * easeOutP;

          // Apply idle hover bounce / rotation effect when arrived
          bounceAngle = (animP >= 1) ? Math.sin(elapsed * 5) * 0.06 : 0;
          scaleBounce = (animP >= 1) ? 1.0 + Math.sin(elapsed * 4) * 0.04 : 1.0;
        } else {
          // Seed unique random location inside RIGHT central area
          const seedVal2 = activeBlock.id * 101 + 61;
          let seedRandX2 = Math.abs(Math.sin(seedVal2));
          seedRandX2 = seedRandX2 - Math.floor(seedRandX2);
          let seedRandY2 = Math.abs(Math.cos(seedVal2 * 2.3));
          seedRandY2 = seedRandY2 - Math.floor(seedRandY2);

          const targetX2 = width * (0.55 + 0.3 * seedRandX2);
          const targetY2 = height * (0.2 + 0.5 * seedRandY2);

          // Origin off-screen (Right side)
          const startX2 = width + 300;
          const startY2 = targetY2;

          currX = startX2 + (targetX2 - startX2) * easeOutP;
          currY = startY2 + (targetY2 - startY2) * easeOutP;

          // Independent bounce variables for organic offset
          bounceAngle = (animP >= 1) ? Math.cos(elapsed * 4.5) * 0.05 : 0;
          scaleBounce = (animP >= 1) ? 1.0 + Math.sin(elapsed * 3.5) * 0.03 : 1.0;
        }

        // Base size is configured or default to 280px
        const stickerSize = (matchedGroup.size || 280) * scaleFactor;
        const stickerW = stickerSize * scaleBounce;
        const stickerH = (stickerImg.naturalHeight / stickerImg.naturalWidth) * stickerW;

        ctx.save();
        ctx.translate(currX, currY);
        ctx.rotate(bounceAngle);
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 12 * scaleFactor;
        ctx.drawImage(stickerImg, -stickerW / 2, -stickerH / 2, stickerW, stickerH);
        ctx.restore();
      }
    }
  }
  
  // 6. Draw Subtitles Overlay over both panels with dynamic layout alternation rules
  if (activeBlock && subtitles && subtitles.length > 0) {
    // 5.8 Check if typewriter overlay behavior is active for this subtitle block
    let isTypewriterActive = false;
    if (config.enableHumanTypewriter && config.humanTypewriterBlocks && blockNum !== -1) {
      isTypewriterActive = config.humanTypewriterBlocks
        .split(',')
        .map(x => parseInt(x.trim(), 10))
        .filter(x => !isNaN(x))
        .includes(blockNum);
    }

    if (isTypewriterActive) {
      // Helper function local to wrap long text into lines
      const wrapTypewriterText = (c: CanvasRenderingContext2D, textStr: string, maxWidth: number): string[] => {
        const paragraphs = textStr.split('\n');
        const lines: string[] = [];
        for (const para of paragraphs) {
          const words = para.split(' ');
          let currentLine = '';
          for (const word of words) {
            const testLine = currentLine ? currentLine + ' ' + word : word;
            const metrics = c.measureText(testLine);
            if (metrics.width > maxWidth && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) {
            lines.push(currentLine);
          }
        }
        return lines;
      };

      // Draw fullscreen typewriter overlay & typed letters completed by 2/3 duration
      ctx.save();
      
      let bgHex = config.humanTypewriterColor || '#000000';
      if (config.randomTypewriterColor) {
        const typewriterPresetColors = [
          '#000000', '#ffffff', '#1e3a8a', '#064e3b', '#7c3aed',
          '#811a1a', '#78350f', '#4b5563', '#be185d', '#115e59'
        ];
        const colorIdx = Math.abs(activeBlock.id * 17 + 3) % typewriterPresetColors.length;
        bgHex = typewriterPresetColors[colorIdx];
      }
      const bgOpacity = config.humanTypewriterOpacity !== undefined ? config.humanTypewriterOpacity : 85;
      
      // Inline hex to rgba conversion
      let cleanHex = bgHex.trim().replace('#', '');
      if (cleanHex.length === 3) {
        cleanHex = cleanHex[0] + cleanHex[0] + cleanHex[1] + cleanHex[1] + cleanHex[2] + cleanHex[2];
      }
      if (cleanHex.length !== 6) {
        cleanHex = '000000';
      }
      const bgR = parseInt(cleanHex.substring(0, 2), 16);
      const bgG = parseInt(cleanHex.substring(2, 4), 16);
      const bgB = parseInt(cleanHex.substring(4, 6), 16);
      const overlayColor = `rgba(${bgR}, ${bgG}, ${bgB}, ${bgOpacity / 100})`;

      // Smart contrast calculation
      const yiq = ((bgR * 299) + (bgG * 587) + (bgB * 114)) / 1000;
      const textStyle = (yiq >= 128) ? '#09090b' : '#ffffff';
      
      ctx.fillStyle = overlayColor;
      ctx.fillRect(0, 0, width, height);

      const duration = Math.max(0.5, activeBlock.endTime - activeBlock.startTime);
      const elapsed = adjustedTime - activeBlock.startTime;
      const typeDuration = duration * (2 / 3);
      const typeP = Math.min(1, elapsed / typeDuration);

      const fullText = activeBlock.text;
      const charCount = Math.floor(fullText.length * typeP);

      const scaledSubtitleFontSize = config.subtitleFontSize * scaleFactor;
      ctx.fillStyle = textStyle;
      ctx.font = `bold ${Math.max(24 * scaleFactor, Math.floor(scaledSubtitleFontSize * 1.25))}px "JetBrains Mono", Courier, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Wrap the FULL text first so we have stable line boundaries (prevents shifting of lines when layout changes)
      const maxTextWidth = width * 0.85;
      const fullLines = wrapTypewriterText(ctx, fullText, maxTextWidth);

      // Distribute character count across lines
      let remainingChars = charCount;
      const renderedLines: string[] = [];
      for (let i = 0; i < fullLines.length; i++) {
        const line = fullLines[i];
        if (remainingChars >= line.length) {
          renderedLines.push(line);
          remainingChars -= line.length;
        } else if (remainingChars > 0) {
          renderedLines.push(line.substring(0, remainingChars));
          remainingChars = 0;
        } else {
          renderedLines.push('');
        }
      }

      // Draw typewriter blinking cursor '|' at typing position
      const showCursor = (typeP < 1 && Math.floor(elapsed * 5) % 2 === 0);
      if (showCursor) {
        let lastTypedIdx = -1;
        for (let i = renderedLines.length - 1; i >= 0; i--) {
          const wasTyped = (charCount > (fullLines.slice(0, i).reduce((sum, l) => sum + l.length, 0)));
          if (wasTyped) {
            lastTypedIdx = i;
            break;
          }
        }
        if (lastTypedIdx === -1) lastTypedIdx = 0;
        renderedLines[lastTypedIdx] = (renderedLines[lastTypedIdx] || '') + '|';
      }

      const typeLineHeight = Math.floor(scaledSubtitleFontSize * 1.6);
      const totalTypeHeight = fullLines.length * typeLineHeight;
      const typeStartY = (height - totalTypeHeight) / 2 + typeLineHeight / 2;

      for (let li = 0; li < renderedLines.length; li++) {
        ctx.fillText(renderedLines[li], width / 2, typeStartY + li * typeLineHeight);
      }
      ctx.restore();
    } else {
      // Load saved effects list from localStorage to randomize layout configurations
      let savedEffectsList: any[] = [];
      try {
        const stored = localStorage.getItem('vsync_saved_effects');
        if (stored) {
          savedEffectsList = JSON.parse(stored);
        }
      } catch (e) {
        console.error("Lỗi đọc danh sách hiệu ứng lưu trữ:", e);
      }

      // Load the active chosen style preset for the entire video segment
      let blockPreset: SubtitlePreset | undefined = undefined;
      if (presets && presets.length > 0) {
        if (config.enableDynamicSubstyling) {
          // Randomly select 1 text style preset (phong cách chữ) dynamically based on activeBlock id to achieve high visual variation
          const presetIdx = Math.abs((activeBlock.id || 0) * 13 + 17) % presets.length;
          blockPreset = presets[presetIdx];
          if (!blockPreset) {
            blockPreset = presets[0]; // fallback to the first preset
          }
        } else if (config.activePresetId && config.activePresetId !== 'none') {
          blockPreset = presets.find(p => p.id === config.activePresetId);
        }
      }

      // Identify our current block's index
      const activeBlockIndex = subtitles.findIndex(s => s.id === activeBlock.id);

      // Build the deterministic segments for traditional vs custom effects
      // Bắt đầu là cách hiển thị truyền thống (hoặc theo cấu hình), sau đó ngẫu nhiên hiệu ứng theo cấu hình số đoạn giãn cách
      interface CohortStyle {
        isEffects: boolean;
        effectIdx: number;
      }
      const cohorts: CohortStyle[] = [];
      let seed = subtitles.length; // stable seed
      const nextRand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return Math.abs(seed) / 4294967296;
      };

      const switchMin = config.substyleSwitchMin !== undefined ? config.substyleSwitchMin : 2;
      const switchMax = config.substyleSwitchMax !== undefined ? config.substyleSwitchMax : 4;
      const diff = Math.max(1, switchMax - switchMin + 1);

      let isEffectsPhase = false; // Start with traditional
      let bIdx = 0;
      while (bIdx < subtitles.length) {
        const phaseLength = Math.floor(nextRand() * diff) + switchMin;
        // Determine what effect index this cohort will use, if we have dynamic effects
        let chosenEffectIdx = 0;
        if (savedEffectsList && savedEffectsList.length > 0) {
          chosenEffectIdx = Math.floor(nextRand() * savedEffectsList.length);
        } else {
          nextRand();
        }
        for (let pIdx = 0; pIdx < phaseLength && bIdx < subtitles.length; pIdx++) {
          cohorts[bIdx] = {
            isEffects: isEffectsPhase,
            effectIdx: chosenEffectIdx
          };
          bIdx++;
        }
        isEffectsPhase = !isEffectsPhase;
      }

      let isEffectsBlock = false;
      let chosenEffectIdx = 0;
      if (activeBlockIndex !== -1 && cohorts[activeBlockIndex]) {
        isEffectsBlock = cohorts[activeBlockIndex].isEffects;
        chosenEffectIdx = cohorts[activeBlockIndex].effectIdx;
      }

      // Apply primary style dominance configuration overrides
      const pm = config.primaryRenderMode || 'alternate';
      if (pm === 'always_traditional') {
        isEffectsBlock = false;
      } else if (pm === 'always_effects') {
        isEffectsBlock = true;
      } else if (pm === 'traditional_dominant') {
        if (isEffectsBlock) {
          const blockSeed = activeBlock.id || 0;
          const check = (Math.abs(blockSeed * 48271 + 31) % 100);
          if (check < 55) { // Force to traditional to achieve roughly 75% traditional ratio
            isEffectsBlock = false;
          }
        }
      } else if (pm === 'effects_dominant') {
        if (!isEffectsBlock) {
          const blockSeed = activeBlock.id || 0;
          const check = (Math.abs(blockSeed * 48271 + 31) % 100);
          if (check < 55) { // Force to effects to achieve roughly 75% effects ratio
            isEffectsBlock = true;
          }
        }
      }

      if (!isEffectsBlock) {
        // Traditional display check: center aligned, bottom centered (subtitleX: 50, subtitleY: customizable from style)
        // and disable blur backgrounds & in/out transition effects
        const tradConfig: RenderConfig = {
          ...config,
          subtitleX: 50,
          subtitleY: blockPreset?.presetY !== undefined ? blockPreset.presetY : 85,
          subtitleAlign: 'center',
          enableBlurBg: false,
          subtitleEffectIn: 'none',
          subtitleEffectOut: 'none',
        };
        drawAdvancedSubtitle(ctx, activeBlock.text, tradConfig, activeBlock, adjustedTime, blockPreset);
      } else {
        // Effects display check: choose randomly 1 template from A, B, C, D group, then choose a random target effect inside that group.
        let blockConfig = config;
        
        if (savedEffectsList && savedEffectsList.length > 0) {
          // 1. Choose a random template group (MẪU CHỮ A, B, C, D)
          const allMẫuGroups = ['A', 'B', 'C', 'D'] as const;
          // Deterministic template group selection based on block id or cohort index
          const groupIdx = Math.abs((activeBlock.id || 0) * 23 + 7) % allMẫuGroups.length;
          const chosenGroup = allMẫuGroups[groupIdx];
          
          // 2. Filter effects matching this group
          let groupEffects = savedEffectsList.filter(eff => (eff.group || 'A') === chosenGroup);
          
          // Fallback if no effects exist in this group yet (ensure zero failure rate)
          if (groupEffects.length === 0) {
            // Find any group that has effects, starting with A
            groupEffects = savedEffectsList.filter(eff => (eff.group || 'A') === 'A');
            if (groupEffects.length === 0) {
              groupEffects = savedEffectsList; // absolute fallback
            }
          }
          
          // 3. Randomly select an effect from the chosen group
          const localEffectIdx = Math.abs((activeBlock.id || 0) * 43 + 3) % groupEffects.length;
          const selectedEffect = groupEffects[localEffectIdx];
          
          blockConfig = {
            ...config,
            subtitleX: selectedEffect.subtitleX !== undefined ? selectedEffect.subtitleX : config.subtitleX,
            subtitleY: selectedEffect.subtitleY !== undefined ? selectedEffect.subtitleY : config.subtitleY,
            subtitleAlign: selectedEffect.subtitleAlign || config.subtitleAlign,
            subtitleEffectIn: selectedEffect.subtitleEffectIn || config.subtitleEffectIn,
            subtitleEffectOut: selectedEffect.subtitleEffectOut || config.subtitleEffectOut,
            subtitleShowEffect: selectedEffect.subtitleShowEffect || config.subtitleShowEffect,
            enableBlurBg: selectedEffect.enableBlurBg !== undefined ? selectedEffect.enableBlurBg : config.enableBlurBg,
            blurBgHeight: selectedEffect.blurBgHeight !== undefined ? selectedEffect.blurBgHeight : config.blurBgHeight,
            blurBgWidth: selectedEffect.blurBgWidth !== undefined ? selectedEffect.blurBgWidth : config.blurBgWidth,
            blurBgOpacity: selectedEffect.blurBgOpacity !== undefined ? selectedEffect.blurBgOpacity : config.blurBgOpacity,
            blurBgInOutEffect: selectedEffect.blurBgInOutEffect || config.blurBgInOutEffect,
            blurBgX: selectedEffect.blurBgX !== undefined ? selectedEffect.blurBgX : config.blurBgX,
            blurBgY: selectedEffect.blurBgY !== undefined ? selectedEffect.blurBgY : config.blurBgY,
            blurBgShape: selectedEffect.blurBgShape || config.blurBgShape,
            blurBgColorHex: selectedEffect.blurBgColorHex || config.blurBgColorHex,
            blurBgBorderColorHex: selectedEffect.blurBgBorderColorHex || config.blurBgBorderColorHex,
            blurBgBlurAmount: selectedEffect.blurBgBlurAmount !== undefined ? selectedEffect.blurBgBlurAmount : config.blurBgBlurAmount,
            lockTextInBlur: selectedEffect.lockTextInBlur !== undefined ? selectedEffect.lockTextInBlur : config.lockTextInBlur,
          };
        }
        
        drawAdvancedSubtitle(ctx, activeBlock.text, blockConfig, activeBlock, adjustedTime, blockPreset);
      }
    }
  } else if (activeBlock) {
    // Fallback if full subtitle list is not available (such as isolated slide render states)
    drawAdvancedSubtitle(ctx, activeBlock.text, config, activeBlock, adjustedTime);
  }

  // 7. Draw brand logo watermark overlay on top of all visual frames!
  if (config.logoUrl) {
    const logoImg = imageCache.get('brand-logo');
    if (logoImg) {
      const scaleX = (config.logoX !== undefined ? config.logoX : 85) / 100;
      const scaleY = (config.logoY !== undefined ? config.logoY : 15) / 100;
      const logoSize = config.logoSize !== undefined ? config.logoSize : 80;
      const opacity = config.logoOpacity !== undefined ? config.logoOpacity : 0.9;

      const logoX = width * scaleX - logoSize / 2;
      const logoY = height * scaleY - logoSize / 2;

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
      ctx.restore();
    }
  }
}

/**
 * Draws the formatted subtitle text lines onto the canvas context
 */
function drawSubtitlesText(ctx: CanvasRenderingContext2D, text: string, config: RenderConfig) {
  const { 
    width, 
    height, 
    subtitleOffset, 
    subtitleFontSize, 
    subtitleColor, 
    subtitleOutlineColor, 
    subtitleOutlineWidth, 
    subtitleBgColor, 
    subtitleBgOpacity 
  } = config;
  
  ctx.save();
  
  ctx.font = `bold ${subtitleFontSize}px "Inter", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  const lines = text.split('\n');
  const lineHeight = subtitleFontSize * 1.35;
  const paddingY = 8;
  const paddingX = 18;
  
  const baseY = height - (height * (subtitleOffset / 100));
  
  const totalTextHeight = lines.length * lineHeight;
  const startY = baseY - (totalTextHeight / 2) + (lineHeight / 2);
  
  let maxLineWidth = 0;
  for (const line of lines) {
    const metrics = ctx.measureText(line);
    if (metrics.width > maxLineWidth) {
      maxLineWidth = metrics.width;
    }
  }
  
  if (subtitleBgOpacity > 0) {
    ctx.fillStyle = subtitleBgColor;
    ctx.globalAlpha = subtitleBgOpacity;
    const boxW = maxLineWidth + paddingX * 2;
    const boxH = totalTextHeight + paddingY * 2;
    const boxX = (width - boxW) / 2;
    const boxY = baseY - (boxH / 2);
    
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(boxX, boxY, boxW, boxH, 8) : ctx.rect(boxX, boxY, boxW, boxH);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const itemY = startY + (i * lineHeight);
    
    if (subtitleOutlineWidth > 0) {
      ctx.strokeStyle = subtitleOutlineColor;
      ctx.lineWidth = subtitleOutlineWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, width / 2, itemY);
    }
    
    ctx.fillStyle = subtitleColor;
    ctx.fillText(line, width / 2, itemY);
  }
  
  ctx.restore();
}

/**
 * Draws subtitle text lines onto the canvas according to a configured preset
 */
export function drawSubtitleWithPreset(
  ctx: CanvasRenderingContext2D,
  text: string,
  preset: SubtitlePreset,
  defaultOffset: number
) {
  const {
    fontFamily,
    fontSize,
    color,
    outlineColor,
    outlineWidth,
    bgColor,
    bgOpacity,
    position,
    effect
  } = preset;

  ctx.save();

  // Load custom font pairing with dynamically adjusted font size if too large for background
  let currentFontSize = fontSize;
  ctx.font = `bold ${currentFontSize}px "${fontFamily}", "Inter", "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const lines = text.split('\n');
  let maxLineWidth = 0;
  for (const line of lines) {
    const metrics = ctx.measureText(line);
    if (metrics.width > maxLineWidth) {
      maxLineWidth = metrics.width;
    }
  }

  // Auto shrink font size to fit background/canvas bounding box nicely
  const maxWidthAllowed = ctx.canvas.width - 40;
  if (maxLineWidth > maxWidthAllowed && maxWidthAllowed > 50) {
    const ratio = maxWidthAllowed / maxLineWidth;
    currentFontSize = Math.max(12, Math.floor(fontSize * ratio));
    ctx.font = `bold ${currentFontSize}px "${fontFamily}", "Inter", "Segoe UI", sans-serif`;
    
    // Recalculate maxLineWidth with new font size
    maxLineWidth = 0;
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      if (metrics.width > maxLineWidth) {
        maxLineWidth = metrics.width;
      }
    }
  }

  const lineHeight = currentFontSize * 1.35;
  const paddingY = 10;
  const paddingX = 20;

  // Calculate coordinates based on position
  let baseX = ctx.canvas.width / 2;
  let baseY = ctx.canvas.height - (ctx.canvas.height * (defaultOffset / 100));

  if (position === 'top-center') {
    baseX = ctx.canvas.width / 2;
    baseY = ctx.canvas.height * (defaultOffset / 100);
  } else if (position === 'left') {
    baseX = ctx.canvas.width / 4;
    baseY = ctx.canvas.height - (ctx.canvas.height * (defaultOffset / 100));
  } else if (position === 'right') {
    baseX = (ctx.canvas.width * 3) / 4;
    baseY = ctx.canvas.height - (ctx.canvas.height * (defaultOffset / 100));
  } else if (position === 'center') {
    baseX = ctx.canvas.width / 2;
    baseY = ctx.canvas.height / 2;
  }

  const totalTextHeight = lines.length * lineHeight;
  const startY = baseY - (totalTextHeight / 2) + (lineHeight / 2);

  // Draw background effect overlays
  if (effect === 'frosted') {
    // Elegant full horizontal wash overlay banner
    ctx.fillStyle = 'rgba(10, 10, 12, 0.75)';
    const bannerH = totalTextHeight + paddingY * 2.5;
    const bannerY = baseY - (bannerH / 2);
    ctx.fillRect(0, bannerY, ctx.canvas.width, bannerH);
    
    // Sleek border lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, bannerY);
    ctx.lineTo(ctx.canvas.width, bannerY);
    ctx.moveTo(0, bannerY + bannerH);
    ctx.lineTo(ctx.canvas.width, bannerY + bannerH);
    ctx.stroke();
  } else if (effect === 'badge') {
    // Premium capsule badge box
    ctx.fillStyle = 'rgba(10, 10, 13, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    const boxW = maxLineWidth + paddingX * 2.5;
    const boxH = totalTextHeight + paddingY * 2.5;
    const boxX = baseX - (boxW / 2);
    const boxY = baseY - (boxH / 2);
    
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(boxX, boxY, boxW, boxH, 14) : ctx.rect(boxX, boxY, boxW, boxH);
    ctx.fill();
    ctx.stroke();
  } else if (bgOpacity > 0) {
    // Normal styled preset box backdrop
    ctx.fillStyle = bgColor;
    ctx.globalAlpha = bgOpacity;
    const boxW = maxLineWidth + paddingX * 2;
    const boxH = totalTextHeight + paddingY * 2;
    const boxX = baseX - (boxW / 2);
    const boxY = baseY - (boxH / 2);
    
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(boxX, boxY, boxW, boxH, 10) : ctx.rect(boxX, boxY, boxW, boxH);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  // Apply visual enhancements (neon/glow or drop-shadows) before text render passes
  if (effect === 'neon') {
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  } else if (effect === 'cinematic') {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
  }

  // Text stroke rendering
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const itemY = startY + (i * lineHeight);

    if (effect === 'cinematic') {
      // Thick double outline overlay pass
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = outlineWidth + 4;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, baseX, itemY);
      
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = outlineWidth;
      ctx.strokeText(line, baseX, itemY);
    } else if (outlineWidth > 0 && effect !== 'neon') {
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = outlineWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, baseX, itemY);
    }

    ctx.fillStyle = color;
    ctx.fillText(line, baseX, itemY);
  }

  ctx.restore();
}

/**
 * Helper to wrap text into lines inside a max width constraint
 */
export function wrapAndFormatText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  
  for (const para of paragraphs) {
    if (para.trim() === '') {
      lines.push('');
      continue;
    }
    const words = para.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const testWidth = ctx.measureText(testLine).width;
      
      if (testWidth > maxWidth) {
        if (ctx.measureText(word).width > maxWidth) {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = '';
          }
          let tempLine = '';
          for (let i = 0; i < word.length; i++) {
            const letter = word[i];
            const letterLine = tempLine + letter;
            if (ctx.measureText(letterLine).width > maxWidth) {
              lines.push(tempLine);
              tempLine = letter;
            } else {
              tempLine = letterLine;
            }
          }
          currentLine = tempLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
          }
          currentLine = word;
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  return lines;
}

export function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  let r = 0, g = 0, b = 0;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else {
    return '#000000';
  }
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#000000' : '#FFFFFF';
}

function drawTypewriterLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  currentTypedCountInLine: number,
  showCursor: boolean,
  align: string,
  alignOffsetCenterX: number,
  itemY: number,
  finalColor: string,
  outlineColor: string,
  outlineWidth: number,
  effect: string
) {
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';

  // Measure full line width to keep the layout anchors completely stable and eliminate all subpixel jitters
  const totalLineWidth = ctx.measureText(line).width;

  let startX = 0;
  if (align === 'left') {
    startX = alignOffsetCenterX;
  } else if (align === 'right') {
    startX = alignOffsetCenterX - totalLineWidth;
  } else {
    startX = alignOffsetCenterX - (totalLineWidth / 2);
  }

  // Slice line up to current typed characters cleanly
  let typedLine = line.substring(0, currentTypedCountInLine);
  if (showCursor) {
    typedLine += '_';
  }

  if (effect === 'cinematic') {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = outlineWidth + 4;
    ctx.lineJoin = 'round';
    ctx.strokeText(typedLine, startX, itemY);

    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = outlineWidth;
    ctx.strokeText(typedLine, startX, itemY);
  } else if (outlineWidth > 0 && effect !== 'neon') {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = outlineWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(typedLine, startX, itemY);
  }

  ctx.fillStyle = finalColor;
  ctx.fillText(typedLine, startX, itemY);

  ctx.textAlign = prevAlign;
}

/**
 * Draws advanced animated subtitles supporting slide in/out, keyframe scale, coordinate translation,
 * and cardinal translucent blurred backdrops.
 */
export function drawAdvancedSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  originalConfig: RenderConfig,
  activeBlock: SubtitleBlock,
  time: number,
  preset?: SubtitlePreset
) {
  let config = originalConfig;
  let isDateHighlightActive = false;
  let dateText = '';
  if (originalConfig.enableHighlightDate) {
    const matched = getHighlightCustomText(text, originalConfig);
    if (matched) {
      isDateHighlightActive = true;
      dateText = matched;
      config = {
        ...originalConfig,
        enableBlurBg: false
      };
    }
  }

  // Choose styling variables from preset (if active) or config defaults
  const scaleFactor = ctx.canvas.height / 720;

  const fontFamily = isDateHighlightActive 
    ? (config.highlightDateFontFamily || 'Josefin Sans')
    : (preset ? preset.fontFamily : 'Josefin Sans');
  const baseFontSize = isDateHighlightActive
    ? (config.highlightTextFontSize || 150)
    : (preset ? preset.fontSize : config.subtitleFontSize);
  const fontSize = baseFontSize * scaleFactor;

  const color = isDateHighlightActive
    ? (config.highlightDateColor || '#FFFFFF')
    : (preset ? preset.color : config.subtitleColor);
  const outlineColor = isDateHighlightActive
    ? '#000000'
    : (preset ? preset.outlineColor : config.subtitleOutlineColor);
  const baseOutlineWidth = isDateHighlightActive
    ? Math.max(22, Math.floor(baseFontSize * 0.15))
    : (preset ? preset.outlineWidth : config.subtitleOutlineWidth);
  const outlineWidth = baseOutlineWidth * scaleFactor;
  const bgColor = isDateHighlightActive
    ? (config.highlightDateBgColor || '#EAB308')
    : (preset ? preset.bgColor : config.subtitleBgColor);
  const bgOpacity = isDateHighlightActive
    ? ((config.highlightDateBgOpacity !== undefined ? config.highlightDateBgOpacity : 85) / 100)
    : (preset ? preset.bgOpacity : config.subtitleBgOpacity);
  const effect = isDateHighlightActive ? 'standard' : (preset ? preset.effect : 'standard');
  let align = isDateHighlightActive ? 'center' : (config.subtitleAlign || 'center');
  if (preset && !config.enableBlurBg && !isDateHighlightActive) {
    if (preset.position === 'left') {
      align = 'left';
    } else if (preset.position === 'right') {
      align = 'right';
    } else if (preset.position === 'center' || preset.position === 'top-center' || preset.position === 'bottom-center') {
      align = 'center';
    }
  }

  const subtitleHighlightMode = (preset && preset.subtitleHighlightMode !== undefined && preset.subtitleHighlightMode !== 'none')
    ? preset.subtitleHighlightMode
    : (config.subtitleHighlightMode || 'none');
  const subtitleHighlightColor = (preset && config.syncHighlightTextColor !== false)
    ? (config.subtitleHighlightBgColor || config.subtitleHighlightColor || '#EAB308')
    : ((preset && preset.subtitleHighlightColor !== undefined)
        ? preset.subtitleHighlightColor
        : (config.subtitleHighlightColor || '#EAB308'));
  const subtitleShowEffect = (preset && preset.subtitleShowEffect !== undefined && preset.subtitleShowEffect !== 'none')
    ? preset.subtitleShowEffect
    : (config.subtitleShowEffect || 'none');

  // 2. Timing and Animation state calculations
  const elapsed = time - activeBlock.startTime;
  const remaining = activeBlock.endTime - time;
  
  const inDuration = 0.35;
  const outDuration = 0.35;
  
  let scale = 1.0;
  let opacity = 1.0;
  let offsetX = 0;
  let offsetY = 0;
  let bgOffsetX = 0;
  let bgOffsetY = 0;
  let bgProgress = 1.0;
  let textToDraw = isDateHighlightActive ? dateText : text;

  // Entrance active effect transitions
  const effectIn = config.subtitleEffectIn || 'zoom_fade';
  if (elapsed < inDuration && elapsed >= 0) {
    const p = elapsed / inDuration;
    if (effectIn === 'zoom_fade') {
      scale = 0.75 + 0.25 * p;
      opacity = p;
    } else if (effectIn === 'bounce' || effectIn === 'bounce_in') {
      scale = p < 0.75 ? (p / 0.75) * 1.25 : 1.25 - ((p - 0.75) / 0.25) * 0.25;
      opacity = Math.min(1.0, p * 1.5);
    } else if (effectIn === 'slide_up') {
      offsetY = (1 - p) * 50;
      opacity = p;
    } else if (effectIn === 'slide_down') {
      offsetY = -(1 - p) * 50;
      opacity = p;
    } else if (effectIn === 'slide_left') {
      offsetX = (1 - p) * 80;
      opacity = p;
    } else if (effectIn === 'slide_right') {
      offsetX = -(1 - p) * 80;
      opacity = p;
    } else if (effectIn === 'zoom_in') {
      scale = 0.1 + 0.9 * p;
      opacity = p;
    } else if (effectIn === 'zoom_out') {
      scale = 2.0 - 1.0 * p;
      opacity = p;
    } else if (effectIn === 'fade_in') {
      opacity = p;
    } else if (effectIn === 'flip_in') {
      opacity = p;
    } else if (effectIn === 'stretch_in') {
      opacity = p;
    }
  }

  // Disappearance active effect transitions
  const effectOut = config.subtitleEffectOut || 'fade';
  if (remaining < outDuration && remaining >= 0) {
    const p = remaining / outDuration; // 1 -> 0
    if (effectOut === 'fade') {
      opacity *= p;
    } else if (effectOut === 'slide_down') {
      offsetY += (1 - p) * 50;
      opacity *= p;
    } else if (effectOut === 'slide_up') {
      offsetY -= (1 - p) * 50;
      opacity *= p;
    } else if (effectOut === 'slide_left') {
      offsetX -= (1 - p) * 80;
      opacity *= p;
    } else if (effectOut === 'slide_right') {
      offsetX += (1 - p) * 80;
      opacity *= p;
    } else if (effectOut === 'zoom_in') {
      scale *= (1.0 + (1 - p) * 1.5);
      opacity *= p;
    } else if (effectOut === 'zoom_out') {
      scale *= (0.5 + 0.5 * p);
      opacity *= p;
    } else if (effectOut === 'flip_out') {
      opacity *= p;
    } else if (effectOut === 'stretch_out') {
      opacity *= p;
    }
  }

  // Calculate fixed blur background sizes
  const blurHeight = config.blurBgHeight || 285;
  const blurWidthPercent = config.blurBgWidth || 100;
  const blurOpacity = config.blurBgOpacity !== undefined ? config.blurBgOpacity : 0.5;
  const blurInOutDir = config.blurBgInOutEffect || 'bottom-to-top';
  const blurShape = config.blurBgShape || 'rectangle';
  const blurColorHex = config.blurBgColorHex || '#000000';
  const blurAmount = config.blurBgBlurAmount !== undefined ? config.blurBgBlurAmount : 18;

  let boxW = ctx.canvas.width * (blurWidthPercent / 100);
  let boxH = blurHeight;

  if (blurShape === 'circle') {
    const diameter = Math.max(boxW, boxH);
    boxW = diameter;
    boxH = diameter;
  }

  // Pre-calculate final font size and wrapped lines to fit inside fixed background sizes
  let currentFontSize = fontSize;
  ctx.save();
  ctx.font = `bold ${currentFontSize}px "${fontFamily}", "Inter", "Segoe UI", sans-serif`;
  ctx.textBaseline = 'middle';

  const isTraditional = !config.enableBlurBg;

  const maxAllowedWidth = isTraditional
    ? Math.max(200, ctx.canvas.width * 0.96)
    : Math.max(40, boxW - 30);
  const maxAllowedHeight = isTraditional
    ? Math.max(100, ctx.canvas.height * 0.45)
    : Math.max(20, boxH - 12);
  const minFontSize = 12;

  let lines = wrapAndFormatText(ctx, textToDraw, maxAllowedWidth);
  let lineHeight = currentFontSize * 1.35;
  let totalTextHeight = lines.length * lineHeight;
  let maxLineWidth = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > maxLineWidth) maxLineWidth = w;
  }

  while (currentFontSize > minFontSize) {
    if (maxLineWidth <= maxAllowedWidth && totalTextHeight <= maxAllowedHeight) {
      if (isTraditional && lines.length > 2) {
        // Keep shrinking to stay within 2 lines if possible for a cleaner layout
      } else {
        break;
      }
    }
    currentFontSize -= 1;
    ctx.font = `bold ${currentFontSize}px "${fontFamily}", "Inter", "Segoe UI", sans-serif`;
    lines = wrapAndFormatText(ctx, textToDraw, maxAllowedWidth);
    lineHeight = currentFontSize * 1.35;
    totalTextHeight = lines.length * lineHeight;
    let tempMaxW = 0;
    for (const hline of lines) {
      const w = ctx.measureText(hline).width;
      if (w > tempMaxW) tempMaxW = w;
    }
    maxLineWidth = tempMaxW;
  }

  // Force limit traditional to exactly at most 3 lines
  if (isTraditional && lines.length > 3) {
    lines = lines.slice(0, 3);
    totalTextHeight = lines.length * lineHeight;
  }
  ctx.restore();

  // Apply smart Typewriter calculations
  let isTypewriterActive = false;
  let typewriterProgress = 1.0;
  let currentTypedCount = 999999;
  let isCursorBlinking = false;

  const isTypewriterActiveIn = (elapsed < inDuration && elapsed >= 0 && effectIn === 'typewriter');
  const isTypewriterActiveShow = (subtitleShowEffect === 'typewriter') || isDateHighlightActive;

  if (isTypewriterActiveIn || isTypewriterActiveShow) {
    isTypewriterActive = true;
    if (isTypewriterActiveIn && !isDateHighlightActive) {
      const typeDuration = Math.min(0.6, activeBlock.endTime - activeBlock.startTime - 0.1);
      typewriterProgress = Math.min(1.0, elapsed / typeDuration);
    } else {
      const totalDuration = Math.max(0.5, activeBlock.endTime - activeBlock.startTime);
      const typeDuration = totalDuration * 0.6667; // Tự gõ xong trước 2/3 thời lượng
      typewriterProgress = Math.min(1.0, elapsed / typeDuration);
    }

    const totalCharsCount = textToDraw.length;
    currentTypedCount = Math.floor(totalCharsCount * typewriterProgress);
    isCursorBlinking = (typewriterProgress < 1.0 && Math.floor(time * 10) % 2 === 0);
  }

  // Determine synchronized coordinates (always locked together)
  let subX = 50;
  let subY = 50;

  if (isDateHighlightActive) {
    subX = 50;
    subY = 50;
  } else {
    if (config.enableBlurBg) {
      subX = (config.blurBgX !== undefined) ? config.blurBgX : ((config.subtitleX !== undefined) ? config.subtitleX : 50);
    } else {
      subX = (config.subtitleX !== undefined) ? config.subtitleX : 50;
    }

    if (config.enableBlurBg) {
      subY = (config.blurBgY !== undefined) ? config.blurBgY : ((config.subtitleY !== undefined) ? config.subtitleY : 85);
    } else {
      subY = (config.subtitleY !== undefined) ? config.subtitleY : 85;
    }

    if (preset && !config.enableBlurBg) {
      if (preset.position === 'top-center') {
        subX = 50;
        subY = preset.presetY !== undefined ? preset.presetY : 15;
      } else if (preset.position === 'left') {
        subX = 25;
        subY = preset.presetY !== undefined ? preset.presetY : 85;
      } else if (preset.position === 'right') {
        subX = 75;
        subY = preset.presetY !== undefined ? preset.presetY : 85;
      } else if (preset.position === 'center') {
        subX = 50;
        subY = preset.presetY !== undefined ? preset.presetY : 50;
      } else { // 'bottom-center'
        subX = 50;
        subY = 91;
      }
    }
  }
  
  const rawBlurBaseX = ctx.canvas.width * (subX / 100);
  const rawBlurBaseY = ctx.canvas.height * (subY / 100);

  // Clamp coordinates so both text & blurred backdrops NEVER spill over the canvas borders
  const margin = 10;
  
  let safeBlurBaseX = rawBlurBaseX;
  let safeBlurBaseY = rawBlurBaseY;
  let safeBaseX = rawBlurBaseX;
  let safeBaseY = rawBlurBaseY;

  if (isTraditional) {
    const textW = maxLineWidth;
    const textH = totalTextHeight;
    const paddingYWall = 35; // Comfortable bottom padding so text never clip
    const paddingXWall = 25; // Good side padding

    // Clamp X so the entire text block doesn't cross the left/right canvas borders
    safeBaseX = Math.max(textW / 2 + paddingXWall, Math.min(ctx.canvas.width - textW / 2 - paddingXWall, rawBlurBaseX));

    // Clamp Y so the entire text block doesn't cross the top/bottom canvas borders
    // Subtitles are drawn using vertical center alignment relative to safeBaseY
    safeBaseY = Math.max(textH / 2 + paddingYWall, Math.min(ctx.canvas.height - textH / 2 - paddingYWall, rawBlurBaseY));
  } else {
    if (boxW >= ctx.canvas.width - margin * 2) {
      safeBlurBaseX = ctx.canvas.width / 2;
    } else {
      safeBlurBaseX = Math.max(boxW / 2 + margin, Math.min(ctx.canvas.width - boxW / 2 - margin, rawBlurBaseX));
    }

    if (boxH >= ctx.canvas.height - margin * 2) {
      safeBlurBaseY = ctx.canvas.height / 2;
    } else {
      safeBlurBaseY = Math.max(boxH / 2 + margin, Math.min(ctx.canvas.height - boxH / 2 - margin, rawBlurBaseY));
    }

    safeBaseX = (config.enableBlurBg && blurWidthPercent < 100) ? safeBlurBaseX : rawBlurBaseX;
    safeBaseY = (config.enableBlurBg && boxH < ctx.canvas.height - margin * 2) ? safeBlurBaseY : rawBlurBaseY;
  }

  // Render Blurred Backdrop
  if (config.enableBlurBg) {
    const boxX = safeBlurBaseX - boxW / 2;
    const boxY = safeBlurBaseY - boxH / 2;

    // Background animation sequence syncing
    bgProgress = 1.0;
    if (elapsed < inDuration) {
      bgProgress = elapsed / inDuration;
    } else if (remaining < outDuration) {
      bgProgress = remaining / outDuration;
    }

    bgOffsetX = 0;
    bgOffsetY = 0;
    
    if (blurInOutDir === 'top-to-bottom') {
      bgOffsetY = -(1 - bgProgress) * (boxY + boxH + 50);
    } else if (blurInOutDir === 'bottom-to-top') {
      bgOffsetY = (1 - bgProgress) * (ctx.canvas.height - boxY + 50);
    } else if (blurInOutDir === 'left-to-right') {
      bgOffsetX = -(1 - bgProgress) * (boxX + boxW + 50);
    } else if (blurInOutDir === 'right-to-left') {
      bgOffsetX = (1 - bgProgress) * (ctx.canvas.width - boxX + 50);
    }

    ctx.save();
    ctx.beginPath();

    const drawShapePath = (x: number, y: number, w: number, h: number) => {
      if (blurShape === 'circle') {
        ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
      } else if (blurShape === 'pill') {
        const radius = Math.min(w, h) / 2;
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
        else ctx.rect(x, y, w, h);
      } else if (blurShape === 'rounded') {
        const radius = 16;
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
        else ctx.rect(x, y, w, h);
      } else {
        ctx.rect(x, y, w, h);
      }
    };

    drawShapePath(boxX + bgOffsetX, boxY + bgOffsetY, boxW, boxH);
    ctx.clip();

    const hexToRgb = (hex: string) => {
      const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
      const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 0, g: 0, b: 0 };
    };
    const rgb = hexToRgb(blurColorHex);
    const fillStyleStr = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${blurOpacity})`;

    try {
      // The user wants absolutely NO blur backdrop filter applied to this background shape
      ctx.fillStyle = fillStyleStr;
      ctx.fillRect(boxX + bgOffsetX, boxY + bgOffsetY, boxW, boxH);
    } catch (e) {
      ctx.fillStyle = fillStyleStr;
      ctx.fillRect(boxX + bgOffsetX, boxY + bgOffsetY, boxW, boxH);
    }
    
    // Draw modern bounding borders matching shape
    const borderHex = config.blurBgBorderColorHex;
    if (borderHex && borderHex !== 'none' && borderHex !== '') {
      const borderRgb = hexToRgb(borderHex);
      ctx.strokeStyle = `rgba(${borderRgb.r}, ${borderRgb.g}, ${borderRgb.b}, ${0.8 * bgProgress})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      drawShapePath(boxX + bgOffsetX, boxY + bgOffsetY, boxW, boxH);
      ctx.stroke();
    }

    ctx.restore();
  }

  // 5. Draw Transformed Text Context with strict canvas-wrapping
  ctx.save();
  ctx.globalAlpha = opacity;
  
  let finalOffsetX = offsetX;
  let finalOffsetY = offsetY;
  if (config.enableBlurBg && config.lockTextInBlur) {
    finalOffsetX += bgOffsetX;
    finalOffsetY += bgOffsetY;
  }

  // Pivot everything on local coordinate center
  ctx.translate(safeBaseX + finalOffsetX, safeBaseY + finalOffsetY);

  let finalScaleX = scale;
  let finalScaleY = scale;
  
  if (elapsed < inDuration && elapsed >= 0) {
    const p = elapsed / inDuration;
    if (effectIn === 'flip_in') {
      finalScaleY = p;
    } else if (effectIn === 'stretch_in') {
      finalScaleX = p < 0.6 ? p / 0.6 * 1.4 : 1.4 - ((p - 0.6) / 0.4) * 0.4;
      finalScaleY = p < 0.6 ? p / 0.6 * 0.7 : 0.7 + ((p - 0.6) / 0.4) * 0.3;
    }
  } else if (remaining < outDuration && remaining >= 0) {
    const p = remaining / outDuration;
    if (effectOut === 'flip_out') {
      finalScaleY = p;
    } else if (effectOut === 'stretch_out') {
      finalScaleX = p * 1.3;
      finalScaleY = p * 0.7;
    }
  }

  ctx.scale(finalScaleX, finalScaleY);

  // 4b. Apply Active Show Effects (Hiệu ứng khi hiển thị chữ sống động)
  if (subtitleShowEffect === 'flicker_warm') {
    const flicker = 0.88 + 0.12 * Math.sin(elapsed * 25) * Math.cos(elapsed * 12);
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity * flicker));
    ctx.shadowColor = '#F59E0B'; // Hổ phác ấm áp
    ctx.shadowBlur = (10 + 6 * Math.sin(elapsed * 15)) * scaleFactor;
  } else if (subtitleShowEffect === 'bounce_loop') {
    const floatHeight = 12 * Math.sin(elapsed * 4.5) * scaleFactor;
    ctx.translate(0, floatHeight);
  } else if (subtitleShowEffect === 'pulse_grow') {
    const grow = 1.0 + 0.07 * Math.sin(elapsed * 4.0);
    ctx.scale(grow, grow);
  } else if (subtitleShowEffect === 'slide_up_down') {
    const slideY = 20 * Math.sin(elapsed * 3.0) * scaleFactor;
    ctx.translate(0, slideY);
  } else if (subtitleShowEffect === 'slide_left_right') {
    const slideX = 25 * Math.sin(elapsed * 3.0) * scaleFactor;
    ctx.translate(slideX, 0);
  } else if (subtitleShowEffect === 'wave_text') {
    const rotationAngle = 0.05 * Math.sin(elapsed * 4.0);
    ctx.rotate(rotationAngle);
  } else if (subtitleShowEffect === 'shake_vibe') {
    const dx = Math.sin(elapsed * 60) * 4 * scaleFactor;
    const dy = Math.cos(elapsed * 55) * 3 * scaleFactor;
    ctx.translate(dx, dy);
  } else if (subtitleShowEffect === 'tiktok_glow') {
    const shift = 4 * Math.sin(elapsed * 18) * scaleFactor;
    ctx.shadowColor = Math.sin(elapsed * 10) > 0 ? '#00f3ff' : '#ff0055';
    ctx.shadowBlur = 12 * scaleFactor;
    ctx.shadowOffsetX = shift;
    ctx.shadowOffsetY = -shift * 0.5;
  } else if (subtitleShowEffect === 'glitch_cyber') {
    const seed = Math.sin(elapsed * 40);
    if (Math.abs(seed) > 0.85) {
      const dx = seed * 8 * scaleFactor;
      const dy = Math.cos(elapsed * 40) * 5 * scaleFactor;
      ctx.translate(dx, dy);
      ctx.shadowColor = '#00ff33';
      ctx.shadowBlur = 8 * scaleFactor;
    }
  }

  let finalColor = color;
  if (subtitleShowEffect === 'rainbow_flow') {
    const hue = (elapsed * 90) % 360;
    finalColor = `hsl(${hue}, 95%, 65%)`;
  }
  if (isDateHighlightActive) {
    finalColor = config.highlightDateColor || '#FFFFFF';
  }

  ctx.font = `bold ${currentFontSize}px "${fontFamily}", "Inter", "Segoe UI", sans-serif`;
  ctx.textBaseline = 'middle';

  const paddingY = 8;
  const paddingX = 18;

  const startY = -(totalTextHeight / 2) + (lineHeight / 2);

  maxLineWidth = 0;
  for (const line of lines) {
    const metrics = ctx.measureText(line);
    if (metrics.width > maxLineWidth) {
      maxLineWidth = metrics.width;
    }
  }

  // Box background (if translucent blur bg is disabled)
  if (!isDateHighlightActive && !config.enableBlurBg && bgOpacity > 0 && effect !== 'frosted') {
    ctx.fillStyle = bgColor;
    ctx.globalAlpha = opacity * bgOpacity;
    const textW = maxLineWidth + paddingX * 2;
    const textH = totalTextHeight + paddingY * 2;
    const boxX = -textW / 2;
    const boxY = -textH / 2;

    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(boxX, boxY, textW, textH, 10) : ctx.rect(boxX, boxY, textW, textH);
    ctx.fill();
    ctx.globalAlpha = opacity;
  }

  // Support presets backgrounds
  if (effect === 'frosted' && !config.enableBlurBg) {
    ctx.fillStyle = 'rgba(10, 10, 12, 0.75)';
    const bannerH = totalTextHeight + paddingY * 2.5;
    ctx.fillRect(-ctx.canvas.width / 2, -bannerH / 2, ctx.canvas.width, bannerH);
  } else if (effect === 'badge') {
    ctx.fillStyle = 'rgba(10, 10, 13, 0.9)';
    ctx.strokeStyle = finalColor;
    ctx.lineWidth = 2.5;
    const textW = maxLineWidth + paddingX * 2.5;
    const textH = totalTextHeight + paddingY * 2.5;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-textW / 2, -textH / 2, textW, textH, 14) : ctx.rect(-textW / 2, -textH / 2, textW, textH);
    ctx.fill();
    ctx.stroke();
  }

  // Visual glows and shadow depths
  if (isDateHighlightActive) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.98)';
    ctx.shadowBlur = 24 * scaleFactor;
    ctx.shadowOffsetX = 5 * scaleFactor;
    ctx.shadowOffsetY = 6 * scaleFactor;
  } else if (effect === 'neon') {
    ctx.shadowColor = finalColor;
    ctx.shadowBlur = 18 * scaleFactor;
  } else if (effect === 'cinematic') {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 12 * scaleFactor;
    ctx.shadowOffsetY = 4 * scaleFactor;
  }

  // Set alignment-specific properties
  let alignOffsetCenterX = 0;
  if (align === 'left') {
    ctx.textAlign = 'left';
    alignOffsetCenterX = -maxLineWidth / 2;
  } else if (align === 'right') {
    ctx.textAlign = 'right';
    alignOffsetCenterX = maxLineWidth / 2;
  } else if (align === 'justify') {
    // Justify calculations are performed per word
  } else {
    ctx.textAlign = 'center';
    alignOffsetCenterX = 0;
  }

  // Render text passes
  let globalWordIndex = 0;
  
  // Calculate deterministic random pair highlight indices for the entire text upfront
  const fullTextWords = textToDraw.trim().split(/\s+/);
  const totalWordsCount = fullTextWords.length;
  let highlightStartIndex = -1;
  if (subtitleHighlightMode === 'random_pair' && totalWordsCount > 0) {
    let hash = Number(activeBlock.id) || 0;
    for (let h = 0; h < textToDraw.length; h++) {
      hash = (hash << 5) - hash + textToDraw.charCodeAt(h);
      hash |= 0;
    }
    highlightStartIndex = Math.abs(hash) % totalWordsCount;
    if (totalWordsCount > 1 && highlightStartIndex === totalWordsCount - 1) {
      highlightStartIndex = totalWordsCount - 2;
    }
  }

  // Calculate deterministic adjacent 2-word highlight indices for the highlight_two_words effect
  let highlightedWordIndices: number[] = [];
  let highlightFirstIdx = -1;
  let highlightSecondIdx = -1;
  if (subtitleShowEffect === 'highlight_two_words' && totalWordsCount > 5) {
    let hash = Number(activeBlock.id) || 0;
    if (!hash) {
      for (let h = 0; h < textToDraw.length; h++) {
        hash = (hash << 5) - hash + textToDraw.charCodeAt(h);
        hash |= 0;
      }
    }
    const isStyleHighlightWeb = (wordIdx: number) => {
      if (subtitleHighlightMode === 'alternating') {
        return wordIdx % 2 !== 0;
      }
      if (subtitleHighlightMode === 'pair') {
        return Math.floor(wordIdx / 2) % 2 !== 0;
      }
      if (subtitleHighlightMode === 'random_pair') {
        return highlightStartIndex !== -1 && (wordIdx === highlightStartIndex || wordIdx === highlightStartIndex + 1);
      }
      return false;
    };
    
    let baseIdx = Math.abs(hash * 17 + 3) % (totalWordsCount - 1);
    let chosenIdx = -1;
    const isFirstOrLast = (idx: number) => {
      if (totalWordsCount >= 4) {
        return idx === 0 || idx === totalWordsCount - 2;
      }
      return false;
    };

    // First try: satisfying style constraint AND avoiding first/last words
    for (let offset = 0; offset < totalWordsCount - 1; offset++) {
      const idx = (baseIdx + offset) % (totalWordsCount - 1);
      if (!isFirstOrLast(idx) && !isStyleHighlightWeb(idx) && !isStyleHighlightWeb(idx + 1)) {
        chosenIdx = idx;
        break;
      }
    }
    // Second try: relax first/last constraint but keep style constraint
    if (chosenIdx === -1) {
      for (let offset = 0; offset < totalWordsCount - 1; offset++) {
        const idx = (baseIdx + offset) % (totalWordsCount - 1);
        if (!isStyleHighlightWeb(idx) && !isStyleHighlightWeb(idx + 1)) {
          chosenIdx = idx;
          break;
        }
      }
    }
    // Third try: relax style constraint but keep first/last constraint
    if (chosenIdx === -1) {
      for (let offset = 0; offset < totalWordsCount - 1; offset++) {
        const idx = (baseIdx + offset) % (totalWordsCount - 1);
        if (!isFirstOrLast(idx) && !isStyleHighlightWeb(idx)) {
          chosenIdx = idx;
          break;
        }
      }
    }
    // Fourth try: relax everything, just stay within style constraints if possible
    if (chosenIdx === -1) {
      for (let offset = 0; offset < totalWordsCount - 1; offset++) {
        const idx = (baseIdx + offset) % (totalWordsCount - 1);
        if (!isStyleHighlightWeb(idx)) {
          chosenIdx = idx;
          break;
        }
      }
    }
    if (chosenIdx === -1) {
      chosenIdx = baseIdx;
    }
    
    highlightFirstIdx = chosenIdx;
    highlightSecondIdx = highlightFirstIdx + 1;
    highlightedWordIndices = [highlightFirstIdx, highlightSecondIdx];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const itemY = startY + (i * lineHeight);

    const hasHighlight = !isDateHighlightActive && (
                          (subtitleHighlightMode && subtitleHighlightMode !== 'none') || 
                          subtitleShowEffect === 'karaoke' || 
                          (subtitleShowEffect === 'highlight_two_words' && totalWordsCount > 5)
                         );

    if (hasHighlight) {
      const words = line.split(' ');
      ctx.textBaseline = 'middle';
      
      const wordWidths = words.map(w => ctx.measureText(w).width);
      const spaceW = ctx.measureText(' ').width;
      const totalLineWidth = wordWidths.reduce((a, b) => a + b, 0) + (words.length - 1) * spaceW;
      
      let leftX = 0;
      let spacing = spaceW;

      if (align === 'justify' && words.length > 1 && i !== lines.length - 1) {
        const totalWordsWidth = wordWidths.reduce((a, b) => a + b, 0);
        const remainingSpace = maxLineWidth - totalWordsWidth;
        spacing = remainingSpace / (words.length - 1);
        leftX = -maxLineWidth / 2;
        ctx.textAlign = 'left';
      } else {
        if (align === 'left') {
          ctx.textAlign = 'left';
          leftX = alignOffsetCenterX;
        } else if (align === 'right') {
          ctx.textAlign = 'left'; // draw left-to-right from starting spot
          leftX = alignOffsetCenterX - totalLineWidth;
        } else { // center or justify fallback
          ctx.textAlign = 'left'; // draw left-to-right from starting spot
          leftX = -totalLineWidth / 2;
        }
      }

      let curX = leftX;
      for (let wIdx = 0; wIdx < words.length; wIdx++) {
        const word = words[wIdx];
        let wordColor = finalColor;
        const highlightColor = subtitleHighlightColor;
        const boxHighlightColor = config.subtitleHighlightBgColor || subtitleHighlightColor || '#EAB308';
        const enableHighlightContrastText = true;
        
        let isHighlightedWord = false;
        let wordP = 0;
        let totalSweepP = 0;

        if (subtitleShowEffect === 'highlight_two_words' && totalWordsCount > 5) {
          isHighlightedWord = highlightedWordIndices.includes(globalWordIndex);
          if (isHighlightedWord) {
            const blockDuration = Math.max(0.5, activeBlock.endTime - activeBlock.startTime);
            const sweepStart = blockDuration * (highlightFirstIdx / totalWordsCount);
            const sweepDuration = 0.3; // Snappy speed, twice as fast as before!

            if (elapsed > sweepStart) {
              totalSweepP = Math.min(1.0, (elapsed - sweepStart) / sweepDuration);
            }

            if (globalWordIndex === highlightFirstIdx) {
              wordP = Math.min(1.0, Math.max(0.0, totalSweepP / 0.5));
            } else if (globalWordIndex === highlightSecondIdx) {
              wordP = Math.min(1.0, Math.max(0.0, (totalSweepP - 0.5) / 0.5));
            }
          }
        }

        if (isHighlightedWord && wordP > 0) {
          const isContiguousPair = (globalWordIndex === highlightFirstIdx && (wIdx + 1 < words.length));
          const isSecondOfContiguousPair = (globalWordIndex === highlightSecondIdx && wIdx > 0 && (globalWordIndex - 1 === highlightFirstIdx));

          let markerX = curX - 4;
          let combinedMarkerW = (wordWidths[wIdx] + 8) * wordP;
          let swipeBorderX = markerX + combinedMarkerW;
          const markerH = currentFontSize * 1.15;
          const markerY = itemY - markerH / 2;

          if (isContiguousPair) {
            const combinedW = wordWidths[wIdx] + spacing + wordWidths[wIdx + 1];
            combinedMarkerW = (combinedW + 8);
            const currentMarkerW = combinedMarkerW * totalSweepP;
            swipeBorderX = markerX + currentMarkerW;

            ctx.save();
            ctx.fillStyle = boxHighlightColor;
            if (ctx.roundRect) {
              ctx.beginPath();
              ctx.roundRect(markerX, markerY, currentMarkerW, markerH, 4);
              ctx.fill();
            } else {
              ctx.fillRect(markerX, markerY, currentMarkerW, markerH);
            }
            ctx.restore();
          } else if (isSecondOfContiguousPair) {
            const firstWordCurX = curX - spacing - wordWidths[wIdx - 1];
            markerX = firstWordCurX - 4;
            const combinedW = wordWidths[wIdx - 1] + spacing + wordWidths[wIdx];
            combinedMarkerW = (combinedW + 8);
            const currentMarkerW = combinedMarkerW * totalSweepP;
            swipeBorderX = markerX + currentMarkerW;
            // Background box was already drawn as part of the first word contiguous rect, so skip drawing!
          } else {
            const wordW = wordWidths[wIdx];
            const markerW = wordW + 8;
            const currentMarkerW = markerW * wordP;
            swipeBorderX = markerX + currentMarkerW;

            ctx.save();
            ctx.fillStyle = boxHighlightColor;
            if (ctx.roundRect) {
              ctx.beginPath();
              ctx.roundRect(markerX, markerY, currentMarkerW, markerH, 4);
              ctx.fill();
            } else {
              ctx.fillRect(markerX, markerY, currentMarkerW, markerH);
            }
            ctx.restore();
          }

          // Draw character by character so they transition text color immediately as sweeping boundary reaches them
          let charX = curX;

          for (let c = 0; c < word.length; c++) {
            const char = word[c];
            const charW = ctx.measureText(char).width;
            
            // Speed sweeping criteria: if the right edge of highlight box reaches the start of this character
            const isCovered = swipeBorderX >= charX;

            ctx.save();
            if (isCovered && enableHighlightContrastText) {
              // Covered character: draw in pure contrast color, with no stroke outline or shadows to keep it clean and readable
              ctx.shadowColor = 'transparent';
              ctx.shadowBlur = 0;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 0;
              ctx.strokeStyle = 'transparent';
              ctx.lineWidth = 0;
              ctx.fillStyle = getContrastColor(boxHighlightColor);
              ctx.fillText(char, charX, itemY);
            } else {
              // Not covered yet (or contrast text disabled): draw with original outline/effect and finalColor
              if (effect === 'cinematic') {
                ctx.strokeStyle = outlineColor;
                ctx.lineWidth = outlineWidth + 4;
                ctx.lineJoin = 'round';
                ctx.strokeText(char, charX, itemY);

                ctx.strokeStyle = outlineColor;
                ctx.lineWidth = outlineWidth;
                ctx.strokeText(char, charX, itemY);
              } else if (outlineWidth > 0 && effect !== 'neon') {
                ctx.strokeStyle = outlineColor;
                ctx.lineWidth = outlineWidth;
                ctx.lineJoin = 'round';
                ctx.strokeText(char, charX, itemY);
              }
              ctx.fillStyle = finalColor;
              ctx.fillText(char, charX, itemY);
            }
            ctx.restore();
            charX += charW;
          }
        } else {
          // Standard / Karaoke/ Alternating style drawing logic
          if (subtitleShowEffect === 'karaoke') {
            const duration = Math.max(0.5, activeBlock.endTime - activeBlock.startTime);
            const wordProgressIdx = (elapsed / duration) * totalWordsCount;
            const activeWordIdx = Math.floor(wordProgressIdx);
            
            if (globalWordIndex === activeWordIdx) {
              ctx.save();
              // Beautiful golden-yellow highlight box (bôi vàng từ đang phát âm)
              ctx.fillStyle = '#EAB308';
              const wordW = wordWidths[wIdx];
              const markerH = currentFontSize * 1.15;
              const markerX = curX - 4;
              const markerY = itemY - markerH / 2;
              const markerW = wordW + 8;
              
              if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(markerX, markerY, markerW, markerH, 4);
                ctx.fill();
              } else {
                ctx.fillRect(markerX, markerY, markerW, markerH);
              }
              ctx.restore();
              
              wordColor = '#000000'; // Make text black inside active word highlight box
            } else if (globalWordIndex < activeWordIdx) {
              wordColor = '#F2F2F7'; // Clean white-gray for already spoken words so they remain clear
            } else {
              wordColor = 'rgba(255, 255, 255, 0.45)'; // Semi-transparent ambient grey for upcoming words so they don't distract
            }
          } else if (subtitleHighlightMode === 'alternating') {
            wordColor = (globalWordIndex % 2 === 0) ? finalColor : highlightColor;
          } else if (subtitleHighlightMode === 'pair') {
            wordColor = (Math.floor(globalWordIndex / 2) % 2 === 0) ? finalColor : highlightColor;
          } else if (subtitleHighlightMode === 'random_pair') {
            if (highlightStartIndex !== -1 && (globalWordIndex === highlightStartIndex || globalWordIndex === highlightStartIndex + 1)) {
              wordColor = highlightColor;
            } else {
              wordColor = finalColor;
            }
          }

          if (effect === 'cinematic') {
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = outlineWidth + 4;
            ctx.lineJoin = 'round';
            ctx.strokeText(word, curX, itemY);

            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = outlineWidth;
            ctx.strokeText(word, curX, itemY);
          } else if (outlineWidth > 0 && effect !== 'neon') {
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = outlineWidth;
            ctx.lineJoin = 'round';
            ctx.strokeText(word, curX, itemY);
          }

          ctx.fillStyle = wordColor;
          ctx.fillText(word, curX, itemY);
        }

        curX += wordWidths[wIdx] + spacing;
        globalWordIndex++;
      }
    } else {
      // Standard regular drawing (no highlighting)
      if (align === 'justify') {
        const words = line.split(' ');
        if (words.length <= 1 || i === lines.length - 1) {
          ctx.textAlign = 'center';
          
          if (effect === 'cinematic') {
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = outlineWidth + 4;
            ctx.lineJoin = 'round';
            ctx.strokeText(line, 0, itemY);
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = outlineWidth;
            ctx.strokeText(line, 0, itemY);
          } else if (outlineWidth > 0 && effect !== 'neon') {
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = outlineWidth;
            ctx.lineJoin = 'round';
            ctx.strokeText(line, 0, itemY);
          }
          ctx.fillStyle = finalColor;
          ctx.fillText(line, 0, itemY);
        } else {
          const totalWordsWidth = words.reduce((sum, w) => sum + ctx.measureText(w).width, 0);
          const remainingSpace = maxLineWidth - totalWordsWidth;
          const wordSpacing = remainingSpace / (words.length - 1);
          let curX = -maxLineWidth / 2;
          ctx.textAlign = 'left';

          for (const word of words) {
            if (effect === 'cinematic') {
              ctx.strokeStyle = outlineColor;
              ctx.lineWidth = outlineWidth + 4;
              ctx.lineJoin = 'round';
              ctx.strokeText(word, curX, itemY);
              ctx.strokeStyle = outlineColor;
              ctx.lineWidth = outlineWidth;
              ctx.strokeText(word, curX, itemY);
            } else if (outlineWidth > 0 && effect !== 'neon') {
              ctx.strokeStyle = outlineColor;
              ctx.lineWidth = outlineWidth;
              ctx.lineJoin = 'round';
              ctx.strokeText(word, curX, itemY);
            }
            ctx.fillStyle = finalColor;
            ctx.fillText(word, curX, itemY);
            curX += ctx.measureText(word).width + wordSpacing;
          }
        }
      } else {
        // Standard Left, Center, Right align
        if (isTypewriterActive) {
          // Calculate chars to draw in this line
          let charsCounted = 0;
          for (let prevIdx = 0; prevIdx < i; prevIdx++) {
            charsCounted += lines[prevIdx].length + 1;
          }
          const remainingAllowed = currentTypedCount - charsCounted;
          let currentTypedCountInLine = 0;
          let showCursor = false;
          if (remainingAllowed <= 0) {
            currentTypedCountInLine = 0;
            showCursor = false;
          } else if (remainingAllowed >= line.length) {
            currentTypedCountInLine = line.length;
          } else {
            currentTypedCountInLine = remainingAllowed;
            showCursor = isCursorBlinking;
          }

          drawTypewriterLine(
            ctx,
            line,
            currentTypedCountInLine,
            showCursor,
            align,
            alignOffsetCenterX,
            itemY,
            finalColor,
            outlineColor,
            outlineWidth,
            effect
          );
        } else {
          if (effect === 'cinematic') {
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = outlineWidth + 4;
            ctx.lineJoin = 'round';
            ctx.strokeText(line, alignOffsetCenterX, itemY);

            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = outlineWidth;
            ctx.strokeText(line, alignOffsetCenterX, itemY);
          } else if (outlineWidth > 0 && effect !== 'neon') {
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = outlineWidth;
            ctx.lineJoin = 'round';
            ctx.strokeText(line, alignOffsetCenterX, itemY);
          }

          ctx.fillStyle = finalColor;
          ctx.fillText(line, alignOffsetCenterX, itemY);
        }
      }
    }
  }

  ctx.restore();
}

/**
 * Draws real-time particle background animations (deterministic based on time in seconds)
 */
export function drawBackgroundEffect(
  ctx: CanvasRenderingContext2D,
  type: string | undefined,
  width: number,
  height: number,
  time: number
) {
  if (!type || type === 'none') return;

  if (type === 'random') {
    const list = ['snow', 'snowflake', 'rain', 'sparks', 'lightning', 'lightning_clouds', 'sakura', 'bubbles', 'golden_dust', 'autumn_leaves', 'starry_glow', 'hearts', 'fireflies', 'matrix_rain', 'snow_storm', 'neon_stars'];
    const idx = Math.floor(time / 6) % list.length;
    type = list[idx];
  }

  ctx.save();
  // Ensure background effects do not bleed outside the canvas context space
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  if (type === 'snow') {
    // 80 small soft vertical snow particles
    const particleCount = 80;
    for (let i = 0; i < particleCount; i++) {
      const x_start = (Math.abs(Math.sin(i * 45.67 + 31.2)) * width);
      const speed_y = 40 + (Math.abs(Math.cos(i * 12.3 + 99.8)) * 40); // 40 to 80 px/sec
      const sway_freq = 0.5 + (i % 5) * 0.2;
      const sway_amp = 8 + (i % 7) * 4;

      const y = (speed_y * time) % (height + 40) - 20;
      const x = (x_start + Math.sin(time * sway_freq) * sway_amp) % width;
      const r = 1.5 + (i % 3) * 0.8;
      const alpha = 0.35 + (i % 4) * 0.12;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
    }
  } else if (type === 'snowflake') {
    // Larger stylized snowflake ornaments floating/falling down
    const particleCount = 35;
    for (let i = 0; i < particleCount; i++) {
      const x_start = (Math.abs(Math.sin(i * 87.3 + 9.4)) * width);
      const speed_y = 25 + (Math.abs(Math.cos(i * 19.4 + 43.1)) * 20); // slow floating
      const sway_freq = 0.4 + (i % 4) * 0.15;
      const sway_amp = 15 + (i % 6) * 6;

      const y = (speed_y * time) % (height + 60) - 30;
      const x = (x_start + Math.sin(time * sway_freq) * sway_amp) % width;
      const r = 4.0 + (i % 4) * 1.5;
      const alpha = 0.25 + (i % 3) * 0.15;
      const angle = time * (0.3 + (i % 4) * 0.15) + i;

      // Draw stylized star / asterisk representing snowflake
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = 1.5;
      for (let j = 0; j < 4; j++) {
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.lineTo(r, 0);
        ctx.stroke();
        ctx.rotate(Math.PI / 4);
      }
      ctx.restore();
    }
  } else if (type === 'rain') {
    // 100 fast slanted rain streaks
    const particleCount = 120;
    for (let i = 0; i < particleCount; i++) {
      const x_start = (Math.abs(Math.sin(i * 153.25 + 9.87)) * width);
      const speed_y = 500 + (Math.abs(Math.cos(i * 44.5 + 87.6)) * 250); // fast!
      const len = 15 + (i % 6) * 10;

      const y = (speed_y * time) % (height + len * 2) - len;
      // Slightly slanted to match standard windy rainy feel
      const x = (x_start + y * 0.1) % width;
      const alpha = 0.15 + (i % 5) * 0.1;

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len * 0.1, y + len);
      ctx.strokeStyle = `rgba(180, 210, 255, ${alpha})`;
      ctx.lineWidth = 0.8 + (i % 3) * 0.4;
      ctx.stroke();
    }
  } else if (type === 'sparks') {
    // Upward rising floating sparks/embers
    const particleCount = 60;
    for (let i = 0; i < particleCount; i++) {
      const x_start = (Math.abs(Math.sin(i * 203.4 + 99.1)) * width);
      const speed_y = 60 + (Math.abs(Math.cos(i * 35.2 + 12.3)) * 40); // speed going up
      const sway_freq = 0.8 + (i % 4) * 0.3;
      const sway_amp = 12 + (i % 5) * 5;

      // y goes subtraction wise to make spark rise up
      const y = height - ((speed_y * time) % (height + 40));
      const x = (x_start + Math.sin(time * sway_freq) * sway_amp) % width;
      const r = 1.2 + (i % 4) * 0.8;
      const alpha = 0.3 + (i % 4) * 0.15;

      // Draw yellow/orange warming light circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const isYellow = (i % 2 === 0);
      ctx.fillStyle = isYellow 
        ? `rgba(255, 200, 30, ${alpha})` 
        : `rgba(240, 90, 10, ${alpha})`;
      ctx.shadowColor = isYellow ? '#ffc81e' : '#f05a0a';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0; // reset instantly
    }
  } else if (type === 'lightning' || type === 'lightning_clouds') {
    // Heavy thunderstorm elements
    const cycle = time % 4; // every 4 seconds loop
    
    // Draw clouds if in lightning_clouds mode
    if (type === 'lightning_clouds') {
      const cloudCount = 4;
      for (let i = 0; i < cloudCount; i++) {
        const cx = (width / (cloudCount - 1)) * i;
        const cy = 20 + Math.sin(time * 0.5 + i) * 10;
        const r = 100 + (i % 3) * 30;
        // Clouds flash/glow during lightning flash triggers!
        const isFlashActive = (cycle > 0.05 && cycle < 0.25);
        const cloudAlpha = isFlashActive ? 0.35 : 0.15 + (i % 3) * 0.05;
        
        const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, r);
        if (isFlashActive) {
          grad.addColorStop(0, `rgba(180, 210, 255, ${cloudAlpha})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        } else {
          grad.addColorStop(0, `rgba(40, 45, 60, ${cloudAlpha})`);
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // High sudden sky environment ambient flash
    if (cycle > 0.0 && cycle < 0.12) {
      ctx.fillStyle = 'rgba(230, 240, 255, 0.25)';
      ctx.fillRect(0, 0, width, height);
    } else if (cycle > 0.15 && cycle < 0.20) {
      ctx.fillStyle = 'rgba(230, 240, 255, 0.12)';
      ctx.fillRect(0, 0, width, height);
    }

    // Periodic lightning flash draw sequence
    if (cycle > 0.05 && cycle < 0.25) {
      const cycle_id = Math.floor(time / 4);
      let boltSeed = cycle_id * 14892 + 3721;
      const boltRand = () => {
        boltSeed = (boltSeed * 9301 + 49297) % 233280;
        return boltSeed / 233280;
      };

      const drawSingleBolt = (startX: number, startY: number, endY: number, initialWidth: number, branchChance: number) => {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        let curY = startY;
        let curX = startX;
        ctx.strokeStyle = '#E0EBFF';
        ctx.lineWidth = initialWidth;
        ctx.shadowColor = '#609BFF';
        ctx.shadowBlur = 18;

        while (curY < endY) {
          const dy = 15 + boltRand() * 25;
          const dx = (boltRand() - 0.5) * 50;
          curY += dy;
          curX += dx;
          ctx.lineTo(curX, curY);

          // Support branching
          if (boltRand() < branchChance && curY < endY - 100) {
            // Draw a smaller branch
            drawSingleBolt(curX, curY, curY + 120 + boltRand() * 100, initialWidth * 0.6, 0.0);
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      };

      const mainX = width * (0.2 + boltRand() * 0.6);
      drawSingleBolt(mainX, 0, height, 3.5 + boltRand() * 2.5, 0.15);
    }
  } else if (type === 'sakura') {
    // Pink Cherry Leaves/Petals blowing towards the left corner
    const leafCount = 45;
    for (let i = 0; i < leafCount; i++) {
      const x_start = (Math.abs(Math.sin(i * 127.3 + 12.3)) * width);
      const speed_y = 35 + (i % 5) * 12;
      const speed_x = -25 - (i % 4) * 8; // blowing leftwards
      const sway_freq = 0.6 + (i % 3) * 0.25;
      const sway_amp = 12 + (i % 5) * 5;

      const y = (speed_y * time) % (height + 45) - 15;
      let x = (x_start + speed_x * time + Math.sin(time * sway_freq) * sway_amp) % width;
      if (x < 0) x += width;

      const scale = 0.8 + (i % 4) * 0.3;
      const alpha = 0.4 + (i % 3) * 0.15;
      const yaw = Math.sin(time * 2 + i) * 0.5; // waving angle

      // Draw teardrop-like pink cherry blossom petal
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 0.5 + i * 0.1);
      ctx.scale(scale, scale * (1 + yaw));
      ctx.fillStyle = `rgba(255, 185, 200, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.bezierCurveTo(4, -10, 8, -5, 0, 6);
      ctx.bezierCurveTo(-8, -5, -4, -10, 0, -6);
      ctx.fill();
      ctx.restore();
    }
  } else if (type === 'bubbles') {
    // 35 light translucent bubbles rising up with dynamic wobble and glare highlights
    const count = 35;
    for (let i = 0; i < count; i++) {
      const x_start = (Math.abs(Math.sin(i * 123.4 + 56.7)) * width);
      const speed_y = 30 + (Math.abs(Math.cos(i * 37.1 + 82.4)) * 30); // float up speed
      const sway_freq = 0.6 + (i % 4) * 0.2;
      const sway_amp = 10 + (i % 5) * 4;

      const y = height - ((speed_y * time) % (height + 50));
      const x = (x_start + Math.sin(time * sway_freq) * sway_amp) % width;
      const r = 5 + (i % 6) * 2.5;
      const alpha = 0.12 + (i % 3) * 0.08;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 230, 255, ${alpha})`;
      ctx.fill();

      // Thin bubble border
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha + 0.15})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // 3D shiny glare highlight
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha + 0.35})`;
      ctx.fill();
    }
  } else if (type === 'golden_dust') {
    // 45 luxurious warm golden dust embers drifting slowly in 2D sine pathways
    const count = 45;
    for (let i = 0; i < count; i++) {
      const x_start = (Math.abs(Math.sin(i * 243.1 + 17.3)) * width);
      const y_start = (Math.abs(Math.cos(i * 119.4 + 43.8)) * height);
      
      const speed_x = 10 + (i % 4) * 5;
      const speed_y = -8 - (i % 3) * 6; // slightly rising
      
      const wave_x = Math.sin(time * 0.4 + i) * 20;
      const wave_y = Math.cos(time * 0.3 + i * 1.5) * 15;

      const x = (x_start + speed_x * time + wave_x) % width;
      let y = (y_start + speed_y * time + wave_y) % height;
      if (y < 0) y += height;

      const r = 1.5 + (i % 4) * 0.8;
      const alpha = 0.25 + (i % 3) * 0.15;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? `rgba(253, 224, 71, ${alpha})` : `rgba(249, 115, 22, ${alpha})`;
      ctx.shadowColor = '#eab308';
      ctx.shadowBlur = 6 + (i % 3) * 3;
      ctx.fill();
      ctx.shadowBlur = 0; // reset instantly
    }
  } else if (type === 'autumn_leaves') {
    // 30 gorgeous crimson/amber maple and oak leaves tumbling down
    const count = 30;
    for (let i = 0; i < count; i++) {
      const x_start = (Math.abs(Math.sin(i * 314.15 + 42.1)) * width);
      const speed_y = 35 + (i % 5) * 12;
      const speed_x = -15 - (i % 4) * 6; // subtle drifting left
      const sway_freq = 0.5 + (i % 3) * 0.2;
      const sway_amp = 15 + (i % 4) * 6;

      const y = (speed_y * time) % (height + 50) - 20;
      let x = (x_start + speed_x * time + Math.sin(time * sway_freq) * sway_amp) % width;
      if (x < 0) x += width;

      const scale = 0.9 + (i % 4) * 0.3;
      const alpha = 0.45 + (i % 3) * 0.15;
      const isRed = (i % 3 === 0);
      const isOrange = (i % 3 === 1);
      
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * (0.4 + (i % 3) * 0.2) + i);
      ctx.scale(scale, scale);
      
      ctx.fillStyle = isRed 
        ? `rgba(220, 38, 38, ${alpha})` // crimson
        : isOrange 
          ? `rgba(249, 115, 22, ${alpha})` // orange
          : `rgba(234, 179, 8, ${alpha})`; // amber/yellow
      
      // Draw simplified leaf path (beautiful organic leaf shape)
      ctx.beginPath();
      ctx.moveTo(0, -8);
      // Main central peak
      ctx.bezierCurveTo(4, -12, 6, -6, 0, 8);
      // Left lobes
      ctx.bezierCurveTo(-8, 3, -10, -2, -3, -5);
      // Right lobes
      ctx.bezierCurveTo(8, 3, 10, -2, 3, -5);
      ctx.fill();
      
      // Leaf vein
      ctx.strokeStyle = `rgba(0, 0, 0, ${alpha * 0.25})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(0, -5);
      ctx.stroke();
      
      ctx.restore();
    }
  } else if (type === 'starry_glow') {
    // 40 twinkling cross stars with soft pulsing and deep cinematic flare glows
    const count = 40;
    for (let i = 0; i < count; i++) {
      const x = (Math.abs(Math.sin(i * 157.9 + 54.3)) * width);
      const y = (Math.abs(Math.cos(i * 224.6 + 9.8)) * height);
      
      // Twinkle pulsation
      const speed = 1.5 + (i % 4) * 0.8;
      const scale = (Math.sin(time * speed + i * 2.3) + 1.0) * 0.5; // pulses 0 to 1
      const alpha = (0.2 + (i % 3) * 0.15) * scale;
      
      if (alpha <= 0.05) continue; // skip invisible stars

      const size = 6 + (i % 4) * 3;
      const isWarm = (i % 2 === 0);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 0.1 + i);
      
      ctx.strokeStyle = isWarm ? `rgba(254, 240, 138, ${alpha})` : `rgba(224, 242, 254, ${alpha})`;
      ctx.fillStyle = isWarm ? `rgba(254, 240, 138, ${alpha})` : `rgba(224, 242, 254, ${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.shadowColor = isWarm ? "#fef08a" : "#bae6fd";
      ctx.shadowBlur = 4 * scale;

      // Draw 4-point star using curves
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.quadraticCurveTo(0, 0, size, 0);
      ctx.quadraticCurveTo(0, 0, 0, size);
      ctx.quadraticCurveTo(0, 0, -size, 0);
      ctx.quadraticCurveTo(0, 0, 0, -size);
      ctx.fill();
      
      ctx.restore();
    }
  } else if (type === 'hearts') {
    // 30 floating romantic hearts rising up with organic sway
    const count = 30;
    for (let i = 0; i < count; i++) {
      const x_start = (Math.abs(Math.sin(i * 199.1 + 83.2)) * width);
      const speed_y = 30 + (Math.abs(Math.cos(i * 47.9 + 11.5)) * 30);
      const sway_freq = 0.7 + (i % 4) * 0.25;
      const sway_amp = 12 + (i % 4) * 4;

      const y = height - ((speed_y * time) % (height + 40));
      const x = (x_start + Math.sin(time * sway_freq) * sway_amp) % width;
      const scale = 0.8 + (i % 4) * 0.3;
      const alpha = 0.35 + (i % 3) * 0.15;
      const isPink = (i % 2 === 0);

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      
      ctx.fillStyle = isPink ? `rgba(244, 114, 182, ${alpha})` : `rgba(239, 68, 68, ${alpha})`;
      
      // Draw standard clean heart path
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.bezierCurveTo(3, -7, 6, -7, 6, -3);
      ctx.bezierCurveTo(6, 1, 0, 5, 0, 8);
      ctx.bezierCurveTo(0, 5, -6, 1, -6, -3);
      ctx.bezierCurveTo(-6, -7, -3, -7, 0, -3);
      ctx.fill();
      
      ctx.restore();
    }
  } else if (type === 'fireflies') {
    // 35 beautiful floating neon-green fireflies pulsing and drifting
    const count = 35;
    for (let i = 0; i < count; i++) {
      const x_start = (Math.abs(Math.sin(i * 142.33 + 77.1)) * width);
      const y_start = (Math.abs(Math.cos(i * 98.45 + 13.9)) * height);
      const speed = 1.0 + (i % 3) * 0.4;
      const pulse_speed = 2 + (i % 4) * 0.8;
      
      const wave_x = Math.sin(time * 0.6 + i) * 30;
      const wave_y = Math.cos(time * 0.5 + i * 1.8) * 25;

      const x = (x_start + wave_x) % width;
      let y = (y_start - speed * time * 12 + wave_y) % height;
      if (y < 0) y += height;

      const r = 1.5 + (i % 3) * 1.0;
      const pulse = (Math.sin(time * pulse_speed + i) + 1.0) * 0.5; // 0 to 1
      const alpha = (0.25 + (i % 3) * 0.2) * pulse;

      if (alpha <= 0.05) continue;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(163, 230, 53, ${alpha})`; // Lime glowing green
      ctx.shadowColor = '#a3e635';
      ctx.shadowBlur = 8 * pulse;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  } else if (type === 'matrix_rain') {
    // Elegant Matrix digital code stream trails
    ctx.font = 'bold 12px monospace';
    const cols = 26;
    const spacing = width / cols;
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' + '0123456789' + '$#@%&';
    
    for (let i = 0; i < cols; i++) {
      const speed = 120 + (Math.abs(Math.sin(i * 44.5)) * 140); // descending speed
      const x = i * spacing + spacing / 2;
      const start_y = (speed * time) % (height + 250) - 200;

      // Draw active head character
      const charIdx = Math.floor(time * 15 + i) % chars.length;
      const headChar = chars[charIdx];
      
      // Draw 6 decaying characters behind the head
      for (let j = 0; j < 8; j++) {
        const y = start_y - j * 16;
        if (y < -20 || y > height + 20) continue;
        
        const alpha = 1.0 - (j / 8);
        
        ctx.fillStyle = j === 0 
          ? `rgba(220, 255, 220, ${alpha * 0.9})` // White glowing head
          : `rgba(34, 197, 94, ${alpha * 0.65})`; // matrix green
        ctx.fillText(headChar, x, y);
      }
    }
  } else if (type === 'snow_storm') {
    // 90 fast-moving wind-blown diagonal snowflakes
    const count = 90;
    for (let i = 0; i < count; i++) {
      const x_start = (Math.abs(Math.sin(i * 188.4 + 44.2)) * width);
      const speed_y = 120 + (i % 6) * 45; // very fast falling
      const speed_x = -130 - (i % 4) * 40; // very fast blowing left (wind!)

      const y = (speed_y * time) % (height + 30) - 15;
      let x = (x_start + speed_x * time) % width;
      if (x < 0) x += width;

      const r = 1.0 + (i % 4) * 1.5;
      const alpha = 0.35 + (i % 3) * 0.15;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
    }
  } else if (type === 'neon_stars') {
    // 35 glowing neon cyberpunk star shapes pulsing and switching colors
    const count = 35;
    for (let i = 0; i < count; i++) {
      const x = (Math.abs(Math.sin(i * 123.45 + 55.4)) * width);
      const y = (Math.abs(Math.cos(i * 87.65 + 12.3)) * height);
      
      const pulse_speed = 1.2 + (i % 3) * 0.8;
      const scale = (Math.sin(time * pulse_speed + i * 3) + 1) * 0.5; // pulse size
      const alpha = (0.25 + (i % 3) * 0.15) * scale;

      if (alpha <= 0.05) continue;

      const size = 6 + (i % 3) * 3;
      const hue = (Math.floor(time * 30 + i * 45)) % 360; // shifting rainbow colors for cyberpunk feel

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 0.2 + i);
      
      ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = `hsl(${hue}, 95%, 60%)`;
      ctx.shadowBlur = 8 * scale;

      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.quadraticCurveTo(0, 0, size, 0);
      ctx.quadraticCurveTo(0, 0, 0, size);
      ctx.quadraticCurveTo(0, 0, -size, 0);
      ctx.quadraticCurveTo(0, 0, 0, -size);
      ctx.stroke();
      
      ctx.restore();
    }
  }

  ctx.restore();
}
