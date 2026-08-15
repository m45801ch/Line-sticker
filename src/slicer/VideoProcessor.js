import { fetchFile } from '@ffmpeg/util';
import JSZip from 'jszip';
import UPNG from 'upng-js';
import { getFFmpeg } from './FFmpegContext';
import { applyChromaKey } from '../utils/chromaKey';

export const INPUT_W = 1920;
export const INPUT_H = 1080;
export const DEFAULT_GRID_COLS = 4;
export const DEFAULT_GRID_ROWS = 3;
export const LINE_TARGET_W = 320;   // 輸出目標寬（LINE 規格）
export const LINE_TARGET_H = 270;   // 輸出目標高（LINE 規格）
export const MAX_DURATION = 4;   // 秒
export const FPS = 10;
export const AUTO_FRAME_COUNT = 20;

// 相容常數（預設網格）
export const GRID_COLS = DEFAULT_GRID_COLS;
export const GRID_ROWS = DEFAULT_GRID_ROWS;
export const CELL_W = Math.round(INPUT_W / GRID_COLS);
export const CELL_H = Math.round(INPUT_H / GRID_ROWS);

const toEven = (n) => Math.max(2, Math.round(n / 2) * 2);

/**
 * 建立均分網格線位置陣列（含邊界）。
 * @param {number} count 線段數（如欄數或列數）
 * @param {number} size 該向總長度
 * @returns {number[]} 長度 count+1 的位置陣列，頭尾為邊界
 */
export const makeGridLines = (count, size) => {
  const lines = [];
  for (let i = 0; i <= count; i++) lines.push((i * size) / count);
  return lines;
};

/**
 * 計算第 cellIndex 格的 crop 視窗座標。
 * @param {number} cellIndex
 * @param {number[]} vLines 垂直線位置（長度 = 欄數+1）
 * @param {number[]} hLines 水平線位置（長度 = 列數+1）
 */
export const getCellRect = (cellIndex, vLines, hLines) => {
  const cols = vLines.length - 1;
  const col = cellIndex % cols;
  const row = Math.floor(cellIndex / cols);
  const x = vLines[col];
  const y = hLines[row];
  const w = vLines[col + 1] - x;
  const h = hLines[row + 1] - y;
  return { x, y, w: toEven(w), h: toEven(h) };
};

/**
 * 建立單一格的 FFmpeg 濾鏡鏈（APNG）：
 * crop(對應格) → scale(符合 320x270、等比例縮放、不超框)
 * → pad(補透明邊至精確 320x270) → 強制 rgba → fps=10
 */
export const buildCellFilter = (cellIndex, vLines, hLines) => {
  const { x, y, w, h } = getCellRect(cellIndex, vLines, hLines);
  return [
    `crop=${w}:${h}:${x}:${y}`,
    `scale=${LINE_TARGET_W}:${LINE_TARGET_H}:force_original_aspect_ratio=decrease`,
    `pad=${LINE_TARGET_W}:${LINE_TARGET_H}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
    'format=rgba',
    `fps=${FPS}`,
  ].join(',');
};

/**
 * 建立單一格的 MP4 切割濾鏡鏈（MP4 無透明通道，補綠幕便於之後去背）。
 */
export const buildCellFilterMp4 = (cellIndex, vLines, hLines) => {
  const { x, y, w, h } = getCellRect(cellIndex, vLines, hLines);
  return [
    `crop=${w}:${h}:${x}:${y}`,
    `scale=${LINE_TARGET_W}:${LINE_TARGET_H}:force_original_aspect_ratio=decrease`,
    `pad=${LINE_TARGET_W}:${LINE_TARGET_H}:(ow-iw)/2:(oh-ih)/2:color=0x00FF00`,
    `fps=${FPS}`,
  ].join(',');
};

const toUint8 = (data) => {
  if (typeof data === 'string') {
    const bin = atob(data);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }
  return data;
};

/**
 * 切割單一格影片，輸出 MP4，回傳 { url, name, index }。
 */
export const sliceCell = async (cellIndex, vLines, hLines, outName) => {
  const ffmpeg = await getFFmpeg();
  const vf = buildCellFilterMp4(cellIndex, vLines, hLines);

  await ffmpeg.exec([
    '-i', 'input.mp4',
    '-t', String(MAX_DURATION),
    '-vf', vf,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '32',
    '-threads', '1',
    '-pix_fmt', 'yuv420p',
    outName,
  ]);

  const data = await ffmpeg.readFile(outName);
  const blob = new Blob([toUint8(data)], { type: 'video/mp4' });
  return {
    url: URL.createObjectURL(blob),
    name: outName,
    index: cellIndex,
  };
};

/**
 * 切割全部格為 MP4 短影片。
 * @param {File} videoFile 上傳的 MP4
 * @param {number[]} vLines 垂直線位置
 * @param {number[]} hLines 水平線位置
 * @param {(info:{done:number,total:number,cell:number,stage:string})=>void} onProgress
 * @returns {Promise<{url:string,name:string,index:number}[]>}
 */
export const sliceAllCells = async (videoFile, vLines, hLines, onProgress) => {
  const ffmpeg = await getFFmpeg();
  await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));

  const cols = vLines.length - 1;
  const rows = hLines.length - 1;
  const total = cols * rows;
  const clips = [];

  for (let i = 0; i < total; i++) {
    onProgress?.({ done: i, total, cell: i + 1, stage: 'processing' });
    const clip = await sliceCell(i, vLines, hLines, `cell_${String(i + 1).padStart(2, '0')}.mp4`);
    clips.push(clip);
    onProgress?.({ done: i + 1, total, cell: i + 1, stage: 'done' });
  }

  return clips;
};

/**
 * 執行單一格的切割，輸出 APNG，回傳 ArrayBuffer。
 */
export const processCell = async (cellIndex, vLines, hLines) => {
  const ffmpeg = await getFFmpeg();
  const outName = `cell_${String(cellIndex + 1).padStart(2, '0')}.png`;
  const vf = buildCellFilter(cellIndex, vLines, hLines);

  await ffmpeg.exec([
    '-i', 'input.mp4',
    '-t', String(MAX_DURATION),
    '-vf', vf,
    '-f', 'apng',
    outName,
  ]);

  const data = await ffmpeg.readFile(outName);
  return toUint8(data);
};

/**
 * 全部處理並打包 ZIP。
 */
export const processAllAndZip = async (videoFile, vLines, hLines, onProgress) => {
  const ffmpeg = await getFFmpeg();

  await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));

  const total = (vLines.length - 1) * (hLines.length - 1);
  const zip = new JSZip();

  for (let i = 0; i < total; i++) {
    onProgress?.({ done: i, total, cell: i + 1, stage: 'processing' });
    const buf = await processCell(i, vLines, hLines);
    const name = `cell_${String(i + 1).padStart(2, '0')}.png`;
    zip.file(name, buf);
    onProgress?.({ done: i + 1, total, cell: i + 1, stage: 'done' });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return { zip: blob, count: total };
};

// ---- 自動化處理管線 ----

/**
 * 從影片 URL 均勻截取指定張數影格（回傳 dataURL 陣列）。
 */
const extractFramesFromUrl = (videoUrl, count) => new Promise((resolve, reject) => {
  const video = document.createElement('video');
  video.src = videoUrl;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.muted = true;

  video.onloadedmetadata = () => {
    const canvas = document.createElement('canvas');
    canvas.width = LINE_TARGET_W;
    canvas.height = LINE_TARGET_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const duration = Math.min(video.duration || MAX_DURATION, MAX_DURATION);
    const interval = duration / count;
    const results = [];

    const grabAt = (time) => new Promise((res) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        ctx.drawImage(video, 0, 0, LINE_TARGET_W, LINE_TARGET_H);
        results.push({ src: canvas.toDataURL('image/png'), displaySrc: canvas.toDataURL('image/png'), time });
        res();
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = time;
    });

    (async () => {
      for (let i = 0; i < count; i++) {
        await grabAt(Math.min(i * interval, Math.max(0, duration - 0.001)));
      }
      video.removeAttribute('src');
      resolve(results);
    })().catch(reject);
  };

  video.onerror = () => reject(new Error('無法讀取影片'));
});

const loadImageToCanvas = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = LINE_TARGET_W;
    canvas.height = LINE_TARGET_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, LINE_TARGET_W, LINE_TARGET_H);
    resolve(ctx.getImageData(0, 0, LINE_TARGET_W, LINE_TARGET_H));
  };
  img.onerror = reject;
  img.src = src;
});

/**
 * 自動偵測去背參數：從影片第一幀分析背景色與距離分布，
 * 自動調整容差度、平滑度、溢色去除強度。
 * @param {string} videoUrl 切割影片 URL
 * @returns {Promise<{bgColor:string,tolerance:number,smoothness:number,enableDespill:boolean,despillStrength:number}>}
 */
export const autoDetectBgSettings = async (videoUrl) => {
  const frames = await extractFramesFromUrl(videoUrl, 1);
  if (frames.length === 0) throw new Error('截取影格失敗');
  const imageData = await loadImageToCanvas(frames[0].displaySrc);
  const data = imageData.data;
  const w = LINE_TARGET_W;
  const h = LINE_TARGET_H;

  // 1. 從四角樣本平均取得背景色（綠幕補邊通常在角落）
  const sample = (sx, sy, sw, sh) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = sy; y < sy + sh; y++) {
      for (let x = sx; x < sx + sw; x++) {
        const i = (y * w + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  };
  const cornerSize = 8;
  const corners = [
    sample(0, 0, cornerSize, cornerSize),
    sample(w - cornerSize, 0, cornerSize, cornerSize),
    sample(0, h - cornerSize, cornerSize, cornerSize),
    sample(w - cornerSize, h - cornerSize, cornerSize, cornerSize),
  ];
  const bg = {
    r: Math.round(corners.reduce((s, c) => s + c.r, 0) / 4),
    g: Math.round(corners.reduce((s, c) => s + c.g, 0) / 4),
    b: Math.round(corners.reduce((s, c) => s + c.b, 0) / 4),
  };

  // 2. 統計整幀每個像素到背景色的距離，找出背景簇與前景之間的間隙
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const dist = Math.round(Math.sqrt((r - bg.r) ** 2 + (g - bg.g) ** 2 + (b - bg.b) ** 2));
    histogram[Math.min(255, dist)]++;
  }

  // 平滑直方圖
  const smooth = histogram.map((_, d) => {
    let sum = 0, n = 0;
    for (let k = Math.max(0, d - 3); k <= Math.min(255, d + 3); k++) { sum += histogram[k]; n++; }
    return sum / n;
  });

  // 找到背景峰（前 100 內的最大值位置）
  let bgPeak = 0;
  for (let d = 1; d < 100; d++) if (smooth[d] > smooth[bgPeak]) bgPeak = d;

  // 從背景峰往後找第一個局部最低點（谷）作為參考容差
  let valley = 255;
  for (let d = bgPeak + 1; d < 180; d++) {
    if (smooth[d] < smooth[d - 1] && smooth[d] <= smooth[d + 1]) { valley = d; break; }
  }

  // 依實務經驗收斂到使用者偏好的範圍：容差 150–180
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const tolerance = clamp(valley, 150, 180);

  // 3. 平滑度：依背景峰的寬度自動判別，最高 20
  let spread = 0;
  for (let d = bgPeak; d <= 255; d++) if (smooth[d] > smooth[bgPeak] * 0.3) spread = d - bgPeak;
  const smoothness = clamp(Math.round(spread * 0.25), 1, 20);

  // 4. 溢色：若背景以綠色為主則開啟，強度 100
  const isGreenish = bg.g > bg.r && bg.g > bg.b;
  const enableDespill = isGreenish;
  const despillStrength = 100;

  const hex = (n) => n.toString(16).padStart(2, '0');
  return {
    bgColor: `#${hex(bg.r)}${hex(bg.g)}${hex(bg.b)}`,
    tolerance,
    smoothness,
    enableDespill,
    despillStrength,
  };
};

/**
 * 對影片執行「截取影格 → 去背」，回傳去背後的 dataURL 陣列。
 */
export const extractProcessedFrameDataUrls = async (videoUrl, settings, frameCount = AUTO_FRAME_COUNT) => {
  const frames = await extractFramesFromUrl(videoUrl, frameCount);
  if (frames.length === 0) throw new Error('截取影格失敗');

  const processed = [];
  for (const frame of frames) {
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.onerror = res; img.src = frame.displaySrc; });
    const canvas = document.createElement('canvas');
    canvas.width = LINE_TARGET_W;
    canvas.height = LINE_TARGET_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, LINE_TARGET_W, LINE_TARGET_H);
    applyChromaKey(ctx, LINE_TARGET_W, LINE_TARGET_H, settings);
    processed.push(canvas.toDataURL('image/png'));
  }
  return processed;
};

/**
 * 將已去背處理後的影格（dataURL 陣列）打包成 APNG（強制 ≤ 1MB）。
 * 壓縮策略：先降色彩數，仍超標則逐步縮小尺寸。
 * @param {string[]} processedFrames 已去背的影格 dataURL 陣列
 * @returns {Promise<{apng:Blob,size:number}>}
 */
export const buildApngFromFrameDataUrls = async (processedFrames) => {
  const totalMs = MAX_DURATION * 1000;
  const delayBase = Math.floor(totalMs / processedFrames.length);
  const delayRemainder = totalMs % processedFrames.length;
  const delays = Array.from({ length: processedFrames.length }, (_, i) => (i < delayRemainder ? delayBase + 1 : delayBase));

  const SIZE_LIMIT = 1024 * 1024;

  const loadToBuffer = (src, w, h) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);
      resolve(ctx.getImageData(0, 0, w, h).data.buffer);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

  const encodeBlob = (buffers, w, h, colors, frameDelays) => {
    const buf = UPNG.encode(buffers, w, h, colors, frameDelays);
    return new Blob([buf], { type: 'image/png' });
  };

  // 1. 原始尺寸先降色彩數
  const baseBuffers = [];
  for (const src of processedFrames) {
    const buf = await loadToBuffer(src, LINE_TARGET_W, LINE_TARGET_H);
    if (buf) baseBuffers.push(buf);
  }
  if (baseBuffers.length === 0) throw new Error('無有效影格');

  let blob = null;
  for (const cnum of [0, 256, 128, 96, 64, 48, 32, 16]) {
    const b = encodeBlob(baseBuffers, LINE_TARGET_W, LINE_TARGET_H, cnum, delays);
    if (b.size <= SIZE_LIMIT) { blob = b; break; }
  }

  // 2. 仍超標：逐步縮小尺寸
  if (!blob) {
    let sw = LINE_TARGET_W;
    let sh = LINE_TARGET_H;
    const MIN_DIM = 32;
    while (sw > MIN_DIM || sh > MIN_DIM) {
      sw = Math.max(MIN_DIM, Math.round(sw * 0.8));
      sh = Math.max(MIN_DIM, Math.round(sh * 0.8));

      const scaledBuffers = [];
      for (const src of processedFrames) {
        const buf = await loadToBuffer(src, sw, sh);
        if (buf) scaledBuffers.push(buf);
      }
      if (scaledBuffers.length === 0) continue;

      const b = encodeBlob(scaledBuffers, sw, sh, 16, delays);
      if (b.size <= SIZE_LIMIT || (sw === MIN_DIM && sh === MIN_DIM)) { blob = b; break; }
    }
  }

  if (!blob) throw new Error('壓縮後仍超過 1MB');
  return { apng: blob, size: blob.size };
};

/**
 * 對單支切割影片執行自動化：截取影格 → 去背 → 打包 APNG（強制 ≤ 1MB）。
 */
export const autoProcessClipToApng = async (videoUrl, settings, frameCount = AUTO_FRAME_COUNT) => {
  const processed = await extractProcessedFrameDataUrls(videoUrl, settings, frameCount);
  return buildApngFromFrameDataUrls(processed);
};

/**
 * 批次自動化處理多支切割影片，完成後打包 ZIP。
 * 若提供 processedMap（clip index → 已編輯的去背影格 dataURL 陣列），
 * 則使用已保留/編輯的影格製作 APNG；否則重新截取影格 + 去背。
 * @param {Array<{url:string,name:string,index:number}>} clips
 * @param {object} settings 去背參數
 * @param {number} frameCount
 * @param {(info:{done:number,total:number,name:string})=>void} onProgress
 * @param {Object<string, string[]>} [processedMap]
 */
export const autoProcessClipsToZip = async (clips, settings, frameCount, onProgress, processedMap = {}) => {
  const zip = new JSZip();
  const total = clips.length;
  let overLimit = 0;

  for (let i = 0; i < total; i++) {
    const clip = clips[i];
    onProgress?.({ done: i, total, name: clip.name, stage: 'processing' });
    let apng, size;
    const keptFrames = processedMap[clip.index];
    if (keptFrames && keptFrames.length > 0) {
      const r = await buildApngFromFrameDataUrls(keptFrames);
      apng = r.apng; size = r.size;
    } else {
      const r = await autoProcessClipToApng(clip.url, settings, frameCount);
      apng = r.apng; size = r.size;
    }
    if (size > 1024 * 1024) overLimit++;
    const base = clip.name.replace(/\.mp4$/i, '');
    zip.file(`${base}.png`, await apng.arrayBuffer());
    onProgress?.({ done: i + 1, total, name: clip.name, stage: 'done' });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return { zip: blob, count: total, overLimit };
};