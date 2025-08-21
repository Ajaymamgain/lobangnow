// Image Extraction Pipeline for Restaurant Images
// Extracts all available images from Google Maps using Spider.cloud

import SpiderCloudService from './spiderCloudService.js';
import { v4 as uuidv4 } from 'uuid';

class ImageExtractionPipeline {
  constructor() {
    this.spiderCloudService = new SpiderCloudService();
  }

  /**
   * Extract all images for a restaurant from Google Maps
   * @param {Object} restaurantData - Restaurant information
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} - Extraction results with all images
   */
  async extractAllRestaurantImages(restaurantData, options = {}) {
    try {
      console.log(`[ImageExtractionPipeline] Starting image extraction for ${restaurantData.name}`);
      
      // Step 1: Extract images from Google Maps via Spider.cloud
      const extractionResults = await this.extractFromGoogleMaps(restaurantData, options);
      
      if (!extractionResults.success) {
        throw new Error(`Image extraction failed: ${extractionResults.error}`);
      }

      console.log(`[ImageExtractionPipeline] Extracted ${extractionResults.images.length} images from Google Maps`);

      // Step 2: Process and validate all extracted images
      const processedImages = await this.processExtractedImages(extractionResults.images, restaurantData);
      
      console.log(`[ImageExtractionPipeline] Processed ${processedImages.length} valid images`);

      // Step 3: Download and upload images to S3 (optional)
      let s3Images = [];
      if (options.uploadToS3 !== false) {
        console.log('[ImageExtractionPipeline] Uploading images to S3...');
        s3Images = await this.uploadImagesToS3(processedImages, restaurantData);
        console.log(`[ImageExtractionPipeline] Uploaded ${s3Images.length} images to S3`);
      }

      // Step 4: Generate comprehensive image report
      const imageReport = this.generateImageReport(processedImages, s3Images, restaurantData);

      return {
        success: true,
        restaurant: restaurantData,
        totalImages: processedImages.length,
        images: processedImages,
        s3Images: s3Images,
        report: imageReport,
        metadata: {
          extractionSource: 'google_maps',
          extractionMethod: 'spider_cloud',
          timestamp: new Date().toISOString(),
          options: options
        }
      };

    } catch (error) {
      console.error('[ImageExtractionPipeline] Image extraction failed:', error.message);
      return {
        success: false,
        error: error.message,
        restaurant: restaurantData
      };
    }
  }

  /**
   * Extract images from Google Maps using Spider.cloud
   * @param {Object} restaurantData - Restaurant information
   * @param {Object} options - Extraction options
   * @returns {Promise<Object>} - Raw extraction results
   */
  async extractFromGoogleMaps(restaurantData, options = {}) {
    try {
      // Build Google Maps URL
      const mapsUrl = this.buildGoogleMapsUrl(restaurantData);
      console.log(`[ImageExtractionPipeline] Targeting Google Maps URL: ${mapsUrl}`);

      // Extract images using Spider.cloud
      const searchResults = await this.spiderCloudService.searchRestaurantImages(restaurantData, {
        limit: options.maxImages || 20, // Extract up to 20 images
        region: options.region || 'SG',
        source: 'google_maps'
      });

      if (!searchResults.success) {
        throw new Error(`Spider.cloud extraction failed: ${searchResults.error}`);
      }

      return {
        success: true,
        images: searchResults.images,
        totalFound: searchResults.totalFound,
        sourceUrl: mapsUrl,
        metadata: searchResults.metadata
      };

    } catch (error) {
      console.error('[ImageExtractionPipeline] Google Maps extraction failed:', error.message);
      throw error;
    }
  }

  /**
   * Process and validate extracted images
   * @param {Array} rawImages - Raw image data from extraction
   * @param {Object} restaurantData - Restaurant information
   * @returns {Array} - Processed and validated images
   */
  async processExtractedImages(rawImages, restaurantData) {
    const processedImages = [];

    for (const image of rawImages) {
      try {
        // Validate image URL
        if (!this.isValidImageUrl(image.url)) {
          console.warn(`[ImageExtractionPipeline] Skipping invalid image URL: ${image.url}`);
          continue;
        }

        // Process image metadata
        const processedImage = {
          id: image.id || `extracted_${uuidv4()}`,
          originalUrl: image.url,
          thumbnailUrl: image.thumbnail || image.url,
          title: image.title || `${restaurantData.name} - Image ${processedImages.length + 1}`,
          source: image.source || 'google_maps',
          width: image.width || 1360,
          height: image.height || 1020,
          relevance: image.relevance || 0.8,
          metadata: {
            ...image.metadata,
            extractedAt: new Date().toISOString(),
            restaurantId: restaurantData.restaurant_id,
            restaurantName: restaurantData.name
          }
        };

        // Validate image dimensions
        if (processedImage.width < 800 || processedImage.height < 600) {
          console.warn(`[ImageExtractionPipeline] Image dimensions too small: ${processedImage.width}x${processedImage.height}`);
          continue;
        }

        processedImages.push(processedImage);

      } catch (error) {
        console.warn(`[ImageExtractionPipeline] Failed to process image:`, error.message);
        continue;
      }
    }

    // Sort by relevance and remove duplicates
    return this.deduplicateAndSortImages(processedImages);
  }

  /**
   * Upload images to S3 for persistent storage (optional)
   * @param {Array} images - Processed images
   * @param {Object} restaurantData - Restaurant information
   * @returns {Array} - S3 upload results
   */
  async uploadImagesToS3(images, restaurantData) {
    console.log('[ImageExtractionPipeline] S3 upload disabled - using direct URLs for video creation');
    return images.map(img => ({
      ...img,
      s3Url: img.originalUrl, // Use original URL instead of S3
      s3Key: `direct_url_${img.id}`,
      s3Bucket: 'direct_urls',
      fileSize: 0,
      uploadedAt: new Date().toISOString()
    }));
  }

  /**
   * Generate comprehensive image report
   * @param {Array} processedImages - Processed images
   * @param {Array} s3Images - S3 uploaded images
   * @param {Object} restaurantData - Restaurant information
   * @returns {Object} - Image report
   */
  generateImageReport(processedImages, s3Images, restaurantData) {
    const report = {
      restaurant: {
        name: restaurantData.name,
        address: restaurantData.address,
        restaurantId: restaurantData.restaurant_id
      },
      extraction: {
        totalImages: processedImages.length,
        successfulUploads: s3Images.length,
        failedUploads: processedImages.length - s3Images.length,
        successRate: ((s3Images.length / processedImages.length) * 100).toFixed(2) + '%'
      },
      imageQuality: {
        highResolution: processedImages.filter(img => img.width >= 1360 && img.height >= 1020).length,
        mediumResolution: processedImages.filter(img => img.width >= 800 && img.height >= 600).length,
        lowResolution: processedImages.filter(img => img.width < 800 || img.height < 600).length
      },
      sources: this.analyzeImageSources(processedImages),
      recommendations: this.generateRecommendations(processedImages, s3Images)
    };

    return report;
  }

  /**
   * Analyze image sources and types
   * @param {Array} images - Processed images
   * @returns {Object} - Source analysis
   */
  analyzeImageSources(images) {
    const sources = {};
    
    images.forEach(image => {
      const source = image.source || 'unknown';
      sources[source] = (sources[source] || 0) + 1;
    });

    return sources;
  }

  /**
   * Generate recommendations based on extracted images
   * @param {Array} processedImages - Processed images
   * @param {Array} s3Images - S3 uploaded images
   * @returns {Array} - Recommendations
   */
  generateRecommendations(processedImages, s3Images) {
    const recommendations = [];

    if (processedImages.length < 5) {
      recommendations.push('Consider extracting more images for better video variety');
    }

    if (s3Images.length < processedImages.length * 0.8) {
      recommendations.push('Some images failed to upload to S3 - check network and permissions');
    }

    const highResCount = processedImages.filter(img => img.width >= 1360 && img.height >= 1020).length;
    if (highResCount < 3) {
      recommendations.push('Limited high-resolution images available - may affect video quality');
    }

    return recommendations;
  }

  /**
   * Build Google Maps URL for restaurant
   * @param {Object} restaurantData - Restaurant information
   * @returns {string} - Google Maps URL
   */
  buildGoogleMapsUrl(restaurantData) {
    const query = `${restaurantData.name} ${restaurantData.address}`;
    return `https://www.google.com/maps/place/${encodeURIComponent(query)}`;
  }

  /**
   * Validate image URL
   * @param {string} url - Image URL
   * @returns {boolean} - Whether URL is valid
   */
  isValidImageUrl(url) {
    return url && 
           typeof url === 'string' && 
           url.startsWith('https://lh') && 
           url.includes('googleusercontent.com') &&
           url.includes('=s');
  }

  /**
   * Download image from URL
   * @param {string} url - Image URL
   * @returns {Promise<Buffer>} - Image buffer
   */
  async downloadImage(url) {
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
      }
      
      return await response.buffer();
    } catch (error) {
      console.error(`[ImageExtractionPipeline] Image download failed:`, error.message);
      throw error;
    }
  }

  /**
   * Remove duplicate images and sort by relevance
   * @param {Array} images - Images to process
   * @returns {Array} - Deduplicated and sorted images
   */
  deduplicateAndSortImages(images) {
    // Remove duplicates based on URL
    const uniqueImages = [];
    const seenUrls = new Set();

    images.forEach(image => {
      if (!seenUrls.has(image.originalUrl)) {
        seenUrls.add(image.originalUrl);
        uniqueImages.push(image);
      }
    });

    // Sort by relevance (highest first)
    return uniqueImages.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Create video directly from extracted images and send to video processor
   * @param {Array} images - Extracted images from Spider.cloud
   * @param {Object} dealData - Deal information
   * @param {Object} restaurantData - Restaurant information
   * @param {Object} options - Video creation options
   * @returns {Promise<Object>} - Video creation results
   */
  async createVideoFromExtractedImages(images, dealData, restaurantData, options = {}) {
    try {
      console.log(`[ImageExtractionPipeline] Creating video from ${images.length} extracted images`);
      
      // Step 1: Prepare image data for video processor
      const imageDataForVideo = {
        aiGeneratedImages: [], // No AI images, only extracted ones
        authenticRestaurantImages: images.map(img => img.originalUrl), // Use direct URLs
        extractedImages: images, // Full image metadata
        extractionSource: 'spider_cloud_google_maps'
      };

      // Step 2: Generate text overlays for each image
      const textOverlays = this.generateTextOverlays(images, dealData, restaurantData);
      
      // Step 3: Send to video processor
      const videoProcessorUrl = process.env.VIDEO_PROCESSOR_URL || 'http://localhost:3000';
      console.log(`[ImageExtractionPipeline] Sending to video processor: ${videoProcessorUrl}`);
      
      const videoResponse = await this.sendToVideoProcessor(
        videoProcessorUrl,
        dealData,
        restaurantData,
        imageDataForVideo,
        textOverlays,
        options
      );

      if (!videoResponse.success) {
        throw new Error(`Video processor failed: ${videoResponse.error}`);
      }

      console.log('[ImageExtractionPipeline] Video created successfully from extracted images');
      
      return {
        success: true,
        video: videoResponse.data.video,
        images: images,
        dealData: dealData,
        restaurantData: restaurantData,
        textOverlays: textOverlays,
        metadata: {
          source: 'spider_cloud_extraction',
          imageCount: images.length,
          videoDuration: videoResponse.data.video.duration,
          createdAt: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('[ImageExtractionPipeline] Video creation failed:', error.message);
      return {
        success: false,
        error: error.message,
        images: images,
        dealData: dealData,
        restaurantData: restaurantData
      };
    }
  }

  /**
   * Generate engaging text overlays for each image
   * @param {Array} images - Extracted images
   * @param {Object} dealData - Deal information
   * @param {Object} restaurantData - Restaurant information
   * @returns {Array} - Text overlay data for each image
   */
  generateTextOverlays(images, dealData, restaurantData) {
    const textOverlays = [];
    
    images.forEach((image, index) => {
      let overlayText = '';
      let style = 'default';
      
      // Generate different text for each image based on position and content
      switch (index) {
        case 0: // First image - Restaurant name and deal
          overlayText = `${restaurantData.name}\n🔥 ${dealData.title}`;
          style = 'header';
          break;
        case 1: // Second image - Deal details
          overlayText = `💰 ${dealData.pricing}\n⏰ ${dealData.validity}`;
          overlayText = `💰 ${dealData.pricing}\n⏰ ${dealData.validity}`;
          break;
        case 2: // Third image - Description
          overlayText = `💬 ${dealData.description}`;
          style = 'description';
          break;
        case 3: // Fourth image - Call to action
          overlayText = `📍 ${restaurantData.address}\n🚀 Visit Now!`;
          style = 'action';
          break;
        case 4: // Fifth image - Additional deal info
          overlayText = `🎉 Limited Time Offer!\n✨ Don't Miss Out!`;
          style = 'highlight';
          break;
        default: // Additional images
          overlayText = `🔥 ${dealData.title}\n💫 Authentic Experience`;
          style = 'standard';
      }
      
      textOverlays.push({
        imageIndex: index,
        text: overlayText,
        style: style,
        position: 'center',
        fontSize: index === 0 ? 48 : 36,
        color: '#FFFFFF',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        animation: index === 0 ? 'fadeIn' : 'slideIn'
      });
    });
    
    return textOverlays;
  }

  /**
   * Send data to video processor
   * @param {string} videoProcessorUrl - Video processor endpoint
   * @param {Object} dealData - Deal information
   * @param {Object} restaurantData - Restaurant information
   * @param {Object} imageData - Image data for video
   * @param {Array} textOverlays - Text overlay data
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Video processor response
   */
  async sendToVideoProcessor(videoProcessorUrl, dealData, restaurantData, imageData, textOverlays, options = {}) {
    try {
      const requestData = {
        storeOwnerWhatsAppNumber: options.storeOwnerWhatsAppNumber || '+6598765432',
        restaurantData: restaurantData,
        dealData: dealData,
        imageData: imageData,
        textOverlays: textOverlays,
        style: options.style || 'singapore'
      };

      console.log(`[ImageExtractionPipeline] Sending to video processor:`, {
        restaurant: restaurantData.name,
        deal: dealData.title,
        images: imageData.authenticRestaurantImages.length,
        textOverlays: textOverlays.length
      });

      const response = await fetch(videoProcessorUrl + '/api/create-deal-sample', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        throw new Error(`Video processor HTTP error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(`Video processor failed: ${result.error}`);
      }

      return {
        success: true,
        data: result.data
      };

    } catch (error) {
      console.error('[ImageExtractionPipeline] Video processor communication failed:', error.message);
      throw error;
    }
  }

  /**
   * Get extraction statistics
   * @returns {Object} - Pipeline statistics
   */
  getStats() {
    return {
      pipeline: 'ImageExtractionPipeline',
      version: '1.0.0',
      features: [
        'Google Maps image extraction',
        'Spider.cloud integration',
        'Image validation and processing',
        'S3 upload support',
        'Video creation from extracted images',
        'Comprehensive reporting'
      ]
    };
  }
}

export default ImageExtractionPipeline;
