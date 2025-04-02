require('dotenv').config(); 
const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// (Optional) You could create an endpoint to safely pass non-sensitive config to the client.
// For example:
// app.get('/config', (req, res) => {
//   res.json({
//     CLIENT_ID: process.env.CLIENT_ID,
//     API_KEY: process.env.API_KEY
//   });
// });

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
