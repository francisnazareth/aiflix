import React, { useState } from 'react';
import api from '../api';

function ImproveAssetModal({ onClose, asset, user, onSuccess }) {
  const [activeAction, setActiveAction] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form data for each action type
  const [deploymentData, setDeploymentData] = useState({ url: '', type: '', note: '' });
  const [architectureData, setArchitectureData] = useState({ url: '', note: '' });
  const [demoFlowData, setDemoFlowData] = useState({ steps: ['', '', '', '', ''] });
  const [screenshotsData, setScreenshotsData] = useState([]);
  const [slidesVideoData, setSlidesVideoData] = useState({ url: '', label: '' });
  const [setupNotesData, setSetupNotesData] = useState({ notes: '' });

  const resetForms = () => {
    setDeploymentData({ url: '', type: '', note: '' });
    setArchitectureData({ url: '', note: '' });
    setDemoFlowData({ steps: ['', '', '', '', ''] });
    setScreenshotsData([]);
    setSlidesVideoData({ url: '', label: '' });
    setSetupNotesData({ notes: '' });
    setActiveAction(null);
  };

  const handleClose = () => {
    resetForms();
    onClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target.classList.contains('improve-modal-overlay')) {
      handleClose();
    }
  };

  const handleSubmit = async (actionType, data) => {
    setIsSubmitting(true);
    try {
      const response = await api.post(`/api/assets/${asset.id}/improvements`, {
        type: actionType,
        data: data,
        contributorName: user?.userName || 'Anonymous',
        contributorId: user?.userId || 'anonymous'
      });

      if (!response.ok) {
        throw new Error('Failed to save improvement');
      }

      if (onSuccess) onSuccess();
      resetForms();
      handleClose();
    } catch (error) {
      console.error('Error saving improvement:', error);
      alert('Failed to save improvement. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScreenshotUpload = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setScreenshotsData(prev => [...prev, { data: event.target.result, caption: '' }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const updateScreenshotCaption = (index, caption) => {
    setScreenshotsData(prev => prev.map((s, i) => i === index ? { ...s, caption } : s));
  };

  const removeScreenshot = (index) => {
    setScreenshotsData(prev => prev.filter((_, i) => i !== index));
  };

  const updateDemoStep = (index, value) => {
    setDemoFlowData(prev => ({
      steps: prev.steps.map((s, i) => i === index ? value : s)
    }));
  };

  const detectUrlType = (url) => {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
    if (url.includes('stream.') || url.includes('microsoftstream')) return 'Microsoft Stream';
    if (url.includes('sharepoint.com') || url.includes('onedrive')) {
      if (url.includes('.pptx') || url.includes('powerpoint')) return 'PowerPoint';
      return 'OneDrive';
    }
    return '';
  };

  const actionCards = [
    { id: 'demoflow', icon: '🎯', title: 'Add demo flow / talk track', desc: 'How to run the demo' },
    { id: 'deployment', icon: '🚀', title: 'Add deployment script', desc: 'azd / Bicep / Terraform' },
    { id: 'slides', icon: '🎬', title: 'Add slides or video', desc: 'Presentation / recording' },
    { id: 'screenshots', icon: '📸', title: 'Add screenshots', desc: 'Visual walkthrough' },
    { id: 'setup', icon: '📝', title: 'Add setup notes', desc: 'Things to know before running' },
    { id: 'architecture', icon: '📐', title: 'Add architecture diagram', desc: 'Link to diagram' },
  ];

  return (
    <div className="improve-modal-overlay" onClick={handleBackdropClick}>
      <div className="improve-modal">
        <div className="improve-modal-header">
          <h2>{activeAction ? 'Add Details' : 'Improve this asset'}</h2>
          <p className="improve-modal-subtitle">Add only what you have. Even one small addition helps the next SE.</p>
        </div>
        <button className="modal-close" onClick={handleClose}>&times;</button>

        <div className="improve-modal-content">
        {!activeAction ? (
          <>
            <p className="improve-prompt">What would you like to add?</p>
            <div className="action-cards-grid">
              {actionCards.map(card => (
                <button
                  key={card.id}
                  className="action-card"
                  onClick={() => setActiveAction(card.id)}
                >
                  <span className="action-card-icon">{card.icon}</span>
                  <span className="action-card-title">{card.title}</span>
                  <span className="action-card-desc">{card.desc}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="micro-form">
            <button className="back-to-actions" onClick={() => setActiveAction(null)}>
              ← Back to options
            </button>

            {/* Deployment Script Form */}
            {activeAction === 'deployment' && (
              <div className="micro-form-content">
                <h3>🚀 Add deployment script</h3>
                <div className="form-group">
                  <label>GitHub link or file URL</label>
                  <input
                    type="url"
                    placeholder="https://github.com/..."
                    value={deploymentData.url}
                    onChange={(e) => setDeploymentData(prev => ({ ...prev, url: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Type (optional)</label>
                  <div className="type-pills">
                    {['azd', 'Bicep', 'Terraform', 'ARM'].map(type => (
                      <button
                        key={type}
                        type="button"
                        className={`type-pill ${deploymentData.type === type ? 'active' : ''}`}
                        onClick={() => setDeploymentData(prev => ({ ...prev, type: prev.type === type ? '' : type }))}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label>Note (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g., Works in Azure OpenAI Sweden Central"
                    value={deploymentData.note}
                    onChange={(e) => setDeploymentData(prev => ({ ...prev, note: e.target.value }))}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => handleSubmit('deployment', deploymentData)}
                  disabled={!deploymentData.url || isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}

            {/* Architecture Diagram Form */}
            {activeAction === 'architecture' && (
              <div className="micro-form-content">
                <h3>📐 Add architecture diagram</h3>
                <div className="form-group">
                  <label>Link to diagram</label>
                  <input
                    type="url"
                    placeholder="SharePoint, GitHub, or image URL"
                    value={architectureData.url}
                    onChange={(e) => setArchitectureData(prev => ({ ...prev, url: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Description (optional)</label>
                  <input
                    type="text"
                    placeholder="Brief description of the architecture"
                    value={architectureData.note}
                    onChange={(e) => setArchitectureData(prev => ({ ...prev, note: e.target.value }))}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => handleSubmit('architecture', architectureData)}
                  disabled={!architectureData.url || isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}

            {/* Demo Flow Form */}
            {activeAction === 'demoflow' && (
              <div className="micro-form-content">
                <h3>🎯 Add demo flow / talk track</h3>
                <p className="form-hint">Add up to 5 key steps in your demo</p>
                <div className="demo-steps">
                  {demoFlowData.steps.map((step, index) => (
                    <div key={index} className="demo-step-input">
                      <span className="step-number">{index + 1}</span>
                      <input
                        type="text"
                        placeholder={index === 0 ? 'e.g., Upload RFP document' : ''}
                        value={step}
                        onChange={(e) => updateDemoStep(index, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => handleSubmit('demoflow', { steps: demoFlowData.steps.filter(s => s.trim()) })}
                  disabled={!demoFlowData.steps.some(s => s.trim()) || isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}

            {/* Screenshots Form */}
            {activeAction === 'screenshots' && (
              <div className="micro-form-content">
                <h3>📸 Add screenshots</h3>
                <div className="screenshots-upload-area">
                  <input
                    type="file"
                    id="screenshot-upload"
                    accept="image/*"
                    multiple
                    onChange={handleScreenshotUpload}
                    style={{ display: 'none' }}
                  />
                  <label htmlFor="screenshot-upload" className="upload-drop-zone">
                    <span className="upload-icon">📤</span>
                    <span>Drag & drop images or click to upload</span>
                  </label>
                </div>
                {screenshotsData.length > 0 && (
                  <div className="screenshots-preview-list">
                    {screenshotsData.map((screenshot, index) => (
                      <div key={index} className="screenshot-preview-item">
                        <img src={screenshot.data} alt={`Screenshot ${index + 1}`} />
                        <input
                          type="text"
                          placeholder="Add caption (optional)"
                          value={screenshot.caption}
                          onChange={(e) => updateScreenshotCaption(index, e.target.value)}
                        />
                        <button
                          type="button"
                          className="remove-screenshot"
                          onClick={() => removeScreenshot(index)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  onClick={() => handleSubmit('screenshots', { images: screenshotsData })}
                  disabled={screenshotsData.length === 0 || isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}

            {/* Slides/Video Form */}
            {activeAction === 'slides' && (
              <div className="micro-form-content">
                <h3>🎬 Add slides or video</h3>
                <div className="form-group">
                  <label>URL</label>
                  <input
                    type="url"
                    placeholder="PowerPoint, Stream, YouTube, or OneDrive link"
                    value={slidesVideoData.url}
                    onChange={(e) => {
                      const url = e.target.value;
                      const detectedType = detectUrlType(url);
                      setSlidesVideoData(prev => ({ 
                        ...prev, 
                        url,
                        label: detectedType || prev.label 
                      }));
                    }}
                  />
                </div>
                {slidesVideoData.label && (
                  <div className="detected-type">
                    Detected: <span className="type-badge">{slidesVideoData.label}</span>
                  </div>
                )}
                <div className="form-group">
                  <label>Label (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g., Customer presentation"
                    value={slidesVideoData.label}
                    onChange={(e) => setSlidesVideoData(prev => ({ ...prev, label: e.target.value }))}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => handleSubmit('slides', slidesVideoData)}
                  disabled={!slidesVideoData.url || isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}

            {/* Setup Notes Form */}
            {activeAction === 'setup' && (
              <div className="micro-form-content">
                <h3>📝 Add setup notes</h3>
                <div className="form-group">
                  <label>Prerequisites & tips</label>
                  <textarea
                    placeholder="e.g., Requires Azure OpenAI access&#10;Set OPENAI_API_KEY environment variable&#10;Works best with GPT-4"
                    rows="6"
                    value={setupNotesData.notes}
                    onChange={(e) => setSetupNotesData({ notes: e.target.value })}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => handleSubmit('setup', setupNotesData)}
                  disabled={!setupNotesData.notes.trim() || isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
          </div>
        )}

        <p className="contribution-note">
          Your contribution will be credited to {user?.userName || 'Anonymous'}
        </p>
        </div>
      </div>
    </div>
  );
}

export default ImproveAssetModal;
