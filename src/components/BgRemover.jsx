import React, { useState, useRef, useEffect } from 'react';
import { ImageIcon, Sparkles, Loader2, Edit3, Undo2, Package, Trash2, Upload, Download, FileArchive } from 'lucide-react';
import JSZip from 'jszip';
import FrameEditor from './FrameEditor';
import { applyChromaKey, autoDetectBgFromImage } from '../utils/chromaKey';

const colorPresets = ['#00FF00', '#0000FF', '#FFFFFF', '#000000'];

const BgRemover = ({ frames, initialResults = [], onFramesProcessed, onGoToStep4, onDeleteAll }) => {
  const [bgColor, setBgColor] = useState('#00FF00');
  const [tolerance, setTolerance] = useState(120);
  const [smoothness, setSmoothness] = useState(8);
  const [enableSmartRemoval, setEnableSmartRemoval] = useState(true);
  const [enableDespill, setEnableDespill] = useState(true);
  const [despillStrength, setDespillStrength] = useState(100);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState(initialResults && initialResults.length > 0 ? initialResults : []);
  const [previewBg, setPreviewBg] = useState('grid');
  const [editTarget, setEditTarget] = useState(null);
  const [deletedIndices, setDeletedIndices] = useState([]);
  const [extraFrames, setExtraFrames] = useState([]);
  const [selected, setSelected] = useState([]);
  const [downloadAll, setDownloadAll] = useState(false);
  const snapshotRef = useRef(null);
  const uploadRef = useRef(null);
  const dragIndexRef = useRef(null);

  const allFrames = frames.length > 0 ? [...frames, ...extraFrames] : extraFrames;

  const autoRanRef = useRef(false);

  // 進入去背頁面（進行去背）時，若智慧去背開啟且尚無結果，自動偵測並去背
  useEffect(() => {
    if (autoRanRef.current) return;
    if (enableSmartRemoval && allFrames.length > 0 && results.length === 0) {
      autoRanRef.current = true;
      processAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFrames.length, enableSmartRemoval]);

  const handleUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const added = files.map((file, i) => {
      const url = URL.createObjectURL(file);
      return { src: url, displaySrc: url, time: i, uploaded: true };
    });
    const newExtra = [...extraFrames, ...added];
    setExtraFrames(newExtra);

    if (results.length > 0) {
      const updated = [...results, ...added.map((f) => ({ ...f, processedSrc: f.displaySrc || f.src }))];
      setResults(updated);
      onFramesProcessed?.(updated);
    } else {
      const base = displayList;
      const combined = [...base, ...added];
      onFramesProcessed?.(combined.map((f) => ({ ...f, processedSrc: f.displaySrc || f.src })));
    }
    setEditTarget(null);
    e.target.value = '';
  };

  const processAll = async () => {
    const sourceFrames = displayList.map((f) => ({ ...f, src: f.displaySrc || f.src }));
    if (!sourceFrames || sourceFrames.length === 0) return;
    snapshotRef.current = results.length > 0 ? [...results] : null;
    setIsProcessing(true);
    await new Promise(r => setTimeout(r, 50));

    // 智慧去背開啟時，先自動偵測參數
    let settings = { bgColor, tolerance, smoothness, enableDespill, despillStrength };
    if (enableSmartRemoval) {
      const first = sourceFrames[0];
      try {
        const detected = await autoDetectBgFromImage(first.displaySrc || first.src);
        setBgColor(detected.bgColor);
        setTolerance(detected.tolerance);
        setSmoothness(detected.smoothness);
        setEnableDespill(detected.enableDespill);
        setDespillStrength(detected.despillStrength);
        settings = {
          bgColor: detected.bgColor,
          tolerance: detected.tolerance,
          smoothness: detected.smoothness,
          enableDespill: detected.enableDespill,
          despillStrength: detected.despillStrength,
        };
      } catch {
        // 偵測失敗則沿用預設值
      }
    }

    const processed = await Promise.all(sourceFrames.map((frame) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.drawImage(img, 0, 0);

          applyChromaKey(ctx, canvas.width, canvas.height, settings);

          resolve({ ...frame, processedSrc: canvas.toDataURL('image/png') });
        };
        img.src = frame.displaySrc || frame.src;
      });
    }));

    setResults(processed);
    setDeletedIndices([]);
    setIsProcessing(false);
    onFramesProcessed?.(processed);
  };

  const getPreviewBgStyle = () => {
    if (previewBg === 'grid') return 'repeating-conic-gradient(#e8e8e8 0% 25%, #d8d8d8 0% 50%) 50% / 20px 20px';
    return previewBg;
  };

  const handleEditorSave = (editedSrc) => {
    const idx = editTarget;
    if (idx === null) return;

    let updated;
    if (results.length === 0) {
      updated = allFrames.map((f) => ({
        ...f,
        processedSrc: f.displaySrc || f.src,
      }));
    } else {
      updated = [...results];
    }

    if (editedSrc && editedSrc.allSrcs) {
      editedSrc.allSrcs.forEach((src, i) => {
        if (updated[i]) updated[i] = { ...updated[i], processedSrc: src };
      });
    } else {
      updated[idx] = { ...updated[idx], processedSrc: editedSrc };
    }

    setResults(updated);
    setEditTarget(null);
    onFramesProcessed?.(updated);
  };

  const handleDeleteFrame = (idx) => {
    if (results.length > 0) {
      const kept = results.filter((_, i) => i !== idx);
      setResults(kept);
      setDeletedIndices([]);
      setSelected([]);
      onFramesProcessed?.(kept);
    } else {
      const newDeleted = [...deletedIndices, idx];
      setDeletedIndices(newDeleted);
      setSelected((prev) => prev.filter((i) => i !== idx).map((i) => (i > idx ? i - 1 : i)));
    }
  };

  const toggleSelect = (idx) => {
    setSelected((prev) => prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]);
  };

  const handleDeleteSelected = () => {
    if (selected.length === 0) return;
    if (results.length > 0) {
      const kept = results.filter((_, i) => !selected.includes(i));
      setResults(kept);
      setDeletedIndices([]);
      setSelected([]);
      onFramesProcessed?.(kept);
    } else {
      const source = allFrames;
      const origIndices = [];
      let displayIdx = 0;
      for (let i = 0; i < source.length; i++) {
        if (deletedIndices.includes(i)) continue;
        if (selected.includes(displayIdx)) origIndices.push(i);
        displayIdx++;
      }
      const newDeleted = [...new Set([...deletedIndices, ...origIndices])];
      setDeletedIndices(newDeleted);
      setSelected([]);
    }
  };

  const handleDeleteAll = () => {
    setExtraFrames([]);
    setResults([]);
    setDeletedIndices([]);
    setSelected([]);
    setEditTarget(null);
    onDeleteAll?.();
  };

  const handleReorder = (from, to) => {
    if (from === to) return;
    if (results.length > 0) {
      const arr = [...results];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      setResults(arr);
      onFramesProcessed?.(arr);
    } else {
      const arr = [...displayList];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      const converted = arr.map((f) => ({ ...f, processedSrc: f.displaySrc || f.src }));
      setResults(converted);
      setDeletedIndices([]);
      onFramesProcessed?.(converted);
    }
  };

  const displayList = results.length > 0
    ? results.filter((_, i) => !deletedIndices.includes(i))
    : allFrames.filter((_, i) => !deletedIndices.includes(i));

  const TAB_W = 96;
  const TAB_H = 74;
  const LINE_W = 320;
  const LINE_H = 270;

  const frameSrc = (frame) => frame.processedSrc || frame.displaySrc || frame.src;

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

  const downloadSelected = async (mode) => {
    const chosen = (downloadAll ? displayList.map((_, i) => i) : selected).slice().sort((a, b) => a - b);
    if (chosen.length === 0) return;
    const isOriginal = mode === 'original';
    const suffix = mode === 'tab' ? 'tab' : mode === 'line' ? '320x270' : '';

    const buildSrc = async (frame) => {
      if (isOriginal) return frameSrc(frame);
      const size = mode === 'tab' ? { w: TAB_W, h: TAB_H } : { w: LINE_W, h: LINE_H };
      return resizeFrame(frameSrc(frame), size.w, size.h);
    };

    if (chosen.length === 1) {
      const src = await buildSrc(displayList[chosen[0]]);
      const a = document.createElement('a');
      a.href = src;
      a.download = `bg-${String(chosen[0] + 1).padStart(2, '0')}${suffix ? `-${suffix}` : ''}.png`;
      a.click();
      return;
    }

    const zip = new JSZip();
    for (const idx of chosen) {
      const frame = displayList[idx];
      if (!frame) continue;
      const src = await buildSrc(frame);
      const blob = await (await fetch(src)).blob();
      zip.file(`bg-${String(idx + 1).padStart(2, '0')}${suffix ? `-${suffix}` : ''}.png`, blob);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bg-frames${suffix ? `-${suffix}` : ''}-${chosen.length}張.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
    <div className="glass-panel">
      <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <ImageIcon size={20} /> 去背
      </h3>

      {(!allFrames || allFrames.length === 0) ? (
        <div>
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>
            請先回到 Step 2 擷取影格，或上傳自己的圖片
          </p>
          <div style={{ textAlign: 'center', paddingBottom: '1.5rem' }}>
            <button className="button" onClick={() => uploadRef.current?.click()}>
              <Upload size={16} /> 上傳圖片
            </button>
          </div>
          <input ref={uploadRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUpload} />
        </div>
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
                  <input type="range" min="0" max="200" value={despillStrength} onChange={(e) => { setDespillStrength(parseInt(e.target.value)); setEnableSmartRemoval(false); }} />
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
                <input type="range" min="0" max="255" value={tolerance} onChange={(e) => { setTolerance(parseInt(e.target.value)); setEnableSmartRemoval(false); }} />
              </div>
              <div className="slider-uniform">
                <label>平滑度 <span>{smoothness}</span></label>
                <input type="range" min="0" max="20" value={smoothness} onChange={(e) => { setSmoothness(parseInt(e.target.value)); setEnableSmartRemoval(false); }} />
              </div>
              <div className="btn-group">
                <button className="button btn-uniform" onClick={() => uploadRef.current?.click()}>
                  <Upload size={14} /> 上傳圖片
                </button>
                <button className="button success btn-uniform" onClick={processAll} disabled={isProcessing}>
                  {isProcessing ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} 全部去背
                </button>
                {results.length > 0 && (
                  <button className="button secondary btn-uniform" onClick={() => { setResults([]); setEditTarget(null); }}>
                    <Undo2 size={14} /> 復原
                  </button>
                )}
                {(results.length > 0 || allFrames.length > 0) && onGoToStep4 && (
                  <button className="button success btn-uniform" onClick={onGoToStep4}>
                    <Package size={14} /> 打包
                  </button>
                )}
              </div>
            </div>
          </div>
          <input ref={uploadRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleUpload} />

          <h4 style={{ marginBottom: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '1rem' }}>
            {results.length > 0 ? `去背結果（${results.length} 張）` : `原始截圖（${allFrames.length} 張）`}
          </h4>

          <div className="frame-toolbar">
            <div className="action-row" style={{ marginLeft: 'auto', gap: '0.5rem' }}>
              <div className="toggle-unit">
                <span>下載全部</span>
                <button className={`toggle-switch ${downloadAll ? 'on' : ''}`} onClick={() => setDownloadAll(!downloadAll)}>
                  <div className="toggle-knob" />
                </button>
              </div>
              {!downloadAll && selected.length > 0 && (
                <span className="frame-count-text">已選 {selected.length} 張</span>
              )}
              <button className="button btn-uniform" onClick={() => downloadSelected('original')} disabled={selected.length === 0 && !downloadAll}>
                <FileArchive size={16} /> 下載原圖尺寸
              </button>
              <button className="button btn-uniform" onClick={() => downloadSelected('tab')} disabled={selected.length === 0 && !downloadAll}>
                <Download size={16} /> 下載 tab (96x74)
              </button>
              <button className="button btn-uniform" onClick={() => downloadSelected('line')} disabled={selected.length === 0 && !downloadAll}>
                <Download size={16} /> 下載 320x270
              </button>
              <button className="button btn-uniform" onClick={handleDeleteSelected} disabled={selected.length === 0}>
                <Trash2 size={16} /> 刪除所選
              </button>
              <button className="button btn-uniform" onClick={handleDeleteAll}>
                <Trash2 size={16} /> 刪除全部
              </button>
            </div>
          </div>

          <div className="frame-grid">
            {displayList.map((frame, idx) => (
              <div
                key={idx}
                className={`frame-item ${selected.includes(idx) ? 'selected' : ''}`}
                style={{ background: getPreviewBgStyle(), cursor: 'pointer' }}
                onClick={() => toggleSelect(idx)}
                title="點擊選取，拖曳排序"
                draggable
                onDragStart={() => { dragIndexRef.current = idx; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleReorder(dragIndexRef.current, idx); dragIndexRef.current = null; }}
              >
                <div className="frame-select-box" onClick={(e) => { e.stopPropagation(); toggleSelect(idx); }}>
                  <input type="checkbox" checked={selected.includes(idx)} onChange={() => toggleSelect(idx)} />
                </div>
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
          frameNumber={editTarget + 1}
          allFrameSrcs={displayList.map((f) => f.processedSrc || f.displaySrc || f.src)}
          onSave={handleEditorSave}
          onCancel={() => setEditTarget(null)}
        />
      )}
    </>
  );
};

export default BgRemover;
