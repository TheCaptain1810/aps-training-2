const express = require("express");
const {
  listBuckets,
  createBucket,
  deleteBucket,
  urnify,
} = require("../services/aps.js");

let router = express.Router();

router.get("/api/buckets", async (req, res, next) => {
  try {
    const buckets = await listBuckets();
    res.json(
      buckets.map((bucket) => ({
        name: bucket.bucketKey,
        urn: urnify(bucket.bucketKey),
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.post("/api/buckets/create", async (req, res, next) => {
  try {
    const { bucketName } = req.body;
    if (!bucketName) {
      res.status(400).send("Bucket name is required.");
      return;
    }

    let sanitizedBucketName = bucketName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^[^a-z0-9]+/, "")
      .replace(/[^a-z0-9]+$/, "");

    if (sanitizedBucketName.length < 3) {
      res
        .status(400)
        .send(
          "Bucket name must be at least 3 characters long after sanitization."
        );
      return;
    }

    if (sanitizedBucketName.length > 128) {
      sanitizedBucketName = sanitizedBucketName.substring(0, 128);
    }

    await createBucket(sanitizedBucketName);

    res.json({
      name: sanitizedBucketName,
      urn: urnify(sanitizedBucketName),
    });
  } catch (error) {
    if (error.status === 409) {
      res.status(409).send(error.message);
      return;
    }
    next(error);
  }
});

router.delete("/api/buckets", async (req, res, next) => {
  try {
    const { bucketName } = req.body;
    if (!bucketName) {
      res.status(400).send("Bucket name is required.");
      return;
    }

    let sanitizedBucketName = bucketName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^[^a-z0-9]+/, "")
      .replace(/[^a-z0-9]+$/, "");

    const result = await deleteBucket(sanitizedBucketName);

    res.json(result);
  } catch (error) {
    res.send(error.message);
    next(error);
  }
});

module.exports = router;
