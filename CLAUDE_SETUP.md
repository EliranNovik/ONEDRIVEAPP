# Claude AI Integration Setup Guide

This guide will help you set up Claude AI 4 integration in your OneDrive application.

## Prerequisites

1. **Anthropic API Key**: You need an API key from Anthropic to use Claude AI
   - Sign up at [Anthropic Console](https://console.anthropic.com/)
   - Create a new API key
   - Copy the API key for use in your application

## Installation

1. **Install Dependencies**

   ```bash
   npm install
   ```

2. **Environment Variables**
   Create a `.env` file in your project root with the following variables:

   ```
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   SESSION_SECRET=your_session_secret_here
   NODE_ENV=development
   ```

   For production, set:

   ```
   NODE_ENV=production
   ```

## Features

### Claude AI Chat Interface

- **Location**: `/claude`
- **Features**:
  - Real-time chat with Claude 3.5 Sonnet
  - Conversation history
  - Typing indicators
  - Suggested prompts
  - Mobile-responsive design

### API Endpoints

- `POST /api/claude/chat` - Send a message to Claude
- `GET /api/claude/models` - Get available Claude models
- `POST /api/claude/chat/stream` - Stream responses from Claude

### Authentication

- Claude AI interface requires Microsoft authentication
- Users must be signed in to access Claude features
- Session-based authentication with your existing Microsoft setup

## Usage

1. **Start the Application**

   ```bash
   npm start
   ```

2. **Access Claude AI**
   - Navigate to your application
   - Sign in with Microsoft account
   - Click "Claude AI" in the navigation menu
   - Start chatting with Claude!

## Configuration

### Model Selection

The application uses Claude 3.5 Sonnet by default. You can modify the model in:

- `routes/claudeRoutes.js` - Change the default model
- `public/claude.html` - Update the model selector options

### Customization

- **Styling**: Modify CSS in `public/claude.html`
- **Prompts**: Update system prompts in `routes/claudeRoutes.js`
- **Features**: Add new endpoints in `routes/claudeRoutes.js`

## Security

- API keys are stored in environment variables
- All Claude endpoints require authentication
- Session-based security with your existing Microsoft auth

## Troubleshooting

### Common Issues

1. **"Failed to get response from Claude"**

   - Check your Anthropic API key in `.env`
   - Verify the API key is valid and has sufficient credits
   - Check network connectivity

2. **Authentication Required**

   - Ensure you're signed in with Microsoft
   - Check session configuration in `server.js`

3. **CORS Issues**
   - Verify your domain is configured correctly
   - Check redirect URIs in Microsoft Azure portal

### Debug Mode

Enable detailed logging by setting:

```
NODE_ENV=development
```

## API Reference

### Chat Endpoint

```javascript
POST /api/claude/chat
{
  "message": "Your message here",
  "conversationHistory": [
    {"role": "user", "content": "Previous message"},
    {"role": "assistant", "content": "Previous response"}
  ]
}
```

### Response Format

```javascript
{
  "success": true,
  "response": "Claude's response",
  "conversationId": "timestamp"
}
```

## Support

For issues with:

- **Claude AI**: Check Anthropic documentation
- **Authentication**: Verify Microsoft Azure configuration
- **Application**: Check server logs and browser console

## License

This integration is part of your OneDrive application and follows the same licensing terms.
