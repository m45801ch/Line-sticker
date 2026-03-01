import React, { useState, useRef, useEffect } from 'react';
import { Download, Sparkles, Image as ImageIcon, ArrowDown, Trash2, AlertCircle, Loader2, X } from 'lucide-react';
import JSZip from 'jszip';

/**
 * 依據 bg 影像計算 Alpha Map
 * 取 RGB 三通道最大值作為 Alpha (0.0 ~ 1.0)
 */
const calculateAlphaMap = (bgImageData) => {
    const { width, height, data } = bgImageData;
    const alphaMap = new Float32Array(width * height);

    for (let i = 0; i < alphaMap.length; i++) {
        const idx = i * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const maxChannel = Math.max(r, g, b);
        alphaMap[i] = maxChannel / 255.0;
    }

    return alphaMap;
};

/**
 * 依圖片尺寸偵測使用哪款浮水印遮罩大小與邊界
 */
const detectWatermarkConfig = (imgWidth, imgHeight) => {
    if (imgWidth > 1024 && imgHeight > 1024) {
        return { size: 96, marginRight: 64, marginBottom: 64 };
    }
    return { size: 48, marginRight: 32, marginBottom: 32 };
};

const WatermarkRemover = () => {
    // Batch processing states
    const [results, setResults] = useState([]); // Array of { id, originalName, sourceUrl, processedUrl, info, status, error }
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [alphaMaps, setAlphaMaps] = useState({});
    const [previewImage, setPreviewImage] = useState(null); // { url, name }

    const fileInputRef = useRef(null);
    const resultsRef = useRef(null);

    // 載入 journey-ad 提供的 bg 圖片並生成 Alpha Map
    useEffect(() => {
        const loadMasks = async () => {
            const configs = [
                { size: 96, path: '/assets/bg_96.png' },
                { size: 48, path: '/assets/bg_48.png' }
            ];

            const maps = {};

            for (const conf of configs) {
                try {
                    const img = new Image();
                    img.src = conf.path;
                    await new Promise((resolve, reject) => {
                        img.onload = () => resolve();
                        img.onerror = () => reject();
                    });

                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);

                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    maps[conf.size] = calculateAlphaMap(imgData);
                } catch (e) {
                    console.error("無法載入浮水印遮罩圖片:", conf.path);
                }
            }

            setAlphaMaps(maps);
        };

        loadMasks();
    }, []);

    // 執行 Reverse Alpha Blending
    const applyWatermarkRemoval = (imgData, alphaMap, config) => {
        const { size, marginRight, marginBottom } = config;
        const imgWidth = imgData.width;
        const imgHeight = imgData.height;

        const x = imgWidth - marginRight - size;
        const y = imgHeight - marginBottom - size;

        const ALPHA_THRESHOLD = 0.002;
        const MAX_ALPHA = 0.99;
        const LOGO_VALUE = 255;

        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const imgIdx = ((y + row) * imgWidth + (x + col)) * 4;
                const alphaIdx = row * size + col;

                let alpha = alphaMap[alphaIdx];
                if (alpha < ALPHA_THRESHOLD) continue;

                alpha = Math.min(alpha, MAX_ALPHA);
                const oneMinusAlpha = 1.0 - alpha;

                for (let c = 0; c < 3; c++) {
                    const watermarked = imgData.data[imgIdx + c];
                    const original = (watermarked - alpha * LOGO_VALUE) / oneMinusAlpha;

                    imgData.data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
                }
            }
        }
    };

    const handleUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const validFiles = files.filter(f => f.type.startsWith('image/'));
        if (validFiles.length === 0) return;

        setIsProcessing(true);
        processBatch(validFiles);
    };

    const processBatch = async (files) => {
        let completed = 0;
        const total = files.length;

        for (const file of files) {
            const id = Math.random().toString(36).substr(2, 9);
            const sourceUrl = URL.createObjectURL(file);

            setResults(prev => [...prev, {
                id,
                originalName: file.name,
                sourceUrl,
                status: 'processing',
                info: null
            }]);

            try {
                const { processedUrl, info } = await processImageFile(file);

                setResults(prev => prev.map(r =>
                    r.id === id ? { ...r, processedUrl, info, status: 'success' } : r
                ));
            } catch (err) {
                console.error(`Error processing ${file.name}:`, err);
                setResults(prev => prev.map(r =>
                    r.id === id ? { ...r, status: 'error', error: "處理失敗" } : r
                ));
            }

            completed++;
            setProgress(Math.round((completed / total) * 100));
        }

        setIsProcessing(false);
        setProgress(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const processImageFile = async (file) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.src = url;
        await new Promise(resolve => {
            img.onload = resolve;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const config = detectWatermarkConfig(canvas.width, canvas.height);
        const info = {
            width: canvas.width,
            height: canvas.height,
            watermarkSize: config.size,
            position: [canvas.width - config.marginRight - config.size, canvas.height - config.marginBottom - config.size]
        };

        const targetMap = alphaMaps[config.size];
        if (targetMap) {
            applyWatermarkRemoval(imgData, targetMap, config);
            ctx.putImageData(imgData, 0, 0);
        }

        const processedUrl = canvas.toDataURL('image/png');
        URL.revokeObjectURL(url); // Clean up temp URL
        return { processedUrl, info };
    };

    const handleDownloadAll = async () => {
        const zip = new JSZip();
        const successResults = results.filter(r => r.status === 'success');

        for (const res of successResults) {
            const base64Data = res.processedUrl.split(',')[1];
            const name = res.originalName.replace(/\.[^/.]+$/, "") + "_no_watermark.png";
            zip.file(name, base64Data, { base64: true });
        }

        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `watermark_removed_batch_${new Date().getTime()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const resetFiles = () => {
        results.forEach(r => {
            URL.revokeObjectURL(r.sourceUrl);
            if (r.processedUrl && r.processedUrl.startsWith('blob:')) URL.revokeObjectURL(r.processedUrl);
        });
        setResults([]);
        setIsProcessing(false);
        setProgress(0);
    };

    const removeSingleResult = (id) => {
        const res = results.find(r => r.id === id);
        if (res) {
            URL.revokeObjectURL(res.sourceUrl);
            setResults(prev => prev.filter(r => r.id !== id));
        }
    };

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '3rem', position: 'relative' }}>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                    Gemini AI 批量去水印
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    支援多圖上傳，純瀏覽器本地處理，打包下載更便利
                </p>
            </div>

            {/* Upload Section */}
            <div className="glass-panel" style={{
                padding: '3rem 2rem',
                textAlign: 'center',
                border: '2px dashed var(--primary-color)',
                backgroundColor: '#0a0f1d',
                color: 'white',
                transition: 'all 0.3s ease',
                position: 'relative'
            }}>
                <ImageIcon size={48} style={{ color: 'var(--primary-color)', marginBottom: '1rem', opacity: 0.8 }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: '#fff' }}>
                    點擊選擇 或 拖曳多張圖片至此
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                    支援 JPG, PNG, WebP 批量處理
                </p>

                <label className="button primary" style={{ cursor: 'pointer', padding: '0.75rem 2rem', fontSize: '1rem' }}>
                    選擇多張圖片
                    <input
                        type="file"
                        hidden
                        multiple
                        accept="image/png, image/jpeg, image/webp"
                        onChange={handleUpload}
                        ref={fileInputRef}
                    />
                </label>

                {isProcessing && (
                    <div style={{ marginTop: '2rem', width: '100%', maxWidth: '400px', margin: '2rem auto 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                            <span>正在處理中...</span>
                            <span>{progress}%</span>
                        </div>
                        <div style={{ height: '8px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${progress}%`, height: '100%', backgroundColor: 'var(--primary-color)', transition: 'width 0.3s ease' }}></div>
                        </div>
                    </div>
                )}
            </div>

            {/* Results Grid */}
            {results.length > 0 && (
                <div ref={resultsRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem', marginTop: '1rem' }}>
                    {results.map((res) => (
                        <div key={res.id} className="glass-panel" style={{
                            padding: '1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem',
                            border: '1px solid var(--border-color)',
                            position: 'relative'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                                    {res.originalName}
                                </span>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {res.status === 'success' && (
                                        <button
                                            onClick={() => {
                                                const link = document.createElement('a');
                                                link.href = res.processedUrl;
                                                link.download = res.originalName.replace(/\.[^/.]+$/, "") + "_no_watermark.png";
                                                document.body.appendChild(link);
                                                link.click();
                                                document.body.removeChild(link);
                                            }}
                                            style={{ padding: '4px', color: 'var(--primary-color)', background: 'none', border: 'none', cursor: 'pointer' }}
                                            title="下載此圖片"
                                        >
                                            <Download size={16} />
                                        </button>
                                    )}
                                    <button onClick={() => removeSingleResult(res.id)} style={{ padding: '4px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }} title="刪除結果">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>

                            <div
                                style={{
                                    height: '180px',
                                    backgroundColor: '#f8f9fa',
                                    borderRadius: '0.5rem',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: res.status === 'success' ? 'zoom-in' : 'default'
                                }}
                                onClick={() => res.status === 'success' && setPreviewImage({ url: res.processedUrl, name: res.originalName })}
                            >
                                {res.status === 'processing' ? (
                                    <div style={{ textAlign: 'center', color: 'var(--primary-color)' }}>
                                        <Loader2 size={32} className="animate-spin" />
                                    </div>
                                ) : res.status === 'success' ? (
                                    <img src={res.processedUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="Result" />
                                ) : (
                                    <div style={{ textAlign: 'center', color: '#ef4444' }}>
                                        <AlertCircle size={32} />
                                        <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>處理失敗</div>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                {res.status === 'success' && res.info && (
                                    <>
                                        <span>{res.info.width}×{res.info.height}</span>
                                        <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>浮水印已移除 (點擊預覽)</span>
                                    </>
                                )}
                                {res.status === 'error' && <span style={{ color: '#ef4444' }}>{res.error}</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Floating Control Box */}
            {results.length > 0 && (
                <div style={{ position: 'absolute', top: '0', bottom: '0', right: '-320px', width: '300px' }}>
                    <div className="glass-panel" style={{
                        padding: '1.5rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                        position: 'sticky',
                        top: '100px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        zIndex: 10
                    }}>
                        <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                            <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>批量操作面板</h4>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                已處理: {results.filter(r => r.status === 'success').length} / {results.length}
                            </p>
                        </div>

                        <button
                            className="button"
                            onClick={handleDownloadAll}
                            disabled={!results.some(r => r.status === 'success')}
                            style={{
                                padding: '1rem',
                                fontSize: '1rem',
                                backgroundColor: '#111827',
                                color: 'white',
                                fontWeight: 600,
                                borderRadius: '0.5rem',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '0.5rem',
                                border: 'none',
                                opacity: !results.some(r => r.status === 'success') ? 0.5 : 1,
                                cursor: 'pointer',
                                width: '100%'
                            }}
                        >
                            <Download size={20} /> 打包下載結果 (ZIP)
                        </button>

                        <button
                            className="button"
                            onClick={resetFiles}
                            style={{
                                padding: '1rem',
                                fontSize: '1rem',
                                backgroundColor: 'white',
                                color: '#4b5563',
                                fontWeight: 600,
                                borderRadius: '0.5rem',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '0.5rem',
                                border: '1px solid #e5e7eb',
                                cursor: 'pointer',
                                width: '100%'
                            }}
                        >
                            <Trash2 size={20} /> 清除所有結果
                        </button>

                        <div style={{
                            fontSize: '0.85rem',
                            color: '#d97706',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.5rem',
                            marginTop: '0.5rem',
                            lineHeight: '1.5'
                        }}>
                            <span style={{ fontSize: '1rem', margin: '0' }}>⚠️</span>
                            <span style={{ flex: 1 }}>批量處理可能消耗較多記憶體，建議一次處理 20 張以內圖片。</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Lightbox Overlay */}
            {previewImage && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        zIndex: 9999,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2rem'
                    }}
                    onClick={() => setPreviewImage(null)}
                >
                    <button
                        style={{
                            position: 'absolute',
                            top: '1.5rem',
                            right: '1.5rem',
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            borderRadius: '50%',
                            color: 'white',
                            padding: '0.5rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s'
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setPreviewImage(null);
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                    >
                        <X size={32} />
                    </button>

                    <div style={{ maxHeight: '85vh', maxWidth: '90vw', position: 'relative', textAlign: 'center' }}>
                        <img
                            src={previewImage.url}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '85vh',
                                objectFit: 'contain',
                                borderRadius: '0.5rem',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                                cursor: 'zoom-out'
                            }}
                            alt="Preview"
                        />
                        <div style={{ color: '#fff', marginTop: '1rem', fontSize: '1rem', fontWeight: 500 }}>
                            {previewImage.name}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WatermarkRemover;
