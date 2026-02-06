import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import HeroBanner from './components/HeroBanner';
import ContentRow from './components/ContentRow';
import AddAssetModal from './components/AddAssetModal';
import AssetDetail from './components/AssetDetail';
import SignedOutPage from './components/SignedOutPage';

// Authentication wrapper component
function AuthRequired({ children }) {
  const [authState, setAuthState] = useState('checking'); // 'checking', 'authenticated', 'unauthenticated'

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/.auth/me');
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0 && data[0].user_id) {
            setAuthState('authenticated');
          } else {
            setAuthState('unauthenticated');
          }
        } else {
          setAuthState('unauthenticated');
        }
      } catch (err) {
        // If /.auth/me fails (e.g., running locally), allow access
        console.log('Auth check failed, allowing access (local dev mode)');
        setAuthState('authenticated');
      }
    };

    checkAuth();
  }, []);

  if (authState === 'checking') {
    return (
      <div className="auth-loading">
        <div className="auth-loading-spinner"></div>
        <p>Checking authentication...</p>
      </div>
    );
  }

  if (authState === 'unauthenticated') {
    // Redirect to Azure AD login
    window.location.href = '/.auth/login/aad?post_login_redirect_uri=' + encodeURIComponent(window.location.pathname);
    return (
      <div className="auth-loading">
        <p>Redirecting to login...</p>
      </div>
    );
  }

  return children;
}

function HomePage({ onAddAsset }) {
  const [assets, setAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(true);

  const fetchAssets = async () => {
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/assets`);
      if (response.ok) {
        const data = await response.json();
        setAssets(data);
      }
    } catch (error) {
      console.error('Failed to fetch assets:', error);
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => {
    fetchAssets();
  }, []);

  // Transform assets to content row format
  const assetItems = assets.map(asset => ({
    id: asset.id,
    title: asset.assetName,
    year: asset.createdBy,
    image: asset.assetPicture || 'https://via.placeholder.com/250x350/1a1a1a/ff0000?text=No+Image'
  }));

  return (
    <>
      <HeroBanner onAddAsset={onAddAsset} />
      <main className="content-area">
        <ContentRow 
          title="DEMO Assets built by SEs & CSAs"
          items={assetItems}
          showProgress={false}
          loading={loadingAssets}
        />
      </main>
    </>
  );
}

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeNavLink, setActiveNavLink] = useState('Home');

  const handleOpenModal = () => {
    setIsModalOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    document.body.style.overflow = 'auto';
  };

  const handleAssetSubmit = (formData) => {
    console.log('Asset submitted:', formData);
    // Success dialog is shown by AddAssetModal
    window.location.reload(); // Refresh to show new asset
  };

  return (
    <Router>
      <Routes>
        <Route path="/signed-out" element={<SignedOutPage />} />
        <Route path="/*" element={
          <AuthRequired>
            <div className="app">
              <Navbar 
                activeNavLink={activeNavLink} 
                onNavLinkClick={setActiveNavLink} 
              />
              
              <Routes>
                <Route path="/" element={<HomePage onAddAsset={handleOpenModal} />} />
                <Route path="/asset/:id" element={<AssetDetail />} />
              </Routes>

              <AddAssetModal 
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                onSubmit={handleAssetSubmit}
              />
            </div>
          </AuthRequired>
        } />
      </Routes>
    </Router>
  );
}

export default App;
