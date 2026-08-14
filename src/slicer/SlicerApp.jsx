import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Loader2, Scissors, AlertTriangle, Zap } from 'lucide-react';
import { getFFmpeg, onFFmpegEvent } from './FFmpegContext';
import { useSlicer } from './SlicerContext';
import {
  sliceAllCells,
  INPUT_W, INPUT_H, MAX_DURATION, DEFAULT_GRID_COLS, DEFAULT_GRID_ROWS, LINE_TARGET_W, LINE_TARGET_H,
  makeGridLines,
} from './VideoProcessor';

const SlicerApp = ({ onBack }) => {
  const navigate = useNavigate();
  const { clips, setClips, setSourceName } = useSlicer();
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoName, setVideoName] = useState('');
  const [videoSize, setVideoSize] = useState({ w: INPUT_W, h: INPUT_H });
  const [gridCols, setGridCols] = useState(DEFAULT_GRID_COLS);
  const [gridRows, setGridRows] = useState(DEFAULT_GRID_ROWS);
  const [vLines, setVLines] = useState(() => makeGridLines(DEFAULT_GRID_COLS, INPUT_W));
  const [hLines, setHLines] = useState(() => makeGridLines(DEFAULT_GRID_ROWS, INPUT_H));
  const [ffLoading, setFfLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cellProgress, setCellProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null); // { axis:'v'|'h', index:number }
  const processingRef = useRef(false);

  const resetLines = () => {
    setVLines(makeGridLines(gridCols, videoSize.w));
    setHLines(makeGridLines(gridRows, videoSize.h));
  };

  const getPointerPos = (e) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * videoSize.w;
    const y = ((e.clientY - rect.top) / rect.height) * videoSize.h;
    return { x, y };
  };

  const onPointerDown = (axis, index) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { axis, index };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pos = getPointerPos(e);
    if (!pos) return;
    if (drag.axis === 'v') {
      setVLines((lines) => {
        const next = [...lines];
        const min = lines[drag.index - 1] + 4;
        const max = lines[drag.index + 1] - 4;
        next[drag.index] = Math.max(min, Math.min(max, pos.x));
        return next;
      });
    } else {
      setHLines((lines) => {
        const next = [...lines];
        const min = lines[drag.index - 1] + 4;
        const max = lines[drag.index + 1] - 4;
        next[drag.index] = Math.max(min, Math.min(max, pos.y));
        return next;
      });
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  };

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const downloadStatus = (name, received, total) => {
    const done = total > 0 && received >= total;
    const suffix = total > 0 ? ` (${formatBytes(received)}/${formatBytes(total)})` : '';
    return `${done ? '下載完成' : '下載中'} ${name}${suffix}`;
  };

  const handleFile = (file) => {
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setVideoName(file.name);
    setVideoSize({ w: INPUT_W, h: INPUT_H });
    setError('');
    setProgress(0);
    setCellProgress(0);

    // 讀取實際解析度
    const probe = document.createElement('video');
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      if (probe.videoWidth > 0 && probe.videoHeight > 0) {
        setVideoSize({ w: probe.videoWidth, h: probe.videoHeight });
        setVLines(makeGridLines(gridCols, probe.videoWidth));
        setHLines(makeGridLines(gridRows, probe.videoHeight));
      }
      probe.removeAttribute('src');
    };
    probe.src = url;
  };

  const handleLoadFF = useCallback(async () => {
    setFfLoading(true);
    setStatusText('準備載入 FFmpeg...');
    try {
      await ensureFFmpeg();
      setStatusText('FFmpeg 已就緒');
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e?.message || e?.toString?.() || String(e));
      setError(`FFmpeg 載入失敗：${msg}`);
    } finally {
      setFfLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 進入頁面即自動載入 FFmpeg（自動選擇模式）
  useEffect(() => {
    handleLoadFF();
  }, [handleLoadFF]);

  const ensureFFmpeg = async () => {
    onFFmpegEvent(({ type, progress, message, name, received, total }) => {
      if (type === 'ffmpeg-progress') {
        setStatusText(`FFmpeg 編譯中 ${Math.round(progress * 100)}%`);
      } else if (type === 'ffmpeg-download') {
        setStatusText(downloadStatus(name, received, total));
      } else if (type === 'ffmpeg-log' && message && !processingRef.current) {
        setStatusText(message);
      }
    });
    setStatusText('FFmpeg 核心初始化中（首次約需數秒）...');
    await getFFmpeg('auto');
  };

  const handleSlice = async () => {
    if (!videoUrl || processing) return;
    setProcessing(true);
    processingRef.current = true;
    setError('');
    setProgress(0);
    setCellProgress(0);

    try {
      await ensureFFmpeg();
      const file = await fetch(videoUrl).then((r) => r.blob());
      const videoFile = new File([file], videoName || 'video.mp4', { type: 'video/mp4' });
      const result = await sliceAllCells(
        videoFile,
        vLines,
        hLines,
        ({ done, total }) => {
          setCellProgress(done + 1);
          setProgress(total > 0 ? ((done + 1) / total) * 100 : 0);
          setStatusText(`切割第 ${done + 1}/${total} 格...`);
        },
      );
      setClips(result);
      setSourceName(videoName || 'video.mp4');
      setStatusText(`完成！已切割 ${result.length} 支影片，前往自動化處理...`);
      navigate('/slicer-auto');
    } catch (e) {
      const msg = typeof e === 'string' ? e : (e?.message || e?.toString?.() || String(e));
      setError(`切割失敗：${msg}`);
    } finally {
      setProcessing(false);
      processingRef.current = false;
    }
  };

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Scissors size={20} /> 多張動態貼圖製作
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
            目前未啟用 COOP/COEP 跨源隔離，將<strong>自動切換為單執行緒模式</strong>（功能正常，僅較慢）。
            若要使用 SharedArrayBuffer 加速，請於伺服器設定 Header：<code>Cross-Origin-Opener-Policy: same-origin</code> 與 <code>Cross-Origin-Embedder-Policy: require-corp</code> 後重新整理頁面。
          </span>
        </div>
      )}

      {clips.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0,242,254,0.1)', color: 'var(--text-primary)', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
          <Zap size={16} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>已有 {clips.length} 支切割結果，尚未遺失，可直接前往自動化處理。</span>
          <button className="button success btn-uniform" onClick={() => navigate('/slicer-auto')}>
            前往自動化處理
          </button>
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
              <p>上傳 MP4 影片</p>
              <span className="upload-hint">點擊或拖放檔案（支援各種解析度，將自動均分網格）</span>
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
                {/* 可調網格校正線（邊界固定、內部線可拖曳） */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${videoSize.w} ${videoSize.h}`} preserveAspectRatio="none">
                    <rect x="0" y="0" width={videoSize.w} height={videoSize.h} fill="none" stroke="rgba(0,242,254,0.9)" strokeWidth="6" />
                    {vLines.map((x, i) => (
                      <line
                        key={`c${i}`}
                        x1={x} y1="0" x2={x} y2={videoSize.h}
                        stroke={i === 0 || i === vLines.length - 1 ? 'rgba(0,242,254,0.9)' : 'rgba(0,242,254,0.7)'}
                        strokeWidth={i === 0 || i === vLines.length - 1 ? 6 : 12}
                        style={{ cursor: i === 0 || i === vLines.length - 1 ? 'default' : 'ew-resize', pointerEvents: i === 0 || i === vLines.length - 1 ? 'none' : 'all' }}
                        onPointerDown={i === 0 || i === vLines.length - 1 ? undefined : onPointerDown('v', i)}
                      />
                    ))}
                    {hLines.map((y, i) => (
                      <line
                        key={`r${i}`}
                        x1="0" y1={y} x2={videoSize.w} y2={y}
                        stroke={i === 0 || i === hLines.length - 1 ? 'rgba(0,242,254,0.9)' : 'rgba(0,242,254,0.7)'}
                        strokeWidth={i === 0 || i === hLines.length - 1 ? 6 : 12}
                        style={{ cursor: i === 0 || i === hLines.length - 1 ? 'default' : 'ns-resize', pointerEvents: i === 0 || i === hLines.length - 1 ? 'none' : 'all' }}
                        onPointerDown={i === 0 || i === hLines.length - 1 ? undefined : onPointerDown('h', i)}
                      />
                    ))}
                  </svg>
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                {videoName} | 影片 {videoSize.w}x{videoSize.h} | 共 {gridCols}x{gridRows} 格（輸出 {LINE_TARGET_W}x{LINE_TARGET_H}）| 拖曳內部線條微調切割位置
              </div>
            </div>
          )}
        </div>

        {/* 右側：控制項 */}
        <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="control-group">
            <label>網格（寬 × 高）</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="number"
                min="1"
                max="20"
                value={gridCols}
                onChange={(e) => {
                  const cols = Math.min(20, Math.max(1, Number(e.target.value) || DEFAULT_GRID_COLS));
                  setGridCols(cols);
                  setVLines(makeGridLines(cols, videoSize.w));
                }}
                className="text-input"
                style={{ flex: 1 }}
              />
              <span>×</span>
              <input
                type="number"
                min="1"
                max="20"
                value={gridRows}
                onChange={(e) => {
                  const rows = Math.min(20, Math.max(1, Number(e.target.value) || DEFAULT_GRID_ROWS));
                  setGridRows(rows);
                  setHLines(makeGridLines(rows, videoSize.h));
                }}
                className="text-input"
                style={{ flex: 1 }}
              />
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              共 {gridCols}×{gridRows} = {gridCols * gridRows} 格
            </div>
          </div>
          <button className="button secondary btn-uniform" onClick={resetLines}>
            重置網格線
          </button>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            輸出規格：每格縮放至 {LINE_TARGET_W}x{LINE_TARGET_H}、前 {MAX_DURATION} 秒、10 fps、MP4 短影片
          </div>

          <button
            className="button success btn-uniform"
            onClick={handleSlice}
            disabled={processing || ffLoading || !videoUrl}
          >
            {processing ? <><Loader2 size={16} className="spin" /> 切割中...</> : <><Scissors size={16} /> 切割</>}
          </button>

          {processing && (
            <div>
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '0.3rem' }}>
                進度 {cellProgress}/{gridCols * gridRows}（{progress.toFixed(0)}%）
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
