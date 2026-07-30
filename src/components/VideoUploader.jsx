import React, { useState, useRef } from 'react';
import { Upload, Film, Trash2, Check } from 'lucide-react';

const ACCEPTED_TYPES = ['.mp4', '.mov', '.webm', 'video/mp4', 'video/quicktime', 'video/webm'];

const formatDuration = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const VideoUploader = ({ onVideoReady }) => {
  const [video, setVideo] = useState(null);
  const [duration, setDuration] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = (file) => {
    if (!file) return;
    const type = file.type || file.name.split('.').pop().toLowerCase();
    const isValid = ACCEPTED_TYPES.includes(type) || ACCEPTED_TYPES.some(t => type.includes(t) || file.name.endsWith(t));
    if (!isValid) {
      alert('請上傳 .mp4, .mov 或 .webm 格式的影片');
      return;
    }

    const url = URL.createObjectURL(file);
    const videoEl = document.createElement('video');
    videoEl.preload = 'metadata';
    videoEl.onloadedmetadata = () => {
      const dur = videoEl.duration;
      setDuration(dur);
      setVideo({ file, url, duration: dur });
      onVideoReady?.({ file, url, duration: dur });
    };
    videoEl.src = url;
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleRemove = () => {
    if (video?.url) URL.revokeObjectURL(video.url);
    setVideo(null);
    setDuration(0);
    onVideoReady?.(null);
  };

  return (
    <div className="glass-panel">
      <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Film size={20} /> 上傳影片檔案
      </h3>

      {!video ? (
        <div
          className={`upload-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={40} className="upload-icon" />
          <p>拖放影片到這裡，或點擊選擇檔案</p>
          <span className="upload-hint">支援 .mp4, .mov, .webm 格式</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>
      ) : (
        <div className="video-preview-card">
          <video src={video.url} controls className="video-preview" />
          <div className="video-info">
            <div className="video-info-row">
              <Film size={16} />
              <span>{video.file.name}</span>
            </div>
            <div className="video-info-row">
              <span>影片長度：</span>
              <strong>{formatDuration(duration)}</strong>
              <span style={{ color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>
                ({duration.toFixed(1)} 秒)
              </span>
            </div>
            <div className="video-info-row">
              <span>格式：{video.file.type || video.file.name.split('.').pop().toUpperCase()}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="button secondary" onClick={handleRemove}>
              <Trash2 size={16} /> 移除影片
            </button>
            <button className="button" onClick={() => onVideoReady?.(video)}>
              <Check size={16} /> 確認使用
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoUploader;
