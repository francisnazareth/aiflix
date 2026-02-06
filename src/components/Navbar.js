import React, { useState, useEffect, useRef } from 'react';
import './Navbar.css';

const navLinks = ['Home', 'New & Popular', 'My List'];

function Navbar({ activeNavLink, onNavLinkClick }) {
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState(null);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 100);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch user info from EasyAuth
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/.auth/me');
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            const principal = data[0];
            const claims = principal.user_claims || [];
            const getClaimValue = (type) => {
              const claim = claims.find(c => c.typ === type || c.typ.endsWith('/' + type));
              return claim ? claim.val : null;
            };

            setUser({
              userId: principal.user_id || getClaimValue('nameidentifier') || getClaimValue('objectidentifier'),
              userName: getClaimValue('name') || getClaimValue('preferred_username') || principal.user_id,
              email: getClaimValue('emailaddress') || getClaimValue('email') || getClaimValue('preferred_username')
            });
          }
        }
      } catch (err) {
        console.log('EasyAuth not available');
      }
    };

    fetchUser();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowProfileDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = () => {
    window.location.href = '/.auth/logout';
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

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
          <div className="profile-container" ref={dropdownRef}>
            <button 
              className="icon-button profile-button"
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            >
              {user ? (
                <span className="profile-avatar">{getInitials(user.userName)}</span>
              ) : (
                '👤'
              )}
            </button>
            
            {showProfileDropdown && (
              <div className="profile-dropdown">
                {user ? (
                  <>
                    <div className="profile-header">
                      <div className="profile-avatar-large">{getInitials(user.userName)}</div>
                      <div className="profile-info">
                        <div className="profile-name">{user.userName}</div>
                        <div className="profile-email">{user.email}</div>
                      </div>
                    </div>
                    <div className="profile-divider"></div>
                    <button className="profile-menu-item sign-out" onClick={handleSignOut}>
                      Sign Out
                    </button>
                  </>
                ) : (
                  <a href="/.auth/login/aad" className="profile-menu-item sign-in">
                    Sign In with Microsoft
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
