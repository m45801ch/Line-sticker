import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SlicerApp from '../slicer/SlicerApp';

const SlicerPage = () => {
  const navigate = useNavigate();
  return (
    <div className="app-container">
      <div className="page-header">
        <button className="back-button" onClick={() => navigate('/')}>
          <ArrowLeft size={20} />
        </button>
        <h1>動態貼圖切割</h1>
      </div>
      <SlicerApp onBack={() => navigate('/')} />
    </div>
  );
};

export default SlicerPage;
