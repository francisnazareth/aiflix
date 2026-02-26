import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import HeroBanner from './components/HeroBanner';
import ContentRow from './components/ContentRow';
import AddAssetModal from './components/AddAssetModal';
import AssetDetail from './components/AssetDetail';
import SignedOutPage from './components/SignedOutPage';
import api from './api';

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

function HomePage({ onAddAsset, searchQuery, selectedCategory, onCategoriesLoaded }) {
  const [assets, setAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(true);

  const fetchAssets = async () => {
    try {
      const response = await api.get('/api/assets');
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
  }, []); // eslint-disable-line

  // Notify parent of available categories whenever assets change
  useEffect(() => {
    if (assets.length > 0 && onCategoriesLoaded) {
      const categories = [...new Set(assets.map(a => a.primaryCustomerScenario).filter(Boolean))].sort();
      onCategoriesLoaded(categories);
    }
  }, [assets, onCategoriesLoaded]);

  // Filter assets based on search query and selected category
  let filteredAssets = assets;
  if (searchQuery) {
    filteredAssets = filteredAssets.filter(asset =>
      asset.assetName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (asset.assetDescription && asset.assetDescription.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }
  if (selectedCategory) {
    filteredAssets = filteredAssets.filter(asset => asset.primaryCustomerScenario === selectedCategory);
  }

  // Helper to transform an asset to card format
  const toCardItem = (asset) => ({
    id: asset.id,
    title: asset.assetName,
    year: asset.createdBy,
    image: asset.assetPicture || 'https://via.placeholder.com/250x350/1a1a1a/ff0000?text=No+Image'
  });

  // Group assets by primaryCustomerScenario
  const groupedByCategory = filteredAssets.reduce((groups, asset) => {
    const category = asset.primaryCustomerScenario || 'Uncategorized';
    if (!groups[category]) groups[category] = [];
    groups[category].push(asset);
    return groups;
  }, {});

  // Sort category names alphabetically, but put "Uncategorized" last
  const categoryNames = Object.keys(groupedByCategory).sort((a, b) => {
    if (a === 'Uncategorized') return 1;
    if (b === 'Uncategorized') return -1;
    return a.localeCompare(b);
  });

  return (
    <>
      <HeroBanner onAddAsset={onAddAsset} />
      <main className="content-area">
        {searchQuery || selectedCategory ? (
          <ContentRow
            title={searchQuery ? `Search results for "${searchQuery}"` : selectedCategory}
            items={filteredAssets.map(toCardItem)}
            showProgress={false}
            loading={loadingAssets}
          />
        ) : (
          categoryNames.map(category => (
            <ContentRow
              key={category}
              title={category}
              items={groupedByCategory[category].map(toCardItem)}
              showProgress={false}
              loading={loadingAssets}
            />
          ))
        )}
        {!loadingAssets && !searchQuery && !selectedCategory && categoryNames.length === 0 && (
          <ContentRow
            title="DEMO Assets built by SEs & CSAs"
            items={[]}
            showProgress={false}
            loading={false}
          />
        )}
      </main>
    </>
  );
}

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeNavLink, setActiveNavLink] = useState('Home');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categories, setCategories] = useState([]);

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
                onNavLinkClick={(link) => {
                  setActiveNavLink(link);
                  if (link === 'Home') setSelectedCategory('');
                }}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                categories={categories}
                selectedCategory={selectedCategory}
                onCategoryChange={(cat) => {
                  setSelectedCategory(cat);
                  setSearchQuery('');
                }}
              />
              
              <Routes>
                <Route path="/" element={
                  <HomePage 
                    onAddAsset={handleOpenModal} 
                    searchQuery={searchQuery} 
                    selectedCategory={selectedCategory}
                    onCategoriesLoaded={setCategories}
                  />
                } />
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
