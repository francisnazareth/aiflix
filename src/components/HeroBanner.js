import React from 'react';

function HeroBanner({ onAddAsset }) {
  return (
    <section className="hero-banner">
      <div className="hero-content">
        <h1 className="hero-title">AI Demo Library</h1>
        <p className="hero-subtitle">Explore AI Innovation</p>
        <p className="hero-description">
          Discover cutting-edge AI demonstrations and interactive projects. 
          Experience the future of artificial intelligence with hands-on examples 
          and real-world applications.
        </p>
        <div className="hero-buttons">
          <button className="btn btn-secondary" onClick={onAddAsset}>
            + Add Asset
          </button>
        </div>
      </div>
      <div className="hero-image-overlay"></div>
    </section>
  );
}

export default HeroBanner;
