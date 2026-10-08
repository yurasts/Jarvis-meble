import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import ClientPortal from './components/ClientPortal.jsx'
import { AuthProvider } from './AuthContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <AuthProvider>
                <App />
              </AuthProvider>
            }
          />
          <Route path="/portal/:token" element={<ClientPortal />} />
        </Routes>
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>,
)
