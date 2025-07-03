/**
 * @fileoverview Main application file for the Autodesk Platform Services (APS) Simple Viewer.
 * Handles bucket management, model uploading, and viewer initialization.
 */

import { initViewer, loadModel } from "./viewer.js";

/**
 * Initialize the application when the DOM is loaded.
 * Sets up the viewer and initializes all UI components.
 */
initViewer(document.getElementById("preview")).then((viewer) => {
  window.viewer = viewer; // Store viewer globally for delete function access
  const urn = window.location.hash?.substring(1);
  setUpBucketSelection(viewer, urn);
  setupModelSelection(viewer, urn);
  setupModelUpload(viewer);
  setupBucketCreation(viewer);
});

/**
 * Sets up the bucket selection dropdown with available buckets.
 * Populates the dropdown with buckets from the server and handles selection state.
 *
 * @param {Object} viewer - The Autodesk Viewer instance
 * @param {string} [selectedUrn] - The URN of the bucket to pre-select
 * @returns {Promise<void>}
 */
async function setUpBucketSelection(viewer, selectedUrn) {
  const dropdownContainer = document.getElementById("buckets");
  const dropdownOptions = document.getElementById("bucket-options");
  const selectedText = dropdownContainer.querySelector(".selected-text");

  dropdownOptions.innerHTML = "";

  try {
    const resp = await fetch("/api/buckets");
    if (!resp.ok) {
      throw new Error(await resp.text());
    }
    const buckets = await resp.json();

    if (buckets.length === 0) {
      selectedText.textContent = "No buckets available";
      return;
    }

    dropdownOptions.innerHTML = buckets
      .map(
        (bucket) =>
          `<div class="dropdown-option ${
            bucket.urn === selectedUrn ? "selected" : ""
          }" data-urn="${bucket.urn}" onclick="selectBucket('${bucket.urn}', '${
            bucket.name
          }')" role="option" tabindex="-1" title="${bucket.name}">
            <span class="option-name" title="${bucket.name}">${
            bucket.name
          }</span>
            <button class="delete-btn" onclick="event.stopPropagation(); deleteBucket('${
              bucket.name
            }')" title="Delete bucket (Note: Only buckets created by this app can be deleted)" aria-label="Delete bucket ${
            bucket.name
          }">×</button>
          </div>`
      )
      .join("\n");

    const selectedBucket = buckets.find((b) => b.urn === selectedUrn);
    if (selectedBucket) {
      selectedText.textContent = selectedBucket.name;
      selectedText.title = selectedBucket.name;
      onBucketSelected(viewer, selectedUrn);
    } else if (buckets.length > 0) {
      const firstBucket = buckets[0];
      selectedText.textContent = firstBucket.name;
      selectedText.title = firstBucket.name;
      onBucketSelected(viewer, firstBucket.urn);
    } else {
      selectedText.textContent = "Select a bucket...";
      selectedText.title = "";
    }
  } catch (err) {
    selectedText.textContent = "Error loading buckets";
    alert("Could not list buckets. See the console for more details.");
    console.error(err);
  }
}

/**
 * Sets up the model selection dropdown with available models.
 * Populates the dropdown with models from the default bucket.
 *
 * @param {Object} viewer - The Autodesk Viewer instance
 * @param {string} [selectedUrn] - The URN of the model to pre-select
 * @returns {Promise<void>}
 */
async function setupModelSelection(viewer, selectedUrn) {
  const dropdown = document.getElementById("models");
  dropdown.innerHTML = "";
  try {
    const resp = await fetch("/api/models");
    if (!resp.ok) {
      throw new Error(await resp.text());
    }
    const models = await resp.json();
    dropdown.innerHTML = models
      .map(
        (model) =>
          `<option value=${model.urn} ${
            model.urn === selectedUrn ? "selected" : ""
          }>${model.name}</option>`
      )
      .join("\n");
    dropdown.onchange = () => onModelSelected(viewer, dropdown.value);
    if (dropdown.value) {
      onModelSelected(viewer, dropdown.value);
    }
  } catch (err) {
    alert("Could not list models. See the console for more details.");
    console.error(err);
  }
}

/**
 * Sets up bucket creation functionality.
 * Handles the create bucket button click event and form submission.
 *
 * @param {Object} viewer - The Autodesk Viewer instance
 * @returns {Promise<void>}
 */
async function setupBucketCreation(viewer) {
  const create = document.getElementById("create");
  const input = document.getElementById("bucket");
  const buckets = document.getElementById("buckets");

  create.onclick = async () => {
    const bucketName = input.value.trim();
    if (!bucketName) {
      alert("Please enter a bucket name.");
      return;
    }

    create.setAttribute("disabled", "true");
    buckets.classList.add("disabled");
    showNotification(`Creating bucket <em>${bucketName}</em>. Please wait...`);

    try {
      const resp = await fetch("/api/buckets/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bucketName: bucketName }),
      });

      if (!resp.ok) {
        throw new Error(await resp.text());
      }

      const bucket = await resp.json();
      setUpBucketSelection(viewer, bucket.urn);
      input.value = "";
    } catch (err) {
      clearNotification();
      console.error("Bucket creation error:", err);
    } finally {
      clearNotification();
      create.removeAttribute("disabled");
      buckets.classList.remove("disabled");
    }
  };
}

/**
 * Sets up model upload functionality.
 * Handles file selection, validation, and upload to the selected bucket.
 *
 * @param {Object} viewer - The Autodesk Viewer instance
 * @returns {Promise<void>}
 */
async function setupModelUpload(viewer) {
  const upload = document.getElementById("upload");
  const input = document.getElementById("input");
  const models = document.getElementById("models");
  upload.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files[0];

    // Get the currently selected bucket
    const bucketsDropdown = document.getElementById("buckets");
    const selectedText = bucketsDropdown.querySelector(".selected-text");
    const selectedOption = bucketsDropdown.querySelector(
      ".dropdown-option.selected"
    );

    if (
      !selectedOption ||
      !selectedText ||
      selectedText.textContent === "Select a bucket..." ||
      selectedText.textContent === "No buckets available" ||
      selectedText.textContent === "Error loading buckets"
    ) {
      alert("Please select a bucket before uploading a model.");
      input.value = ""; // Clear the file input
      return;
    }

    const selectedBucketUrn = selectedOption.dataset.urn;

    let data = new FormData();
    data.append("model-file", file);
    data.append("bucket-urn", selectedBucketUrn); // Include the selected bucket

    if (file.name.endsWith(".zip")) {
      // When uploading a zip file, ask for the main design file in the archive
      const entrypoint = window.prompt(
        "Please enter the filename of the main design inside the archive."
      );
      if (!entrypoint) {
        input.value = ""; // Clear the file input if user cancels
        return;
      }
      data.append("model-zip-entrypoint", entrypoint);
    }

    upload.setAttribute("disabled", "true");
    models.setAttribute("disabled", "true");
    showNotification(
      `Uploading model <em>${file.name}</em> to bucket <em>${selectedText.textContent}</em>. Do not reload the page.`
    );

    try {
      const resp = await fetch("/api/models", { method: "POST", body: data });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }

      await resp.json();
      onBucketSelected(viewer, selectedBucketUrn);
    } catch (err) {
      alert(
        `Could not upload model ${file.name}. See the console for more details.`
      );
      console.error(err);
    } finally {
      clearNotification();
      upload.removeAttribute("disabled");
      models.removeAttribute("disabled");
      input.value = "";
    }
  };
}

/**
 * Handles bucket selection and updates the models dropdown.
 * Fetches and displays models from the selected bucket.
 *
 * @param {Object} viewer - The Autodesk Viewer instance
 * @param {string} bucketUrn - The URN of the selected bucket
 * @returns {Promise<void>}
 */
async function onBucketSelected(viewer, bucketUrn) {
  try {
    const resp = await fetch(
      `/api/models?bucket=${encodeURIComponent(bucketUrn)}`
    );
    if (!resp.ok) {
      throw new Error(await resp.text());
    }
    const models = await resp.json();
    const modelsDropdown = document.getElementById("models");
    modelsDropdown.innerHTML = models
      .map((model) => `<option value=${model.urn}>${model.name}</option>`)
      .join("\n");

    if (models.length === 0) {
      showNotification("No models found in this bucket.");
    } else {
      clearNotification();
      if (modelsDropdown.value) {
        onModelSelected(viewer, modelsDropdown.value);
      }
    }
  } catch (err) {
    alert(
      "Could not list models for this bucket. See the console for more details."
    );
    console.error(err);
  }
}

/**
 * Handles model selection and loading.
 * Checks translation status and loads the model in the viewer when ready.
 *
 * @param {Object} viewer - The Autodesk Viewer instance
 * @param {string} urn - The URN of the selected model
 * @returns {Promise<void>}
 */
async function onModelSelected(viewer, urn) {
  if (window.onModelSelectedTimeout) {
    clearTimeout(window.onModelSelectedTimeout);
    delete window.onModelSelectedTimeout;
  }
  window.location.hash = urn;
  try {
    const resp = await fetch(`/api/models/${urn}/status`);
    if (!resp.ok) {
      throw new Error(await resp.text());
    }
    const status = await resp.json();
    switch (status.status) {
      case "n/a":
        showNotification(`Model has not been translated.`);
        break;
      case "inprogress":
        showNotification(`Model is being translated (${status.progress})...`);
        window.onModelSelectedTimeout = setTimeout(
          onModelSelected,
          5000,
          viewer,
          urn
        );
        break;
      case "failed":
        showNotification(
          `Translation failed. <ul>${status.messages
            .map((msg) => `<li>${JSON.stringify(msg)}</li>`)
            .join("")}</ul>`
        );
        break;
      default:
        clearNotification();
        loadModel(viewer, urn);
        break;
    }
  } catch (err) {
    alert("Could not load model. See the console for more details.");
    console.error(err);
  }
}

/**
 * Displays a notification message to the user.
 * Shows an overlay with the specified message.
 *
 * @param {string} message - The HTML message to display
 */
function showNotification(message) {
  const overlay = document.getElementById("overlay");
  overlay.innerHTML = `<div class="notification">${message}</div>`;
  overlay.style.display = "flex";
}

/**
 * Clears the notification overlay.
 * Hides the notification message from the user.
 */
function clearNotification() {
  const overlay = document.getElementById("overlay");
  overlay.innerHTML = "";
  overlay.style.display = "none";
}

/**
 * Deletes a bucket after user confirmation.
 * Handles the deletion process and updates the UI accordingly.
 *
 * @param {string} bucketName - The name of the bucket to delete
 * @returns {Promise<void>}
 */
async function deleteBucket(bucketName) {
  if (
    !confirm(
      `Are you sure you want to delete bucket "${bucketName}"?\n\nNote: You can only delete buckets that you created with this app. Buckets created by other applications or users cannot be deleted.\n\nThis action cannot be undone.`
    )
  ) {
    return;
  }

  try {
    showNotification(`Deleting bucket <em>${bucketName}</em>...`);

    const resp = await fetch("/api/buckets", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bucketName: bucketName }),
    });

    if (!resp.ok) {
      const errorMessage = await resp.text();
      throw new Error(errorMessage);
    }

    const viewer = window.viewer;
    setUpBucketSelection(viewer);

    clearNotification();
    showNotification(`Bucket "${bucketName}" deleted successfully.`);
    setTimeout(clearNotification, 3000);
  } catch (err) {
    clearNotification();
    alert(err.message);
    console.error("Bucket deletion error:", err);
  }
}

/**
 * Toggles the dropdown open/closed state.
 * Manages the dropdown visibility and ARIA attributes.
 */
function toggleDropdown() {
  const dropdown = document.getElementById("buckets");
  const dropdownSelected = dropdown.querySelector(".dropdown-selected");
  const isOpen = dropdown.classList.contains("open");

  console.log("Toggle dropdown called, current state:", isOpen);

  dropdown.classList.toggle("open");

  dropdownSelected.setAttribute("aria-expanded", !isOpen);
}

/**
 * Handles bucket selection from the dropdown.
 * Updates the selected bucket and triggers bucket-specific actions.
 *
 * @param {string} urn - The URN of the selected bucket
 * @param {string} name - The display name of the selected bucket
 */
function selectBucket(urn, name) {
  console.log("Select bucket called:", name, urn);
  const dropdown = document.getElementById("buckets");
  const dropdownSelected = dropdown.querySelector(".dropdown-selected");
  const selectedText = dropdown.querySelector(".selected-text");
  const options = dropdown.querySelectorAll(".dropdown-option");

  selectedText.textContent = name;
  selectedText.title = name;

  options.forEach((option) => {
    option.classList.remove("selected");
    if (option.dataset.urn === urn) {
      option.classList.add("selected");
    }
  });

  dropdown.classList.remove("open");
  dropdownSelected.setAttribute("aria-expanded", "false");

  onBucketSelected(window.viewer, urn);
}

/**
 * Handles keyboard events for the dropdown.
 * Provides keyboard accessibility for dropdown interaction.
 *
 * @param {KeyboardEvent} event - The keyboard event
 */
function handleDropdownKeydown(event) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleDropdown();
  } else if (event.key === "Escape") {
    const dropdown = document.getElementById("buckets");
    const dropdownSelected = dropdown.querySelector(".dropdown-selected");
    dropdown.classList.remove("open");
    dropdownSelected.setAttribute("aria-expanded", "false");
  }
}

// Make functions globally accessible for HTML onclick handlers
window.toggleDropdown = toggleDropdown;
window.selectBucket = selectBucket;
window.handleDropdownKeydown = handleDropdownKeydown;
window.deleteBucket = deleteBucket;

/**
 * Close dropdown when clicking outside of it.
 * Provides click-away functionality for better UX.
 */
document.addEventListener("click", function (event) {
  const dropdown = document.getElementById("buckets");
  if (dropdown && !dropdown.contains(event.target)) {
    const dropdownSelected = dropdown.querySelector(".dropdown-selected");
    dropdown.classList.remove("open");
    dropdownSelected.setAttribute("aria-expanded", "false");
  }
});
