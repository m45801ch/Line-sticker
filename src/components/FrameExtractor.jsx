import React, { useState, useRef } from 'react';
import { Video, Loader2, Trash2, Crop, Undo2, ImageIcon, Download, FileArchive } from 'lucide-react';
import JSZip from 'jszip';
import CropModal from './CropModal';

const applyCropToImage = (src, crop) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = crop.w;
      canvas.height = crop.h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = src;
  });
};

const FrameExtractor = ({ videoUrl, videoName, duration, onFramesExtracted, onGoToStep3 }) => {
  const [frameCount, setFrameCount] = useState(20);
  const [extracting, setExtracting] = useState(false);
  const [frames, setFrames] = useState([]);
  const [progress, setProgress] = useState(0);
  const [unifiedCrop, setUnifiedCrop] = useState(false);
  const [cropTarget, setCropTarget] = useState(null);
  const [selected, setSelected] = useState([]);
  const videoRef = useRef(null);

  const extractFrames = () => {
    if (!videoUrl || duration <= 0) return;
    setExtracting(true);
    setProgress(0);
    setFrames([]);

    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';

    video.onloadedmetadata = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const results = [];
      const interval = duration / frameCount;

      let currentTime = 0;
      let captured = 0;

      video.onseeked = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const src = canvas.toDataURL('image/png');
        results.push({ src, displaySrc: src, time: currentTime });
        captured++;
        setProgress(Math.round((captured / frameCount) * 100));

        if (captured < frameCount) {
          currentTime += interval;
          video.currentTime = currentTime;
        } else {
          setFrames(results);
          setExtracting(false);
          setProgress(100);
          onFramesExtracted?.(results);
        }
      };

      video.currentTime = 0;
    };
  };

  const handleDelete = (idx) => {
    const updated = frames.filter((_, i) => i !== idx);
    setFrames(updated);
    setSelected((prev) => prev.filter((i) => i !== idx).map((i) => (i > idx ? i - 1 : i)));
    onFramesExtracted?.(updated);
  };

  const handleUndo = (idx) => {
    const updated = frames.map((f, i) =>
      i === idx ? { ...f, displaySrc: f.src } : f
    );
    setFrames(updated);
    onFramesExtracted?.(updated);
  };

  const handleCropComplete = async ({ croppedSrc, crop }) => {
    const idx = cropTarget;
    if (idx === null) return;

    if (unifiedCrop) {
      const updated = await Promise.all(frames.map(async (f) => {
        const newSrc = await applyCropToImage(f.src, crop);
        return { ...f, displaySrc: newSrc };
      }));
      setFrames(updated);
      onFramesExtracted?.(updated);
    } else {
      const updated = frames.map((f, i) =>
        i === idx ? { ...f, displaySrc: croppedSrc } : f
      );
      setFrames(updated);
      onFramesExtracted?.(updated);
    }
    setCropTarget(null);
  };

  const downloadSingle = (idx) => {
    const frame = frames[idx];
    if (!frame) return;
    const a = document.createElement('a');
    a.href = frame.displaySrc;
    a.download = `frame-${String(idx + 1).padStart(2, '0')}.png`;
    a.click();
  };

  const TAB_W = 96;
  const TAB_H = 74;
  const LINE_W = 320;
  const LINE_H = 270;

  const resizeFrame = (src, w, h) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });

  const fileName = (idx, suffix) => `frame-${String(idx + 1).padStart(2, '0')}${suffix ? `-${suffix}` : ''}.png`;

  const downloadSelected = async (mode) => {
    if (selected.length === 0) return;
    const chosen = selected.slice().sort((a, b) => a - b);
    const isOriginal = mode === 'original';
    const suffix = mode === 'tab' ? 'tab' : mode === 'line' ? '320x270' : '';

    const buildSrc = async (frame) => {
      if (isOriginal) return frame.displaySrc;
      const size = mode === 'tab' ? { w: TAB_W, h: TAB_H } : { w: LINE_W, h: LINE_H };
      return resizeFrame(frame.displaySrc, size.w, size.h);
    };

    if (chosen.length === 1) {
      const frame = frames[chosen[0]];
      if (!frame) return;
      const src = await buildSrc(frame, chosen[0]);
      const a = document.createElement('a');
      a.href = src;
      a.download = fileName(chosen[0], suffix);
      a.click();
      return;
    }

    const zip = new JSZip();
    for (const idx of chosen) {
      const frame = frames[idx];
      if (!frame) continue;
      const src = await buildSrc(frame, idx);
      const blob = await (await fetch(src)).blob();
      zip.file(fileName(idx, suffix), blob);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frames${suffix ? `-${suffix}` : ''}-${chosen.length}張.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSelected = () => downloadSelected('original');
  const handleDownloadTabSelected = () => downloadSelected('tab');
  const handleDownloadLineSelected = () => downloadSelected('line');

  const toggleSelect = (idx) => {
    setSelected((prev) => prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]);
  };

  const getTimeLabel = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
    <div className="glass-panel">
      <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Video size={20} /> 擷取影格
      </h3>

      <div className="extract-layout">
        <div className="extract-video">
          {videoUrl && (
            <video ref={videoRef} src={videoUrl} controls style={{ width: '100%', borderRadius: '0.5rem', background: '#000', maxHeight: '250px' }} />
          )}
        </div>

        <div className="extract-controls">
          <div className="action-row" style={{ alignItems: 'flex-end' }}>
            <div className="control-group" style={{ flex: 1 }}>
              <label>擷取張數</label>
              <div className="number-input-unit">
                <button className="num-btn" onClick={() => setFrameCount(Math.max(1, frameCount - 1))} disabled={extracting}>−</button>
                <input type="number" min="1" max="48" value={frameCount} onChange={(e) => setFrameCount(Math.min(48, Math.max(1, Number(e.target.value) || 1)))} disabled={extracting} />
                <button className="num-btn" onClick={() => setFrameCount(Math.min(48, frameCount + 1))} disabled={extracting}>+</button>
                <input type="range" min="1" max="48" value={frameCount} onChange={(e) => setFrameCount(Number(e.target.value))} disabled={extracting} className="inline-slider" />
                <span className="frame-count-badge">{frameCount} 張</span>
              </div>
            </div>
            <button className="button btn-uniform" onClick={extractFrames} disabled={extracting || !videoUrl}>
              {extracting ? <><Loader2 size={16} className="spin" /> {progress}%</> : <>開始抽幀</>}
            </button>
          </div>

          {extracting && (
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="extract-footer">
            <span className="video-name-label" title={videoName}>{videoName || ''}</span>
            {frames.length > 0 && (
              <div className="action-row" style={{ marginLeft: 'auto' }}>
                <div className="toggle-unit">
                  <span>統一裁切</span>
                  <button className={`toggle-switch ${unifiedCrop ? 'on' : ''}`} onClick={() => { const next = !unifiedCrop; setUnifiedCrop(next); if (next && frames.length > 0) setCropTarget(0); }}>
                    <div className="toggle-knob" />
                  </button>
                </div>
                <button className="button success btn-uniform" onClick={onGoToStep3}>
                  <ImageIcon size={16} /> 進行去背
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {frames.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <div className="frame-toolbar">
            <span className="frame-count-text">共 {frames.length} 張影格</span>
            <div className="action-row" style={{ marginLeft: 'auto', gap: '0.5rem' }}>
              {selected.length > 0 && (
                <span className="frame-count-text">已選 {selected.length} 張</span>
              )}
              <button className="button btn-uniform" onClick={handleDownloadSelected} disabled={selected.length === 0}>
                <FileArchive size={16} /> 下載原圖尺寸
              </button>
              <button className="button btn-uniform" onClick={handleDownloadTabSelected} disabled={selected.length === 0}>
                <Download size={16} /> 下載 tab (96x74)
              </button>
              <button className="button btn-uniform" onClick={handleDownloadLineSelected} disabled={selected.length === 0}>
                <Download size={16} /> 下載 320x270
              </button>
            </div>
          </div>

          <div className="frame-grid">
            {frames.map((frame, idx) => (
              <div key={idx} className={`frame-item ${selected.includes(idx) ? 'selected' : ''}`}>
                <div className="frame-select-box" onClick={(e) => { e.stopPropagation(); toggleSelect(idx); }}>
                  <input type="checkbox" checked={selected.includes(idx)} onChange={() => toggleSelect(idx)} />
                </div>
                <img src={frame.displaySrc} alt={`影格 ${idx + 1}`} onClick={() => toggleSelect(idx)} style={{ cursor: 'pointer' }} />
                <span className="frame-time">{getTimeLabel(frame.time)}</span>
                <span className="frame-index">#{idx + 1}</span>
                <button className="frame-delete-btn" onClick={() => handleDelete(idx)} title="刪除">
                  <Trash2 size={12} />
                </button>
                {frame.displaySrc !== frame.src && (
                  <button className="frame-undo-btn" onClick={() => handleUndo(idx)} title="復原">
                    <Undo2 size={12} />
                  </button>
                )}
                <button className="frame-crop-btn" onClick={() => setCropTarget(idx)} title="裁切">
                  <Crop size={12} />
                </button>
                <button className="frame-download-btn" onClick={() => downloadSingle(idx)} title="下載">
                  <Download size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>

      {cropTarget !== null && (
        <CropModal
          imageSrc={frames[cropTarget]?.src}
          onConfirm={handleCropComplete}
          onCancel={() => setCropTarget(null)}
        />
      )}
    </>
  );
};

export default FrameExtractor;
