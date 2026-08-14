import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Upload, Video, ImageIcon, Package, Check, AlertTriangle } from 'lucide-react';
import VideoUploader from '../components/VideoUploader';
import FrameExtractor from '../components/FrameExtractor';
import BgRemover from '../components/BgRemover';
import ApngExporter from '../components/ApngExporter';
import { MAX_DURATION } from '../slicer/VideoProcessor';

const MAX_FRAMES = 20;

const steps = [
  { id: 1, label: '上傳影片', icon: <Upload size={20} /> },
  { id: 2, label: '擷取影格', icon: <Video size={20} /> },
  { id: 3, label: '去背', icon: <ImageIcon size={20} /> },
  { id: 4, label: '打包', icon: <Package size={20} /> },
];

const DynamicSticker = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const sliced = location.state?.slicedVideo;
  const [activeStep, setActiveStep] = useState(sliced?.url ? 2 : 1);
  const [videoInfo, setVideoInfo] = useState(sliced?.url
    ? { url: sliced.url, file: { name: sliced.name || 'sliced.mp4', type: 'video/mp4' }, duration: MAX_DURATION }
    : null);
  const [frames, setFrames] = useState([]);
  const [processedFrames, setProcessedFrames] = useState([]);

  const handleVideoReady = (info) => {
    setVideoInfo(info);
    if (info) setActiveStep(2);
  };

  const handleFramesExtracted = (extractedFrames) => {
    setFrames(extractedFrames);
    setProcessedFrames([]);
  };

  const handleFramesProcessed = (processed) => {
    setProcessedFrames(processed);
  };

  const handleGoToStep3 = () => {
    setActiveStep(3);
  };

  const getPackFrameCount = () => processedFrames.length > 0 ? processedFrames.length : frames.length;

  const canEnterStep4 = () => {
    const count = getPackFrameCount();
    return count > 0 && count <= MAX_FRAMES;
  };

  const [packGateError, setPackGateError] = useState('');

  const handleGoToStep4 = () => {
    if (!canEnterStep4()) {
      setPackGateError(`影格數需不超過 ${MAX_FRAMES} 張，目前 ${getPackFrameCount()} 張`);
      return;
    }
    setPackGateError('');
    setActiveStep(4);
  };

  const handleDeleteAll = () => {
    setFrames([]);
    setProcessedFrames([]);
    setVideoInfo(null);
  };

  const displayFrames = processedFrames.length > 0 ? processedFrames : frames;

  return (
    <div className="app-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h1>單張動態貼圖製作</h1>
      </div>

      <div className="stepper">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`step-item ${activeStep === step.id ? 'active' : ''} ${activeStep > step.id ? 'completed' : ''}`}
            onClick={() => {
              if (step.id < activeStep || step.id === 2) setActiveStep(step.id);
              else if (step.id === 3 && frames.length > 0) setActiveStep(3);
              else if (step.id === 4 && canEnterStep4()) { setPackGateError(''); setActiveStep(4); }
              else if (step.id === 4) setPackGateError(`影格數需不超過 ${MAX_FRAMES} 張，目前 ${getPackFrameCount()} 張`);
            }}
            style={{ cursor: (step.id < activeStep || step.id === 2 || (step.id === 3 && frames.length > 0) || (step.id === 4 && canEnterStep4())) ? 'pointer' : 'default' }}
          >
            <div className="step-circle">
              {activeStep > step.id ? <Check size={20} /> : step.icon}
            </div>
            <span className="step-label">{step.label}</span>
          </div>
        ))}
      </div>

      <div className="content-area">
        {packGateError && activeStep < 4 && (
          <div className="gate-error" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,107,107,0.12)', color: '#ff6b6b', padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
            <AlertTriangle size={16} /> {packGateError}
          </div>
        )}
        {activeStep === 1 && (
          <VideoUploader onVideoReady={handleVideoReady} />
        )}

        {activeStep === 2 && (
          <FrameExtractor
            videoUrl={videoInfo?.url}
            videoName={videoInfo?.file?.name}
            duration={videoInfo?.duration}
            onFramesExtracted={handleFramesExtracted}
            onGoToStep3={handleGoToStep3}
          />
        )}

        {activeStep === 3 && (
          <BgRemover
            frames={frames}
            initialResults={processedFrames}
            onFramesProcessed={handleFramesProcessed}
            onGoToStep4={handleGoToStep4}
            onDeleteAll={handleDeleteAll}
          />
        )}

        {activeStep === 4 && (
          <ApngExporter frames={displayFrames} />
        )}
      </div>

      <footer style={{ marginTop: '3rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem', paddingBottom: '2rem' }}>
        <p>© 2026 Line 貼圖助手</p>
      </footer>
    </div>
  );
};

export default DynamicSticker;
