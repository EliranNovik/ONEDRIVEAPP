// Global variables for selected files, access token, and created folder link
let filesToUpload = [];
let accessToken = null;
let createdFolderLink = '';

// MSAL configuration for your OneDrive (Microsoft Graph) app
const msalConfig = {
  auth: {
    clientId: "e03ab8e9-4eb4-4bbc-8c6d-805021e089cd",  
    authority: "https://login.microsoftonline.com/899fa835-174e-49e1-93a3-292318f5ee84",
    redirectUri: "https://bd50-212-199-32-162.ngrok-free.app"
  }
};

const msalInstance = new msal.PublicClientApplication(msalConfig);

// Scopes needed for OneDrive file access (Microsoft Graph)
const graphScopes = ["Files.ReadWrite.All"];

/* ---------------- Authentication ---------------- */

// Sign in function
document.getElementById('signin-button').onclick = function () {
  msalInstance.loginPopup({ scopes: graphScopes })
    .then(loginResponse => {
      msalInstance.setActiveAccount(loginResponse.account);
      msalInstance.acquireTokenSilent({ scopes: graphScopes, account: loginResponse.account })
        .then(tokenResponse => {
          accessToken = tokenResponse.accessToken;
          document.getElementById('signin-button').style.display = 'none';
          document.getElementById('signout-button').style.display = 'inline-block';
        })
        .catch(error => {
          alert("Error acquiring token. See console for details.");
        });
    })
    .catch(error => {
      alert("Login failed. See console for details.");
    });
};

// Sign out function
document.getElementById('signout-button').onclick = function () {
  msalInstance.logoutPopup().then(() => {
    accessToken = null;
    document.getElementById('signin-button').style.display = 'inline-block';
    document.getElementById('signout-button').style.display = 'none';
  });
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
  fileListContainer.innerHTML = `<h3>FILES</h3>` + listHTML;
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
  
  // Create the folder in OneDrive using Microsoft Graph API
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
      createdFolderLink = linkData.link.webUrl;
      
      // Show "Copy Link" and "Open Folder" buttons
      const copyBtn = document.getElementById('copyLinkBtn');
      const openFolderBtn = document.getElementById('openFolderBtn');
      copyBtn.style.display = 'inline-block';
      openFolderBtn.style.display = 'inline-block';
      
      copyBtn.onclick = function() {
        copyLink(); // Use the updated copyLink function
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
  const link = createdFolderLink; // Get the link of the created folder

  if (link) {
    // Copy the link to the clipboard
    navigator.clipboard.writeText(link)
      .then(() => {
        // Show the "Copied!" message
        const copyMessage = document.getElementById("copyMessage");
        copyMessage.classList.add("show"); // Add the 'show' class to display the message

        // Hide the "Copied!" message after 2 seconds
        setTimeout(() => {
          copyMessage.classList.remove("show"); // Remove the 'show' class to fade out the message
        }, 2000);
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
