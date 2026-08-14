import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Scissors, Zap, Check } from 'lucide-react';
import AutoProcessApp from '../slicer/AutoProcessApp';

const AutoProcessPage = () => {
  const navigate = useNavigate();
  const steps = [
    { id: 1, label: '影片切割', icon: <Scissors size={20} /> },
    { id: 2, label: '自動化處理', icon: <Zap size={20} /> },
  ];
  return (
    <div className="app-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/slicer')}>
          <ArrowLeft size={20} />
        </button>
        <h1>自動化處理</h1>
      </div>

      <div className="stepper">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`step-item ${step.id === 2 ? 'active' : 'completed'}`}
          >
            <div className="step-circle">
              {step.id === 1 ? <Check size={20} /> : step.icon}
            </div>
            <span className="step-label">{step.label}</span>
          </div>
        ))}
      </div>

      <AutoProcessApp />
    </div>
  );
};

export default AutoProcessPage;
