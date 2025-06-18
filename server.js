require('dotenv').config(); 
const express = require('express');
const session = require('express-session');
const path = require('path');
const axios = require('axios');
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

// Configure session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Only send cookies over HTTPS in production
    httpOnly: true, // Prevents client-side access to the cookie
    sameSite: 'lax', // Protects against CSRF
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  name: 'sessionId' // Set a specific name for the session cookie
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

// Middleware to check authentication state
const checkAuth = (req, res, next) => {
  if (req.session && req.session.accessToken) {
    return next();
  }
  res.redirect('/');
};

// Route to render index.ejs with session data
app.get('/teams', (req, res) => {
  res.render('index', { 
    session: req.session,
    user: req.session.user || null
  });
});

// Endpoint to store the token from the client into the session
app.post("/set-token", (req, res) => {
  if (req.body.token) {
    req.session.accessToken = req.body.token;
    if (req.body.user) {
      req.session.user = req.body.user;
    }
    req.session.save((err) => {
      if (err) {
        console.error('Error saving session:', err);
        res.status(500).json({ success: false, message: "Error saving session" });
      } else {
        res.json({ success: true });
      }
    });
  } else {
    res.status(400).json({ success: false, message: "No token provided" });
  }
});

// Get token endpoint
app.get("/get-token", (req, res) => {
  res.json({ 
    token: req.session.accessToken || null,
    user: req.session.user || null
  });
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

// Calendar route
app.get('/calendar', (req, res) => {
    res.render('calendar', {
        title: 'Calendar',
        user: req.session.user || null
    });
});

// API route to fetch and merge events from all three shared calendars
app.get('/api/merged-calendar-events', async (req, res) => {
  if (!req.session || !req.session.accessToken) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  const accessToken = req.session.accessToken;
  const calendarEmails = [
    'shared-staffcalendar@lawoffice.org.il',
    'shared-newclients@lawoffice.org.il',
    'shared-potentialclients@lawoffice.org.il'
  ];

  try {
    // Fetch events from all calendars in parallel, catching errors for each
    const eventPromises = calendarEmails.map(email =>
      axios.get(`https://graph.microsoft.com/v1.0/users/${email}/calendar/events`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      }).catch(error => ({ error, email }))
    );
    const results = await Promise.all(eventPromises);

    // Check for errors in any result
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.error('Calendar fetch errors:', errors.map(e => ({
        email: e.email,
        message: e.error?.response?.data || e.error?.message
      })));
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch one or more calendars',
        details: errors.map(e => ({
          email: e.email,
          message: e.error?.response?.data || e.error?.message
        }))
      });
    }

    // Merge all events into one array
    const mergedEvents = results.flatMap(r => r.data.value.map(ev => ({ ...ev, calendar: r.config.url.split('/')[5] })));
    res.json({ success: true, events: mergedEvents });
  } catch (err) {
    console.error('Error fetching calendar events:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch calendar events', details: err.response?.data || err.message });
  }
});

// Add event to selected shared calendar
app.post('/api/calendar/add-event', async (req, res) => {
  if (!req.session || !req.session.accessToken) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  const accessToken = req.session.accessToken;
  const { title, description, location, start, end, calendar } = req.body;
  if (!title || !start || !end || !calendar) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  try {
    const event = {
      subject: title,
      body: {
        contentType: 'HTML',
        content: description || ''
      },
      start: {
        dateTime: new Date(start).toISOString(),
        timeZone: 'UTC'
      },
      end: {
        dateTime: new Date(end).toISOString(),
        timeZone: 'UTC'
      },
      location: {
        displayName: location || ''
      }
    };
    const url = `https://graph.microsoft.com/v1.0/users/${calendar}/calendar/events`;
    const response = await axios.post(url, event, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    res.json({ success: true, event: response.data });
  } catch (err) {
    console.error('Error creating event:', err.response?.data || err.message);
    res.status(500).json({ success: false, error: 'Failed to create event', details: err.response?.data || err.message });
  }
});

// Handle MSAL redirect
app.get('/onedriveapp', (req, res) => {
  // If there's an error during authentication
  if (req.query.error) {
    return res.redirect('/?error=' + encodeURIComponent(req.query.error_description || 'Authentication failed'));
  }
  
  // If this is the auth callback with a code
  if (req.query.code) {
    // Store the code in session temporarily if needed
    req.session.authCode = req.query.code;
  }
  
  // Always serve the main page
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
