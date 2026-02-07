import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function ContentCard({ item, showProgress }) {
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);

  const handleClick = () => {
    navigate(`/asset/${item.id}`);
  };

  const hasValidImage = item.image && !item.image.includes('placeholder') && !imageError;

  return (
    <div 
      className="content-card"
      onClick={handleClick}
    >
      {hasValidImage ? (
        <img 
          src={item.image} 
          alt={item.title} 
          loading="lazy"
          onError={() => setImageError(true)}
        />
      ) : (
        <div className="card-placeholder" />
      )}
      {showProgress && <div className="progress-bar"></div>}
      <div className="card-overlay">
        <h3>{item.title}</h3>
        {item.year && <p className="card-year">{item.year}</p>}
      </div>
    </div>
  );
}

export default ContentCard;
