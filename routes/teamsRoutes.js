// routes/teamsRoutes.js
const express = require("express");
const axios = require("axios");
const msal = require("@azure/msal-node");
require("dotenv").config();
const path = require("path");
const fs = require("fs");

const router = express.Router();

// MSAL Configuration
const msalConfig = {
  auth: {
    clientId: 'e03ab8e9-4eb4-4bbc-8c6d-805021e089cd',
    authority: 'https://login.microsoftonline.com/899fa835-174e-49e1-93a3-292318f5ee84',
    redirectUri: 'http://localhost:3000/teams/auth/callback'
  }
};

const pca = new msal.PublicClientApplication(msalConfig);

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
    const authUrl = await pca.getAuthCodeUrl({
      scopes: ["User.Read", "OnlineMeetings.ReadWrite", "Calendars.ReadWrite"],
      redirectUri: "http://localhost:3000/onedriveapp"
    });
    res.redirect(authUrl);
  } catch (error) {
    console.error("Error generating auth URL:", error);
    res.status(500).send("Error generating auth URL");
  }
});

// Authentication callback route
router.get('/auth/callback', async (req, res) => {
  try {
    console.log('Starting authentication callback...');
    
    const tokenResponse = await pca.acquireTokenByCode({
      code: req.query.code,
      scopes: ['User.Read', 'Chat.Create', 'Chat.ReadWrite', 'OnlineMeetings.ReadWrite', 'TeamsActivity.Send'],
      redirectUri: process.env.REDIRECT_URI
    });

    console.log('Token acquired successfully');

    // Store the access token in the session
    req.session.accessToken = tokenResponse.accessToken;

    // Get user information
    const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${tokenResponse.accessToken}`
      }
    });

    console.log('User information retrieved:', userResponse.data);

    // Validate that we have a valid user ID
    if (!userResponse.data.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userResponse.data.id)) {
      console.error('Invalid user ID format received from Microsoft Graph API');
      return res.redirect('/?error=invalid_user_id');
    }

    // Store user information in the session
    req.session.user = {
      id: userResponse.data.id,
      username: userResponse.data.userPrincipalName,
      displayName: userResponse.data.displayName
    };

    // Save the session
    req.session.save((err) => {
      if (err) {
        console.error('Error saving session:', err);
        return res.redirect('/?error=session_error');
      }
      
      // Log successful authentication
      console.log('✅ User authenticated and session updated:', {
        userId: req.session.user.id,
        username: req.session.user.username,
        displayName: req.session.user.displayName
      });
      
      res.redirect('/teams');
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.redirect('/?error=auth_error');
  }
});

// Add middleware to check user information
router.use((req, res, next) => {
  if (req.session && req.session.accessToken && !req.session.user) {
    console.log('Session has token but no user info, attempting to fetch user info...');
    axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: {
        Authorization: `Bearer ${req.session.accessToken}`
      }
    })
    .then(response => {
      req.session.user = {
        id: response.data.id,
        username: response.data.userPrincipalName,
        displayName: response.data.displayName
      };
      req.session.save();
      next();
    })
    .catch(error => {
      console.error('Error fetching user info:', error);
      next();
    });
  } else {
    next();
  }
});

// Logout Route
router.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/teams");
});

// Create Meeting Route
router.post("/create-meeting", checkAuth, async (req, res) => {
  console.log("=== Starting Meeting Creation Process ===");
  console.log("Request body:", req.body);
  console.log("Session user:", req.session.user);
  
  const { topic, dateTime } = req.body;
  if (!topic || !dateTime) {
    console.log("❌ Missing required parameters:", { topic, dateTime });
    return res.status(400).json({ success: false, error: "Both 'topic' and 'dateTime' are required." });
  }

  console.log("✅ Parameters validated:", { topic, dateTime });

  const startIso = new Date(dateTime).toISOString();
  const endIso = new Date(new Date(dateTime).getTime() + 30 * 60000).toISOString();
  console.log("📅 Meeting time range:", { startIso, endIso });

  const meetingPayload = {
    subject: topic,
    startDateTime: startIso,
    endDateTime: endIso,
    allowedPresenters: "everyone",
    lobbyBypassSettings: { 
      scope: "everyone",
      isDialInBypassEnabled: true
    },
    participants: { attendees: [] }
  };
  console.log("📝 Meeting payload prepared:", meetingPayload);

  try {
    const accessToken = req.session.accessToken;
    if (!accessToken) {
      console.log("❌ No access token found in session");
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }
    console.log("✅ Access token found in session");

    // Create the meeting
    console.log("🔄 Creating meeting via Microsoft Graph API...");
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
    console.log("✅ Meeting created successfully:", meetingResponse.data);
    const meetingLink = meetingResponse.data.joinWebUrl;

    // Format the meeting time for the message
    const meetingTime = new Date(dateTime).toLocaleString();
    console.log("⏰ Formatted meeting time:", meetingTime);
    
    // Try to send activity feed notification, but don't fail if it doesn't work
    try {
      console.log("🔄 Sending Teams notification...");
      console.log("📊 User ID validation:", {
        originalId: req.session.user.id,
        cleanedId: req.session.user.id.replace(/[^a-f0-9-]/gi, ''),
        isValid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.session.user.id)
      });
      
      // Ensure the user ID is a valid GUID
      const userId = req.session.user.id.toLowerCase().trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(userId)) {
        console.error("❌ Invalid user ID format:", userId);
        return res.json({ 
          success: true, 
          meetingLink,
          message: "Meeting created successfully, but notification failed due to invalid user ID format"
        });
      }

      // Send activity feed notification
      const notificationPayload = {
        topic: {
          source: 'entityUrl',
          value: `https://graph.microsoft.com/v1.0/users/${userId}`
        },
        activityType: 'meetingCreatedEvent',
        previewText: {
          content: `New meeting: ${topic}`
        },
        recipient: {
          '@odata.type': 'microsoft.graph.aadUserNotificationRecipient',
          userId: userId
        },
        templateParameters: {
          meetingTopic: topic,
          meetingTime: meetingTime,
          meetingLink: meetingLink
        }
      };

      await axios.post(
        `https://graph.microsoft.com/v1.0/users/${userId}/teamwork/sendActivityNotification`,
        notificationPayload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log("✅ Teams notification sent successfully");
    } catch (error) {
      console.error("Error sending Teams notification:", error);
      // Don't fail the meeting creation if notification fails
    }

    res.json({ success: true, meetingLink });
  } catch (error) {
    console.error("Error creating meeting:", error);
    res.status(500).json({ success: false, error: "Error creating meeting" });
  }
});

// Function to read and process email template
const getEmailTemplate = (language, data) => {
  const templatePath = path.join(__dirname, '../public/email-templates', `${language}.html`);
  let template = fs.readFileSync(templatePath, 'utf8');
  
  // Replace placeholders with actual data
  template = template
    .replace(/\[Recipient Name\]/g, data.recipientName || '')
    .replace(/\[Meeting Topic\]/g, data.meetingTopic)
    .replace(/\[Meeting Date\]/g, data.meetingDate)
    .replace(/\[Meeting Time\]/g, data.meetingTime)
    .replace(/\[Meeting Link\]/g, data.meetingLink);
  
  return template;
};

// Send Email Route
router.post("/send-email", checkAuth, async (req, res) => {
  console.log('Send email route hit');
  console.log('Session:', req.session);
  console.log('Request body:', req.body);

  try {
    if (!req.session || !req.session.accessToken) {
      console.log('No session or access token found');
      return res.status(401).json({ 
        success: false, 
        error: "Not authenticated" 
      });
    }

    const {
      recipientEmail,
      recipientName,
      meetingTopic,
      meetingDate,
      meetingTime,
      meetingLink,
      language
    } = req.body;

    console.log('Validating required fields...');
    if (!recipientEmail || !meetingTopic || !meetingLink) {
      console.log('Missing required fields:', { recipientEmail, meetingTopic, meetingLink });
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields" 
      });
    }

    // Get the appropriate email template
    const emailContent = getEmailTemplate(language, {
      recipientName,
      meetingTopic,
      meetingDate,
      meetingTime,
      meetingLink
    });

    console.log('Sending email via Microsoft Graph API...');
    const response = await axios.post(
      'https://graph.microsoft.com/v1.0/me/sendMail',
      {
        message: {
          subject: `Meeting Invitation: ${meetingTopic}`,
          body: {
            contentType: 'HTML',
            content: emailContent
          },
          toRecipients: [
            {
              emailAddress: {
                address: recipientEmail
              }
            }
          ]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${req.session.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Email sent successfully');
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to send email' 
    });
  }
});

module.exports = router;
     