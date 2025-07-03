const express = require("express");
const formidable = require("express-formidable");
const {
  listObjects,
  uploadObject,
  translateObject,
  getManifest,
  urnify,
  deurnify,
} = require("../services/aps.js");

let router = express.Router();

router.get("/api/models", async (req, res, next) => {
  try {
    const bucketUrn = req.query.bucket;
    let objects;

    if (bucketUrn) {
      // Decode the bucket URN to get the bucket name
      const bucketName = deurnify(bucketUrn);
      objects = await listObjects(bucketName);
    } else {
      // Default behavior - list objects from default bucket
      objects = await listObjects();
    }

    res.json(
      objects.map((obj) => ({
        name: obj.objectKey,
        urn: urnify(obj.objectId),
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.get("/api/models/:urn/status", async (req, res, next) => {
  try {
    const manifest = await getManifest(req.params.urn);
    if (manifest) {
      let messages = [];
      if (manifest.derivatives) {
        for (const derivative of manifest.derivatives) {
          messages = messages.concat(derivative.messages || []);
          if (derivative.children) {
            for (const child of derivative.children) {
              messages = messages.concat(child.messages || []);
            }
          }
        }
        res.json({
          status: manifest.status,
          progress: manifest.progress,
          messages,
        });
      }
    } else {
      res.json({ status: "n/a" });
    }
  } catch (error) {
    next(error);
  }
});

router.post(
  "/api/models",
  formidable({ maxFileSize: Infinity }),
  async (req, res, next) => {
    const file = req.files["model-file"];
    if (!file) {
      res.status(400).send("The required field 'model-file' is missing.");
      return;
    }

    try {
      let bucketName;

      // Check if a specific bucket URN was provided
      if (req.fields["bucket-urn"]) {
        // Decode the bucket URN to get the bucket name
        bucketName = deurnify(req.fields["bucket-urn"]);
        console.log(`Uploading to bucket: ${bucketName}`);
      }

      // Upload to the specified bucket (or default if none specified)
      const obj = await uploadObject(file.name, file.path, bucketName);
      await translateObject(
        urnify(obj.objectId),
        req.fields["model-zip-entrypoint"]
      );
      res.json({
        name: obj.objectKey,
        urn: urnify(obj.objectId),
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
