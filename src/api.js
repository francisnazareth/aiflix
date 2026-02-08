/**
 * API helper with authentication support.
 * Automatically attaches Azure AD tokens to API requests.
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Cache for the auth token
let cachedToken = null;
let tokenExpiry = null;

/**
 * Get the ID token from EasyAuth
 */
async function getIdToken() {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken;
  }

  try {
    const response = await fetch('/.auth/me');
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        cachedToken = data[0].id_token;
        // Parse token to get expiry (tokens typically last 1 hour)
        if (cachedToken) {
          try {
            const payload = JSON.parse(atob(cachedToken.split('.')[1]));
            tokenExpiry = payload.exp * 1000; // Convert to milliseconds
          } catch {
            // If we can't parse, assume 1 hour validity
            tokenExpiry = Date.now() + 60 * 60 * 1000;
          }
        }
        return cachedToken;
      }
    }
  } catch (err) {
    console.log('Failed to get auth token:', err);
  }
  
  return null;
}

/**
 * Make an authenticated API request
 */
export async function apiFetch(endpoint, options = {}) {
  const token = await getIdToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  // Add auth header if we have a token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  return response;
}

/**
 * Convenience methods
 */
export const api = {
  get: (endpoint) => apiFetch(endpoint),
  
  post: (endpoint, data) => apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  
  put: (endpoint, data) => apiFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  
  patch: (endpoint, data) => apiFetch(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }),
  
  delete: (endpoint) => apiFetch(endpoint, {
    method: 'DELETE',
  }),
};

export default api;
