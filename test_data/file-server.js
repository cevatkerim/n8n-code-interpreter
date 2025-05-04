const express = require('express');
const path = require('path');
const app = express();
const PORT = 3004;

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Serve files from test_data directory
app.use('/files', express.static(path.join(__dirname, 'test_data')));

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`File server running on http://localhost:${PORT}`);
  console.log(`CSV file available at: http://localhost:${PORT}/files/input.csv`);
}); 