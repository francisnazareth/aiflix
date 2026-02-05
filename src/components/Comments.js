import React, { useState, useEffect } from 'react';
import './Comments.css';

const Comments = ({ assetId, user }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  useEffect(() => {
    fetchComments();
  }, [assetId]);

  const fetchComments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/assets/${assetId}/comments`);
      if (response.ok) {
        const data = await response.json();
        setComments(data);
      }
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const submitComment = async (e) => {
    e.preventDefault();
    
    if (!user?.userId) {
      alert('Please sign in to comment');
      return;
    }

    if (!newComment.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/assets/${assetId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newComment.trim(),
          userId: user.userId,
          userName: user.userName || user.userId
        })
      });

      if (response.ok) {
        setNewComment('');
        fetchComments(); // Refresh comments
      } else {
        const error = await response.json();
        alert(error.detail || 'Failed to add comment');
      }
    } catch (error) {
      console.error('Failed to submit comment:', error);
      alert('Failed to add comment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteComment = async (commentId) => {
    if (!window.confirm('Are you sure you want to delete this comment?')) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/assets/${assetId}/comments/${commentId}?user_id=${encodeURIComponent(user.userId)}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        fetchComments(); // Refresh comments
      } else {
        const error = await response.json();
        alert(error.detail || 'Failed to delete comment');
      }
    } catch (error) {
      console.error('Failed to delete comment:', error);
      alert('Failed to delete comment');
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
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

  return (
    <div className="comments-container">
      <h3 className="comments-title">
        Comments {comments.length > 0 && <span className="comment-count">({comments.length})</span>}
      </h3>

      {user?.userId ? (
        <form onSubmit={submitComment} className="comment-form">
          <div className="comment-input-container">
            <div className="user-avatar">{getInitials(user.userName)}</div>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="comment-input"
              rows={3}
              disabled={isSubmitting}
            />
          </div>
          <button 
            type="submit" 
            className="submit-comment-btn"
            disabled={isSubmitting || !newComment.trim()}
          >
            {isSubmitting ? 'Posting...' : 'Post Comment'}
          </button>
        </form>
      ) : (
        <p className="sign-in-prompt">Sign in to leave a comment</p>
      )}

      <div className="comments-list">
        {isLoading ? (
          <div className="loading-comments">Loading comments...</div>
        ) : comments.length === 0 ? (
          <div className="no-comments">No comments yet. Be the first to comment!</div>
        ) : (
          comments.map(comment => (
            <div key={comment.id} className="comment-item">
              <div className="comment-avatar">{getInitials(comment.userName)}</div>
              <div className="comment-content">
                <div className="comment-header">
                  <span className="comment-author">{comment.userName}</span>
                  <span className="comment-date">{formatDate(comment.createdAt)}</span>
                  {user?.userId === comment.userId && (
                    <button 
                      className="delete-comment-btn"
                      onClick={() => deleteComment(comment.id)}
                      title="Delete comment"
                    >
                      ×
                    </button>
                  )}
                </div>
                <p className="comment-text">{comment.text}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Comments;
