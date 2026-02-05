import React from 'react';
import { useNavigate } from 'react-router-dom';

function ContentCard({ item, showProgress }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/asset/${item.id}`);
  };

  return (
    <div 
      className="content-card"
      onClick={handleClick}
    >
      <img src={item.image} alt={item.title} />
      {showProgress && <div className="progress-bar"></div>}
      <div className="card-overlay">
        <h3>{item.title}</h3>
        {item.year && <p className="card-year">{item.year}</p>}
      </div>
    </div>
  );
}

export default ContentCard;
