// Global variables for selected files, access token, and created folder link
let filesToUpload = [];
let accessToken = null;
let createdFolderLink = '';

// MSAL configuration for your OneDrive (Microsoft Graph) app
const msalConfig = {
  auth: {
    clientId: "e03ab8e9-4eb4-4bbc-8c6d-805021e089cd",  
    authority: "https://login.microsoftonline.com/899fa835-174e-49e1-93a3-292318f5ee84",
    // Use the environment variable for redirectUri (set via window.REDIRECT_URI in your HTML)
    redirectUri: window.REDIRECT_URI || 'http://localhost:3000/callback'
  }
};

const msalInstance = new msal.PublicClientApplication(msalConfig);

// Scopes needed for OneDrive file access and Teams meeting creation
const graphScopes = [
  "Files.ReadWrite.All",
  "OnlineMeetings.ReadWrite",
  "Calendars.ReadWrite",
  "User.Read"
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
      }
    })
    .catch(err => {
      console.error("Error fetching token from session:", err);
    });
});

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
        msalInstance.setActiveAccount(loginResponse.account);
        console.log("Login successful:", loginResponse);
        msalInstance.acquireTokenSilent({ scopes: graphScopes, account: loginResponse.account })
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
  window.location.href = "https://lawdecker-my.sharepoint.com";
};

/* ---------------- File Selection & Drag-Drop ---------------- */

const dropZone = document.getElementById('drop-zone');
const fileListContainer = document.getElementById('fileList');
const fileInput = document.getElementById('fileInput');

// When clicking on the drop zone, trigger file input click
if (fileInput) {
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });
  
  // Update file list when files are selected via file input
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      filesToUpload = files;
      updateFileList();
    }
  });
}

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
    filesToUpload = files;
    updateFileList();
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

/* ---------------- File Upload ---------------- */

// Upload files to OneDrive under a new folder created in the root directory
document.getElementById('upload-button').onclick = function () {
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
  
  fetch(createFolderEndpoint, {
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
  })
  .then(response => response.json())
  .then(folderData => {
    console.log("Folder created:", folderData);
    // Save the webUrl as a fallback sharing link (if needed)
    createdFolderLink = folderData.webUrl;
    
    // Create a sharing link (edit, anonymous) for the new folder
    fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${folderData.id}/createLink`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "edit",
        scope: "anonymous"
      })
    })
    .then(response => response.json())
    .then(linkData => {
      console.log("Sharing link created:", linkData);
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
    })
    .catch(error => {
      console.error("Error creating sharing link:", error);
      alert("Error setting folder sharing. Check the console for details.");
    });

    // Upload each file into the newly created folder
    filesToUpload.forEach(file => {
      const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${folderData.id}:/${encodeURIComponent(file.name)}:/content`;
      fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Authorization": "Bearer " + accessToken,
          "Content-Type": file.type || "application/octet-stream"
        },
        body: file
      })
      .then(response => response.json())
      .then(uploadData => {
        console.log(`File ${file.name} uploaded successfully:`, uploadData);
      })
      .catch(error => {
        console.error(`Error uploading file ${file.name}:`, error);
      });
    });
    
    console.log("Folder created, sharing link set, and file upload initiated. Check console for details.");
    // Clear the file list and reset input fields
    fileListContainer.innerHTML = '';
    filesToUpload = [];
    if (folderNameInput) folderNameInput.value = '';
    const customNameInput = document.getElementById('customName');
    if (customNameInput) customNameInput.value = '';
  })
  .catch(error => {
    console.error("Error creating folder:", error);
    alert("Error creating folder. Check the console for details.");
  });
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
