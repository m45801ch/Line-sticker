import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import StaticSticker from './pages/StaticSticker';
import DynamicSticker from './pages/DynamicSticker';
import SlicerPage from './pages/SlicerPage';
import AutoProcessPage from './pages/AutoProcessPage';
import { SlicerProvider } from './slicer/SlicerProvider';

function App() {
  return (
    <BrowserRouter>
      <SlicerProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/static" element={<StaticSticker />} />
          <Route path="/dynamic" element={<DynamicSticker />} />
          <Route path="/slicer" element={<SlicerPage />} />
          <Route path="/slicer-auto" element={<AutoProcessPage />} />
        </Routes>
      </SlicerProvider>
    </BrowserRouter>
  );
}

export default App;
