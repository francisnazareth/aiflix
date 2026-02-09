import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Comments from './Comments';
import ImproveAssetModal from './ImproveAssetModal';
import AddAssetModal from './AddAssetModal';
import api from '../api';

function AssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [improvements, setImprovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [showImproveModal, setShowImproveModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
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
        const response = await api.get(`/api/assets/${id}`);
        if (!response.ok) {
          throw new Error('Asset not found');
        }
        const data = await response.json();
        setAsset(data);
        
        // Also fetch improvements
        const improvementsResponse = await api.get(`/api/assets/${id}/improvements`);
        if (improvementsResponse.ok) {
          const improvementsData = await improvementsResponse.json();
          setImprovements(improvementsData);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAsset();
  }, [id]);

  const refreshAsset = async () => {
    const response = await api.get(`/api/assets/${id}`);
    if (response.ok) {
      const data = await response.json();
      setAsset(data);
    }
    // Also refresh improvements
    const improvementsResponse = await api.get(`/api/assets/${id}/improvements`);
    if (improvementsResponse.ok) {
      const improvementsData = await improvementsResponse.json();
      setImprovements(improvementsData);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await api.delete(`/api/assets/${id}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete asset');
      }
      
      navigate('/');
    } catch (err) {
      alert(`Failed to delete asset: ${err.message}`);
      setShowDeleteModal(false);
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
              <span className="label">Maintained by:</span>{' '}
              {asset.createdByEmail ? (
                <a 
                  href={`https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(asset.createdByEmail)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="owner-link"
                  title="Chat in Teams"
                >
                  {asset.createdBy}
                </a>
              ) : (
                <span>{asset.createdBy}</span>
              )}
            </p>
            <p className="asset-detail-date">
              <span className="label">Created:</span> {new Date(asset.createdAt).toLocaleDateString()}
            </p>
            <p className="asset-detail-date">
              <span className="label">Last maintained:</span> {new Date(asset.lastMaintainedAt || asset.createdAt).toLocaleDateString()}
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
                  Fix asset details
                </button>
                <button 
                  className="btn btn-delete-link"
                  onClick={() => setShowDeleteModal(true)}
                >
                  <svg className="trash-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                  Delete asset
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
            {/* Architecture links from improvements */}
            {improvements.filter(imp => imp.type === 'architecture' && imp.data?.url).map((arch, idx) => (
              <a key={`arch-${idx}`} href={arch.data.url} target="_blank" rel="noopener noreferrer" className="resource-link">
                <span className="resource-icon">📐</span>
                {arch.data.note || 'Architecture Diagram'}
                {arch.contributorName && <span className="contributor-badge">by {arch.contributorName}</span>}
              </a>
            ))}
            {asset.presentationUrl && (
              <a href={asset.presentationUrl} target="_blank" rel="noopener noreferrer" className="resource-link">
                <span className="resource-icon">📊</span>
                Slide Deck
              </a>
            )}
            {/* Slides from improvements */}
            {improvements.filter(imp => imp.type === 'slides' && imp.data?.url).map((slide, idx) => (
              <a key={`slides-${idx}`} href={slide.data.url} target="_blank" rel="noopener noreferrer" className="resource-link">
                <span className="resource-icon">📊</span>
                {slide.data.note || 'Slide Deck'}
                {slide.contributorName && <span className="contributor-badge">by {slide.contributorName}</span>}
              </a>
            ))}
            {asset.githubUrl && (
              <a href={asset.githubUrl} target="_blank" rel="noopener noreferrer" className="resource-link">
                <span className="resource-icon">💻</span>
                GitHub Repository
              </a>
            )}
            {/* Deployment scripts from improvements */}
            {improvements.filter(imp => imp.type === 'deployment' && imp.data?.url).map((dep, idx) => (
              <a key={`deploy-${idx}`} href={dep.data.url} target="_blank" rel="noopener noreferrer" className="resource-link">
                <span className="resource-icon">🚀</span>
                {dep.data.type ? `Deployment Script (${dep.data.type})` : 'Deployment Script'}
                {dep.data.note && <span className="resource-note"> — {dep.data.note}</span>}
                {dep.contributorName && <span className="contributor-badge">by {dep.contributorName}</span>}
              </a>
            ))}
            {!asset.architectureUrl && !asset.presentationUrl && !asset.githubUrl && 
             improvements.filter(imp => ['architecture', 'slides', 'deployment'].includes(imp.type) && imp.data?.url).length === 0 && (
              <p className="no-resources">No resource links available</p>
            )}
          </div>
        </div>

        {/* Demo Flow section from improvements */}
        {(() => {
          const demoFlows = improvements.filter(imp => imp.type === 'demoflow' && imp.data?.steps?.length > 0);
          return demoFlows.length > 0 && (
            <div className="asset-detail-section">
              <h2>Demo Flow</h2>
              {demoFlows.map((flow, flowIndex) => (
                <div key={flowIndex} className="demo-flow-container">
                  <ol className="demo-flow-steps">
                    {flow.data.steps.map((step, stepIndex) => (
                      <li key={stepIndex} className="demo-flow-step">{step}</li>
                    ))}
                  </ol>
                  <p className="demo-flow-contributor">Contributed by {flow.contributorName}</p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Screenshots section - combines asset screenshots and improvement screenshots */}
        {(() => {
          const assetScreenshots = asset.screenshots || [];
          const improvementScreenshots = improvements
            .filter(imp => imp.type === 'screenshots' && imp.data?.images)
            .flatMap(imp => imp.data.images.map(img => ({
              data: img.data,
              caption: img.caption,
              contributor: imp.contributorName
            })));
          const allScreenshots = [
            ...assetScreenshots.map(s => ({ data: s, caption: null, contributor: null })),
            ...improvementScreenshots
          ];
          
          return allScreenshots.length > 0 && (
            <div className="asset-detail-section">
              <h2>Screenshots</h2>
              <div className="screenshots-grid">
                {allScreenshots.map((screenshot, index) => (
                  <div key={index} className="screenshot-item">
                    <img src={screenshot.data} alt={screenshot.caption || `Screenshot ${index + 1}`} loading="lazy" />
                    {(screenshot.caption || screenshot.contributor) && (
                      <div className="screenshot-info">
                        {screenshot.caption && <span className="screenshot-caption">{screenshot.caption}</span>}
                        {screenshot.contributor && <span className="screenshot-contributor">by {screenshot.contributor}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Setup Notes section from improvements */}
        {(() => {
          const setupNotes = improvements.filter(imp => imp.type === 'setup' && imp.data?.notes);
          return setupNotes.length > 0 && (
            <div className="asset-detail-section">
              <h2>Setup Notes</h2>
              {setupNotes.map((note, idx) => (
                <div key={idx} className="setup-notes-container">
                  <p className="setup-notes-text">{note.data.notes}</p>
                  {note.contributorName && <p className="setup-notes-contributor">Contributed by {note.contributorName}</p>}
                </div>
              ))}
            </div>
          );
        })()}

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

      {showDeleteModal && (
        <div className="modal show" onClick={(e) => e.target.classList.contains('modal') && setShowDeleteModal(false)}>
          <div className="delete-modal-content">
            <h2>Delete asset</h2>
            <p>This removes the asset from the demo library. Others won't be able to access it.</p>
            <div className="delete-modal-actions">
              <button 
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AssetDetail;
