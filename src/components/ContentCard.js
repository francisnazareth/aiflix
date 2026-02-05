import React from 'react';

function ContentCard({ item, showProgress }) {
  const handleClick = () => {
    console.log('Playing:', item.title);
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
