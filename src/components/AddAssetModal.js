import React, { useState, useRef } from 'react';

function AddAssetModal({ isOpen, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    assetName: '',
    assetDescription: '',
    architectureUrl: '',
    presentationUrl: '',
    githubUrl: '',
  });
  const [tags, setTags] = useState([]);
  const [currentTag, setCurrentTag] = useState('');
  const [picturePreview, setPicturePreview] = useState(null);
  const [screenshots, setScreenshots] = useState([]);
  
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

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const submitData = {
      ...formData,
      tags,
      assetPicture: assetPictureRef.current?.files?.[0]?.name || null,
      screenshots: screenshots.map(s => s.name),
      submittedAt: new Date().toISOString(),
    };
    
    onSubmit(submitData);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      assetName: '',
      assetDescription: '',
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
                <button type="button" className="btn btn-add-tag" onClick={handleAddTag}>
                  Add Tag
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
              <div className="file-input-wrapper" onClick={() => assetPictureRef.current?.click()}>
                <input
                  type="file"
                  id="assetPicture"
                  name="assetPicture"
                  accept="image/*"
                  ref={assetPictureRef}
                  onChange={handlePictureChange}
                />
                <span className="file-input-label">Choose image</span>
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
            <button type="submit" className="btn btn-primary">Submit Asset</button>
            <button type="button" className="btn btn-secondary modal-close-btn" onClick={handleClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddAssetModal;
