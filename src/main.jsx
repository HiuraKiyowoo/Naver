import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '../style.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0c', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', fontFamily: 'sans-serif', padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>😵</div>
          <h2 style={{ fontWeight: 900, fontSize: '20px', marginBottom: '8px' }}>Oops, ada yang error</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', marginBottom: '24px' }}>Coba refresh halaman ini</p>
          <button onClick={() => window.location.reload()} style={{ background: '#F6CF80', color: '#0a0a0c', border: 'none', borderRadius: '999px', padding: '12px 28px', fontWeight: 900, fontSize: '13px', cursor: 'pointer' }}>
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
