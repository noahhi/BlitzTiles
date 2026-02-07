import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { GamePage } from './pages/GamePage';
import { SettingsPage } from './pages/SettingsPage';
import { useSettingsStore } from './hooks/useSettingsStore';
import './styles/global.css';

// Apply theme synchronously before React renders to prevent flash
const initialTheme = useSettingsStore.getState().theme;
document.documentElement.setAttribute('data-theme', initialTheme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/game/:roomId?" element={<GamePage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
