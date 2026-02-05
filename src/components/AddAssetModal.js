import React, { useState, useRef } from 'react';

function AddAssetModal({ isOpen, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    assetName: '',
    assetDescription: '',
    createdBy: '',
    architectureUrl: '',
    presentationUrl: '',
    githubUrl: '',
  });
  const [tags, setTags] = useState([]);
  const [currentTag, setCurrentTag] = useState('');
  const [picturePreview, setPicturePreview] = useState(null);
  const [screenshots, setScreenshots] = useState([]);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  
  const assetPictureRef = useRef(null);
  const screenshotsRef = useRef(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePictureChange = (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        setPicturePreview(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateImage = async () => {
    if (!formData.assetName && !formData.assetDescription) {
      alert('Please enter an asset name or description to generate an image.');
      return;
    }
    
    setIsGeneratingImage(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/api/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          asset_name: formData.assetName,
          asset_description: formData.assetDescription,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to generate image');
      }
      
      const data = await response.json();
      const imageDataUrl = `data:${data.content_type};base64,${data.image_data}`;
      setPicturePreview(imageDataUrl);
    } catch (error) {
      console.error('Error generating image:', error);
      alert(`Failed to generate image: ${error.message}`);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleScreenshotsChange = (e) => {
    const files = Array.from(e.target.files);
    const newScreenshots = [];
    
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        newScreenshots.push({
          name: file.name,
          data: event.target.result,
        });
        if (newScreenshots.length === files.length) {
          setScreenshots(newScreenshots);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveScreenshot = (index) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddTag = () => {
    const trimmedTag = currentTag.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags(prev => [...prev, trimmedTag]);
      setCurrentTag('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(prev => prev.filter(tag => tag !== tagToRemove));
  };

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      
      const submitData = {
        assetName: formData.assetName,
        assetDescription: formData.assetDescription,
        createdBy: formData.createdBy,
        tags,
        architectureUrl: formData.architectureUrl || null,
        presentationUrl: formData.presentationUrl || null,
        githubUrl: formData.githubUrl || null,
        assetPicture: picturePreview || null,
        screenshots: screenshots.map(s => s.data),
      };
      
      const response = await fetch(`${apiUrl}/api/assets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to save asset');
      }
      
      const savedAsset = await response.json();
      onSubmit(savedAsset);
      resetForm();
      onClose();
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
      createdBy: '',
      architectureUrl: '',
      presentationUrl: '',
      githubUrl: '',
    });
    setTags([]);
    setCurrentTag('');
    setPicturePreview(null);
    setScreenshots([]);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target.classList.contains('modal')) {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal show" onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>Add New Asset</h2>
          <button className="modal-close" onClick={handleClose}>&times;</button>
        </div>
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
              <label htmlFor="assetDescription">Asset Description *</label>
              <textarea
                id="assetDescription"
                name="assetDescription"
                required
                placeholder="Enter asset description"
                rows="4"
                value={formData.assetDescription}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="createdBy">Your Name *</label>
              <input
                type="text"
                id="createdBy"
                name="createdBy"
                required
                placeholder="Enter your name"
                value={formData.createdBy}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="tags">Tags</label>
              <div className="tag-input-container">
                <input
                  type="text"
                  id="tags"
                  placeholder="Enter a tag"
                  value={currentTag}
                  onChange={(e) => setCurrentTag(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                />
                <button type="button" className="btn btn-secondary" onClick={handleAddTag}>
                  + ADD TAG
                </button>
              </div>
              {tags.length > 0 && (
                <div className="tags-list">
                  {tags.map((tag, index) => (
                    <span key={index} className="tag-badge">
                      {tag}
                      <button type="button" onClick={() => handleRemoveTag(tag)}>&times;</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="assetPicture">Asset Picture</label>
              <div className="image-input-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={handleGenerateImage}
                  disabled={isGeneratingImage}
                >
                  {isGeneratingImage ? 'GENERATING...' : '+ GENERATE IMAGE'}
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => assetPictureRef.current?.click()}
                >
                  + CHOOSE IMAGE
                </button>
                <input
                  type="file"
                  id="assetPicture"
                  name="assetPicture"
                  accept="image/*"
                  ref={assetPictureRef}
                  onChange={handlePictureChange}
                  style={{ display: 'none' }}
                />
              </div>
              {picturePreview && (
                <div className="preview-container">
                  <img src={picturePreview} alt="Preview" className="preview-image" />
                </div>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="architectureUrl">Architecture URL</label>
              <input
                type="url"
                id="architectureUrl"
                name="architectureUrl"
                placeholder="https://example.com/architecture"
                value={formData.architectureUrl}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="presentationUrl">Presentation URL</label>
              <input
                type="url"
                id="presentationUrl"
                name="presentationUrl"
                placeholder="https://example.com/presentation"
                value={formData.presentationUrl}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="githubUrl">GitHub Repository URL</label>
              <input
                type="url"
                id="githubUrl"
                name="githubUrl"
                placeholder="https://github.com/username/repo"
                value={formData.githubUrl}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="screenshots">Screenshots</label>
              <div className="file-input-wrapper" onClick={() => screenshotsRef.current?.click()}>
                <input
                  type="file"
                  id="screenshots"
                  name="screenshots"
                  accept="image/*"
                  multiple
                  ref={screenshotsRef}
                  onChange={handleScreenshotsChange}
                />
                <span className="file-input-label">Choose screenshots</span>
              </div>
              {screenshots.length > 0 && (
                <div className="screenshots-container">
                  {screenshots.map((screenshot, index) => (
                    <div key={index} className="screenshot-item">
                      <img src={screenshot.data} alt={screenshot.name} />
                      <button
                        type="button"
                        className="screenshot-remove"
                        onClick={() => handleRemoveScreenshot(index)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Submit Asset'}
            </button>
            <button type="button" className="btn btn-secondary modal-close-btn" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddAssetModal;
