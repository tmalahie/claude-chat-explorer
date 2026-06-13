import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ProjectsPage from './pages/ProjectsPage.jsx';
import ChatPage from './pages/ChatPage.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProjectsPage />} />
        <Route path="/p/:projectId" element={<ChatPage />} />
        <Route path="/p/:projectId/c/:convId" element={<ChatPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
