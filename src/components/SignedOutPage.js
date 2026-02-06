import React from 'react';
import './SignedOutPage.css';

function SignedOutPage() {
  const handleSignIn = () => {
    window.location.href = '/.auth/login/aad?post_login_redirect_uri=/';
  };

  return (
    <div className="signed-out-page">
      <div className="poster-grid-background">
        {/* Generate a grid of placeholder posters */}
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} className="poster-placeholder" style={{
            background: `hsl(${(i * 37) % 360}, 50%, ${25 + (i % 3) * 10}%)`,
            animationDelay: `${i * 0.1}s`
          }}>
            <div className="poster-inner"></div>
          </div>
        ))}
      </div>
      
      <div className="gradient-overlay"></div>
      
      <header className="signed-out-header">
        <span className="logo">AiFlix</span>
        <button className="sign-in-btn" onClick={handleSignIn}>Sign In</button>
      </header>
      
      <div className="signed-out-content">
        <h1>Unlimited demos, assets, and more</h1>
        <p className="subtitle">Explore AI-powered demos built by Microsoft SEs & CSAs.</p>
        <p className="cta-text">Ready to explore? Sign in to get started.</p>
        <button className="get-started-btn" onClick={handleSignIn}>
          Get Started <span className="arrow">›</span>
        </button>
      </div>
      
      <div className="bottom-gradient"></div>
    </div>
  );
}

export default SignedOutPage;
