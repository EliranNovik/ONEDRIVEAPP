// Add SweetAlert2 script
if (typeof Swal === 'undefined') {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
  document.head.appendChild(script);
}

// Global variables for selected files, access token, and created folder link
let filesToUpload = [];
let accessToken = null;
let createdFolderLink = '';
let currentAccount = null; // Store the current account

// Configure SweetAlert2 Toast
const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  }
});

// MSAL configuration for your OneDrive (Microsoft Graph) app
const msalConfig = {
  auth: {
    clientId: "e03ab8e9-4eb4-4bbc-8c6d-805021e089cd",  
    authority: "https://login.microsoftonline.com/899fa835-174e-49e1-93a3-292318f5ee84",
    redirectUri: window.REDIRECT_URI || "https://onedriveapp.onrender.com",
    navigateToLoginRequestUrl: true
  },
  cache: {
    cacheLocation: "localStorage", // This enables persistent login
    storeAuthStateInCookie: true // This helps with IE11 or cross-site scenarios
  }
};

const msalInstance = new msal.PublicClientApplication(msalConfig);

// Scopes needed for OneDrive file access and Teams meeting creation
const graphScopes = [
  "Files.ReadWrite.All",
  "OnlineMeetings.ReadWrite",
  "Calendars.Read",
  "Calendars.Read.Shared",
  "Calendars.ReadWrite",
  "Calendars.ReadWrite.Shared",
  "User.Read",
  "Mail.Send",
  "Chat.ReadWrite",
  "Chat.Create",
  "Chat.ReadBasic",
  "Contacts.Read"
];

/* ---------------- Utility: Detect Mobile Device ---------------- */
function isMobileDevice() {
  return /Mobi|Android/i.test(navigator.userAgent);
}

/* ---------------- Check for Existing Token in Session ---------------- */
document.addEventListener("DOMContentLoaded", function() {
  // First check MSAL accounts
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    currentAccount = accounts[0];
    msalInstance.setActiveAccount(currentAccount);
    updateWelcomeMessage(currentAccount.name);
    const signinButton = document.getElementById('signin-button');
    const signoutButton = document.getElementById('signout-button');
    if (signinButton) signinButton.style.display = 'none';
    if (signoutButton) signoutButton.style.display = 'inline-block';
  }

  // Then check server session
  fetch('/get-token')
    .then(response => response.json())
    .then(data => {
      if (data.token) {
        accessToken = data.token;
        // If we have a token but no MSAL account, try to handle redirect
        if (!currentAccount) {
          handleRedirectPromise();
        }
      }
    })
    .catch(err => {
      console.error("Error fetching token from session:", err);
    });
});

// Function to extract username from email
function extractUsername(email) {
  if (!email) return '';
  return email.split('@')[0];
}

// Function to update welcome message
function updateWelcomeMessage(userName) {
  const welcomeMessage = document.querySelector('.welcome-message');
  const userNameElement = document.getElementById('userName');
  const welcomeTextElement = document.getElementById('welcomeText');
  
  if (userName) {
    if (welcomeMessage) welcomeMessage.classList.add('signed-in');
    if (userNameElement) {
      userNameElement.textContent = userName;
      userNameElement.style.display = 'inline-block';
    }
    if (welcomeTextElement) welcomeTextElement.style.display = 'none';
  } else {
    if (welcomeMessage) welcomeMessage.classList.remove('signed-in');
    if (userNameElement) userNameElement.style.display = 'none';
    if (welcomeTextElement) welcomeTextElement.style.display = 'inline-block';
  }
}

// Handle redirect promise to complete authentication
async function handleRedirectPromise() {
  try {
    console.log('Handling redirect...');
    const response = await msalInstance.handleRedirectPromise();
    
    // Check if we have any accounts
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      currentAccount = accounts[0];
      msalInstance.setActiveAccount(currentAccount);
      console.log('Active account set:', currentAccount.username);
      
      try {
        // Try to acquire token silently first
        const tokenResponse = await msalInstance.acquireTokenSilent({
          scopes: graphScopes,
          account: currentAccount
        });
        
        accessToken = tokenResponse.accessToken;
        console.log('Token acquired silently');
        
        // Update UI
        updateWelcomeMessage(currentAccount.name);
        document.getElementById('signin-button').style.display = 'none';
        if (document.getElementById('signout-button')) {
          document.getElementById('signout-button').style.display = 'inline-block';
        }
        
        // Save token and user info to session
        await fetch('/set-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            token: accessToken,
            user: {
              id: currentAccount.homeAccountId,
              name: currentAccount.name,
              username: currentAccount.username,
              displayName: currentAccount.name
            }
          })
        });
        
        Toast.fire({
          icon: 'success',
          title: `Welcome back, ${currentAccount.name}!`
        });
      } catch (error) {
        console.error('Error acquiring token silently:', error);
        if (error instanceof msal.InteractionRequiredAuthError) {
          // If silent token acquisition fails, try interactive
          await loginInteractive();
        }
      }
    } else if (response) {
      // We got a response but no account - this is the first sign-in
      currentAccount = response.account;
      msalInstance.setActiveAccount(currentAccount);
      accessToken = response.accessToken;
      
      updateWelcomeMessage(currentAccount.name);
      document.getElementById('signin-button').style.display = 'none';
      if (document.getElementById('signout-button')) {
        document.getElementById('signout-button').style.display = 'inline-block';
      }
      
      // Save token and user info to session
      await fetch('/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token: accessToken,
          user: {
            id: currentAccount.homeAccountId,
            name: currentAccount.name,
            username: currentAccount.username,
            displayName: currentAccount.name
          }
        })
      });
      
      Toast.fire({
        icon: 'success',
        title: `Welcome, ${currentAccount.name}!`
      });
    }
  } catch (error) {
    console.error('Error during redirect handling:', error);
    Toast.fire({
      icon: 'error',
      title: 'Sign-in failed. Please try again.'
    });
  }
}

// Helper function for interactive login
async function loginInteractive() {
  try {
    const loginResponse = await msalInstance.loginPopup({
      scopes: graphScopes
    });
    
    currentAccount = loginResponse.account;
    msalInstance.setActiveAccount(currentAccount);
    accessToken = loginResponse.accessToken;
    
    updateWelcomeMessage(currentAccount.name);
    document.getElementById('signin-button').style.display = 'none';
    if (document.getElementById('signout-button')) {
      document.getElementById('signout-button').style.display = 'inline-block';
    }
    
    await fetch('/set-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: accessToken })
    });
    
    Toast.fire({
      icon: 'success',
      title: `Welcome, ${currentAccount.name}!`
    });
  } catch (error) {
    console.error('Error during interactive login:', error);
    Toast.fire({
      icon: 'error',
      title: 'Sign-in failed. Please try again.'
    });
  }
}

/* ---------------- Authentication ---------------- */

// Updated sign in function with conditional flow for mobile vs. desktop
document.getElementById('signin-button').onclick = function () {
  if (isMobileDevice()) {
    // On mobile, use redirect-based authentication
    msalInstance.loginRedirect({ scopes: graphScopes });
  } else {
    // On desktop, use popup-based authentication
    msalInstance.loginPopup({ scopes: graphScopes })
      .then(loginResponse => {
        currentAccount = loginResponse.account; // Store the account
        msalInstance.setActiveAccount(currentAccount);
        console.log("Login successful:", loginResponse);
        
        // Immediately update UI with welcome message and toast
        updateWelcomeMessage(currentAccount.name);
        Toast.fire({
          icon: 'success',
          title: `Welcome, ${currentAccount.name}!`
        });
        document.getElementById('signin-button').style.display = 'none';
        
        // Acquire token silently and save token to the session
        msalInstance.acquireTokenSilent({ scopes: graphScopes, account: currentAccount })
          .then(tokenResponse => {
            accessToken = tokenResponse.accessToken;
            console.log("Access token acquired:", accessToken);
            // Save the token to the server session
            fetch('/set-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: tokenResponse.accessToken })
            })
            .then(res => res.json())
            .then(data => {
              if (data.success) {
                console.log("Token saved in session.");
              } else {
                console.error("Error saving token:", data.message);
              }
            })
            .catch(err => console.error("Error calling /set-token:", err));
          })
          .catch(error => {
            console.error("Token acquisition error:", error);
            Toast.fire({
              icon: 'error',
              title: 'Error acquiring token. See console for details.'
            });
          });
      })
      .catch(error => {
        console.error("Login error:", error);
        Toast.fire({
          icon: 'error',
          title: 'Login failed. See console for details.'
        });
      });
  }
};

/* ---------------- File Selection & Drag-Drop ---------------- */

// Initialize drop zone elements
const dropZone = document.getElementById('drop-zone');
const fileListContainer = document.getElementById('fileList');
const fileInput = document.getElementById('fileInput');

// Set up drop zone event listeners
document.addEventListener('DOMContentLoaded', function() {
  if (dropZone && fileInput) {
    // Make the entire drop zone clickable to trigger file selection
    dropZone.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation(); // Prevent event bubbling
    fileInput.click();
  });
  
    // Handle file selection via input
    fileInput.addEventListener('change', function() {
      // Visual feedback when files are selected
      if (this.files.length > 0) {
        dropZone.classList.add('files-selected');
        // Update the filesToUpload array
        filesToUpload = Array.from(this.files);
        updateFileList();
      } else {
        dropZone.classList.remove('files-selected');
        filesToUpload = [];
      updateFileList();
    }
  });

// Drag-and-drop events
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('hover');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.classList.remove('hover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('hover');
  const files = Array.from(e.dataTransfer.files);
  if (files.length > 0) {
        dropZone.classList.add('files-selected');
    filesToUpload = files;
    updateFileList();
      }
    });
    
    // Reset file input when files are uploaded
    const uploadButton = document.getElementById('upload-button');
    if (uploadButton) {
      uploadButton.addEventListener('click', function() {
        // This will be called after the upload is complete
        setTimeout(function() {
          fileInput.value = '';
          dropZone.classList.remove('files-selected');
        }, 1000);
      });
    }
  }
});

// Helper function to update file list display
function updateFileList() {
  let listHTML = '<ul>';
  filesToUpload.forEach(file => {
    listHTML += `<li>
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">${(file.size / 1024).toFixed(2)} KB</span>
                 </li>`;
  });
  listHTML += '</ul>';
  fileListContainer.innerHTML = listHTML;
}

/* ---------------- Token Refresh Function ---------------- */
async function refreshTokenIfNeeded() {
  try {
    console.log("Attempting to refresh token...");
    
    // First, try to handle any redirect promise
    await handleRedirectPromise();
    
    // If we have a stored account, use it
    if (currentAccount) {
      console.log("Using stored account:", currentAccount);
      try {
        const tokenResponse = await msalInstance.acquireTokenSilent({ 
          scopes: graphScopes, 
          account: currentAccount 
        });
        
        // Update the access token
        accessToken = tokenResponse.accessToken;
        console.log("Token refreshed successfully");
        
        // Save the new token to the server session
        const response = await fetch('/set-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: accessToken })
        });
        
        const data = await response.json();
        if (data.success) {
          console.log("New token saved in session.");
          return true;
        } else {
          console.error("Error saving new token:", data.message);
          return false;
        }
      } catch (error) {
        console.error("Error acquiring token silently:", error);
        // If silent token acquisition fails, try interactive
        return await acquireTokenInteractive();
      }
    } else {
      // Try to get the account from MSAL
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length === 0) {
        console.error("No account found. Please sign in again.");
        // Try to sign in interactively
        return await acquireTokenInteractive();
      }
      
      // Use the first account or try to get the active account
      currentAccount = msalInstance.getActiveAccount() || accounts[0];
      msalInstance.setActiveAccount(currentAccount);
      console.log("Using account from MSAL:", currentAccount);
      
      try {
        const tokenResponse = await msalInstance.acquireTokenSilent({ 
          scopes: graphScopes, 
          account: currentAccount 
        });
        
        // Update the access token
        accessToken = tokenResponse.accessToken;
        console.log("Token refreshed successfully");
        
        // Save the new token to the server session
        const response = await fetch('/set-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: accessToken })
        });
        
        const data = await response.json();
        if (data.success) {
          console.log("New token saved in session.");
          return true;
        } else {
          console.error("Error saving new token:", data.message);
          return false;
        }
      } catch (error) {
        console.error("Error acquiring token silently:", error);
        // If silent token acquisition fails, try interactive
        return await acquireTokenInteractive();
      }
    }
  } catch (error) {
    console.error("Error refreshing token:", error);
    // If all else fails, prompt the user to sign in again
    alert("Your session has expired. Please sign in again.");
    document.getElementById('signin-button').style.display = 'inline-block';
    document.getElementById('signout-button').style.display = 'none';
    return false;
  }
}

// Helper function to acquire token interactively
async function acquireTokenInteractive() {
  try {
    console.log("Attempting interactive token acquisition...");
    const loginResponse = await msalInstance.loginPopup({ scopes: graphScopes });
    currentAccount = loginResponse.account;
    msalInstance.setActiveAccount(currentAccount);
    
    const tokenResponse = await msalInstance.acquireTokenSilent({ 
      scopes: graphScopes, 
      account: currentAccount 
    });
    
    // Update the access token
    accessToken = tokenResponse.accessToken;
    console.log("Token acquired interactively");
    
    // Save the new token to the server session
    const response = await fetch('/set-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: accessToken })
    });
    
    const data = await response.json();
    if (data.success) {
      console.log("New token saved in session.");
      return true;
    } else {
      console.error("Error saving new token:", data.message);
      return false;
    }
  } catch (error) {
    console.error("Error acquiring token interactively:", error);
    return false;
  }
}

/* ---------------- File Upload ---------------- */

// Upload files to OneDrive under a new folder created in the root directory
document.getElementById('upload-button').onclick = async function () {
  if (filesToUpload.length === 0) {
    Toast.fire({
      icon: 'error',
      title: 'Please drag and drop at least one file.'
    });
    return;
  }
  if (!accessToken) {
    Toast.fire({
      icon: 'error',
      title: 'Please sign in first to obtain an access token.'
    });
    return;
  }
  
  const folderNameInput = document.getElementById('folderName');
  const folderName = folderNameInput ? folderNameInput.value.trim() : '';
  if (!folderName) {
    Toast.fire({
      icon: 'error',
      title: 'Please enter a new folder name.'
    });
    return;
  }
  
  // Create new folder in the root directory of OneDrive
  let createFolderEndpoint = `https://graph.microsoft.com/v1.0/me/drive/root/children`;
  
  try {
    const folderResponse = await fetch(createFolderEndpoint, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + accessToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename"
    })
    });
    
    // Check if the response indicates an expired token
    if (folderResponse.status === 401) {
      const errorData = await folderResponse.json();
      if (errorData.error && errorData.error.code === "InvalidAuthenticationToken") {
        // Try to refresh the token
        const refreshed = await refreshTokenIfNeeded();
        if (refreshed) {
          // Retry the folder creation with the new token
          return document.getElementById('upload-button').onclick();
        } else {
          return; // Stop if token refresh failed
        }
      }
    }
    
    // If we get here, either the request succeeded or it's a different error
    if (!folderResponse.ok) {
      throw new Error(`API error: ${folderResponse.status}`);
    }
    
    const folderData = await folderResponse.json();
    console.log("Folder created:", folderData);
    // Save the webUrl as a fallback sharing link (if needed)
    createdFolderLink = folderData.webUrl;
    
    // Create a sharing link (edit, anonymous) for the new folder
    const linkResponse = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${folderData.id}/createLink`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "edit",
        scope: "anonymous"
      })
    });
    
    // Check if the response indicates an expired token
    if (linkResponse.status === 401) {
      const errorData = await linkResponse.json();
      if (errorData.error && errorData.error.code === "InvalidAuthenticationToken") {
        // Try to refresh the token
        const refreshed = await refreshTokenIfNeeded();
        if (refreshed) {
          // Retry the link creation with the new token
          return document.getElementById('upload-button').onclick();
        } else {
          return; // Stop if token refresh failed
        }
      }
    }
    
    // If we get here, either the request succeeded or it's a different error
    if (!linkResponse.ok) {
      throw new Error(`API error: ${linkResponse.status}`);
    }
    
    const linkData = await linkResponse.json();
      console.log("Sharing link created:", linkData);
    
    // Check if linkData.link exists before accessing webUrl
    if (linkData && linkData.link && linkData.link.webUrl) {
      createdFolderLink = linkData.link.webUrl;
      
      // Show "Copy Link" and "Open Folder" buttons
      const copyBtn = document.getElementById('copyLinkBtn');
      const openFolderBtn = document.getElementById('openFolderBtn');
      if (copyBtn) copyBtn.style.display = 'inline-block';
      if (openFolderBtn) openFolderBtn.style.display = 'inline-block';
      
      copyBtn.onclick = function() {
        copyLink();
      };
      
      openFolderBtn.onclick = function() {
        window.open(createdFolderLink, '_blank');
      };
    } else {
      console.error("Invalid response format from createLink API:", linkData);
      // If we have an error object, log its details
      if (linkData.error) {
        console.error("API Error details:", linkData.error);
        Toast.fire({
          icon: 'error',
          title: `Error creating sharing link: ${linkData.error.message || 'Unknown error'}`
        });
      } else {
        Toast.fire({
          icon: 'error',
          title: 'Error: Could not create a sharing link. The response format was unexpected.'
        });
      }
    }

    // Upload each file into the newly created folder
    for (const file of filesToUpload) {
      const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${folderData.id}:/${encodeURIComponent(file.name)}:/content`;
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Authorization": "Bearer " + accessToken,
          "Content-Type": file.type || "application/octet-stream"
        },
        body: file
      });
      
      // Check if the response indicates an expired token
      if (uploadResponse.status === 401) {
        const errorData = await uploadResponse.json();
        if (errorData.error && errorData.error.code === "InvalidAuthenticationToken") {
          // Try to refresh the token
          const refreshed = await refreshTokenIfNeeded();
          if (refreshed) {
            // Retry the file upload with the new token
            return document.getElementById('upload-button').onclick();
          } else {
            return; // Stop if token refresh failed
          }
        }
      }
      
      // If we get here, either the request succeeded or it's a different error
      if (!uploadResponse.ok) {
        throw new Error(`API error: ${uploadResponse.status}`);
      }
      
      const uploadData = await uploadResponse.json();
      console.log(`File ${file.name} uploaded successfully:`, uploadData);
    }
    
    // Clear the file list and reset input fields
    fileListContainer.innerHTML = '';
    filesToUpload = [];
    if (folderNameInput) folderNameInput.value = '';
    
    Toast.fire({
      icon: 'success',
      title: 'Files uploaded successfully!'
    });
    
  } catch (error) {
    console.error("Error during upload process:", error);
    Toast.fire({
      icon: 'error',
      title: `Error: ${error.message || 'Unknown error occurred during upload'}`
    });
  }
};

/* ---------------- Copy Link Function with "Copied!" Message ---------------- */
function copyLink() {
  const link = createdFolderLink;
  if (link) {
    navigator.clipboard.writeText(link)
      .then(() => {
        Toast.fire({
          icon: 'success',
          title: 'Link copied to clipboard!'
        });
      })
      .catch(() => {
        Toast.fire({
          icon: 'error',
          title: 'Failed to copy the link. Please try manually.'
        });
      });
  } else {
    console.error("No link available to copy.");
    Toast.fire({
      icon: 'error',
      title: 'No link available to copy. Please try again.'
    });
  }
}

/* ---------------- Meeting Modal & Meeting Form Handling ---------------- */
// Since you want the meeting creator on a separate page (/teams), 
// the meeting modal code here will run only if its elements exist.
document.addEventListener("DOMContentLoaded", function() {
  const meetingModal = document.getElementById('meetingModal');
  if (meetingModal) {
    const createMeetingLink = document.getElementById('create-meeting-link');
    if (createMeetingLink) {
      createMeetingLink.addEventListener('click', (e) => {
        e.preventDefault();
        meetingModal.style.display = 'block';
      });
    }
  
    const modalClose = document.getElementById('modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', () => {
        meetingModal.style.display = 'none';
      });
    }
  
    window.addEventListener('click', (event) => {
      if (event.target === meetingModal) {
        meetingModal.style.display = 'none';
      }
    });
  }
});

// Handle meeting form submission (this code will run on the Teams page where the meeting modal exists)
const meetingForm = document.getElementById('meetingForm');
if (meetingForm) {
  meetingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = document.getElementById('topic').value;
    const dateTime = document.getElementById('dateTime').value;
    
    try {
      const response = await fetch("/teams/create-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, dateTime })
      });
      
      const data = await response.json();
      if (data.success) {
        const meetingLinkContainer = document.getElementById("meetingLinkContainer");
        if (meetingLinkContainer) {
          meetingLinkContainer.innerHTML = `<a href="${data.meetingLink}" target="_blank">Join Meeting</a>`;
          meetingLinkContainer.style.display = "block";
        }
        const copyMeetingLinkBtn = document.getElementById("copyMeetingLinkBtn");
        if (copyMeetingLinkBtn) {
          copyMeetingLinkBtn.style.display = "inline-block";
          copyMeetingLinkBtn.onclick = function() {
            navigator.clipboard.writeText(data.meetingLink)
              .then(() => console.log("Meeting link copied to clipboard!"))
              .catch(() => alert("Failed to copy the link. Please try manually."));
          };
        }
      } else {
        Toast.fire({
          icon: 'error',
          title: 'Error creating meeting'
        });
      }
    } catch (err) {
      console.error("Error:", err);
      Toast.fire({
        icon: 'error',
        title: 'Error creating meeting'
      });
    }
  });
}

/* ---------------- OneDrive Search Functionality ---------------- */

// Search input and results elements
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const searchResults = document.getElementById('searchResults');

// Debounce function to limit API calls
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Search OneDrive
async function searchOneDrive(query) {
  if (!query.trim() || !accessToken) return;

  try {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(query)}')`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        // Token might be expired, try to refresh
        const refreshed = await refreshTokenIfNeeded();
        if (refreshed) {
          return searchOneDrive(query);
        }
      }
      throw new Error('Search failed');
    }

    const data = await response.json();
    displaySearchResults(data.value);
  } catch (error) {
    console.error('Search error:', error);
    Toast.fire({
      icon: 'error',
      title: 'Error searching OneDrive'
    });
  }
}

// Display search results
function displaySearchResults(results) {
  if (!results || results.length === 0) {
    searchResults.innerHTML = '<div class="search-result-item">No results found</div>';
    searchResults.style.display = 'block';
    return;
  }

  const resultsHTML = results.map(item => `
    <div class="search-result-item" data-url="${item.webUrl}">
      <i class="fas ${item.folder ? 'fa-folder' : 'fa-file'}"></i>
      <div class="item-name">${item.name}</div>
      <div class="item-path">${item.parentReference?.path || ''}</div>
    </div>
  `).join('');

  searchResults.innerHTML = resultsHTML;
  searchResults.style.display = 'block';

  // Add click handlers to results
  document.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const url = item.getAttribute('data-url');
      if (url) {
        window.open(url, '_blank');
        searchResults.style.display = 'none';
      }
    });
  });
}

// Event listeners for search
if (searchInput && searchButton && searchResults) {
  // Debounced search on input
  searchInput.addEventListener('input', debounce((e) => {
    searchOneDrive(e.target.value);
  }, 300));

  // Search on button click
  searchButton.addEventListener('click', () => {
    if (searchInput.value.trim()) {
      searchOneDrive(searchInput.value);
    }
  });

  // Hide results when clicking outside
  document.addEventListener('click', (e) => {
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer && !searchContainer.contains(e.target)) {
      searchResults.style.display = 'none';
    }
  });

  // Show results when focusing input
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) {
      searchOneDrive(searchInput.value);
    }
  });
}
