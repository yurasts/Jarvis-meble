import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import ClientPortal from './components/ClientPortal.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Главная страница (Ваша админка) */}
        <Route path="/" element={<App />} />
        
        {/* Публичная страница клиента */}
        <Route path="/portal/:id" element={<ClientPortal />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)