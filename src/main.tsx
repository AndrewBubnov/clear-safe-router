import React from 'react';
import { createRoot } from 'react-dom/client';
import { Router } from './index';
import { routeTree } from './routeTree.gen';

createRoot(document.getElementById('root')!).render(<React.StrictMode><Router routes={routeTree} /></React.StrictMode>);
