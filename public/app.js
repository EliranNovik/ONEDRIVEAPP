// Global variables for selected files, access token, and created folder link
let filesToUpload = [];
let accessToken = null;
let createdFolderLink = '';
let currentAccount = null; // Store the current account

// MSAL configuration for your OneDrive (Microsoft Graph) app
const msalConfig = {
  auth: {
    clientId: "e03ab8e9-4eb4-4bbc-8c6d-805021e089cd",  
    authority: "https://login.microsoftonline.com/899fa835-174e-49e1-93a3-292318f5ee84",
    // Use the environment variable for redirectUri (set via window.REDIRECT_URI in your HTML)
    redirectUri: window.REDIRECT_URI || 'http://localhost:3000/onedriveapp'
  }
};

const msalInstance = new msal.PublicClientApplication(msalConfig);

// Scopes needed for OneDrive file access and Teams meeting creation
const graphScopes = [
  "Files.ReadWrite.All",
  "OnlineMeetings.ReadWrite",
  "Calendars.ReadWrite",
  "User.Read",
  "Mail.Send"
];

/* ---------------- Utility: Detect Mobile Device ---------------- */
function isMobileDevice() {
  return /Mobi|Android/i.test(navigator.userAgent);
}

/* ---------------- Check for Existing Token in Session ---------------- */
document.addEventListener("DOMContentLoaded", function() {
  // Check for an existing token stored in the server session
  fetch('/get-token')
    .then(response => response.json())
    .then(data => {
      if (data.token) {
        accessToken = data.token;
        document.getElementById('signin-button').style.display = 'none';
        document.getElementById('signout-button').style.display = 'inline-block';
        console.log("Token retrieved from session:", accessToken);
        
        // Try to get the account from MSAL
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
          currentAccount = accounts[0];
          msalInstance.setActiveAccount(currentAccount);
          updateWelcomeMessage(currentAccount.name);
          console.log("Account retrieved from MSAL:", currentAccount);
        } else {
          // If no accounts found but we have a token, try to handle the redirect
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
  if (userName) {
    welcomeMessage.classList.add('signed-in');
    document.getElementById('userName').textContent = userName;
    document.getElementById('welcomeText').style.display = 'none';
    document.getElementById('userName').style.display = 'inline-block';
  } else {
    welcomeMessage.classList.remove('signed-in');
    document.getElementById('welcomeText').style.display = 'inline-block';
    document.getElementById('userName').style.display = 'none';
  }
}

// Handle redirect promise to complete authentication
async function handleRedirectPromise() {
  try {
    const response = await msalInstance.handleRedirectPromise();
    if (response) {
      console.log('Login successful');
      const account = msalInstance.getAccount();
      updateWelcomeMessage(account.name);
      currentAccount = account;
      msalInstance.setActiveAccount(currentAccount);
      console.log("User signed in via redirect:", currentAccount);
      
      // Get a token
      const tokenResponse = await msalInstance.acquireTokenSilent({ 
        scopes: graphScopes, 
        account: currentAccount 
      });
      
      accessToken = tokenResponse.accessToken;
      console.log("Access token acquired after redirect:", accessToken);
      
      // Update UI
      document.getElementById('signin-button').style.display = 'none';
      document.getElementById('signout-button').style.display = 'inline-block';
      
      // Save the token to the server session
      const saveResponse = await fetch('/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: accessToken })
      });
      
      const saveData = await saveResponse.json();
      if (saveData.success) {
        console.log("Token saved in session after redirect.");
      } else {
        console.error("Error saving token after redirect:", saveData.message);
      }
    }
  } catch (error) {
    console.error('Error during redirect:', error);
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
        msalInstance.acquireTokenSilent({ scopes: graphScopes, account: currentAccount })
          .then(tokenResponse => {
            accessToken = tokenResponse.accessToken;
            console.log("Access token acquired:", accessToken);
            document.getElementById('signin-button').style.display = 'none';
            document.getElementById('signout-button').style.display = 'inline-block';
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
            alert("Error acquiring token. See console for details.");
          });
      })
      .catch(error => {
        console.error("Login error:", error);
        alert("Login failed. See console for details.");
      });
  }
};

// Sign out function now redirects to OneDrive instead of logging out.
// Replace the URL below with your OneDrive for Business URL.
document.getElementById('signout-button').onclick = function () {
  window.open("https://lawdecker-my.sharepoint.com", "_blank");
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
    alert('Please drag and drop at least one file.');
    return;
  }
  if (!accessToken) {
    alert('Please sign in first to obtain an access token.');
    return;
  }
  
  const folderNameInput = document.getElementById('folderName');
  const folderName = folderNameInput ? folderNameInput.value.trim() : '';
  if (!folderName) {
    alert('Please enter a new folder name.');
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
        alert(`Error creating sharing link: ${linkData.error.message || 'Unknown error'}`);
      } else {
        alert("Error: Could not create a sharing link. The response format was unexpected.");
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
    
  } catch (error) {
    console.error("Error during upload process:", error);
    alert(`Error: ${error.message || 'Unknown error occurred during upload'}`);
  }
};

/* ---------------- Copy Link Function with "Copied!" Message ---------------- */
function copyLink() {
  const link = createdFolderLink;
  if (link) {
    navigator.clipboard.writeText(link)
      .then(() => {
        const copyMessage = document.getElementById("copyMessage");
        if (copyMessage) {
          copyMessage.classList.add("show");
          setTimeout(() => {
            copyMessage.classList.remove("show");
          }, 2000);
        }
      })
      .catch(err => {
        console.error("Failed to copy the link:", err);
        alert("Failed to copy the link. Please try manually.");
      });
  } else {
    console.error("No link available to copy.");
    alert("No link available to copy. Please try again.");
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
        alert("Error creating meeting");
      }
    } catch (err) {
      console.error("Error:", err);
      alert("Error creating meeting");
    }
  });
}
