import React, { useState, useRef, useCallback } from 'react';
import { Upload, Film, Play, Download, Loader2, Scissors, AlertTriangle } from 'lucide-react';
import { getFFmpeg, onFFmpegEvent, releaseFFmpeg } from './FFmpegContext';
import {
  processAllAndZip, GRID_COLS, GRID_ROWS, CELL_W, CELL_H, INPUT_W, INPUT_H,
} from './VideoProcessor';

const SlicerApp = ({ onBack }) => {
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoName, setVideoName] = useState('');
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [ffLoading, setFfLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cellProgress, setCellProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setVideoName(file.name);
    setError('');
    setProgress(0);
    setCellProgress(0);
  };

  const handleLoadFF = useCallback(async () => {
    setFfLoading(true);
    setStatusText('載入 FFmpeg WASM...');
    onFFmpegEvent(({ type, progress, message }) => {
      if (type === 'ffmpeg-progress') {
        setStatusText(`FFmpeg 載入中 ${Math.round(progress * 100)}%`);
      } else if (type === 'ffmpeg-log' && message) {
        setStatusText(message);
      }
    });
    try {
      await getFFmpeg();
      setStatusText('FFmpeg 已就緒');
    } catch (e) {
      setError(`FFmpeg 載入失敗：${e.message}`);
    } finally {
      setFfLoading(false);
    }
  }, []);

  const handleProcess = async () => {
    if (!videoUrl || processing) return;
    setProcessing(true);
    setError('');
    setProgress(0);
    setCellProgress(0);

    try {
      const file = await fetch(videoUrl).then((r) => r.blob());
      const videoFile = new File([file], videoName || 'video.mp4', { type: 'video/mp4' });
      const result = await processAllAndZip(
        videoFile,
        { x: offsetX, y: offsetY },
        ({ done, total, stage }) => {
          setCellProgress(done);
          setProgress(total > 0 ? (done / total) * 100 : 0);
          setStatusText(stage === 'processing' ? `處理第 ${done + 1}/${total} 格...` : '');
        },
      );

      const a = document.createElement('a');
      a.href = URL.createObjectURL(result.zip);
      a.download = 'line-dynamic-stickers.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setStatusText(`完成！已打包 ${result.count} 個 APNG 檔案`);
    } catch (e) {
      setError(`處理失敗：${e.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // 影片顯示尺寸（用於對齊網格覆蓋層）
  const gridRatio = INPUT_H / INPUT_W;

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Scissors size={20} /> 動態貼圖切割
        </h3>
        {onBack && (
          <button className="button secondary btn-uniform" onClick={onBack}>← 返回</button>
        )}
      </div>

      {!navigator.userAgent && null}
      {typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,165,0,0.12)', color: '#b26a00', padding: '0.6rem 0.9rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.8rem' }}>
          <AlertTriangle size={15} />
          <span>
            目前未啟用 COOP/COEP 跨源隔離，FFmpeg 將以單執行緒模式運作。
            若要使用 SharedArrayBuffer 加速，請於伺服器設定 Header：<code>Cross-Origin-Opener-Policy: same-origin</code> 與 <code>Cross-Origin-Embedder-Policy: require-corp</code>。
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
        {/* 左側：上傳 + 預覽 */}
        <div style={{ flex: '1', minWidth: '320px' }}>
          {!videoUrl ? (
            <div
              className="upload-zone"
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: '3rem 1.5rem', cursor: 'pointer' }}
            >
              <Upload size={40} className="upload-icon" />
              <p>上傳 1920x1080 MP4 影片</p>
              <span className="upload-hint">點擊或拖放檔案（建議解析度 1920x1080）</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files[0])}
              />
            </div>
          ) : (
            <div>
              <div style={{ position: 'relative', display: 'inline-block', width: '100%', maxWidth: '640px' }}>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  style={{ width: '100%', borderRadius: '0.5rem', background: '#000', display: 'block' }}
                />
                {/* 6x4 網格校正線 */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  <svg width="100%" height="100%" viewBox={`0 0 ${INPUT_W} ${INPUT_H}`} preserveAspectRatio="none">
                    <rect x="0" y="0" width={INPUT_W} height={INPUT_H} fill="none" stroke="rgba(0,242,254,0.9)" strokeWidth="6" />
                    {Array.from({ length: GRID_COLS + 1 }, (_, i) => (
                      <line key={`c${i}`} x1={i * CELL_W + offsetX} y1="0" x2={i * CELL_W + offsetX} y2={INPUT_H} stroke="rgba(0,242,254,0.7)" strokeWidth="4" />
                    ))}
                    {Array.from({ length: GRID_ROWS + 1 }, (_, i) => (
                      <line key={`r${i}`} x1="0" y1={i * CELL_H + offsetY} x2={INPUT_W} y2={i * CELL_H + offsetY} stroke="rgba(0,242,254,0.7)" strokeWidth="4" />
                    ))}
                  </svg>
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                {videoName} | 每格 {CELL_W}x{CELL_H}，共 {GRID_COLS}x{GRID_ROWS} 格
              </div>
            </div>
          )}
        </div>

        {/* 右側：控制項 */}
        <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="control-group">
            <label>網格偏移 X（px）</label>
            <input
              type="number"
              value={offsetX}
              onChange={(e) => setOffsetX(Number(e.target.value) || 0)}
              className="text-input"
            />
          </div>
          <div className="control-group">
            <label>網格偏移 Y（px）</label>
            <input
              type="number"
              value={offsetY}
              onChange={(e) => setOffsetY(Number(e.target.value) || 0)}
              className="text-input"
            />
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            輸出規格：每格 ≤ 320x270、10 fps、前 4 秒、APNG（自動補透明邊，不拉伸變形）
          </div>

          <button className="button btn-uniform" onClick={handleLoadFF} disabled={ffLoading}>
            {ffLoading ? <><Loader2 size={16} className="spin" /> 載入中</> : <><Play size={16} /> 載入 FFmpeg</>}
          </button>

          <button
            className="button success btn-uniform"
            onClick={handleProcess}
            disabled={processing || ffLoading || !videoUrl}
          >
            {processing ? <><Loader2 size={16} className="spin" /> 處理中...</> : <><Download size={16} /> 全部處理並打包下載</>}
          </button>

          {processing && (
            <div>
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.3rem' }}>
                進度 {cellProgress}/24（{progress.toFixed(0)}%）
              </div>
            </div>
          )}

          {statusText && !processing && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{statusText}</div>
          )}
          {error && (
            <div style={{ fontSize: '0.8rem', color: '#d32f2f' }}>{error}</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SlicerApp;
