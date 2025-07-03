const { AuthenticationClient, Scopes } = require("@aps_sdk/authentication");
const { OssClient, Region, PolicyKey } = require("@aps_sdk/oss");
const {
  ModelDerivativeClient,
  View,
  OutputType,
} = require("@aps_sdk/model-derivative");
const { APS_CLIENT_ID, APS_CLIENT_SECRET } = require("../config.js");

const APS_BUCKET = `the-captain-basic-app`;

const authenticationClient = new AuthenticationClient();
const ossClient = new OssClient();
const modelDerivativeClient = new ModelDerivativeClient();

const service = (module.exports = {});

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

service.getViewerToken = async () => {
  return await authenticationClient.getTwoLeggedToken(
    APS_CLIENT_ID,
    APS_CLIENT_SECRET,
    [Scopes.ViewablesRead]
  );
};

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

  // Use the bucket name as provided - validation should be done at the route level
  try {
    const bucket = await ossClient.createBucket(
      Region.Us,
      { bucketKey: bucketName, policyKey: PolicyKey.Persistent },
      { accessToken }
    );
    return bucket;
  } catch (error) {
    // If bucket already exists, throw a meaningful error instead of auto-generating names
    if (error.axiosError?.response?.status === 409) {
      const conflictError = new Error(
        `Bucket name '${bucketName}' already exists. Please choose a different name.`
      );
      conflictError.status = 409;
      throw conflictError;
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

service.deleteBucket = async (bucketName) => {
  const accessToken = await getInternalToken();

  try {
    // Try to get and delete all objects in the bucket first
    await clearBucketObjects(bucketName, accessToken);

    // Now try to delete the empty bucket
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

// Helper function to clear all objects from a bucket
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

// Helper function to handle deletion errors
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
