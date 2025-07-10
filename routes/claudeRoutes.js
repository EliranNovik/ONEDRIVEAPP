const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Middleware to check authentication
const checkAuth = (req, res, next) => {
  if (req.session && req.session.accessToken) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
};

// Chat with Claude AI
router.post('/chat', checkAuth, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Prepare messages for Claude
    const messages = [
      {
        role: 'user',
        content: `You are Claude, an AI assistant. Please help the user with their request. Be helpful, accurate, and concise.`
      },
      ...conversationHistory,
      {
        role: 'user',
        content: message
      }
    ];

    // Call Claude AI
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      messages: messages,
      temperature: 0.7,
    });

    res.json({
      success: true,
      response: response.content[0].text,
      conversationId: Date.now().toString()
    });

  } catch (error) {
    console.error('Error calling Claude AI:', error);
    res.status(500).json({ 
      error: 'Failed to get response from Claude AI',
      details: error.message 
    });
  }
});

// Get Claude AI models info
router.get('/models', checkAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      models: [
        {
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          description: 'Latest Claude model with enhanced reasoning and coding capabilities'
        },
        {
          id: 'claude-3-opus-20240229',
          name: 'Claude 3 Opus',
          description: 'Most powerful Claude model for complex tasks'
        },
        {
          id: 'claude-3-sonnet-20240229',
          name: 'Claude 3 Sonnet',
          description: 'Balanced model for general use'
        }
      ]
    });
  } catch (error) {
    console.error('Error getting models:', error);
    res.status(500).json({ error: 'Failed to get models' });
  }
});

// Stream chat with Claude AI (for real-time responses)
router.post('/chat/stream', checkAuth, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Prepare messages for Claude
    const messages = [
      {
        role: 'user',
        content: `You are Claude, an AI assistant. Please help the user with their request. Be helpful, accurate, and concise.`
      },
      ...conversationHistory,
      {
        role: 'user',
        content: message
      }
    ];

    // Stream response from Claude
    const stream = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      messages: messages,
      temperature: 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta') {
        res.write(`data: ${JSON.stringify({
          type: 'content',
          content: chunk.delta.text
        })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Error streaming from Claude AI:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: 'Failed to get response from Claude AI'
    })}\n\n`);
    res.end();
  }
});

module.exports = router; 