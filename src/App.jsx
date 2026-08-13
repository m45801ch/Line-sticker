import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import StaticSticker from './pages/StaticSticker';
import DynamicSticker from './pages/DynamicSticker';
import SlicerPage from './pages/SlicerPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/static" element={<StaticSticker />} />
        <Route path="/dynamic" element={<DynamicSticker />} />
        <Route path="/slicer" element={<SlicerPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
