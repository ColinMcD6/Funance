import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HomePage } from '@/pages/home/home-page';
import './index.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <HomePage />
  </StrictMode>,
);
