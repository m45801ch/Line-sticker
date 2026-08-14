import React, { useState } from 'react';
import { SlicerContext } from './SlicerContext';

export const SlicerProvider = ({ children }) => {
  const [clips, setClips] = useState([]);
  const [sourceName, setSourceName] = useState('');

  const clearClips = () => {
    clips.forEach((c) => {
      try { URL.revokeObjectURL(c.url); } catch { /* noop */ }
    });
    setClips([]);
    setSourceName('');
  };

  const value = {
    clips,
    setClips,
    sourceName,
    setSourceName,
    clearClips,
  };

  return <SlicerContext.Provider value={value}>{children}</SlicerContext.Provider>;
};
