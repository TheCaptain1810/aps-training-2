import { initViewer, loadModel } from "./viewer.js";

initViewer(document.getElementById("preview")).then((viewer) => {
  window.viewer = viewer; // Store viewer globally for delete function access
  const urn = window.location.hash?.substring(1);
  setUpBucketSelection(viewer, urn);
  setupModelUpload(viewer);
  setupBucketCreation(viewer);
});

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

    // Update selected text
    if (buckets.length === 0) {
      selectedText.textContent = "No buckets available";
      return;
    }

    // Create dropdown options with delete buttons
    dropdownOptions.innerHTML = buckets
      .map(
        (bucket) =>
          `<div class="dropdown-option ${
            bucket.urn === selectedUrn ? "selected" : ""
          }" data-urn="${bucket.urn}" onclick="selectBucket('${bucket.urn}', '${
            bucket.name
          }')" role="option" tabindex="-1">
            <span class="option-name">${bucket.name}</span>
            <button class="delete-btn" onclick="event.stopPropagation(); deleteBucket('${
              bucket.name
            }')" title="Delete bucket (Note: Only buckets created by this app can be deleted)" aria-label="Delete bucket ${
            bucket.name
          }">×</button>
          </div>`
      )
      .join("\n");

    // Set selected text
    const selectedBucket = buckets.find((b) => b.urn === selectedUrn);
    if (selectedBucket) {
      selectedText.textContent = selectedBucket.name;
      onBucketSelected(viewer, selectedUrn);
    } else if (buckets.length > 0) {
      // Auto-select first bucket if no selection
      const firstBucket = buckets[0];
      selectedText.textContent = firstBucket.name;
      onBucketSelected(viewer, firstBucket.urn);
    } else {
      selectedText.textContent = "Select a bucket...";
    }
  } catch (err) {
    selectedText.textContent = "Error loading buckets";
    alert("Could not list buckets. See the console for more details.");
    console.error(err);
  }
}

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
    // Disable dropdown by adding a disabled class instead of attribute
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
      input.value = ""; // Clear the input
    } catch (err) {
      alert(
        `Could not create bucket ${bucketName}. See the console for more details.`
      );
      console.error(err);
    } finally {
      clearNotification();
      create.removeAttribute("disabled");
      buckets.classList.remove("disabled");
    }
  };
}

async function setupModelUpload(viewer) {
  const upload = document.getElementById("upload");
  const input = document.getElementById("input");
  const models = document.getElementById("models");
  upload.onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files[0];
    let data = new FormData();
    data.append("model-file", file);
    if (file.name.endsWith(".zip")) {
      // When uploading a zip file, ask for the main design file in the archive
      const entrypoint = window.prompt(
        "Please enter the filename of the main design inside the archive."
      );
      data.append("model-zip-entrypoint", entrypoint);
    }
    upload.setAttribute("disabled", "true");
    models.setAttribute("disabled", "true");
    showNotification(
      `Uploading model <em>${file.name}</em>. Do not reload the page.`
    );
    try {
      const resp = await fetch("/api/models", { method: "POST", body: data });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      const model = await resp.json();
      // Refresh the currently selected bucket to show the new model
      const bucketsDropdown = document.getElementById("buckets");
      const selectedText = bucketsDropdown.querySelector(".selected-text");
      if (
        selectedText &&
        selectedText.textContent !== "Select a bucket..." &&
        selectedText.textContent !== "No buckets available"
      ) {
        // Get the current selected bucket URN and refresh it
        const selectedOption = bucketsDropdown.querySelector(
          ".dropdown-option.selected"
        );
        if (selectedOption) {
          onBucketSelected(viewer, selectedOption.dataset.urn);
        }
      } else {
        setupModelSelection(viewer, model.urn);
      }
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

async function onBucketSelected(viewer, bucketUrn) {
  // When a bucket is selected, refresh the models dropdown to show models from that bucket
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

    // Clear any existing model selection
    if (models.length === 0) {
      showNotification("No models found in this bucket.");
    } else {
      clearNotification();
      // Optionally select the first model
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

function showNotification(message) {
  const overlay = document.getElementById("overlay");
  overlay.innerHTML = `<div class="notification">${message}</div>`;
  overlay.style.display = "flex";
}

function clearNotification() {
  const overlay = document.getElementById("overlay");
  overlay.innerHTML = "";
  overlay.style.display = "none";
}

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

    // Refresh the bucket list after successful deletion
    const viewer = window.viewer; // Assuming viewer is accessible globally
    setUpBucketSelection(viewer);

    clearNotification();
    showNotification(`Bucket "${bucketName}" deleted successfully.`);
    setTimeout(clearNotification, 3000);
  } catch (err) {
    clearNotification();

    // Show more user-friendly error messages based on the error type
    let userMessage = `Could not delete bucket "${bucketName}".`;

    if (err.message.includes("Permission denied")) {
      userMessage +=
        "\n\nThis bucket was likely created by another application or user. You can only delete buckets that you created with this app.";
    } else if (err.message.includes("not empty")) {
      userMessage +=
        "\n\nThe bucket contains objects that need to be deleted first.";
    } else if (err.message.includes("not found")) {
      userMessage += "\n\nThe bucket no longer exists.";
    } else {
      userMessage += `\n\nError: ${err.message}`;
    }

    alert(userMessage);
    console.error("Bucket deletion error:", err);
  }
}

function toggleDropdown() {
  const dropdown = document.getElementById("buckets");
  const dropdownSelected = dropdown.querySelector(".dropdown-selected");
  const isOpen = dropdown.classList.contains("open");

  console.log("Toggle dropdown called, current state:", isOpen);

  dropdown.classList.toggle("open");

  // Update aria-expanded attribute
  dropdownSelected.setAttribute("aria-expanded", !isOpen);
}

function selectBucket(urn, name) {
  console.log("Select bucket called:", name, urn);
  const dropdown = document.getElementById("buckets");
  const dropdownSelected = dropdown.querySelector(".dropdown-selected");
  const selectedText = dropdown.querySelector(".selected-text");
  const options = dropdown.querySelectorAll(".dropdown-option");

  // Update selected text
  selectedText.textContent = name;

  // Update selected option
  options.forEach((option) => {
    option.classList.remove("selected");
    if (option.dataset.urn === urn) {
      option.classList.add("selected");
    }
  });

  // Close dropdown
  dropdown.classList.remove("open");
  dropdownSelected.setAttribute("aria-expanded", "false");

  // Trigger bucket selection
  onBucketSelected(window.viewer, urn);
}

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

// Close dropdown when clicking outside
document.addEventListener("click", function (event) {
  const dropdown = document.getElementById("buckets");
  if (dropdown && !dropdown.contains(event.target)) {
    const dropdownSelected = dropdown.querySelector(".dropdown-selected");
    dropdown.classList.remove("open");
    dropdownSelected.setAttribute("aria-expanded", "false");
  }
});
