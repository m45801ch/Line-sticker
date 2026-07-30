import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, Eraser, Scissors, PackageCheck, Check } from 'lucide-react';
import PromptGenerator from '../components/PromptGenerator';
import WatermarkRemover from '../components/WatermarkRemover';
import ImageProcessor from '../components/ImageProcessor';
import Exporter from '../components/Exporter';

const steps = [
  { id: 1, label: '生成提示詞', icon: <Sparkles size={20} /> },
  { id: 2, label: '去除浮水印', icon: <Eraser size={20} /> },
  { id: 3, label: '處理圖片', icon: <Scissors size={20} /> },
  { id: 4, label: '打包下載', icon: <PackageCheck size={20} /> },
];

const StaticSticker = () => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(1);
  const [processedData, setProcessedData] = useState(null);

  const handleProcessed = (data) => {
    setProcessedData(data);
  };

  const handleGoToStep4 = () => {
    setActiveStep(4);
  };

  const handleGoToStep3 = () => {
    setActiveStep(3);
  };

  return (
    <div className="app-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/')}>
          <ArrowLeft size={20} />
        </button>
        <h1>靜態貼圖製作</h1>
      </div>

      <div className="stepper">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`step-item ${activeStep === step.id ? 'active' : ''} ${activeStep > step.id ? 'completed' : ''}`}
            onClick={() => setActiveStep(step.id)}
            style={{ cursor: 'pointer' }}
          >
            <div className="step-circle">
              {activeStep > step.id ? <Check size={20} /> : step.icon}
            </div>
            <span className="step-label">{step.label}</span>
          </div>
        ))}
      </div>

      <div className="content-area">
        {activeStep === 1 && <PromptGenerator />}
        {activeStep === 2 && <WatermarkRemover />}
        <div style={{ display: activeStep === 3 ? 'block' : 'none' }}>
          <ImageProcessor
            onProcessed={handleProcessed}
            onGoToStep4={handleGoToStep4}
          />
        </div>
        {activeStep === 4 && (
          <Exporter
            data={processedData}
            onGoToStep3={handleGoToStep3}
          />
        )}
      </div>

      <footer style={{ marginTop: '3rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.75rem', paddingBottom: '2rem' }}>
        <p>© 2026 Line 貼圖助手</p>
      </footer>
    </div>
  );
};

export default StaticSticker;
