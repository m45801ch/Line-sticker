import React, { useState, useRef } from 'react';
import { ImageIcon, Sparkles, Loader2, Edit3, Undo2, Package, Trash2 } from 'lucide-react';
import FrameEditor from './FrameEditor';

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 0, g: 255, b: 0 };
};

const colorPresets = ['#00FF00', '#0000FF', '#FFFFFF', '#000000'];

const applyChromaKey = (ctx, width, height, settings) => {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const target = hexToRgb(settings.bgColor);
  const tol = settings.tolerance;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dist = Math.sqrt(Math.pow(r - target.r, 2) + Math.pow(g - target.g, 2) + Math.pow(b - target.b, 2));

    if (dist < tol) {
      data[i + 3] = 0;
    } else if (settings.smoothness > 0 && dist < tol + settings.smoothness * 2) {
      const alpha = Math.round(((dist - tol) / (settings.smoothness * 2)) * 255);
      if (alpha < data[i + 3]) data[i + 3] = alpha;
    }

    if (settings.enableDespill && data[i + 3] > 0) {
      const maxRB = Math.max(r, b);
      if (g > maxRB) {
        const spill = g - maxRB;
        if (settings.despillStrength <= 100) {
          data[i + 1] = Math.round(g - spill * (settings.despillStrength / 100));
        } else {
          const baseG = Math.round(g - spill);
          const extraFactor = (settings.despillStrength - 100) / 100;
          data[i + 1] = Math.round(baseG - (baseG - (r + b) / 2) * extraFactor);
        }
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
};

const BgRemover = ({ frames, onFramesProcessed, onGoToStep4 }) => {
  const [bgColor, setBgColor] = useState('#00FF00');
  const [tolerance, setTolerance] = useState(120);
  const [smoothness, setSmoothness] = useState(8);
  const [enableSmartRemoval, setEnableSmartRemoval] = useState(true);
  const [enableDespill, setEnableDespill] = useState(true);
  const [despillStrength, setDespillStrength] = useState(100);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [previewBg, setPreviewBg] = useState('grid');
  const [editTarget, setEditTarget] = useState(null);
  const [deletedIndices, setDeletedIndices] = useState([]);
  const snapshotRef = useRef(null);

  const processAll = async () => {
    if (!frames || frames.length === 0) return;
    snapshotRef.current = results.length > 0 ? [...results] : null;
    setIsProcessing(true);
    await new Promise(r => setTimeout(r, 50));

    const processed = await Promise.all(frames.map((frame) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.drawImage(img, 0, 0);

          if (enableSmartRemoval) {
            applyChromaKey(ctx, canvas.width, canvas.height, {
              bgColor, tolerance, smoothness,
              enableDespill, despillStrength,
            });
          }

          resolve({ ...frame, processedSrc: canvas.toDataURL('image/png') });
        };
        img.src = frame.displaySrc || frame.src;
      });
    }));

    setResults(processed);
    setIsProcessing(false);
    onFramesProcessed?.(processed);
  };

  const getPreviewBgStyle = () => {
    if (previewBg === 'grid') return 'repeating-conic-gradient(#1a1a1a 0% 25%, #222 0% 50%) 50% / 20px 20px';
    return previewBg;
  };

  const handleEditorSave = (editedSrc) => {
    const idx = editTarget;
    if (idx === null) return;

    let updated;
    if (results.length === 0) {
      updated = frames.map((f) => ({
        ...f,
        processedSrc: f.displaySrc || f.src,
      }));
    } else {
      updated = [...results];
    }
    updated[idx] = { ...updated[idx], processedSrc: editedSrc };
    setResults(updated);
    setEditTarget(null);
    onFramesProcessed?.(updated);
  };

  const handleDeleteFrame = (idx) => {
    const newDeleted = [...deletedIndices, idx];
    setDeletedIndices(newDeleted);
    if (results.length > 0) {
      const kept = results.filter((_, i) => !newDeleted.includes(i));
      setResults(kept);
      onFramesProcessed?.(kept);
    }
  };

  const displayList = results.length > 0
    ? results.filter((_, i) => !deletedIndices.includes(i))
    : frames.filter((_, i) => !deletedIndices.includes(i));

  return (
    <>
    <div className="glass-panel">
      <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <ImageIcon size={20} /> 去背
      </h3>

      {(!frames || frames.length === 0) ? (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
          請先回到 Step 2 擷取影格
        </p>
      ) : (
        <div>
          <div className="bg-settings-condensed">
            <div className="bg-settings-row">
              <label className="toggle-unit">
                <span>智慧去背</span>
                <input type="checkbox" className="toggle" checked={enableSmartRemoval} onChange={(e) => setEnableSmartRemoval(e.target.checked)} />
              </label>
              <label className="toggle-unit">
                <span>溢色去除</span>
                <input type="checkbox" className="toggle" checked={enableDespill} onChange={(e) => setEnableDespill(e.target.checked)} />
              </label>
              {enableDespill && (
                <div className="slider-uniform" style={{ maxWidth: '140px' }}>
                  <label>強度 <span>{despillStrength}%</span></label>
                  <input type="range" min="0" max="200" value={despillStrength} onChange={(e) => setDespillStrength(parseInt(e.target.value))} />
                </div>
              )}
              <div className="preview-bg-bar" style={{ marginLeft: 'auto' }}>
                <span>預覽背景：</span>
                {[
                  { id: 'grid', label: '綠色', color: '#00CC00' },
                  { id: 'white', label: '白色', color: '#ffffff' },
                  { id: 'black', label: '黑色', color: '#333333' },
                  { id: 'blue', label: '藍色', color: '#1e90ff' },
                  { id: 'pink', label: '粉紅色', color: '#ff69b4' },
                ].map(bg => (
                  <button key={bg.id} className={`preview-bg-btn ${previewBg === bg.id ? 'active' : ''}`} onClick={() => setPreviewBg(bg.id)}
                    style={{ background: bg.color, color: ['white', 'pink'].includes(bg.id) ? '#000' : '#fff', borderColor: previewBg === bg.id ? 'var(--primary-color)' : 'rgba(255,255,255,0.2)' }}>
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-settings-row">
              <div className="color-picker-unit">
                <label>目標背景色</label>
                <div className="color-picker-row">
                  <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
                  {colorPresets.map(c => (
                    <button key={c} onClick={() => setBgColor(c)} className="color-swatch" style={{ backgroundColor: c, borderColor: bgColor === c ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)' }} />
                  ))}
                </div>
              </div>
              <div className="slider-uniform">
                <label>容差度 <span>{tolerance}</span></label>
                <input type="range" min="0" max="255" value={tolerance} onChange={(e) => setTolerance(parseInt(e.target.value))} />
              </div>
              <div className="slider-uniform">
                <label>平滑度 <span>{smoothness}</span></label>
                <input type="range" min="0" max="20" value={smoothness} onChange={(e) => setSmoothness(parseInt(e.target.value))} />
              </div>
              <div className="btn-group">
                <button className="button success btn-uniform" onClick={processAll} disabled={isProcessing}>
                  {isProcessing ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} 全部去背
                </button>
                {results.length > 0 && (
                  <button className="button secondary btn-uniform" onClick={() => { setResults([]); setEditTarget(null); }}>
                    <Undo2 size={14} /> 復原
                  </button>
                )}
                {results.length > 0 && onGoToStep4 && (
                  <button className="button success btn-uniform" onClick={onGoToStep4}>
                    <Package size={14} /> 打包
                  </button>
                )}
              </div>
            </div>
          </div>

          <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '1rem' }}>
            {results.length > 0 ? `去背結果（${results.length} 張）` : `原始截圖（${frames.length} 張）`}
          </h4>

          <div className="frame-grid">
            {displayList.map((frame, idx) => (
              <div key={idx} className="frame-item" style={{ background: getPreviewBgStyle(), cursor: 'pointer' }} onClick={() => setEditTarget(idx)} title="點擊編輯">
                <img src={results.length > 0 ? frame.processedSrc : (frame.displaySrc || frame.src)} alt={`截圖 ${idx + 1}`} />
                <span className="frame-index">#{idx + 1}</span>
                <button className="frame-delete-btn" onClick={(e) => { e.stopPropagation(); handleDeleteFrame(idx); }} title="刪除">
                  <Trash2 size={12} />
                </button>
                <button className="frame-edit-btn" onClick={(e) => { e.stopPropagation(); setEditTarget(idx); }}>
                  <Edit3 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>

      {editTarget !== null && (
        <FrameEditor
          imageSrc={displayList[editTarget]?.processedSrc || displayList[editTarget]?.displaySrc || displayList[editTarget]?.src}
          previewBg={previewBg}
          onSave={handleEditorSave}
          onCancel={() => setEditTarget(null)}
        />
      )}
    </>
  );
};

export default BgRemover;
