import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Crop } from 'lucide-react';

const RATIO_OPTIONS = [
  { id: 'free', label: '自由裁切' },
  { id: '1:1', label: '1:1' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
  { id: 'custom', label: '自訂比例' },
];

const computeCenteredSelection = (displayW, displayH, ratioVal) => {
  const margin = 0.15;
  const maxW = displayW * (1 - margin);
  const maxH = displayH * (1 - margin);

  let w = maxW * 0.8;
  let h = maxH * 0.8;

  if (ratioVal) {
    if (w / h > ratioVal) {
      w = h * ratioVal;
    } else {
      h = w / ratioVal;
    }
  }

  if (w > maxW) { w = maxW; h = ratioVal ? w / ratioVal : h; }
  if (h > maxH) { h = maxH; w = ratioVal ? h * ratioVal : w; }

  return { x: (displayW - w) / 2, y: (displayH - h) / 2, w, h };
};

const CropModal = ({ imageSrc, frameNumber, onConfirm, onCancel }) => {
  const [ratio, setRatio] = useState('free');
  const [customW, setCustomW] = useState(16);
  const [customH, setCustomH] = useState(9);
  const [isDragging, setIsDragging] = useState(false);
  const [start, setStart] = useState(null);
  const [selection, setSelection] = useState(null);
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [moveOffset, setMoveOffset] = useState(null);
  const [dragMode, setDragMode] = useState(null);
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const wrapperRef = useRef(null);
  const selectionRef = useRef(null);

  const getRatioValue = useCallback(() => {
    if (ratio === 'free') return null;
    if (ratio === 'custom') return customW / customH;
    const [a, b] = ratio.split(':').map(Number);
    return a / b;
  }, [ratio, customW, customH]);

  const initSelection = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const dw = wrapper.getBoundingClientRect().width;
    const dh = wrapper.getBoundingClientRect().height;
    if (dw <= 0 || dh <= 0) return;
    setDisplaySize({ w: dw, h: dh });
    const rv = getRatioValue();
    const s = computeCenteredSelection(dw, dh, rv);
    setSelection(s);
    selectionRef.current = s;
  }, [getRatioValue]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const onLoad = () => {
      setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
      setTimeout(initSelection, 50);
    };
    if (img.complete) onLoad();
    else img.onload = onLoad;
  }, [imageSrc, initSelection]);

  useEffect(() => {
    if (displaySize.w > 0 && displaySize.h > 0) {
      const rv = getRatioValue();
      const s = computeCenteredSelection(displaySize.w, displaySize.h, rv);
      setSelection(s);
      selectionRef.current = s;
    }
  }, [ratio, customW, customH, displaySize]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const getMousePos = (e) => {
    const rect = wrapperRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(e.clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(e.clientY - rect.top, rect.height)),
    };
  };

  const clampResize = (nw, nh, sel, dSize, rv) => {
    let w = Math.max(20, Math.min(nw, dSize.w - sel.x));
    let h = Math.max(20, Math.min(nh, dSize.h - sel.y));
    if (rv) {
      if (w / h > rv) {
        w = h * rv;
      } else {
        h = w / rv;
      }
      w = Math.max(20, Math.min(w, dSize.w - sel.x));
      h = Math.max(20, Math.min(h, dSize.h - sel.y));
    }
    return { w, h };
  };

  const isOnResizeHandle = (pos) => {
    if (!selection) return false;
    const margin = 14;
    return (
      pos.x >= selection.x + selection.w - margin &&
      pos.x <= selection.x + selection.w &&
      pos.y >= selection.y + selection.h - margin &&
      pos.y <= selection.y + selection.h
    );
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    const pos = getMousePos(e);

    if (isOnResizeHandle(pos)) {
      setDragMode('resize');
    } else if (selection && pos.x >= selection.x && pos.x <= selection.x + selection.w &&
        pos.y >= selection.y && pos.y <= selection.y + selection.h) {
      setDragMode('move');
      setMoveOffset({ x: pos.x - selection.x, y: pos.y - selection.y });
    } else {
      setDragMode('create');
      setStart(pos);
    }
    setIsDragging(true);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const pos = getMousePos(e);
    const sel = selectionRef.current;
    if (!sel) return;
    const dSize = displaySize;
    const rv = getRatioValue();

    if (dragMode === 'resize') {
      const clamped = clampResize(pos.x - sel.x, pos.y - sel.y, sel, dSize, rv);
      const updated = { ...sel, w: clamped.w, h: clamped.h };
      setSelection(updated);
    } else if (dragMode === 'move') {
      const dx = pos.x - moveOffset.x;
      const dy = pos.y - moveOffset.y;
      const x = Math.max(0, Math.min(dx, dSize.w - sel.w));
      const y = Math.max(0, Math.min(dy, dSize.h - sel.h));
      setSelection({ ...sel, x, y });
    } else if (dragMode === 'create') {
      let rw = Math.abs(pos.x - start.x);
      let rh = Math.abs(pos.y - start.y);

      if (rv) {
        if (rw / rh > rv) {
          rw = rh * rv;
        } else {
          rh = rw / rv;
        }
      }

      let x = Math.min(start.x, start.x + (pos.x < start.x ? -rw : rw));
      let y = Math.min(start.y, start.y + (pos.y < start.y ? -rh : rh));
      x = Math.max(0, Math.min(x, dSize.w - rw));
      y = Math.max(0, Math.min(y, dSize.h - rh));

      setSelection({ x, y, w: rw, h: rh });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragMode(null);
    setMoveOffset(null);
  };

  const handleConfirm = () => {
    const sel = selectionRef.current;
    if (!sel || sel.w < 5 || sel.h < 5) {
      onCancel();
      return;
    }
    const img = new Image();
    img.onload = () => {
      const dSize = displaySize;
      const scaleX = img.naturalWidth / dSize.w;
      const scaleY = img.naturalHeight / dSize.h;

      const sx = Math.round(sel.x * scaleX);
      const sy = Math.round(sel.y * scaleY);
      const sw = Math.round(sel.w * scaleX);
      const sh = Math.round(sel.h * scaleY);

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      onConfirm({ croppedSrc: canvas.toDataURL('image/png'), crop: { x: sx, y: sy, w: sw, h: sh } });
    };
    img.src = imageSrc;
  };

  return (
    <div className="crop-modal-overlay">
      <div className="crop-modal">
        <div className="crop-modal-header">
          <h3><Crop size={18} /> 裁切圖片 {frameNumber ? `（第 ${frameNumber} 張）` : ''}</h3>
          <button className="crop-close-btn" onClick={onCancel}><X size={20} /></button>
        </div>

        <div className="crop-ratio-bar">
          {RATIO_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`crop-ratio-btn ${ratio === opt.id ? 'active' : ''}`}
              onClick={() => setRatio(opt.id)}
            >
              {opt.label}
            </button>
          ))}
          {ratio === 'custom' && (
            <div className="crop-custom-ratio">
              <input type="number" min="1" max="99" value={customW} onChange={(e) => setCustomW(Number(e.target.value) || 1)} />
              <span>:</span>
              <input type="number" min="1" max="99" value={customH} onChange={(e) => setCustomH(Number(e.target.value) || 1)} />
            </div>
          )}
        </div>

        <div className="crop-image-container" ref={containerRef}>
          <div
            ref={wrapperRef}
            className="crop-image-wrapper"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img ref={imgRef} src={imageSrc} alt="裁切預覽" className="crop-image" draggable={false} />
            {selection && (
              <div
                className={`crop-selection-box ${dragMode === 'move' ? 'moving' : ''} ${dragMode === 'resize' ? 'resizing' : ''}`}
                style={{
                  left: `${selection.x}px`,
                  top: `${selection.y}px`,
                  width: `${selection.w}px`,
                  height: `${selection.h}px`,
                }}
              >
                <div className="crop-resize-handle" />
              </div>
            )}
            {selection && (
              <div
                className="crop-dimension-label"
                style={{
                  left: `${selection.x}px`,
                  top: `${selection.y - 22}px`,
                }}
              >
                {selection.w.toFixed(0)} × {selection.h.toFixed(0)}
              </div>
            )}
          </div>
        </div>

        <div className="crop-modal-footer">
          <button className="button secondary" onClick={onCancel}>取消</button>
          <button className="button" onClick={handleConfirm} disabled={!selection || selection.w < 5}>確認裁切</button>
        </div>
      </div>
    </div>
  );
};

export default CropModal;
