import React, { useState, useEffect } from 'react';

const navLinks = ['Home', 'New & Popular', 'My List'];

function Navbar({ activeNavLink, onNavLinkClick }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 100);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navbarStyle = scrolled
    ? {
        background: 'rgba(20, 20, 20, 0.95)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
      }
    : {};

  return (
    <header className="navbar" style={navbarStyle}>
      <div className="navbar-container">
        <div className="navbar-brand">
          <span className="logo">AiFlix</span>
        </div>
        <nav className="navbar-menu">
          {navLinks.map((link) => (
            <a
              key={link}
              href="#"
              className={`nav-link ${activeNavLink === link ? 'active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                onNavLinkClick(link);
              }}
            >
              {link}
            </a>
          ))}
        </nav>
        <div className="navbar-icons">
          <button className="icon-button">🔍</button>
          <button className="icon-button">👤</button>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
