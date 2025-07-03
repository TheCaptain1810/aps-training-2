/**
 * @fileoverview Autodesk Platform Services (APS) integration module.
 * Provides functions for authentication, bucket management, object storage, and model translation.
 */

const { AuthenticationClient, Scopes } = require("@aps_sdk/authentication");
const { OssClient, Region, PolicyKey } = require("@aps_sdk/oss");
const {
  ModelDerivativeClient,
  View,
  OutputType,
} = require("@aps_sdk/model-derivative");
const { APS_CLIENT_ID, APS_CLIENT_SECRET } = require("../config.js");

/** @constant {string} Default bucket name for the application */
const APS_BUCKET = `the-captain-basic-app`;

const authenticationClient = new AuthenticationClient();
const ossClient = new OssClient();
const modelDerivativeClient = new ModelDerivativeClient();

/** @namespace service - Exported service functions */
const service = (module.exports = {});

/**
 * Retrieves an internal access token for server-to-server authentication.
 * Includes comprehensive scopes for bucket and data operations.
 *
 * @returns {Promise<string>} The access token
 */
async function getInternalToken() {
  const credentials = await authenticationClient.getTwoLeggedToken(
    APS_CLIENT_ID,
    APS_CLIENT_SECRET,
    [
      Scopes.DataRead,
      Scopes.DataCreate,
      Scopes.DataWrite,
      Scopes.BucketCreate,
      Scopes.BucketRead,
      Scopes.BucketDelete,
      Scopes.BucketUpdate,
    ]
  );
  return credentials.access_token;
}

/**
 * Retrieves a viewer token for client-side authentication.
 * Used by the frontend viewer for accessing viewable content.
 *
 * @returns {Promise<Object>} Token object with access_token and expires_in
 */
service.getViewerToken = async () => {
  return await authenticationClient.getTwoLeggedToken(
    APS_CLIENT_ID,
    APS_CLIENT_SECRET,
    [Scopes.ViewablesRead]
  );
};

/**
 * Ensures that a bucket exists, creating it if necessary.
 * Checks for bucket existence and creates with persistent policy if not found.
 *
 * @param {string} bucketKey - The key/name of the bucket
 * @returns {Promise<void>}
 * @throws {Error} If bucket creation fails for reasons other than 404
 */
service.ensureBucketExists = async (bucketKey) => {
  const accessToken = await getInternalToken();
  try {
    await ossClient.getBucketDetails(bucketKey, { accessToken });
  } catch (error) {
    if (error.axiosError.response.status === 404) {
      await ossClient.createBucket(
        Region.Us,
        { bucketKey: bucketKey, policyKey: PolicyKey.Persistent },
        { accessToken }
      );
    } else {
      throw error;
    }
  }
};

/**
 * Lists all buckets accessible to the current application.
 * Handles pagination to retrieve all available buckets.
 *
 * @returns {Promise<Array<Object>>} Array of bucket objects
 */
service.listBuckets = async () => {
  const accessToken = await getInternalToken();
  let response = await ossClient.getBuckets({
    limit: 64,
    accessToken,
  });
  let buckets = response.items;
  while (response.next) {
    const startAt = new URL(response.next).searchParams.get("startAt");
    response = await ossClient.getBuckets({
      limit: 64,
      startAt,
      accessToken,
    });
    buckets = buckets.concat(response.items);
  }
  console.log("Buckets:", buckets);
  return buckets;
};

/**
 * Lists all objects in a specified bucket.
 * Handles pagination to retrieve all objects and ensures bucket exists.
 *
 * @param {string} [bucketKey=APS_BUCKET] - The bucket key to list objects from
 * @returns {Promise<Array<Object>>} Array of object metadata
 */
service.listObjects = async (bucketKey = APS_BUCKET) => {
  await service.ensureBucketExists(bucketKey);
  const accessToken = await getInternalToken();
  let response = await ossClient.getObjects(bucketKey, {
    limit: 64,
    accessToken,
  });
  let objects = response.items;
  while (response.next) {
    const startAt = new URL(response.next).searchParams.get("startAt");
    response = await ossClient.getObjects(bucketKey, {
      limit: 64,
      startAt,
      accessToken,
    });
    objects = objects.concat(response.items);
  }
  return objects;
};

service.createBucket = async (bucketName) => {
  const accessToken = await getInternalToken();

  try {
    const bucket = await ossClient.createBucket(
      Region.Us,
      { bucketKey: bucketName, policyKey: PolicyKey.Persistent },
      { accessToken }
    );
    return bucket;
  } catch (error) {
    if (error.axiosError?.response?.status === 409) {
      try {
        await ossClient.getBucketDetails(bucketName, { accessToken });
        const conflictError = new Error(
          `Bucket name '${bucketName}' already exists and is accessible. Please choose a different name.`
        );
        conflictError.status = 409;
        throw conflictError;
      } catch (detailError) {
        if (detailError.axiosError?.response?.status === 404) {
          const reservedError = new Error(
            `Bucket name '${bucketName}' was recently deleted and is temporarily unavailable. Please wait a few minutes and try again, or choose a different name.`
          );
          reservedError.status = 409;
          throw reservedError;
        } else if (detailError.axiosError?.response?.status === 403) {
          const accessError = new Error(
            `Bucket name '${bucketName}' is already in use by another application or user. Please choose a different name.`
          );
          accessError.status = 409;
          throw accessError;
        } else {
          const unknownError = new Error(
            `Bucket name '${bucketName}' conflicts with an existing bucket. Please choose a different name.`
          );
          unknownError.status = 409;
          throw unknownError;
        }
      }
    }
    throw error;
  }
};

service.uploadObject = async (objectName, filePath, bucketKey = APS_BUCKET) => {
  await service.ensureBucketExists(bucketKey);
  const accessToken = await getInternalToken();
  const obj = await ossClient.uploadObject(bucketKey, objectName, filePath, {
    accessToken,
  });
  return obj;
};

service.translateObject = async (urn, rootFilename) => {
  const accessToken = await getInternalToken();
  const job = await modelDerivativeClient.startJob(
    {
      input: {
        urn,
        compressedUrn: !!rootFilename,
        rootFilename,
      },
      output: {
        formats: [
          {
            views: [View._2d, View._3d],
            type: OutputType.Svf2,
          },
        ],
      },
    },
    { accessToken }
  );
  return job.result;
};

service.getManifest = async (urn) => {
  const accessToken = await getInternalToken();
  try {
    const manifest = await modelDerivativeClient.getManifest(urn, {
      accessToken,
    });
    return manifest;
  } catch (err) {
    if (err.axiosError.response.status === 404) {
      return null;
    } else {
      throw err;
    }
  }
};

service.urnify = (id) => Buffer.from(id).toString("base64").replace(/=/g, "");

service.deurnify = (urn) => {
  const paddedUrn = urn + "=".repeat((4 - (urn.length % 4)) % 4);
  return Buffer.from(paddedUrn, "base64").toString();
};

service.deleteBucket = async (bucketName) => {
  const accessToken = await getInternalToken();

  try {
    await clearBucketObjects(bucketName, accessToken);

    console.log(`Attempting to delete bucket: ${bucketName}`);
    await ossClient.deleteBucket(bucketName, { accessToken });
    return {
      success: true,
      message: `Bucket '${bucketName}' deleted successfully.`,
    };
  } catch (error) {
    console.error("Bucket deletion error:", {
      status: error.axiosError?.response?.status,
      statusText: error.axiosError?.response?.statusText,
      data: error.axiosError?.response?.data,
    });

    return handleDeletionError(error, bucketName);
  }
};

async function clearBucketObjects(bucketName, accessToken) {
  try {
    const objects = await ossClient.getObjects(bucketName, { accessToken });

    if (objects.body?.items?.length > 0) {
      console.log(
        `Found ${objects.body.items.length} objects in bucket ${bucketName}`
      );

      for (const object of objects.body.items) {
        try {
          console.log(`Deleting object: ${object.objectKey}`);
          await ossClient.deleteObject(bucketName, object.objectKey, {
            accessToken,
          });
        } catch (objError) {
          console.error(
            `Failed to delete object ${object.objectKey}:`,
            objError.message
          );
        }
      }
    } else {
      console.log(`Bucket ${bucketName} appears to be empty`);
    }
  } catch (listError) {
    console.warn("Could not list bucket objects:", listError.message);
  }
}

function handleDeletionError(error, bucketName) {
  const status = error.axiosError?.response?.status;

  if (status === 404) {
    const notFoundError = new Error(`Bucket '${bucketName}' not found.`);
    notFoundError.status = 404;
    throw notFoundError;
  }

  if (status === 403) {
    let message = `Permission denied. Cannot delete bucket '${bucketName}'. `;
    const errorData = error.axiosError?.response?.data;

    if (errorData?.reason === "Bucket owner mismatch") {
      message += "This bucket was created by a different application or user.";
    } else if (errorData?.errorCode === "AUTH-003") {
      message += "Your access token doesn't have sufficient permissions.";
    } else {
      message +=
        "Common causes: 1) Bucket created by another app, 2) Missing delete permissions, 3) Hidden objects exist.";
    }

    const forbiddenError = new Error(message);
    forbiddenError.status = 403;
    throw forbiddenError;
  }

  if (status === 409) {
    const conflictError = new Error(
      `Bucket '${bucketName}' is not empty or has active operations.`
    );
    conflictError.status = 409;
    throw conflictError;
  }

  const genericError = new Error(
    `Failed to delete bucket '${bucketName}': ${error.message}`
  );
  genericError.status = status || 500;
  throw genericError;
}
