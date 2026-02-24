import React, { useState, useEffect } from 'react';
import api from '../api';

function AddAssetModal({ isOpen, onClose, onSubmit, asset: editAsset }) {
  const isEditMode = !!editAsset;
  const [user, setUser] = useState(null);
  
  // Determine initial demo link type and URL from asset being edited
  const getInitialDemoLink = () => {
    if (editAsset) {
      if (editAsset.githubUrl) return { type: 'github', url: editAsset.githubUrl };
      if (editAsset.presentationUrl) return { type: 'presentation', url: editAsset.presentationUrl };
      if (editAsset.liveDemoUrl) return { type: 'livedemo', url: editAsset.liveDemoUrl };
      if (editAsset.recordingUrl) return { type: 'recording', url: editAsset.recordingUrl };
      if (editAsset.architectureUrl) return { type: 'architecture', url: editAsset.architectureUrl };
    }
    return { type: null, url: '' };
  };

  const [formData, setFormData] = useState({
    assetName: editAsset?.assetName || '',
    assetDescription: editAsset?.assetDescription || '',
    primaryCustomerScenario: editAsset?.primaryCustomerScenario || '',
  });
  const initialDemoLink = getInitialDemoLink();
  const [demoLinkType, setDemoLinkType] = useState(initialDemoLink.type);
  const [demoLinkUrl, setDemoLinkUrl] = useState(initialDemoLink.url);
  const [picturePreview, setPicturePreview] = useState(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [savedAsset, setSavedAsset] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Reset form when modal opens or editAsset changes
  useEffect(() => {
    if (isOpen) {
      const demoLink = getInitialDemoLink();
      setFormData({
        assetName: editAsset?.assetName || '',
        assetDescription: editAsset?.assetDescription || '',
        primaryCustomerScenario: editAsset?.primaryCustomerScenario || '',
      });
      setDemoLinkType(demoLink.type);
      setDemoLinkUrl(demoLink.url);
      setPicturePreview(null);
      setShowSuccessDialog(false);
      setSavedAsset(null);
      setErrorMessage('');
    }
  }, [isOpen, editAsset]);

  // Fetch user from EasyAuth
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
              userId: principal.user_id,
              userName: getClaimValue('name') || getClaimValue('preferred_username') || principal.user_id
            });
          }
        }
      } catch (err) {
        console.log('EasyAuth not available');
      }
    };
    fetchUser();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleGenerateImage = async () => {
    const targetAsset = savedAsset || editAsset;
    if (!targetAsset) {
      return;
    }
    
    setIsGeneratingImage(true);
    try {
      const response = await api.post('/api/generate-image', {
        asset_name: targetAsset.assetName,
        asset_description: targetAsset.assetDescription,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to generate image');
      }
      
      const data = await response.json();
      const imageDataUrl = `data:${data.content_type};base64,${data.image_data}`;
      setPicturePreview(imageDataUrl);
      
      // Update the asset with the generated image
      await api.patch(`/api/assets/${targetAsset.id}/picture`, { assetPicture: imageDataUrl });
    } catch (error) {
      console.error('Error generating image:', error);
      alert(`Failed to generate image: ${error.message}`);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate that a demo link is selected and URL is provided
    if (!demoLinkType || !demoLinkUrl.trim()) {
      setErrorMessage('Please select a Demo Link option and enter a URL.');
      return;
    }
    
    setErrorMessage('');
    setIsSubmitting(true);
    
    try {
      const submitData = {
        assetName: formData.assetName,
        assetDescription: formData.assetDescription,
        primaryCustomerScenario: formData.primaryCustomerScenario || null,
        architectureUrl: demoLinkType === 'architecture' ? demoLinkUrl : null,
        presentationUrl: demoLinkType === 'presentation' ? demoLinkUrl : null,
        githubUrl: demoLinkType === 'github' ? demoLinkUrl : null,
        liveDemoUrl: demoLinkType === 'livedemo' ? demoLinkUrl : null,
        recordingUrl: demoLinkType === 'recording' ? demoLinkUrl : null,
      };
      
      // Include extra fields only for create mode
      if (!isEditMode) {
        submitData.createdBy = user?.userName || 'Anonymous';
        submitData.createdByEmail = user?.userId || null;
        submitData.tags = [];
        submitData.assetPicture = null;
        submitData.screenshots = [];
      }
      
      const response = isEditMode 
        ? await api.put(`/api/assets/${editAsset.id}`, submitData)
        : await api.post('/api/assets', submitData);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save asset');
      }
      
      const savedAsset = await response.json();
      
      if (isEditMode) {
        // For edit mode, just call onSubmit and close
        onSubmit(savedAsset);
        onClose();
      } else {
        // For create mode, show success dialog
        setSavedAsset(savedAsset);
        resetForm();
        setShowSuccessDialog(true);
      }
    } catch (error) {
      console.error('Error saving asset:', error);
      alert(`Failed to save asset: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      assetName: '',
      assetDescription: '',
      primaryCustomerScenario: '',
    });
    setDemoLinkType(null);
    setDemoLinkUrl('');
    setPicturePreview(null);
    setErrorMessage('');
  };

  const handleClose = () => {
    resetForm();
    setShowSuccessDialog(false);
    setSavedAsset(null);
    onClose();
  };

  const handleSuccessOk = () => {
    if (savedAsset) {
      onSubmit(savedAsset);
    }
    handleClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target.classList.contains('modal')) {
      handleClose();
    }
  };

  const handleDemoLinkSelect = (type) => {
    setDemoLinkType(demoLinkType === type ? null : type);
    setErrorMessage('');
  };

  if (!isOpen) return null;

  return (
    <div className="modal show" onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-header-text">
            <h2>{isEditMode ? 'Fix asset details' : 'Add New Asset'}</h2>
            {isEditMode && (
              <>
                <p className="modal-subtitle">Use this to update details or links</p>
                <p className="modal-subtitle-light">Changes here won't affect how others use the demo.</p>
              </>
            )}
          </div>
          <button className="modal-close" onClick={handleClose}>&times;</button>
        </div>
        {errorMessage && (
          <div className="error-banner">
            <span className="error-icon">⚠</span>
            {errorMessage}
          </div>
        )}
        <form className="asset-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="assetName">Asset Name *</label>
              <input
                type="text"
                id="assetName"
                name="assetName"
                required
                placeholder="Enter asset name"
                value={formData.assetName}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="assetDescription">What this demo shows *</label>
              <textarea
                id="assetDescription"
                name="assetDescription"
                required
                placeholder="1–2 lines. Think how you'd explain this to another SE."
                rows="4"
                value={formData.assetDescription}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="primaryCustomerScenario">Primary Customer Scenario</label>
              <select
                id="primaryCustomerScenario"
                name="primaryCustomerScenario"
                value={formData.primaryCustomerScenario}
                onChange={handleInputChange}
              >
                <option value=""></option>
                <option value="Digital Avatar / Conversational UI">Digital Avatar / Conversational UI</option>
                <option value="Contact Center & CX">Contact Center & CX</option>
                <option value="HR & Talent">HR & Talent</option>
                <option value="Finance & Investment Analysis">Finance & Investment Analysis</option>
                <option value="Procurement & RFP">Procurement & RFP</option>
                <option value="Platform / Architecture">Platform / Architecture</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Demo Link (any one)</label>
              <div className="demo-link-pills">
                <button
                  type="button"
                  className={`demo-link-pill ${demoLinkType === 'github' ? 'active' : ''}`}
                  onClick={() => handleDemoLinkSelect('github')}
                >
                  <svg className="pill-icon" viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg> GitHub
                </button>
                <button
                  type="button"
                  className={`demo-link-pill ${demoLinkType === 'presentation' ? 'active' : ''}`}
                  onClick={() => handleDemoLinkSelect('presentation')}
                >
                  <svg className="pill-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 17h2v-7H7v7zm4 0h2V7h-2v10zm4 0h2v-4h-2v4z"/></svg> Slide Deck
                </button>
                <button
                  type="button"
                  className={`demo-link-pill ${demoLinkType === 'livedemo' ? 'active' : ''}`}
                  onClick={() => handleDemoLinkSelect('livedemo')}
                >
                  <svg className="pill-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M8 5v14l11-7z"/></svg> Live Demo URL
                </button>
                <button
                  type="button"
                  className={`demo-link-pill ${demoLinkType === 'recording' ? 'active' : ''}`}
                  onClick={() => handleDemoLinkSelect('recording')}
                >
                  <svg className="pill-icon" viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg> Recording
                </button>
              </div>
              <p style={{ fontSize: '12px', color: '#aaa', margin: '8px 0 0 0', fontStyle: 'italic' }}>
                Tip – always keep your GitHub repos private, and provide access only when requested on a peer-to-peer basis.
              </p>
              {demoLinkType && (
                <input
                  type="url"
                  className="demo-link-input"
                  placeholder={`Enter ${demoLinkType === 'github' ? 'GitHub repository' : demoLinkType === 'presentation' ? 'slide deck' : demoLinkType === 'livedemo' ? 'live demo' : 'recording'} URL`}
                  value={demoLinkUrl}
                  onChange={(e) => { setDemoLinkUrl(e.target.value); setErrorMessage(''); }}
                />
              )}
            </div>
          </div>

          {isEditMode && (
            <div className="form-row">
              <div className="form-group">
                <label>Cover Image</label>
                <div className="edit-image-section">
                  {(picturePreview || editAsset?.assetPicture) ? (
                    <div className="edit-image-preview">
                      <img src={picturePreview || editAsset.assetPicture} alt="Asset cover" />
                    </div>
                  ) : (
                    <div className="edit-image-placeholder">No cover image</div>
                  )}
                  <button 
                    type="button" 
                    className="btn btn-secondary generate-image-btn" 
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage}
                  >
                    {isGeneratingImage ? 'Generating...' : (editAsset?.assetPicture || picturePreview ? 'Regenerate Image' : 'Generate Image')}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : (isEditMode ? 'Update Asset' : 'Submit Asset')}
            </button>
            <button type="button" className="btn btn-secondary modal-close-btn" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* Success Dialog */}
      {showSuccessDialog && (
        <div className="success-dialog-overlay">
          <div className="success-dialog">
            <div className="success-icon">
              <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <p className="success-message">Asset published. You can add more links anytime.</p>
            
            {!picturePreview && (
              <div className="generate-image-section">
                <p className="generate-image-prompt">Want a cover image? We can generate one automatically.</p>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={handleGenerateImage}
                  disabled={isGeneratingImage}
                >
                  {isGeneratingImage ? 'GENERATING...' : '+ GENERATE IMAGE'}
                </button>
              </div>
            )}
            
            {picturePreview && (
              <div className="generated-image-preview">
                <img src={picturePreview} alt="Generated cover" />
                <p className="image-added-text">✓ Cover image added!</p>
              </div>
            )}
            
            <button className="btn btn-primary" onClick={handleSuccessOk}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AddAssetModal;
