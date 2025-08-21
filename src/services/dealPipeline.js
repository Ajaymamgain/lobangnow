import OpenAI from 'openai';
import ImagenService from './imagenService.js';
import SpiderCloudService from './spiderCloudService.js';
import ImageExtractionPipeline from './imageExtractionPipeline.js';
import { uploadToS3 } from './s3Service.js';

class DealPipeline {
  constructor(config) {
    this.openai = new OpenAI({ apiKey: config.openAiApiKey });
    this.imagenService = new ImagenService(config.replicateApiToken);
    this.spiderCloudService = new SpiderCloudService(config.spiderCloudApiKey);
    this.imageExtractionPipeline = new ImageExtractionPipeline();
    this.s3Service = { uploadToS3 };
  }

  /**
   * Process deal using only extracted images (no AI generation, no S3 upload)
   * @param {Object} dealData - Deal information
   * @param {Object} restaurantData - Restaurant information
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} - Processing results
   */
  async processDealWithExtractedImagesOnly(dealData, restaurantData, options = {}) {
    try {
      console.log('[DealPipeline] Processing deal with extracted images only:', dealData.title);
      
      // Step 1: Extract images from Google Maps using ImageExtractionPipeline
      console.log('[DealPipeline] Step 1: Extracting restaurant images from Google Maps...');
      const imageExtractionResults = await this.imageExtractionPipeline.extractAllRestaurantImages(restaurantData, {
        maxImages: options.maxImages || 6,
        region: options.region || 'SG',
        uploadToS3: false // Don't upload to S3, use direct URLs
      });

      if (!imageExtractionResults.success) {
        throw new Error(`Image extraction failed: ${imageExtractionResults.error}`);
      }

      console.log(`[DealPipeline] Successfully extracted ${imageExtractionResults.totalImages} images from Google Maps`);

      // Step 2: Create video directly from extracted images
      console.log('[DealPipeline] Step 2: Creating video from extracted images...');
      const videoResults = await this.imageExtractionPipeline.createVideoFromExtractedImages(
        imageExtractionResults.images,
        dealData,
        restaurantData,
        {
          style: options.style || 'singapore',
          storeOwnerWhatsAppNumber: options.storeOwnerWhatsAppNumber || '+6598765432'
        }
      );

      if (!videoResults.success) {
        throw new Error(`Video creation failed: ${videoResults.error}`);
      }

      console.log('[DealPipeline] Video created successfully from extracted images');

      // Step 3: Return comprehensive results
      return {
        success: true,
        deal_id: dealData.deal_id || `deal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        restaurant_id: restaurantData.restaurant_id,
        ai_generated_images: [], // No AI images
        authentic_restaurant_images: imageExtractionResults.images,
        extracted_images_summary: {
          total: imageExtractionResults.totalImages,
          highQuality: imageExtractionResults.report.imageQuality.highResolution,
          s3Uploads: 0, // No S3 uploads
          extractionReport: imageExtractionResults.report
        },
        video: videoResults.video,
        text_overlays: videoResults.textOverlays,
        metadata: {
          source: 'spider_cloud_extraction_only',
          method: 'direct_video_creation',
          timestamp: new Date().toISOString(),
          options: options
        }
      };

    } catch (error) {
      console.error('[DealPipeline] Deal processing with extracted images failed:', error.message);
      throw error;
    }
  }

  /**
   * Process a complete deal from start to finish
   */
  async processDeal(dealData, restaurantData, skipAiImages = false) {
    try {
      console.log('[DealPipeline] Starting deal processing for:', dealData.title);
      
      // Step 1: Extract ALL available images from Google Maps using ImageExtractionPipeline
      console.log(`[DealPipeline] Step 1: Extracting all restaurant images from Google Maps...`);
      const imageExtractionResults = await this.imageExtractionPipeline.extractAllRestaurantImages(restaurantData, {
        maxImages: 20, // Extract up to 20 images
        region: 'SG',
        uploadToS3: true // Upload to S3 for persistent storage
      });

      if (!imageExtractionResults.success) {
        throw new Error(`Image extraction failed: ${imageExtractionResults.error}`);
      }

      console.log(`[DealPipeline] Successfully extracted ${imageExtractionResults.totalImages} images from Google Maps`);
      console.log(`[DealPipeline] S3 uploads: ${imageExtractionResults.s3Images.length}/${imageExtractionResults.totalImages}`);
      
      // Step 2: Generate AI images only if not skipped
      let aiImages = [];
      if (!skipAiImages) {
        console.log(`[DealPipeline] Generating AI food images for deal: ${dealData.title}`);
        aiImages = await this.imagenService.generateFoodImages(
          dealData, 
          restaurantData, 
          6, // Generate 6 images for TikTok-style video
          {
            width: 1024,
            height: 1024,
            guidance_scale: 1.0, // Optimized for Lightning model
            num_inference_steps: 4 // Lightning model uses only 4 steps
          }
        );
      } else {
        console.log(`[DealPipeline] Skipping AI image generation as requested`);
      }
      
      if (!aiImages.success || aiImages.images.length === 0) {
        throw new Error(`SDXL image generation failed: ${aiImages.error || 'No images generated'}`);
      }
      
      console.log(`[DealPipeline] Successfully generated ${aiImages.images.length} images with SDXL`);
      
      // Step 3: Upload images to S3
      const uploadedImages = [];
      for (let i = 0; i < aiImages.images.length; i++) {
        const image = aiImages.images[i];
        const s3Key = `deals/${dealData.deal_id}/image_${i + 1}.jpg`;
        
        console.log(`[DealPipeline] Uploading image ${i + 1} to S3...`);
        const s3Url = await this.uploadImageToS3(image.imageBuffer, s3Key);
        
        uploadedImages.push({
          image_id: `img_${Date.now()}_${i}`,
          s3_url: s3Url,
          s3_key: s3Key,
          prompt: image.prompt,
          image_index: i,
          metadata: image.metadata
        });
      }
      
      console.log(`[DealPipeline] Successfully uploaded ${uploadedImages.length} images to S3`);
      
      // Step 4: Prepare comprehensive image data for video generation
      const imageDataForVideo = {
        aiGeneratedImages: uploadedImages.map(img => img.s3_url),
        authenticRestaurantImages: imageExtractionResults.s3Images.map(img => img.s3Url), // Use S3 URLs from extraction
        extractedImages: imageExtractionResults.images, // Full extracted image data
        extractionReport: imageExtractionResults.report // Detailed extraction report
      };
      
      console.log(`[DealPipeline] Sending to video processor: ${imageDataForVideo.aiGeneratedImages.length} AI images + ${imageDataForVideo.authenticRestaurantImages.length} authentic images`);
      console.log(`[DealPipeline] Total extracted images available: ${imageDataForVideo.extractedImages.length}`);
      
      // Step 5: Send images to video-processor for video creation
      const videoProcessorUrl = process.env.VIDEO_PROCESSOR_URL || 'http://localhost:3000';
      const videoResponse = await this.sendToVideoProcessor(
        videoProcessorUrl,
        dealData,
        restaurantData,
        imageDataForVideo
      );
      
      if (!videoResponse.success) {
        throw new Error(`Video processor failed: ${videoResponse.error}`);
      }
      
      console.log('[DealPipeline] Video created successfully:', videoResponse.data.video.s3Url);
      
      return {
        success: true,
        deal_id: dealData.deal_id || `deal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        restaurant_id: restaurantData.restaurant_id,
        ai_generated_images: uploadedImages,
        authentic_restaurant_images: imageExtractionResults.s3Images,
        extracted_images_summary: {
          total: imageExtractionResults.totalImages,
          highQuality: imageExtractionResults.report.imageQuality.highResolution,
          s3Uploads: imageExtractionResults.s3Images.length,
          extractionReport: imageExtractionResults.report
        },
        video: videoResponse.data.video,
        whatsapp_response: videoResponse.data.whatsappResponse,
        prompt: aiImages.prompt, // Use the prompt from the AI generation result
        spider_cloud_search: authenticImages
      };
      
    } catch (error) {
      console.error('[DealPipeline] Deal processing failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Search for authentic restaurant images using Spider.cloud
   * @param {Object} restaurantData - Restaurant information
   * @returns {Promise<Object>} - Search results with images
   */
  async searchRestaurantImages(restaurantData) {
    try {
      console.log('[DealPipeline] Searching for authentic restaurant images with Spider.cloud...');
      
      const searchOptions = {
        searchType: 'images',
        source: 'google_maps,google_images',
        limit: 8,
        region: 'SG',
        safeSearch: 'moderate'
      };
      
      const searchResults = await this.spiderCloudService.searchRestaurantImages(
        restaurantData, 
        searchOptions
      );
      
      if (searchResults.success && searchResults.images.length > 0) {
        console.log(`[DealPipeline] Found ${searchResults.images.length} authentic restaurant images`);
        
        // Use direct URLs for public images (no S3 upload needed)
        const uploadedImages = [];
        for (const image of searchResults.images.slice(0, 4)) { // Limit to 4 best images
          try {
            // For public images, use the direct URL
            const directUrl = image.url;
            
            uploadedImages.push({
              ...image,
              s3Url: directUrl, // Use direct URL instead of S3
              s3Key: `public_images/${image.id}.jpg`, // Reference key for tracking
              source: 'spider_cloud',
              type: 'authentic_restaurant',
              isPublic: true // Flag to indicate this is a public image
            });
            console.log(`[DealPipeline] Added public restaurant image to pipeline: ${image.title}`);
            console.log(`[DealPipeline] Direct URL: ${directUrl}`);
          } catch (error) {
            console.warn(`[DealPipeline] Failed to process restaurant image ${image.id}:`, error.message);
          }
        }
        
        return {
          success: true,
          images: uploadedImages,
          totalFound: searchResults.totalFound,
          searchQuery: searchResults.searchQuery
        };
        
      } else {
        console.warn('[DealPipeline] No authentic restaurant images found via Spider.cloud');
        return {
          success: false,
          images: [],
          error: searchResults.error || 'No images found'
        };
      }
      
    } catch (error) {
      console.error('[DealPipeline] Restaurant image search failed:', error.message);
      return {
        success: false,
        images: [],
        error: error.message
      };
    }
  }

  /**
   * Generate optimized prompt for SDXL image generation
   */
  async generateOptimizedPrompt(dealData, restaurantData) {
    try {
      const prompt = `You are a prompt engineering expert for food photography. Create a detailed visual prompt for SDXL model to generate high-quality restaurant deal images.

Restaurant: ${restaurantData.name}
Deal: ${dealData.title}
Description: ${dealData.description || 'Special offer'}
Location: ${restaurantData.address}
Category: ${restaurantData.category || 'Restaurant'}

Generate a single detailed prompt (max 200 words) for SDXL model:`;

      const promptResponse = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7
      });

      const optimizedPrompt = promptResponse.choices[0].message.content.trim();
      console.log('[DealPipeline] Optimized prompt:', optimizedPrompt);

      return optimizedPrompt;

    } catch (error) {
      console.error('[DealPipeline] Prompt optimization failed:', error.message);
      // Fallback prompt
      return `Professional restaurant deal photography, ${dealData.title}, ${restaurantData.name}, appetizing food presentation, vibrant colors, natural lighting, Singapore cuisine, high quality, no text overlay, clean background`;
    }
  }

  /**
   * Upload image to S3
   */
  async uploadImageToS3(imageBuffer, s3Key) {
    try {
      const imageUrl = await uploadToS3(imageBuffer, s3Key, 'image/jpeg');
      return imageUrl;
    } catch (error) {
      console.error('[DealPipeline] Image S3 upload failed:', error.message);
      throw error;
    }
  }

  /**
   * Send deal data and images to video-processor
   */
  async sendToVideoProcessor(videoProcessorUrl, dealData, restaurantData, imageData) {
    try {
      console.log('[DealPipeline] Sending to video-processor...');
      
      // Generate TikTok-style text overlays for the video
      const textOverlays = [
        {
          text: `🔥 ${dealData.title || 'Amazing Deal'} 🔥`,
          fontSize: 75,
          color: 'white',
          yPosition: 180,
          fontFamily: 'headline'
        },
        {
          text: dealData.description || 'Special offer',
          fontSize: 55,
          color: 'white',
          yPosition: 260,
          fontFamily: 'details'
        },
        {
          text: `💰 ${dealData.pricing || 'Great value'} 💰`,
          fontSize: 95,
          color: 'yellow',
          yPosition: 180,
          fontFamily: 'price'
        },
        {
          text: `📍 ${restaurantData.name || 'Restaurant'}`,
          fontSize: 65,
          color: 'white',
          yPosition: 180,
          fontFamily: 'restaurant'
        },
        {
          text: '🎯 LIMITED TIME OFFER!',
          fontSize: 60,
          color: 'red',
          yPosition: 180,
          fontFamily: 'headline'
        },
        {
          text: '📱 WhatsApp us now!',
          fontSize: 50,
          color: 'cyan',
          yPosition: 180,
          fontFamily: 'details'
        }
      ];
      
      const response = await fetch(`${videoProcessorUrl}/api/create-deal-sample`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          storeOwnerWhatsAppNumber: restaurantData.phone || '+6598765432',
          restaurantData: {
            restaurant_id: restaurantData.restaurant_id,
            name: restaurantData.name,
            address: restaurantData.address,
            phone: restaurantData.phone,
            email: restaurantData.email,
            category: restaurantData.category,
            description: restaurantData.description
          },
          dealData: {
            deal_id: dealData.deal_id || `deal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: dealData.title,
            description: dealData.description,
            pricing: dealData.pricing,
            validity: dealData.validity,
            category: dealData.category
          },
          imageData: imageData, // New structure with AI + authentic images
          textOverlays: textOverlays, // Add text overlays
          style: 'singapore'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Video processor HTTP error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      return result;

    } catch (error) {
      console.error('[DealPipeline] Video processor communication failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test the complete pipeline
   */
  async testPipeline() {
    try {
      console.log('[DealPipeline] Testing complete pipeline...');
      
              // Test Imagen connection
        const imagenTest = await this.imagenService.testConnection();
        if (!imagenTest.success) {
          throw new Error(`Imagen connection test failed: ${imagenTest.error}`);
        }
      
              console.log('[DealPipeline] Imagen connection test passed');
      
      return {
        success: true,
        message: 'SDXL pipeline component working correctly',
        sdxl: sdxlTest
      };
      
    } catch (error) {
      console.error('[DealPipeline] Pipeline test failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default DealPipeline;
