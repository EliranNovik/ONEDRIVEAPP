// Shared MSAL configuration for consistent authentication across all pages
window.AuthConfig = {
  // MSAL configuration
  msalConfig: {
    auth: {
      clientId: "e03ab8e9-4eb4-4bbc-8c6d-805021e089cd",
      authority: "https://login.microsoftonline.com/899fa835-174e-49e1-93a3-292318f5ee84",
      redirectUri: window.location.hostname === "localhost" 
        ? "http://localhost:3000/onedriveapp"
        : "https://onedriveapp.onrender.com/onedriveapp",
      navigateToLoginRequestUrl: false,
      postLogoutRedirectUri: window.location.hostname === "localhost" 
        ? "http://localhost:3000/"
        : "https://onedriveapp.onrender.com/"
    },
    cache: {
      cacheLocation: "localStorage",
      storeAuthStateInCookie: true
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          if (containsPii) return;
          console.log(`MSAL [${level}]: ${message}`);
        },
        piiLoggingEnabled: false,
        logLevel: "Error"
      }
    }
  },

  // Graph scopes
  graphScopes: [
    "User.Read",
    "User.ReadBasic.All",
    "Files.ReadWrite.All",
    "OnlineMeetings.ReadWrite",
    "Calendars.Read",
    "Calendars.Read.Shared",
    "Calendars.ReadWrite",
    "Calendars.ReadWrite.Shared",
    "Mail.Send",
    "Chat.ReadWrite",
    "Chat.Create",
    "Chat.ReadBasic",
    "Contacts.Read",
    "People.Read"
  ],

  // Initialize MSAL instance
  getInstance: function() {
    if (!window.msalInstance) {
      window.msalInstance = new msal.PublicClientApplication(this.msalConfig);
    }
    return window.msalInstance;
  },

  // Check if user is authenticated
  isAuthenticated: function() {
    const msalInstance = this.getInstance();
    const accounts = msalInstance.getAllAccounts();
    return accounts.length > 0;
  },

  // Get current account
  getCurrentAccount: function() {
    const msalInstance = this.getInstance();
    return msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0] || null;
  },

  // Handle authentication redirect
  handleRedirectPromise: async function() {
    try {
      const msalInstance = this.getInstance();
      console.log('Handling redirect promise...');
      
      const response = await msalInstance.handleRedirectPromise();
      
      if (response) {
        console.log('Redirect response received:', response);
        msalInstance.setActiveAccount(response.account);
        
        // Save token to session
        await this.saveTokenToSession(response.accessToken, response.account);
        
        return response;
      }
      
      // Check for existing accounts
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        console.log('Found existing account:', accounts[0].username);
        msalInstance.setActiveAccount(accounts[0]);
        
        // Try to get token silently
        try {
          const tokenResponse = await msalInstance.acquireTokenSilent({
            scopes: this.graphScopes,
            account: accounts[0]
          });
          
          await this.saveTokenToSession(tokenResponse.accessToken, accounts[0]);
          return { account: accounts[0], accessToken: tokenResponse.accessToken };
        } catch (error) {
          console.log('Silent token acquisition failed:', error);
          if (error instanceof msal.InteractionRequiredAuthError) {
            console.log('Interaction required, will need to sign in again');
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error handling redirect promise:', error);
      return null;
    }
  },

  // Save token to server session
  saveTokenToSession: async function(accessToken, account) {
    try {
      const response = await fetch('/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token: accessToken,
          user: {
            id: account.homeAccountId,
            name: account.name,
            username: account.username,
            displayName: account.name
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save token to session');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to save token');
      }

      console.log('Token saved to session successfully');
      return true;
    } catch (error) {
      console.error('Error saving token to session:', error);
      return false;
    }
  },

  // Sign in function
  signIn: async function() {
    try {
      const msalInstance = this.getInstance();
      
      // Use redirect for mobile, popup for desktop
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      
      if (isMobile) {
        await msalInstance.loginRedirect({
          scopes: this.graphScopes
        });
      } else {
        const response = await msalInstance.loginPopup({
          scopes: this.graphScopes
        });
        
        msalInstance.setActiveAccount(response.account);
        await this.saveTokenToSession(response.accessToken, response.account);
        
        return response;
      }
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  },

  // Sign out function
  signOut: async function() {
    try {
      const msalInstance = this.getInstance();
      const accounts = msalInstance.getAllAccounts();
      
      if (accounts.length > 0) {
        // Clear server session
        await fetch('/set-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: null })
        });
        
        // Sign out from MSAL
        await msalInstance.logoutRedirect({
          account: accounts[0]
        });
      }
    } catch (error) {
      console.error('Sign out error:', error);
    }
  },

  // Get access token
  getAccessToken: async function() {
    try {
      const msalInstance = this.getInstance();
      const account = this.getCurrentAccount();
      
      if (!account) {
        throw new Error('No account available');
      }
      
      const response = await msalInstance.acquireTokenSilent({
        scopes: this.graphScopes,
        account: account
      });
      
      return response.accessToken;
    } catch (error) {
      console.error('Error getting access token:', error);
      throw error;
    }
  },

  // Check server session
  checkServerSession: async function() {
    try {
      const response = await fetch('/get-token');
      const data = await response.json();
      return data.token && data.user ? data : null;
    } catch (error) {
      console.error('Error checking server session:', error);
      return null;
    }
  },

  // Initialize authentication on page load
  initialize: async function() {
    console.log('Initializing authentication...');
    
    // Handle redirect first
    const redirectResponse = await this.handleRedirectPromise();
    
    // Check server session
    const serverSession = await this.checkServerSession();
    
    // Update UI based on authentication state
    const account = this.getCurrentAccount();
    if (account && serverSession) {
      this.updateUI(account, true);
      return { authenticated: true, account, serverSession };
    } else if (redirectResponse) {
      this.updateUI(redirectResponse.account, true);
      return { authenticated: true, account: redirectResponse.account };
    } else {
      this.updateUI(null, false);
      return { authenticated: false };
    }
  },

  // Update UI based on authentication state
  updateUI: function(account, authenticated) {
    const signinButton = document.getElementById('signin-button');
    const signoutButton = document.getElementById('signout-button');
    const welcomeMessage = document.querySelector('.welcome-message');
    const userNameElement = document.getElementById('userName');
    const welcomeTextElement = document.getElementById('welcomeText');

    if (authenticated && account) {
      // Show authenticated state
      if (signinButton) signinButton.style.display = 'none';
      if (signoutButton) signoutButton.style.display = 'inline-block';
      if (welcomeMessage) welcomeMessage.classList.add('signed-in');
      if (userNameElement) {
        userNameElement.textContent = account.name || account.username;
        userNameElement.style.display = 'inline-block';
      }
      if (welcomeTextElement) welcomeTextElement.style.display = 'none';
    } else {
      // Show unauthenticated state
      if (signinButton) signinButton.style.display = 'inline-block';
      if (signoutButton) signoutButton.style.display = 'none';
      if (welcomeMessage) welcomeMessage.classList.remove('signed-in');
      if (userNameElement) userNameElement.style.display = 'none';
      if (welcomeTextElement) welcomeTextElement.style.display = 'inline-block';
    }
  }
}; 