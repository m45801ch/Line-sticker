import React, { useState, useRef } from 'react';
import { Copy, Sparkles, Check, Edit3, RotateCcw } from 'lucide-react';

const artStyleOptions = [
  { id: 'cute-2d', name: '可愛、活潑、2D平面風格' },
  { id: 'vector', name: '向量插畫 (Vector)' },
  { id: 'watercolor', name: '水彩風 (Watercolor)' },
  { id: '3d-render', name: '3D 算圖 (3D Render)' },
  { id: 'minimalist', name: '簡約幾何 (Minimalist)' },
  { id: 'retro', name: '復古像素 (Retro Pixel)' },
  { id: 'custom', name: '自訂畫風...' },
];

const themeOptions = [
  { id: 'common', name: '常用語', words: '早安、晚安、謝謝、不客氣、對不起、沒問題、好的、收到、拜託、辛苦了、OK、等等' },
  { id: 'greeting', name: '打招呼', words: '你好、嗨、哈囉、掰掰、再見、嘿嘿、安安、午安、晚安、好久不見、想你、最近好嗎' },
  { id: 'emotion', name: '情緒表達', words: '開心、傷心、生氣、驚訝、無言、崩潰、感動、好煩、超爽、嚇死、放空、厭世' },
  { id: 'work', name: '職場用語', words: '收到、了解、辛苦了、加油、下班、開會、忙死了、等我、幫幫忙、做完了、休息、上班中' },
  { id: 'love', name: '愛情甜蜜', words: '愛你、想你、抱抱、親親、寶貝、老公、老婆、晚安❤、早安❤、在幹嘛、吃了嗎、回來了' },
  { id: 'funny', name: '搞笑耍廢', words: '哈哈哈、笑死、傻眼、母湯、躺平、不想動、好餓、吃土、救命、神煩、滾、隨便' },
  { id: 'custom', name: '自行輸入...' },
];

const borderStyleOptions = [
  { id: 'thick-white', name: '粗白框', value: '粗白色外框' },
  { id: 'thin-white', name: '細白框', value: '細白色外框' },
  { id: 'no-border', name: '無白框', value: '無外框' },
];

const fontStyleOptions = [
  { id: 'cute-q', name: '可愛 Q 版字型' },
  { id: 'handwriting', name: '手寫塗鴉字型' },
  { id: 'marker', name: '粗體馬克筆字型' },
  { id: 'bubble', name: '圓潤泡泡字型' },
  { id: 'retro-marker', name: '復古麥克筆字型' },
  { id: 'brush', name: '日系毛筆字型' },
  { id: 'geometric', name: '幾何方塊字型' },
  { id: 'neon', name: '霓虹發光字型' },
  { id: 'comic', name: '漫畫效果字型' },
  { id: 'chalk', name: '黑板粉筆字型' },
  { id: 'pixel-game', name: '遊戲像素字型' },
  { id: 'dot-matrix', name: '點陣印刷字型' },
];

const fontColorOptions = [
  { id: 'high-sat', name: '高飽和亂數' },
  { id: 'yellow', name: '黃色' },
  { id: 'red', name: '紅色' },
  { id: 'mixed', name: '混合色' },
  { id: 'blue', name: '藍色' },
  { id: 'purple', name: '紫色' },
  { id: 'orange', name: '橘色' },
  { id: 'pink', name: '粉紅色' },
  { id: 'neon-color', name: '霓虹色' },
  { id: 'gold', name: '金色' },
  { id: 'sky-blue', name: '天藍色' },
  { id: 'grape', name: '葡萄紫' },
];

const DEFAULT_PROMPT_TEMPLATE = `🚀 LINE 12格角色貼圖生成 Prompt

請參考上傳圖片中的角色，生成一張包含 12 格不同動作的角色貼圖合集。

【角色一致性要求】
必須完全維持原上傳圖角色之髮型、五官、服裝、顏色與比例
不可改變角色設定或重新設計造型

【畫風設定】
{artStyle}

【角色與文字】
{borderStyle}

【背景】必須為純綠色 #00FF00（無漸層、無雜點）

【排版與尺寸】
總尺寸：2560 × 1664 px
分割為橫版4 × 3 排列，共12格
每張貼圖約 0.2cm Padding
遠景與中景、近景交互隨機搭配
必須包含正面、側面與俯視角、誇張視角,各種不同角度

【文字規範】:
語言：台灣繁體中文(不要重複)

【文字內容包含】：
{words}

【字型風格】：
{fontStyle}

【字體顏色】：
{fontColor}

【字體樣式限制】：
禁止使用任何綠色色系
禁止使用表情符號
不可重點角色
字體顏色不支援綠色#00FF00（純綠色）

【表情與動作設計】
每格皆為不同表情與動作
情緒及動作須與文字語意描述

【輸出格式】
僅輸出一張橫版 4 × 3 大圖
背景統一為純綠色 #00FF00`;

const PromptGenerator = () => {
  const [artStyleId, setArtStyleId] = useState(artStyleOptions[0].id);
  const [customArtStyle, setCustomArtStyle] = useState('');

  const [themeId, setThemeId] = useState(themeOptions[0].id);
  const [customThemeWords, setCustomThemeWords] = useState('');

  const [borderStyleId, setBorderStyleId] = useState(borderStyleOptions[0].id);
  const [fontStyleId, setFontStyleId] = useState(fontStyleOptions[0].id);
  const [fontColorId, setFontColorId] = useState(fontColorOptions[0].id);

  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_PROMPT_TEMPLATE);
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);

  const [copied, setCopied] = useState(false);
  const promptRef = useRef(null);

  const getArtStyleName = () => {
    if (artStyleId === 'custom') return customArtStyle || '可愛、活潑、2D平面風格';
    return artStyleOptions.find(s => s.id === artStyleId)?.name || '可愛、活潑、2D平面風格';
  };

  const getThemeWords = () => {
    if (themeId === 'custom') return customThemeWords || '早安、晚安、謝謝、不客氣、對不起、沒問題、好的、收到、拜託、辛苦了、OK、等等';
    return themeOptions.find(t => t.id === themeId)?.words || '早安、晚安、謝謝、不客氣、對不起、沒問題、好的、收到、拜託、辛苦了、OK、等等';
  };

  const getThemeName = () => {
    if (themeId === 'custom') return '自訂主題';
    return themeOptions.find(t => t.id === themeId)?.name || '常用語';
  };

  const getBorderStyleValue = () => {
    return borderStyleOptions.find(b => b.id === borderStyleId)?.value || '粗白色外框';
  };

  const getFontStyleName = () => {
    return fontStyleOptions.find(f => f.id === fontStyleId)?.name || '可愛 Q 版字型';
  };

  const getFontColorName = () => {
    return fontColorOptions.find(f => f.id === fontColorId)?.name || '高飽和亂數';
  };

  const buildPrompt = () => {
    let result = promptTemplate;
    result = result.replace(/{artStyle}/g, getArtStyleName());
    result = result.replace(/{borderStyle}/g, getBorderStyleValue());
    result = result.replace(/{words}/g, getThemeWords());
    result = result.replace(/{fontStyle}/g, getFontStyleName());
    result = result.replace(/{fontColor}/g, getFontColorName());
    return result;
  };

  const generatedPrompt = buildPrompt();

  const handleResetTemplate = () => {
    setPromptTemplate(DEFAULT_PROMPT_TEMPLATE);
    setIsEditingTemplate(false);
  };

  const copyToClipboard = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const textarea = document.createElement('textarea');
    textarea.value = generatedPrompt;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.warn('Copy failed', err);
    }
    document.body.removeChild(textarea);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render prompt with colored highlights
  const renderPromptWithHighlights = () => {
    const plain = generatedPrompt;
    let parts = [];
    let remaining = plain;

    // Only highlight these extracted dynamic strings if they actually match in the text
    const stringsToHighlight = [
      getArtStyleName(),
      getBorderStyleValue(),
      getThemeWords(),
      getFontStyleName(),
      getFontColorName()
    ].filter(Boolean); // removing empty strings just in case

    stringsToHighlight.forEach((str) => {
      const idx = remaining.indexOf(str);
      if (idx !== -1) {
        if (idx > 0) parts.push({ text: remaining.slice(0, idx), highlight: false });
        parts.push({ text: str, highlight: true });
        remaining = remaining.slice(idx + str.length);
      }
    });

    if (remaining) {
      parts.push({ text: remaining, highlight: false });
    }

    return parts.map((part, i) =>
      part.highlight ? (
        <span key={i} style={{ color: '#ffcc00', fontWeight: 600 }}>{part.text}</span>
      ) : (
        <span key={i}>{part.text}</span>
      )
    );
  };

  return (
    <div className="glass-panel" style={{ padding: '2rem' }}>
      <div className="control-group" style={{ marginBottom: '2rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', fontSize: '1.5rem', color: 'var(--primary-color)' }}>
          <Sparkles size={28} />
          LINE 12格角色貼圖 AI 提示詞產生器（去背完稿專用版）
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 600, marginBottom: '1.5rem' }}>
          一鍵生成可上架規格 × 台灣繁中 × 純綠背去背友善 × 高一致性角色設計
        </p>

        <div style={{ background: 'rgba(0, 242, 254, 0.05)', borderLeft: '4px solid var(--primary-color)', padding: '1.25rem', borderRadius: '0 0.5rem 0.5rem 0' }}>
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem', color: 'var(--text-primary)' }}>🎨 LINE貼圖生成器說明</h3>
          <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)', lineHeight: '1.6' }}>本工具專為「LINE角色貼圖」設計，<br />可將你上傳的角色圖片，自動生成：</p>
          <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            <li>✔ 12種不同動作</li>
            <li>✔ 台灣繁體中文常用語</li>
            <li>✔ 貼紙風格粗白邊</li>
            <li>✔ 純綠背景（#00FF00）去背專用</li>
            <li>✔ 4×3 排版直接輸出</li>
          </ul>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem', padding: '1.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>

        {/* Row 1: Style & Border */}
        <div className="control-group">
          <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>選擇畫風</label>
          <select className="select-input" value={artStyleId} onChange={(e) => setArtStyleId(e.target.value)}>
            {artStyleOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {artStyleId === 'custom' && (
          <div className="control-group">
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>自訂畫風描述</label>
            <input type="text" className="text-input" placeholder="例如: 日本漫畫風..." value={customArtStyle} onChange={(e) => setCustomArtStyle(e.target.value)} />
          </div>
        )}

        <div className="control-group">
          <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>貼紙白邊 (角色與文字)</label>
          <select className="select-input" value={borderStyleId} onChange={(e) => setBorderStyleId(e.target.value)}>
            {borderStyleOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>

        {/* Row 2: Theme & Font & Color */}
        <div className="control-group">
          <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>選擇主題內容</label>
          <select className="select-input" value={themeId} onChange={(e) => setThemeId(e.target.value)}>
            {themeOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {themeId === 'custom' && (
          <div className="control-group" style={{ gridColumn: '1 / -1' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>自行輸入 12 個文字（用頓號分隔）</label>
            <input type="text" className="text-input" placeholder="例如: 早安、晚安、謝謝、不客氣..." value={customThemeWords} onChange={(e) => setCustomThemeWords(e.target.value)} />
          </div>
        )}

        <div className="control-group">
          <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>字型風格</label>
          <select className="select-input" value={fontStyleId} onChange={(e) => setFontStyleId(e.target.value)}>
            {fontStyleOptions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>

        <div className="control-group">
          <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>字體顏色</label>
          <select className="select-input" value={fontColorId} onChange={(e) => setFontColorId(e.target.value)}>
            {fontColorOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '1rem' }}>
          <label style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>
            生成提示詞 (Prompt) — 主題：{getThemeName()}
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setIsEditingTemplate(!isEditingTemplate)}
              style={{
                background: isEditingTemplate ? 'rgba(0, 242, 254, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                border: '1px solid var(--border-color)',
                color: isEditingTemplate ? 'var(--primary-color)' : 'var(--text-secondary)',
                padding: '0.4rem 0.8rem',
                borderRadius: '0.25rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                transition: 'all 0.2s'
              }}
            >
              <Edit3 size={14} /> {isEditingTemplate ? '完成修改' : '修改預設 Prompt 模板'}
            </button>
            <button
              onClick={handleResetTemplate}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid transparent',
                color: 'var(--text-secondary)',
                padding: '0.4rem 0.8rem',
                borderRadius: '0.25rem',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            >
              <RotateCcw size={14} /> 還原預設值
            </button>
          </div>
        </div>

        {isEditingTemplate ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ padding: '0.75rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              💡 <strong>編輯模式：</strong>您現在可以自由修改 Prompt 的原本架構。<br />
              請保留 <code>{'{artStyle}'}</code>, <code>{'{borderStyle}'}</code>, <code>{'{words}'}</code>, <code>{'{fontStyle}'}</code>, <code>{'{fontColor}'}</code> 這些大括號變數，這樣上方選單的選項才會自動替換進去！
            </div>
            <textarea
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
              style={{
                width: '100%',
                minHeight: '400px',
                background: 'rgba(0,0,0,0.6)',
                border: '1px solid var(--primary-color)',
                color: '#fff',
                padding: '1.5rem',
                borderRadius: '0.5rem',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                lineHeight: '1.8',
                resize: 'vertical',
                outline: 'none'
              }}
            />
          </div>
        ) : (
          <div
            ref={promptRef}
            style={{
              position: 'relative',
              background: 'var(--panel-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              paddingRight: '7rem',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.8',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              maxHeight: '400px',
              overflowY: 'auto',
              fontFamily: 'monospace'
            }}
          >
            {renderPromptWithHighlights()}

            <button
              onClick={copyToClipboard}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                padding: '0.6rem 1.2rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: copied ? 'rgba(0, 230, 118, 0.15)' : 'var(--primary-color)',
                border: `1px solid ${copied ? 'var(--success-color)' : 'transparent'}`,
                color: copied ? 'var(--success-color)' : '#000',
                borderRadius: '0.3rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                zIndex: 10,
                boxShadow: copied ? 'none' : '0 4px 12px rgba(0, 242, 254, 0.3)'
              }}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? '已複製' : '一鍵複製'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptGenerator;
