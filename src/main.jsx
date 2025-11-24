import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './components/App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'

// Suppress Rails UJS errors if they come from browser extensions or external sources
if (typeof window !== 'undefined') {
  // Catch uncaught errors from Rails UJS
  window.addEventListener('error', (event) => {
    if (event.message && (
      event.message.includes('rails-ujs') ||
      (event.message.includes('querySelectorAll') && event.message.includes('is not a valid selector'))
    )) {
      event.preventDefault(); // Prevent the error from showing in console
      return false;
    }
  }, true);

  // Also filter console errors
  const originalError = console.error;
  console.error = (...args) => {
    const errorString = args.join(' ');
    if (errorString.includes('rails-ujs') || 
        (errorString.includes('querySelectorAll') && errorString.includes('is not a valid selector'))) {
      return; // Silently ignore Rails UJS errors
    }
    originalError.apply(console, args);
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
