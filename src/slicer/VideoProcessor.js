import { fetchFile } from '@ffmpeg/util';
import JSZip from 'jszip';
import { getFFmpeg } from './FFmpegContext';

export const INPUT_W = 1920;
export const INPUT_H = 1080;
export const GRID_COLS = 6;
export const GRID_ROWS = 4;
export const CELL_W = 320;
export const CELL_H = 270;
export const MAX_DURATION = 4;   // 秒
export const FPS = 10;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * 計算第 cellIndex 格的 crop 視窗座標（含使用者 Offset）。
 */
export const getCellRect = (cellIndex, offsetX, offsetY) => {
  const col = cellIndex % GRID_COLS;
  const row = Math.floor(cellIndex / GRID_COLS);
  const x = clamp(col * CELL_W + offsetX, 0, INPUT_W - CELL_W);
  const y = clamp(row * CELL_H + offsetY, 0, INPUT_H - CELL_H);
  return { x, y, w: CELL_W, h: CELL_H };
};

/**
 * 建立單一格的 FFmpeg 濾鏡鏈：
 * crop(320x270 對應格) → scale(符合 320x270、等比例縮放、不超框)
 * → pad(補透明邊至精確 320x270) → 強制 rgba → fps=10
 */
export const buildCellFilter = (cellIndex, offsetX, offsetY) => {
  const { x, y } = getCellRect(cellIndex, offsetX, offsetY);
  return [
    `crop=${CELL_W}:${CELL_H}:${x}:${y}`,
    `scale=${CELL_W}:${CELL_H}:force_original_aspect_ratio=decrease`,
    `pad=${CELL_W}:${CELL_H}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
    'format=rgba',
    `fps=${FPS}`,
  ].join(',');
};

/**
 * 執行單一格的切割，輸出 APNG，回傳 ArrayBuffer。
 */
export const processCell = async (cellIndex, offsetX, offsetY) => {
  const ffmpeg = await getFFmpeg();
  const outName = `cell_${String(cellIndex + 1).padStart(2, '0')}.png`;
  const vf = buildCellFilter(cellIndex, offsetX, offsetY);

  await ffmpeg.exec([
    '-i', 'input.mp4',
    '-t', String(MAX_DURATION),
    '-vf', vf,
    '-f', 'apng',
    outName,
  ]);

  const data = await ffmpeg.readFile(outName);
  // readFile 回傳 Uint8Array（新版）或 string（base64，舊版）
  let buf = data;
  if (typeof data === 'string') {
    const bin = atob(data);
    buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  }
  return buf;
};

/**
 * 全部處理並打包 ZIP。
 * @param {File} videoFile 上傳的 MP4
 * @param {{x:number,y:number}} offset 網格偏移
 * @param {(info:{done:number,total:number,cell:number,stage:string})=>void} onProgress
 * @returns {Promise<{zip:Blob,count:number}>}
 */
export const processAllAndZip = async (videoFile, offset, onProgress) => {
  const ffmpeg = await getFFmpeg();

  await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));

  const total = GRID_COLS * GRID_ROWS; // 24
  const zip = new JSZip();

  for (let i = 0; i < total; i++) {
    onProgress?.({ done: i, total, cell: i + 1, stage: 'processing' });
    const buf = await processCell(i, offset.x, offset.y);
    const name = `cell_${String(i + 1).padStart(2, '0')}.apng`;
    zip.file(name, buf);
    onProgress?.({ done: i + 1, total, cell: i + 1, stage: 'done' });
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return { zip: blob, count: total };
};
