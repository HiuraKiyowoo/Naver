import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

const Welcome = lazy(() => import('./pages/Welcome'));
const Home    = lazy(() => import('./pages/Home'));
const Explore = lazy(() => import('./pages/Explore'));
const Browse  = lazy(() => import('./pages/Browse'));
const Series  = lazy(() => import('./pages/Series'));
const Read    = lazy(() => import('./pages/Read'));
const History = lazy(() => import('./pages/History'));

function App() {
  return (
    <Router>
      <Suspense fallback={<div className="min-h-screen bg-[#0a0a0c]" />}>
        <Routes>
          <Route path="/"             element={<Welcome />} />
          <Route path="/home"         element={<Home />} />
          <Route path="/explore"      element={<Explore />} />
          <Route path="/browse"       element={<Browse />} />
          <Route path="/history"      element={<History />} />
          <Route path="/novel/:id"    element={<Series />} />
          <Route path="/read/:postId" element={<Read />} />
          <Route path="*"             element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
