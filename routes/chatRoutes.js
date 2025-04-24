const express = require('express');
const router = express.Router();
const axios = require('axios');

// Middleware to check authentication
const checkAuth = (req, res, next) => {
  if (req.session && req.session.accessToken) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
};

// Get all chats
router.get('/chats', checkAuth, async (req, res) => {
  try {
    const response = await axios.get('https://graph.microsoft.com/v1.0/chats', {
      headers: {
        Authorization: `Bearer ${req.session.accessToken}`
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// Create a new chat
router.post('/chats', checkAuth, async (req, res) => {
  const { members } = req.body;
  console.log('Received chat creation request with members:', members);
  
  if (!members || !Array.isArray(members)) {
    console.error('Invalid members data:', members);
    return res.status(400).json({ error: 'Members array is required' });
  }

  try {
    console.log('Creating chat with members:', members);
    console.log('Using token from session:', req.session.accessToken ? 'Token present' : 'No token');
    
    const response = await axios.post('https://graph.microsoft.com/v1.0/chats', {
      chatType: 'oneOnOne',
      members: members.map(email => ({
        '@odata.type': '#microsoft.graph.aadUserConversationMember',
        roles: ['owner'],
        'user@odata.bind': `https://graph.microsoft.com/v1.0/users/${email}`
      }))
    }, {
      headers: {
        Authorization: `Bearer ${req.session.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Graph API response:', response.data);
    res.json({ 
      success: true, 
      chatId: response.data.id,
      topic: response.data.topic || 'New Chat'
    });
  } catch (error) {
    console.error('Error creating chat:', error.response ? error.response.data : error.message);
    console.error('Error details:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
    res.status(500).json({ 
      success: false, 
      error: error.response ? error.response.data : error.message 
    });
  }
});

// Send a message to a chat
router.post('/chats/:chatId/messages', checkAuth, async (req, res) => {
  const { chatId } = req.params;
  const { content } = req.body;
  
  if (!content) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  try {
    const response = await axios.post(
      `https://graph.microsoft.com/v1.0/chats/${chatId}/messages`,
      {
        body: {
          content: content
        }
      },
      {
        headers: {
          Authorization: `Bearer ${req.session.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get messages from a chat
router.get('/chats/:chatId/messages', checkAuth, async (req, res) => {
  const { chatId } = req.params;
  
  try {
    const response = await axios.get(
      `https://graph.microsoft.com/v1.0/chats/${chatId}/messages`,
      {
        headers: {
          Authorization: `Bearer ${req.session.accessToken}`
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Get Contacts Route
router.get('/contacts', checkAuth, async (req, res) => {
  try {
    console.log('Fetching contacts for user:', req.session.user?.username);
    console.log('Token present:', !!req.session.accessToken);
    
    let allContacts = [];
    let nextLink = 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,mail,userPrincipalName,jobTitle,companyName&$top=999';

    while (nextLink) {
      console.log('Fetching contacts from:', nextLink);
      const response = await axios.get(nextLink, {
        headers: {
          Authorization: `Bearer ${req.session.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.data.value || !Array.isArray(response.data.value)) {
        console.error('Unexpected response format:', response.data);
        return res.status(500).json({ 
          success: false, 
          error: 'Unexpected response format from Microsoft Graph API',
          details: response.data
        });
      }

      // Add the current page of contacts to our collection
      allContacts = allContacts.concat(response.data.value);
      console.log(`Fetched ${response.data.value.length} contacts in this batch`);

      // Check if there's a next page
      nextLink = response.data['@odata.nextLink'];
    }

    console.log(`Fetched total of ${allContacts.length} contacts`);

    const contacts = allContacts.map(user => ({
      id: user.id,
      displayName: user.displayName || 'Unknown',
      mail: user.mail || user.userPrincipalName,
      jobTitle: user.jobTitle || '',
      companyName: user.companyName || ''
    }));

    // Filter out the current user from the contacts list
    const currentUserEmail = req.session.user?.username;
    const filteredContacts = contacts.filter(contact => contact.mail !== currentUserEmail);

    console.log('Returning filtered contacts:', filteredContacts.length);

    res.json({ 
      success: true, 
      contacts: filteredContacts 
    });
  } catch (error) {
    console.error('Error fetching contacts:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText
    });
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch contacts',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router; 