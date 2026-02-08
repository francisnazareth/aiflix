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
    console.log('DEBUG API - Using cached token');
    return cachedToken;
  }

  try {
    console.log('DEBUG API - Fetching token from /.auth/me');
    const response = await fetch('/.auth/me');
    console.log('DEBUG API - /.auth/me response status:', response.status);
    if (response.ok) {
      const data = await response.json();
      console.log('DEBUG API - /.auth/me data length:', data?.length);
      if (data && data.length > 0) {
        cachedToken = data[0].id_token;
        console.log('DEBUG API - id_token present:', !!cachedToken);
        console.log('DEBUG API - id_token length:', cachedToken?.length);
        // Parse token to get expiry (tokens typically last 1 hour)
        if (cachedToken) {
          try {
            const payload = JSON.parse(atob(cachedToken.split('.')[1]));
            tokenExpiry = payload.exp * 1000; // Convert to milliseconds
            console.log('DEBUG API - Token expires:', new Date(tokenExpiry));
            console.log('DEBUG API - Token aud:', payload.aud);
            console.log('DEBUG API - Token iss:', payload.iss);
          } catch {
            // If we can't parse, assume 1 hour validity
            tokenExpiry = Date.now() + 60 * 60 * 1000;
          }
        }
        return cachedToken;
      } else {
        console.log('DEBUG API - No user data in /.auth/me response');
      }
    }
  } catch (err) {
    console.log('DEBUG API - Failed to get auth token:', err);
  }
  
  console.log('DEBUG API - No token available');
  return null;
}

/**
 * Make an authenticated API request
 */
export async function apiFetch(endpoint, options = {}) {
  const token = await getIdToken();
  console.log('DEBUG API - apiFetch called for:', endpoint);
  console.log('DEBUG API - Token available:', !!token);
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  
  // Add auth header if we have a token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    console.log('DEBUG API - Authorization header set');
  } else {
    console.log('DEBUG API - WARNING: No token, request will fail');
  }
  
  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
  console.log('DEBUG API - Request URL:', url);
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  console.log('DEBUG API - Response status:', response.status);
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
