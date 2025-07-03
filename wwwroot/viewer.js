/**
 * @fileoverview Autodesk Viewer initialization and model loading functionality.
 * Handles the setup and management of the Autodesk Forge Viewer.
 */

/// import * as Autodesk from "@types/forge-viewer";

/**
 * Retrieves an access token from the server for Autodesk services.
 * This function is used by the Autodesk Viewer for authentication.
 *
 * @param {Function} callback - Callback function to receive the token and expiry time
 * @returns {Promise<void>}
 */
async function getAccessToken(callback) {
  try {
    const resp = await fetch("/api/auth/token");
    if (!resp.ok) {
      throw new Error(await resp.text());
    }
    const { access_token, expires_in } = await resp.json();
    callback(access_token, expires_in);
  } catch (err) {
    alert("Could not obtain access token. See the console for more details.");
    console.error(err);
  }
}

/**
 * Initializes the Autodesk Viewer in the specified container.
 * Sets up the viewer with production environment and document browser extension.
 *
 * @param {HTMLElement} container - The DOM element to contain the viewer
 * @returns {Promise<Object>} A promise that resolves to the initialized viewer instance
 */
export function initViewer(container) {
  return new Promise(function (resolve, reject) {
    Autodesk.Viewing.Initializer(
      { env: "AutodeskProduction", getAccessToken },
      function () {
        const config = {
          extensions: ["Autodesk.DocumentBrowser"],
        };
        const viewer = new Autodesk.Viewing.GuiViewer3D(container, config);
        viewer.start();
        viewer.setTheme("light-theme");
        resolve(viewer);
      }
    );
  });
}

/**
 * Loads a model into the viewer using its URN.
 * Handles the document loading process and sets up the viewer for the model.
 *
 * @param {Object} viewer - The Autodesk Viewer instance
 * @param {string} urn - The URN of the model to load
 * @returns {Promise<Object>} A promise that resolves when the model is loaded
 */
export function loadModel(viewer, urn) {
  return new Promise(function (resolve, reject) {
    function onDocumentLoadSuccess(doc) {
      resolve(viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry()));
    }
    function onDocumentLoadFailure(code, message, errors) {
      const error = new Error(
        message || `Document load failed with code: ${code}`
      );
      error.code = code;
      error.errors = errors;
      reject(error);
    }
    viewer.setLightPreset(0);
    Autodesk.Viewing.Document.load(
      "urn:" + urn,
      onDocumentLoadSuccess,
      onDocumentLoadFailure
    );
  });
}
