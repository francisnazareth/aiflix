import React, { useRef, useState } from 'react';
import ContentCard from './ContentCard';

function ContentRow({ title, items, showProgress }) {
  const carouselRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setStartX(e.pageX - carouselRef.current.offsetLeft);
    setScrollLeft(carouselRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - carouselRef.current.offsetLeft;
    const walk = (x - startX) * 1;
    carouselRef.current.scrollLeft = scrollLeft - walk;
  };

  // Touch support
  const handleTouchStart = (e) => {
    setStartX(e.touches[0].screenX);
  };

  const handleTouchEnd = (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const diff = startX - touchEndX;
    
    if (diff > 50) {
      carouselRef.current.scrollLeft += 300;
    } else if (diff < -50) {
      carouselRef.current.scrollLeft -= 300;
    }
  };

  return (
    <section className="content-row">
      <h2 className="row-title">{title}</h2>
      <div 
        className="carousel"
        ref={carouselRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="carousel-track">
          {items.map((item) => (
            <ContentCard 
              key={item.id} 
              item={item} 
              showProgress={showProgress} 
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default ContentRow;
