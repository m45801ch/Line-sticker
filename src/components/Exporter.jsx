import React, { useState } from 'react';
import JSZip from 'jszip';
import { Download, FileArchive, Scissors } from 'lucide-react';

const Exporter = ({ data, onGoToStep2 }) => {
    // data is { stems: [...], mainIdx, tabIdx, startIndex }
    const [isExporting, setIsExporting] = useState(false);
    const startIndex = data?.startIndex || 1;

    const resizeBase64Img = (base64, width, height) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                const scale = Math.min(width / img.width, height / img.height);
                const drawW = img.width * scale;
                const drawH = img.height * scale;
                const drawX = (width - drawW) / 2;
                const drawY = (height - drawH) / 2;

                ctx.drawImage(img, drawX, drawY, drawW, drawH);
                resolve(canvas.toDataURL('image/png').split(',')[1]);
            };
            img.src = base64;
        });
    };

    const handleExport = async () => {
        if (!data || !data.stems || data.stems.length === 0) return;
        setIsExporting(true);

        const zip = new JSZip();
        const { stems, mainIdx, tabIdx } = data;

        // 1. Process Main (240x240)
        const mainB64 = await resizeBase64Img(stems[mainIdx], 240, 240);
        zip.file("main.png", mainB64, { base64: true });

        // 2. Process Tab (96x74)
        const tabB64 = await resizeBase64Img(stems[tabIdx], 96, 74);
        zip.file("tab.png", tabB64, { base64: true });

        // 3. Process 12 Stickers (370x320)
        for (let i = 0; i < stems.length; i++) {
            const fileName = String(startIndex + i).padStart(2, '0') + ".png";
            const stickerB64 = await resizeBase64Img(stems[i], 370, 320);
            zip.file(fileName, stickerB64, { base64: true });
        }

        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = `line-stickers-${new Date().getTime()}.zip`;
        link.click();

        setIsExporting(false);
    };

    if (!data || !data.stems || data.stems.length === 0) {
        return (
            <div className="glass-panel">
                <div style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--text-secondary)', padding: '2rem', border: '1px dashed var(--border-color)', borderRadius: '0.5rem' }}>
                    <FileArchive size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>請先在 Step 2 處理圖片後，才能進行打包下載</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
                    <button
                        className="button success"
                        onClick={handleExport}
                        disabled={isExporting}
                        style={{ height: '3rem', padding: '0 3rem', fontSize: '1rem' }}
                    >
                        {isExporting ? <span className="loader">處理中...</span> : <><Download size={20} /> 下載完整 ZIP (14 張)</>}
                    </button>
                    <button
                        className="button secondary"
                        onClick={onGoToStep2}
                        style={{ height: '3rem', padding: '0 2rem' }}
                    >
                        <Scissors size={18} /> 處理下一張貼圖
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Exporter;
