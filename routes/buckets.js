const express = require("express");
const { listBuckets, createBucket, urnify } = require("../services/aps.js");

let router = express.Router();

router.get("/api/buckets", async (req, res, next) => {
  try {
    const buckets = await listBuckets();
    res.json(
      buckets.map((bucket) => ({
        name: bucket.bucketKey,
        urn: urnify(bucket.bucketKey), // Add URN for frontend compatibility
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.post("/api/buckets", async (req, res, next) => {
  try {
    const { bucketName } = req.body;
    if (!bucketName) {
      res.status(400).send("Bucket name is required.");
      return;
    }

    // Use the user's bucket name with minimal sanitization for APS requirements
    // APS bucket names must be 3-128 chars, lowercase, alphanumeric and hyphens only
    let sanitizedBucketName = bucketName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "") // Remove invalid characters
      .replace(/^[^a-z0-9]+/, "") // Remove leading non-alphanumeric
      .replace(/[^a-z0-9]+$/, ""); // Remove trailing non-alphanumeric

    // Ensure minimum length
    if (sanitizedBucketName.length < 3) {
      res
        .status(400)
        .send(
          "Bucket name must be at least 3 characters long after sanitization."
        );
      return;
    }

    // Ensure maximum length
    if (sanitizedBucketName.length > 128) {
      sanitizedBucketName = sanitizedBucketName.substring(0, 128);
    }

    await createBucket(sanitizedBucketName);

    res.json({
      name: sanitizedBucketName,
      urn: urnify(sanitizedBucketName),
    });
  } catch (error) {
    // Handle bucket name conflicts with a user-friendly message
    if (error.status === 409) {
      res.status(409).send(error.message);
      return;
    }
    next(error);
  }
});

module.exports = router;
