import { createContext, useContext } from 'react';

export const SlicerContext = createContext(null);

export const useSlicer = () => useContext(SlicerContext);
