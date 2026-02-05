import React from 'react';

function HeroBanner({ onAddAsset }) {
  const handlePlayClick = (e) => {
    // Create ripple effect
    const btn = e.currentTarget;
    const ripple = document.createElement('div');
    ripple.style.position = 'absolute';
    ripple.style.borderRadius = '50%';
    ripple.style.background = 'rgba(255, 255, 255, 0.6)';
    ripple.style.width = '20px';
    ripple.style.height = '20px';
    ripple.style.animation = 'rippleEffect 0.6s ease-out';
    
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);
    
    setTimeout(() => ripple.remove(), 600);
  };

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
          <button className="btn btn-primary" onClick={handlePlayClick}>
            ▶ Play
          </button>
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
