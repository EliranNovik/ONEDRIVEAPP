/* Global variables for selected files, access token, and created folder link */
let filesToUpload = [];
let accessToken = null;
let createdFolderLink = '';

// MSAL configuration for your OneDrive (Microsoft Graph) app
const msalConfig = {
  auth: {
    clientId: "e03ab8e9-4eb4-4bbc-8c6d-805021e089cd",  
    authority: "https://login.microsoftonline.com/899fa835-174e-49e1-93a3-292318f5ee84",
    redirectUri: window.REDIRECT_URI || 'http://localhost:3000'
  }
};

const msalInstance = new msal.PublicClientApplication(msalConfig);
const graphScopes = ["Files.ReadWrite.All", "OnlineMeetings.ReadWrite", "Calendars.ReadWrite", "User.Read"];

/* ---------------- Authentication ---------------- */

document.getElementById('signin-button').onclick = function () {
  msalInstance.loginPopup({ scopes: graphScopes })
    .then(loginResponse => {
      msalInstance.setActiveAccount(loginResponse.account);
      console.log("Login successful:", loginResponse);
      // Acquire token silently
      return msalInstance.acquireTokenSilent({ scopes: graphScopes, account: loginResponse.account });
    })
    .then(tokenResponse => {
      accessToken = tokenResponse.accessToken;
      console.log("Access token acquired:", accessToken);
      // Send the token to the server to store in the session
      return fetch("/set-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: accessToken })
      });
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        console.log("Token stored in session.");
        document.getElementById('signin-button').style.display = 'none';
        document.getElementById('signout-button').style.display = 'inline-block';
      } else {
        console.error("Failed to store token in session:", data.message);
      }
    })
    .catch(error => {
      console.error("Error in login flow:", error);
      alert("Login failed. See console for details.");
    });
};

document.getElementById('signout-button').onclick = function () {
  window.location.href = "https://YOUR_TENANT-my.sharepoint.com";
};

/* ---------------- File Selection & Drag-Drop ---------------- */

const dropZone = document.getElementById('drop-zone');
const fileListContainer = document.getElementById('fileList');
const fileInput = document.getElementById('fileInput');

if (fileInput) {
  dropZone.addEventListener('click', () => { fileInput.click(); });
  
  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      filesToUpload = files;
      updateFileList();
    }
  });
}

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
  
  const createFolderEndpoint = `https://graph.microsoft.com/v1.0/me/drive/root/children`;
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
    createdFolderLink = folderData.webUrl;
    
    fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${folderData.id}/createLink`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ type: "edit", scope: "anonymous" })
    })
    .then(response => response.json())
    .then(linkData => {
      console.log("Sharing link created:", linkData);
      createdFolderLink = linkData.link.webUrl;
      const copyBtn = document.getElementById('copyLinkBtn');
      const openFolderBtn = document.getElementById('openFolderBtn');
      copyBtn.style.display = 'inline-block';
      openFolderBtn.style.display = 'inline-block';
      copyBtn.onclick = function() { copyLink(); };
      openFolderBtn.onclick = function() { window.open(createdFolderLink, '_blank'); };
    })
    .catch(error => {
      console.error("Error creating sharing link:", error);
      alert("Error setting folder sharing. Check the console for details.");
    });

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
    
    alert("Folder created, sharing link set, and file upload initiated. Check console for details.");
    fileListContainer.innerHTML = '';
    filesToUpload = [];
    if (folderNameInput) folderNameInput.value = '';
  })
  .catch(error => {
    console.error("Error creating folder:", error);
    alert("Error creating folder. Check the console for details.");
  });
};

function copyLink() {
  if (createdFolderLink) {
    navigator.clipboard.writeText(createdFolderLink)
      .then(() => {
        const copyMessage = document.getElementById("copyMessage");
        copyMessage.classList.add("show");
        setTimeout(() => { copyMessage.classList.remove("show"); }, 2000);
      })
      .catch(err => {
        console.error("Failed to copy the link:", err);
        alert("Failed to copy the link. Please try manually.");
      });
  } else {
    alert("No link available to copy. Please try again.");
  }
}
