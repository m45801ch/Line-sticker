import React, { useState, useRef, useEffect } from 'react';
import { X, Wand2, Eraser, Undo2, Save, Pipette } from 'lucide-react';

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 0, g: 255, b: 0 };
};

const rgbToHex = (r, g, b) => {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
};

const previewBgMap = {
  grid: 'repeating-conic-gradient(#1a1a1a 0% 25%, #222 0% 50%) 50% / 20px 20px',
  white: '#ffffff',
  black: '#000000',
  blue: '#1e90ff',
  pink: '#ffb6c1',
};

const applyChromaKey = (ctx, width, height, targetRGB, tolerance, smoothness) => {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dist = Math.sqrt(
      Math.pow(r - targetRGB.r, 2) +
      Math.pow(g - targetRGB.g, 2) +
      Math.pow(b - targetRGB.b, 2)
    );

    if (dist < tolerance) {
      data[i + 3] = 0;
    } else if (smoothness > 0 && dist < tolerance + smoothness * 2) {
      const alpha = Math.round(((dist - tolerance) / (smoothness * 2)) * 255);
      if (alpha < data[i + 3]) data[i + 3] = alpha;
    }
  }
  ctx.putImageData(imageData, 0, 0);
};

const DEFAULT_COLOR = { r: 0, g: 255, b: 0 };

const FrameEditor = ({ imageSrc, previewBg = 'grid', onSave, onCancel }) => {
  const [tool, setTool] = useState('wand');
  const [brushSize, setBrushSize] = useState(20);
  const [tolerance, setTolerance] = useState(120);
  const [smoothness, setSmoothness] = useState(8);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState([]);
  const [selectedColor, setSelectedColor] = useState(DEFAULT_COLOR);
  const [mousePos, setMousePos] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const dragStartRef = useRef(null);
  const panStartRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      saveState();
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHistory(prev => [...prev, canvas.toDataURL()]);
  };

  const handleUndo = () => {
    if (history.length < 2) return;
    const newHistory = history.slice(0, -1);
    setHistory(newHistory);
    const prev = newHistory[newHistory.length - 1];
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
    };
    img.src = prev;
  };

  const getCanvasPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const displayW = rect.width / zoom;
    const displayH = rect.height / zoom;
    const scaleX = canvas.width / displayW;
    const scaleY = canvas.height / displayH;
    const offsetX = (rect.width - displayW) / 2 - panX;
    const offsetY = (rect.height - displayH) / 2 - panY;
    return {
      x: Math.round(((e.clientX - rect.left) - offsetX) * scaleX),
      y: Math.round(((e.clientY - rect.top) - offsetY) * scaleY),
    };
  };

  const handleMouseDown = (e) => {
    if (tool === 'eraser') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pos = getCanvasPos(e);
      const ctx = canvas.getContext('2d');
      saveState();
      setIsDrawing(true);
      eraseAt(ctx, pos.x, pos.y);
      return;
    }
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { x: panX, y: panY };
  };

  const handleMouseMove = (e) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (rect) {
      setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    if (tool === 'eraser' && isDrawing) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const pos = getCanvasPos(e);
      const ctx = canvas.getContext('2d');
      eraseAt(ctx, pos.x, pos.y);
      return;
    }
    if (tool !== 'eraser' && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setPanX(panStartRef.current.x + dx);
        setPanY(panStartRef.current.y + dy);
      }
    }
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setIsDrawing(false);
    dragStartRef.current = null;
  };

  const handleMouseUp = (e) => {
    setIsDrawing(false);
    if (tool !== 'eraser' && dragStartRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      dragStartRef.current = null;
      if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const pos = getCanvasPos(e);
        const ctx = canvas.getContext('2d');
        if (tool === 'pipette') {
          const pixel = ctx.getImageData(pos.x, pos.y, 1, 1).data;
          setSelectedColor({ r: pixel[0], g: pixel[1], b: pixel[2] });
        } else if (tool === 'wand') {
          saveState();
          const pixel = ctx.getImageData(pos.x, pos.y, 1, 1).data;
          const target = { r: pixel[0], g: pixel[1], b: pixel[2] };
          setSelectedColor(target);
          applyChromaKey(ctx, canvas.width, canvas.height, target, tolerance, smoothness);
        }
      }
    }
  };

  const eraseAt = (ctx, x, y) => {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  const handleSave = () => {
    onSave(canvasRef.current?.toDataURL('image/png'));
  };

  const colorHex = rgbToHex(selectedColor.r, selectedColor.g, selectedColor.b);
  const bgStyle = previewBgMap[previewBg] || previewBgMap.grid;

  return (
    <div className="crop-modal-overlay">
      <div className="frame-editor">
        <div className="frame-editor-header">
          <h3>單張去背編輯器</h3>
          <button className="crop-close-btn" onClick={onCancel}><X size={20} /></button>
        </div>

        <div className="frame-editor-toolbar">
          <button className={`editor-tool-btn ${tool === 'pipette' ? 'active' : ''}`} onClick={() => setTool('pipette')} title="吸管">
            <Pipette size={16} /> 吸管
          </button>
          <button className={`editor-tool-btn ${tool === 'wand' ? 'active' : ''}`} onClick={() => setTool('wand')} title="魔術棒">
            <Wand2 size={16} /> 魔術棒
          </button>
          <button className={`editor-tool-btn ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')} title="橡皮擦">
            <Eraser size={16} /> 橡皮擦
          </button>

          {tool === 'eraser' && (
            <div className="editor-brush-size">
              <span>筆刷</span>
              <input type="range" min="5" max="100" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
              <span className="brush-size-badge">{brushSize}px</span>
            </div>
          )}

          <div className="editor-separator" />

          {(tool === 'pipette' || tool === 'wand') && (
            <>
              <div className="editor-slider-group">
                <label>容差度 <span>{tolerance}</span></label>
                <input type="range" min="0" max="255" value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
              </div>
              <div className="editor-slider-group">
                <label>平滑度 <span>{smoothness}</span></label>
                <input type="range" min="0" max="20" value={smoothness} onChange={(e) => setSmoothness(Number(e.target.value))} />
              </div>
            </>
          )}

          <div className="editor-sampled-color" title={`rgb(${selectedColor.r},${selectedColor.g},${selectedColor.b})`}>
            <span style={{ background: colorHex, width: '1.2rem', height: '1.2rem', borderRadius: '3px', display: 'inline-block', border: '1px solid rgba(255,255,255,0.3)' }} />
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{colorHex}</span>
          </div>

          <div className="editor-separator" />
          <div className="editor-zoom-controls">
            <button className="zoom-btn" onClick={() => setZoom(z => Math.max(0.3, z - 0.2))}>−</button>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <button className="zoom-btn" onClick={() => setZoom(z => Math.min(5, z + 0.2))}>+</button>
            <button className="zoom-btn zoom-reset" onClick={() => { setZoom(1); setPanX(0); setPanY(0); }} title="重置位置與縮放">⟲</button>
          </div>
          <button className="editor-undo-btn" onClick={handleUndo} disabled={history.length < 2} title="復原">
            <Undo2 size={16} /> 復原
          </button>
        </div>

        <div className="frame-editor-canvas-wrap" style={{ background: bgStyle }}>
          <div ref={viewportRef} className="canvas-viewport">
            <canvas
              ref={canvasRef}
              className="frame-editor-canvas"
              style={{
                cursor: tool === 'wand' ? 'crosshair' : tool === 'eraser' ? 'none' : 'crosshair',
                transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            />
            {tool === 'eraser' && mousePos && (
              <div className="eraser-cursor-ring" style={{
                width: `${brushSize * zoom}px`,
                height: `${brushSize * zoom}px`,
                left: `${mousePos.x - (brushSize * zoom) / 2}px`,
                top: `${mousePos.y - (brushSize * zoom) / 2}px`,
              }} />
            )}
            
          </div>
        </div>

        <div className="frame-editor-footer">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {tool === 'pipette' ? '點擊圖片吸取顏色 (不套用去背)' :
             tool === 'wand' ? '點擊背景色，自動去背' :
             '拖曳塗抹，移除不需要的部分'}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="button secondary" onClick={onCancel}>取消</button>
            <button className="button success" onClick={handleSave} disabled={history.length < 2}>
              <Save size={16} /> 儲存變更
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FrameEditor;
