/**
 * API helper with authentication support.
 * Automatically attaches Azure AD tokens to API requests.
 * Handles token expiry by refreshing via EasyAuth or prompting re-login.
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// Cache for the auth token
let cachedToken = null;
let tokenExpiry = null;
let isRefreshing = false;
let refreshPromise = null;

/**
 * Force-refresh the EasyAuth session and get a new token.
 * Returns the new token or null if refresh failed.
 */
async function refreshAuthSession() {
  // Avoid multiple simultaneous refresh attempts
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      console.log('DEBUG API - Attempting EasyAuth token refresh via /.auth/refresh');
      const refreshResponse = await fetch('/.auth/refresh');
      if (refreshResponse.ok) {
        console.log('DEBUG API - EasyAuth refresh succeeded, fetching new token');
        // Clear cached token so getIdToken fetches fresh
        cachedToken = null;
        tokenExpiry = null;
        return await getIdToken(true);
      } else {
        console.log('DEBUG API - EasyAuth refresh failed with status:', refreshResponse.status);
        return null;
      }
    } catch (err) {
      console.log('DEBUG API - EasyAuth refresh error:', err);
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Redirect user to re-login
 */
function redirectToLogin() {
  const currentPath = window.location.pathname + window.location.search;
  const loginUrl = `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(currentPath)}`;
  console.log('DEBUG API - Redirecting to login:', loginUrl);
  window.location.href = loginUrl;
}

/**
 * Get the ID token from EasyAuth
 * @param {boolean} forceRefresh - Skip cache and fetch fresh from /.auth/me
 */
async function getIdToken(forceRefresh = false) {
  // Return cached token if still valid (with 5 min buffer)
  if (!forceRefresh && cachedToken && tokenExpiry && Date.now() < tokenExpiry - 5 * 60 * 1000) {
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
 * Make an authenticated API request.
 * On 401, attempts to refresh the token and retry once before prompting re-login.
 */
export async function apiFetch(endpoint, options = {}, _isRetry = false) {
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
    console.log('DEBUG API - WARNING: No token, request may fail');
  }
  
  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
  console.log('DEBUG API - Request URL:', url);
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  console.log('DEBUG API - Response status:', response.status);

  // Handle 401 - token expired or invalid
  if (response.status === 401 && !_isRetry) {
    console.log('DEBUG API - Got 401, attempting token refresh...');
    const newToken = await refreshAuthSession();
    if (newToken) {
      console.log('DEBUG API - Token refreshed, retrying request');
      return apiFetch(endpoint, options, true);
    } else {
      console.log('DEBUG API - Token refresh failed, redirecting to login');
      redirectToLogin();
      // Return the original 401 response in case redirect doesn't happen immediately
      return response;
    }
  }

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
