import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// Configure AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

const BUCKET_NAME = process.env.S3_BUCKET || 'viral-agency-content';

async function uploadToS3(buffer, key, contentType = 'video/mp4') {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType
      // Removed ACL: 'public-read' to fix AccessControlListNotSupported error
    });

    const result = await s3Client.send(command);
    const s3Url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-southeast-1'}.amazonaws.com/${key}`;
    console.log(`Uploaded to S3: ${s3Url}`);
    return s3Url;
  } catch (error) {
    console.error('S3 upload error:', error);
    throw error;
  }
}

async function downloadFromS3(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    const result = await s3Client.send(command);
    return result.Body;
  } catch (error) {
    console.error('S3 download error:', error);
    throw error;
  }
}

async function deleteFromS3(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });

    await s3Client.send(command);
    console.log(`Deleted from S3: ${key}`);
  } catch (error) {
    console.error('S3 delete error:', error);
    throw error;
  }
}

export {
  uploadToS3,
  downloadFromS3,
  deleteFromS3
};
