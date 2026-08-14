import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Image, Film, Scissors } from 'lucide-react';

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div className="home-container">
      <header className="header">
        <h1>Line 貼圖助手</h1>
        <p>快速製作您的個人化 LINE 貼圖組</p>
      </header>

      <div className="home-cards">
        <div className="home-card" onClick={() => navigate('/static')}>
          <div className="home-card-icon">
            <Image size={48} />
          </div>
          <h2>靜態貼圖製作</h2>
          <p>製作靜態 LINE 貼圖，從生成提示詞到打包匯出一氣呵成</p>
          <span className="home-card-link">開始製作 →</span>
        </div>

        <div className="home-card" onClick={() => navigate('/dynamic')}>
          <div className="home-card-icon">
            <Film size={48} />
          </div>
          <h2>單張動態貼圖製作</h2>
          <p>從影片製作動態 LINE 貼圖，擷取影格到去背打包</p>
          <span className="home-card-link">開始製作 →</span>
        </div>

        <div className="home-card" onClick={() => navigate('/slicer')}>
          <div className="home-card-icon">
            <Scissors size={48} />
          </div>
          <h2>多張動態貼圖製作</h2>
          <p>上傳影片自動切割為多格 LINE 動態貼圖</p>
          <span className="home-card-link">開始製作 →</span>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
