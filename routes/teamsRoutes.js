// routes/teamsRoutes.js
const express = require("express");
const axios = require("axios");
const msal = require("@azure/msal-node");
require("dotenv").config();

const router = express.Router();

// MSAL Configuration
const msalConfig = {
  auth: {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${process.env.TENANT_ID}`,
  }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

// Updated Middleware to check if the user is logged in (session based)
const checkAuth = (req, res, next) => {
  if (req.session && req.session.accessToken) {
    return next();
  }
  res.redirect("/teams/login");
};

// Home Route – renders the meeting creator page
router.get("/", (req, res) => {
  res.render("index", { session: req.session });
});

// Login Route for Meeting Creator
router.get("/login", async (req, res) => {
  try {
    const authUrl = await cca.getAuthCodeUrl({
      scopes: ["User.Read", "OnlineMeetings.ReadWrite", "Calendars.ReadWrite"],
      redirectUri: process.env.REDIRECT_URI,
    });
    res.redirect(authUrl);
  } catch (error) {
    console.error("Error generating auth URL:", error);
    res.status(500).send("Error generating auth URL");
  }
});

// Callback Route – matches the REDIRECT_URI in .env
router.get("/auth/callback", async (req, res) => {
  try {
    const tokenResponse = await cca.acquireTokenByCode({
      code: req.query.code,
      scopes: ["User.Read", "OnlineMeetings.ReadWrite", "Calendars.ReadWrite"],
      redirectUri: process.env.REDIRECT_URI,
    });
    req.session.accessToken = tokenResponse.accessToken;
    req.session.user = tokenResponse.account;
    res.redirect("/teams");
  } catch (error) {
    console.error("Error during callback:", error);
    res.status(500).send("Authentication failed");
  }
});

// Logout Route
router.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/teams");
});

// Create Meeting Route
router.post("/create-meeting", checkAuth, async (req, res) => {
  const { topic, dateTime } = req.body;
  if (!topic || !dateTime) {
    return res.status(400).json({ error: "Both 'topic' and 'dateTime' are required." });
  }

  const startIso = new Date(dateTime).toISOString();
  const endIso = new Date(new Date(dateTime).getTime() + 30 * 60000).toISOString();

  const meetingPayload = {
    subject: topic,
    startDateTime: startIso,
    endDateTime: endIso,
    allowedPresenters: "everyone",
    lobbyBypassSettings: { scope: "everyone" },
    participants: { attendees: [] }
  };

  try {
    const accessToken = req.session.accessToken;
    const meetingResponse = await axios.post(
      "https://graph.microsoft.com/v1.0/me/onlineMeetings",
      meetingPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    const meetingLink = meetingResponse.data.joinWebUrl;
    res.json({ success: true, meetingLink });
  } catch (error) {
    console.error("Error creating meeting:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to create meeting" });
  }
});

module.exports = router;
