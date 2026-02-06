import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Comments from './Comments';
import ImproveAssetModal from './ImproveAssetModal';
import AddAssetModal from './AddAssetModal';

function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [showImproveModal, setShowImproveModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch authenticated user from EasyAuth
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/.auth/me');
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            const principal = data[0];
            // Extract user info from EasyAuth claims
            const claims = principal.user_claims || [];
            const getClaimValue = (type) => {
              const claim = claims.find(c => c.typ === type || c.typ.endsWith('/' + type));
              return claim ? claim.val : null;
            };

            setUser({
              userId: principal.user_id || getClaimValue('nameidentifier') || getClaimValue('objectidentifier'),
              userName: getClaimValue('name') || getClaimValue('preferred_username') || principal.user_id,
              email: getClaimValue('emailaddress') || getClaimValue('email')
            });
          }
        }
      } catch (err) {
        // Running locally without EasyAuth - allow anonymous access
        console.log('EasyAuth not available, running in anonymous mode');
      }
    };

    fetchUser();
  }, []);

  useEffect(() => {
    const fetchAsset = async () => {
      try {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
        const response = await fetch(`${apiUrl}/api/assets/${id}`);
        if (!response.ok) {
          throw new Error('Asset not found');
        }
        const data = await response.json();
        setAsset(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAsset();
  }, [id]);

  const refreshAsset = async () => {
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    const response = await fetch(`${apiUrl}/api/assets/${id}`);
    if (response.ok) {
      const data = await response.json();
      setAsset(data);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this asset? This action cannot be undone.')) {
      return;
    }
    
    setIsDeleting(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/assets/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete asset');
      }
      
      navigate('/');
    } catch (err) {
      alert(`Failed to delete asset: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const isOwner = user && asset && user.userName === asset.createdBy;

  if (loading) {
    return (
      <div className="asset-detail-page">
        <div className="asset-detail-loading">Loading asset...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="asset-detail-page">
        <div className="asset-detail-error">
          <h2>Error</h2>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="asset-detail-page">
      <button className="btn btn-secondary back-btn" onClick={() => navigate('/')}>
        ← Back to Assets
      </button>

      <div className="asset-detail-container">
        <div className="asset-detail-header">
          <div className="asset-detail-image">
            {asset.assetPicture ? (
              <img src={asset.assetPicture} alt={asset.assetName} />
            ) : (
              <div className="no-image">No Image</div>
            )}
          </div>
          <div className="asset-detail-info">
            <h1 className="asset-detail-title">{asset.assetName}</h1>
            <p className="asset-detail-author">
              <span className="label">Created by:</span> {asset.createdBy}
            </p>
            <p className="asset-detail-date">
              <span className="label">Created:</span> {new Date(asset.createdAt).toLocaleDateString()}
            </p>
            
            {asset.tags && asset.tags.length > 0 && (
              <div className="asset-detail-tags">
                <span className="label">Tags:</span>
                <div className="tags-list">
                  {asset.tags.map((tag, index) => (
                    <span key={index} className="tag-badge">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="asset-detail-description-inline">
              <p>{asset.assetDescription}</p>
            </div>

            {isOwner && (
              <div className="asset-owner-actions">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setShowEditModal(true)}
                >
                  Edit Asset
                </button>
                <button 
                  className="btn btn-danger"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting...' : 'Delete Asset'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="asset-detail-section">
          <div className="resources-header">
            <h2>Resources</h2>
            <button 
              className="btn btn-improve"
              onClick={() => setShowImproveModal(true)}
            >
              + Improve this asset
            </button>
          </div>
          <div className="asset-detail-links">
            {asset.architectureUrl && (
              <a href={asset.architectureUrl} target="_blank" rel="noopener noreferrer" className="resource-link">
                <span className="resource-icon">📐</span>
                Architecture Diagram
              </a>
            )}
            {asset.presentationUrl && (
              <a href={asset.presentationUrl} target="_blank" rel="noopener noreferrer" className="resource-link">
                <span className="resource-icon">📊</span>
                Slide Deck
              </a>
            )}
            {asset.githubUrl && (
              <a href={asset.githubUrl} target="_blank" rel="noopener noreferrer" className="resource-link">
                <span className="resource-icon">💻</span>
                GitHub Repository
              </a>
            )}
            {!asset.architectureUrl && !asset.presentationUrl && !asset.githubUrl && (
              <p className="no-resources">No resource links available</p>
            )}
          </div>
        </div>

        {asset.screenshots && asset.screenshots.length > 0 && (
          <div className="asset-detail-section">
            <h2>Screenshots</h2>
            <div className="screenshots-grid">
              {asset.screenshots.map((screenshot, index) => (
                <div key={index} className="screenshot-item">
                  <img src={screenshot} alt={`Screenshot ${index + 1}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="asset-detail-section">
          <Comments assetId={id} user={user} />
        </div>
      </div>

      {showImproveModal && (
        <ImproveAssetModal
          asset={asset}
          user={user}
          onClose={() => setShowImproveModal(false)}
          onSuccess={refreshAsset}
        />
      )}

      <AddAssetModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSubmit={(updatedAsset) => {
          setAsset(updatedAsset);
          setShowEditModal(false);
        }}
        asset={asset}
      />
    </div>
  );
}

export default AssetDetail;
