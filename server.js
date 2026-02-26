const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Runtime config endpoint - serves environment variables to the frontend
app.get('/api/config', (req, res) => {
  res.json({
    apiUrl: process.env.REACT_APP_API_URL || 'http://localhost:8000'
  });
});

// Serve static files from the build directory
app.use(express.static(path.join(__dirname, 'build')));

// Handle React routing, return all requests to React app (Express 5 syntax)
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
