// Add SweetAlert2 script
if (typeof Swal === 'undefined') {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
  document.head.appendChild(script);
}

// Global variables for selected files and created folder link
let filesToUpload = [];
let createdFolderLink = '';

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

// Use shared authentication configuration
let msalInstance;
let accessToken = null;
let currentAccount = null;

/* ---------------- Utility: Detect Mobile Device ---------------- */
function isMobileDevice() {
  return /Mobi|Android/i.test(navigator.userAgent);
}

/* ---------------- Initialize Authentication ---------------- */
document.addEventListener("DOMContentLoaded", async function() {
  // Initialize the shared auth configuration
  if (window.AuthConfig) {
    msalInstance = window.AuthConfig.getInstance();
    
    try {
      const authResult = await window.AuthConfig.initialize();
      
      if (authResult.authenticated) {
        currentAccount = authResult.account;
        accessToken = await window.AuthConfig.getAccessToken();
        console.log('User authenticated in app.js:', currentAccount.username);
      }
    } catch (error) {
      console.error('Error initializing authentication in app.js:', error);
    }
  }
});

// Function to extract username from email
function extractUsername(email) {
  if (!email) return '';
  return email.split('@')[0];
}

/* ---------------- Authentication ---------------- */

// Updated sign in function using shared authentication
if (document.getElementById('signin-button')) {
  document.getElementById('signin-button').onclick = async function () {
    try {
      if (window.AuthConfig) {
        await window.AuthConfig.signIn();
        
        // Refresh the page to update UI
        window.location.reload();
      }
    } catch (error) {
      console.error("Sign in error:", error);
      if (window.Toast) {
        Toast.fire({
          icon: 'error',
          title: 'Sign in failed. Please try again.'
        });
      }
    }
  };
}

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
    
    if (window.AuthConfig && currentAccount) {
      try {
        accessToken = await window.AuthConfig.getAccessToken();
        console.log("Token refreshed successfully");
        return true;
      } catch (error) {
        console.error("Error refreshing token:", error);
        // If token refresh fails, redirect to sign in
        window.location.href = '/';
        return false;
      }
    } else {
      console.error("No account found. Please sign in again.");
      window.location.href = '/';
      return false;
    }
  } catch (error) {
    console.error("Error refreshing token:", error);
    window.location.href = '/';
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
