import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

class S3ImageService {
    constructor(config = {}) {
        this.s3 = new S3Client({
            region: config.region || process.env.AWS_REGION || 'ap-southeast-1'
        });
        this.bucket = config.bucket || process.env.S3_BUCKET || 'viral-agency-content';
    }

    async uploadRestaurantImages(folderName, images) {
        try {
            console.log(`[S3ImageService] Uploading ${images.length} images to folder: ${folderName}`);
            
            const uploadPromises = images.map(async (image, index) => {
                const s3Key = `${folderName}/${image.filename}`;
                
                try {
                    const command = new PutObjectCommand({
                        Bucket: this.bucket,
                        Key: s3Key,
                        Body: image.buffer,
                        ContentType: image.contentType || 'image/jpeg'
                    });

                    await this.s3.send(command);
                    
                    const s3Url = `https://${this.bucket}.s3.${this.s3.config.region || 'ap-southeast-1'}.amazonaws.com/${s3Key}`;
                    
                    console.log(`[S3ImageService] Successfully uploaded image ${index + 1}: ${s3Url}`);
                    
                    return {
                        success: true,
                        s3Key: s3Key,
                        s3Url: s3Url,
                        filename: image.filename
                    };
                } catch (error) {
                    console.error(`[S3ImageService] Error uploading image ${index + 1}:`, error);
                    return {
                        success: false,
                        error: error.message,
                        filename: image.filename
                    };
                }
            });

            const results = await Promise.all(uploadPromises);
            const successfulUploads = results.filter(r => r.success);
            const failedUploads = results.filter(r => !r.success);

            if (failedUploads.length > 0) {
                console.warn(`[S3ImageService] ${failedUploads.length} images failed to upload:`, failedUploads);
            }

            return {
                success: successfulUploads.length > 0,
                urls: successfulUploads.map(r => r.s3Url),
                keys: successfulUploads.map(r => r.s3Key),
                failed: failedUploads,
                total: images.length,
                successful: successfulUploads.length
            };
        } catch (error) {
            console.error('[S3ImageService] Error in uploadRestaurantImages:', error);
            return {
                success: false,
                error: error.message,
                urls: [],
                keys: [],
                failed: images.map((img, i) => ({ filename: img.filename, error: error.message })),
                total: images.length,
                successful: 0
            };
        }
    }

    async downloadImage(s3Key) {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: s3Key
            });

            const result = await this.s3.send(command);
            return result.Body;
        } catch (error) {
            console.error('[S3ImageService] Error downloading image:', error);
            throw error;
        }
    }

    async deleteImage(s3Key) {
        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: s3Key
            });

            await this.s3.send(command);
            console.log(`[S3ImageService] Successfully deleted image: ${s3Key}`);
            return true;
        } catch (error) {
            console.error('[S3ImageService] Error deleting image:', error);
            throw error;
        }
    }
}

export default S3ImageService;
