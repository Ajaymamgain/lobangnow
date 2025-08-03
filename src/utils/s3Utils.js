// src/utils/s3Utils.js
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const region = process.env.AWS_REGION || 'ap-southeast-1';
const s3Client = new S3Client({ region });

async function getBusinessContextFromS3() {
  const bucketName = process.env.S3_CONTEXT_BUCKET;
  const key = process.env.S3_CONTEXT_KEY;

  if (!bucketName || !key) {
    console.warn("[S3Utils] S3_CONTEXT_BUCKET or S3_CONTEXT_KEY not set. Business context might be unavailable.");
    return null;
  }

  const params = {
    Bucket: bucketName,
    Key: key,
  };

  try {
    const { Body } = await s3Client.send(new GetObjectCommand(params));
    const streamToString = (stream) =>
      new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
    const context = await streamToString(Body);
    console.log("[S3Utils] Business context fetched successfully from S3.");
    return context;
  } catch (error) {
    console.error("[S3Utils] Error fetching business context from S3:", error);
    return null; 
  }
}

async function uploadToS3(bucketName, key, body, contentType) {
  if (!bucketName || !key) {
    console.error('[S3Utils] Bucket name or key not provided for S3 upload.');
    throw new Error('Bucket name or key missing for S3 upload.');
  }
  const params = {
    Bucket: bucketName,
    Key: key, // e.g., invoices/storeId/orderId.pdf
    Body: body,
    ContentType: contentType, // e.g., 'application/pdf'
  };
  try {
    await s3Client.send(new PutObjectCommand(params));
    console.log(`[S3Utils] Successfully uploaded ${key} to ${bucketName}.`);
    // Construct and return the public URL if needed, depends on bucket policy and S3/R2 setup
    // For R2, public URL might be process.env.R2_PUBLIC_URL + '/' + key
    return `s3://${bucketName}/${key}`; // Or a public URL
  } catch (error) {
    console.error(`[S3Utils] Error uploading ${key} to S3:`, error);
    throw error;
  }
}

export {
  getBusinessContextFromS3,
  uploadToS3,
};
