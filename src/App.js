import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import HeroBanner from './components/HeroBanner';
import ContentRow from './components/ContentRow';
import AddAssetModal from './components/AddAssetModal';
import AssetDetail from './components/AssetDetail';
import SignedOutPage from './components/SignedOutPage';

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
    alert(`Asset "${formData.assetName}" has been saved successfully!`);
    handleCloseModal();
    window.location.reload(); // Refresh to show new asset
  };

  return (
    <Router>
      <Routes>
        <Route path="/signed-out" element={<SignedOutPage />} />
        <Route path="/*" element={
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
        } />
      </Routes>
    </Router>
  );
}

export default App;
