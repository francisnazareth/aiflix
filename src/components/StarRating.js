import React, { useState, useEffect } from 'react';
import './StarRating.css';

const StarRating = ({ assetId, user, onRatingChange }) => {
  const [averageRating, setAverageRating] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [userRating, setUserRating] = useState(null);
  const [hoverRating, setHoverRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  useEffect(() => {
    fetchRatings();
    if (user?.userId) {
      fetchUserRating();
    }
  }, [assetId, user]);

  const fetchRatings = async () => {
    try {
      const response = await fetch(`${API_URL}/api/assets/${assetId}/ratings`);
      if (response.ok) {
        const data = await response.json();
        setAverageRating(data.averageRating || 0);
        setTotalCount(data.totalCount || 0);
      }
    } catch (error) {
      console.error('Failed to fetch ratings:', error);
    }
  };

  const fetchUserRating = async () => {
    if (!user?.userId) return;
    try {
      const response = await fetch(`${API_URL}/api/assets/${assetId}/ratings/user/${encodeURIComponent(user.userId)}`);
      if (response.ok) {
        const data = await response.json();
        setUserRating(data.rating);
      }
    } catch (error) {
      console.error('Failed to fetch user rating:', error);
    }
  };

  const submitRating = async (rating) => {
    if (!user?.userId) {
      alert('Please sign in to rate this asset');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/assets/${assetId}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          userId: user.userId,
          userName: user.userName || user.userId
        })
      });

      if (response.ok) {
        setUserRating(rating);
        fetchRatings(); // Refresh average
        if (onRatingChange) onRatingChange();
      } else {
        const error = await response.json();
        alert(error.detail || 'Failed to submit rating');
      }
    } catch (error) {
      console.error('Failed to submit rating:', error);
      alert('Failed to submit rating');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStars = (rating, interactive = false) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      const filled = interactive 
        ? (hoverRating || userRating || 0) >= i
        : rating >= i;
      const halfFilled = !interactive && !filled && rating >= i - 0.5;
      
      stars.push(
        <span
          key={i}
          className={`star ${filled ? 'filled' : ''} ${halfFilled ? 'half-filled' : ''} ${interactive ? 'interactive' : ''} ${isSubmitting ? 'disabled' : ''}`}
          onClick={interactive && !isSubmitting ? () => submitRating(i) : undefined}
          onMouseEnter={interactive && !isSubmitting ? () => setHoverRating(i) : undefined}
          onMouseLeave={interactive && !isSubmitting ? () => setHoverRating(0) : undefined}
        >
          ★
        </span>
      );
    }
    return stars;
  };

  return (
    <div className="star-rating-container">
      <div className="rating-display">
        <div className="average-rating">
          {renderStars(averageRating)}
          <span className="rating-text">
            {averageRating > 0 ? averageRating.toFixed(1) : 'No ratings'} 
            {totalCount > 0 && <span className="rating-count">({totalCount} {totalCount === 1 ? 'rating' : 'ratings'})</span>}
          </span>
        </div>
      </div>
      
      {user?.userId && (
        <div className="user-rating">
          <span className="your-rating-label">Your rating:</span>
          <div className="interactive-stars">
            {renderStars(userRating || 0, true)}
          </div>
          {userRating && <span className="user-rating-value">{userRating}/5</span>}
        </div>
      )}
      
      {!user?.userId && (
        <p className="sign-in-prompt">Sign in to rate this asset</p>
      )}
    </div>
  );
};

export default StarRating;
