require('dotenv').config(); 
const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();

// Enhanced logging configuration
const logRequest = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log({
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      session: req.session ? {
        id: req.session.id,
        hasToken: !!req.session.accessToken,
        user: req.session.user
      } : null
    });
  });
  next();
};

// Apply logging middleware first
app.use(logRequest);

// Set view engine and views directory
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware to parse JSON request bodies
app.use(express.json());

// Configure session middleware – change the secret for production use
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false
}));

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  }
}));

// Store active users
const activeUsers = new Map();

// Middleware to track active users
app.use((req, res, next) => {
  if (req.session && req.session.accessToken) {
    const userEmail = req.session.user?.username;
    if (userEmail) {
      activeUsers.set(userEmail, Date.now());
    }
  }
  next();
});

// Clean up inactive users (5 minutes timeout)
setInterval(() => {
  const now = Date.now();
  for (const [email, lastActive] of activeUsers.entries()) {
    if (now - lastActive > 5 * 60 * 1000) { // 5 minutes
      activeUsers.delete(email);
    }
  }
}, 60 * 1000); // Check every minute

// Add endpoint to get active users
app.get('/api/active-users', (req, res) => {
  res.json(Array.from(activeUsers.keys()));
});

// Endpoint to store the token from the client into the session
app.post("/set-token", (req, res) => {
  if (req.body.token) {
    req.session.accessToken = req.body.token;
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, message: "No token provided" });
  }
});

// Add the missing /api/auth/token endpoint
app.post("/api/auth/token", (req, res) => {
  if (req.body.token) {
    req.session.accessToken = req.body.token;
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, message: "No token provided" });
  }
});

app.get("/get-token", (req, res) => {
  res.json({ token: req.session.accessToken || null });
});


// Mount teams routes at /teams (must come after session middleware)
const teamsRoutes = require("./routes/teamsRoutes.js");
const chatRoutes = require("./routes/chatRoutes.js");

// Add logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Mount routes with proper prefixes
app.use("/teams", teamsRoutes);
app.use("/api", chatRoutes); // API routes
app.use("/chat", chatRoutes); // Chat view routes

// Add route to serve chat.html for any chat ID
app.get('/chat/:chatId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Add error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    success: false, 
    error: err.message || 'An unexpected error occurred' 
  });
});

// Handle 404 errors
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Route not found' 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
