import React, { useState } from 'react';
import Navbar from './components/Navbar';
import HeroBanner from './components/HeroBanner';
import ContentRow from './components/ContentRow';
import AddAssetModal from './components/AddAssetModal';
import Footer from './components/Footer';
import { contentData } from './data/content';

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
    alert(`Asset "${formData.assetName}" has been submitted successfully!`);
    handleCloseModal();
  };

  return (
    <div className="app">
      <Navbar 
        activeNavLink={activeNavLink} 
        onNavLinkClick={setActiveNavLink} 
      />
      <HeroBanner onAddAsset={handleOpenModal} />
      
      <main className="content-area">
        {contentData.map((row, index) => (
          <ContentRow 
            key={index}
            title={row.title}
            items={row.items}
            showProgress={row.showProgress}
          />
        ))}
      </main>

      <AddAssetModal 
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleAssetSubmit}
      />

      <Footer />
    </div>
  );
}

export default App;
