require('dotenv').config(); 
const express = require('express');
const session = require('express-session');
const path = require('path');
const app = express();

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
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to store the token from the client into the session
app.post("/set-token", (req, res) => {
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
app.use("/teams", teamsRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
