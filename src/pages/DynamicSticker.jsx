import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Video, ImageIcon, Package, Check } from 'lucide-react';
import VideoUploader from '../components/VideoUploader';
import FrameExtractor from '../components/FrameExtractor';
import BgRemover from '../components/BgRemover';
import ApngExporter from '../components/ApngExporter';

const steps = [
  { id: 1, label: '上傳影片', icon: <Upload size={20} /> },
  { id: 2, label: '擷取影格', icon: <Video size={20} /> },
  { id: 3, label: '去背', icon: <ImageIcon size={20} /> },
  { id: 4, label: '打包', icon: <Package size={20} /> },
];

const DynamicSticker = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(1);
  const [videoInfo, setVideoInfo] = useState(null);
  const [frames, setFrames] = useState([]);
  const [processedFrames, setProcessedFrames] = useState([]);

  const handleVideoReady = (info) => {
    setVideoInfo(info);
    if (info) setActiveStep(2);
  };

  const handleFramesExtracted = (extractedFrames) => {
    setFrames(extractedFrames);
  };

  const handleFramesProcessed = (processed) => {
    setProcessedFrames(processed);
  };

  const handleGoToStep3 = () => {
    setActiveStep(3);
  };

  const handleGoToStep4 = () => {
    setActiveStep(4);
  };

  const displayFrames = processedFrames.length > 0 ? processedFrames : frames;

  return (
    <div className="app-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/')}>
          <ArrowLeft size={20} />
        </button>
        <h1>動態貼圖製作</h1>
      </div>

      <div className="stepper">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`step-item ${activeStep === step.id ? 'active' : ''} ${activeStep > step.id ? 'completed' : ''}`}
            onClick={() => {
              if (step.id < activeStep) setActiveStep(step.id);
              else if (step.id === 3 && frames.length > 0) setActiveStep(3);
              else if (step.id === 4 && processedFrames.length > 0) setActiveStep(4);
            }}
            style={{ cursor: (step.id < activeStep || (step.id === 3 && frames.length > 0) || (step.id === 4 && processedFrames.length > 0)) ? 'pointer' : 'default' }}
          >
            <div className="step-circle">
              {activeStep > step.id ? <Check size={20} /> : step.icon}
            </div>
            <span className="step-label">{step.label}</span>
          </div>
        ))}
      </div>

      <div className="content-area">
        {activeStep === 1 && (
          <VideoUploader onVideoReady={handleVideoReady} />
        )}

        {activeStep === 2 && videoInfo && (
          <FrameExtractor
            videoUrl={videoInfo.url}
            videoName={videoInfo.file?.name}
            duration={videoInfo.duration}
            onFramesExtracted={handleFramesExtracted}
            onGoToStep3={handleGoToStep3}
          />
        )}

        {activeStep === 3 && (
          <BgRemover
            frames={frames}
            onFramesProcessed={handleFramesProcessed}
            onGoToStep4={handleGoToStep4}
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
