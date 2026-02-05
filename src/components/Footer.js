import React from 'react';

const footerData = [
  {
    title: 'Company',
    links: ['About Us', 'Jobs', 'Press'],
  },
  {
    title: 'Help & Support',
    links: ['Contact Us', 'FAQ', 'Help Center'],
  },
  {
    title: 'Legal',
    links: ['Privacy', 'Terms', 'Cookies'],
  },
  {
    title: 'Account',
    links: ['Settings', 'Download', 'Sign Out'],
  },
];

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        {footerData.map((column, index) => (
          <div key={index} className="footer-column">
            <h4>{column.title}</h4>
            {column.links.map((link, linkIndex) => (
              <a key={linkIndex} href="#">
                {link}
              </a>
            ))}
          </div>
        ))}
      </div>
      <p className="footer-copyright">&copy; 2026 AiFlix. All rights reserved.</p>
    </footer>
  );
}

export default Footer;
