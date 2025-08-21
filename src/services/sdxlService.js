// Google Imagen 4 Fast Image Generation Service for Food Images
// High-quality, photorealistic food photography for restaurant deals

import Replicate from "replicate";
import fs from "node:fs";

class ImagenService {
  constructor(replicateApiToken) {
    this.replicate = new Replicate({
      auth: replicateApiToken || process.env.REPLICATE_API_TOKEN,
    });
  }

  /**
   * Generate food images using Google Imagen 4 Fast model
   * High-quality, photorealistic food photography for restaurant deals
   */
  async generateFoodImages(dealData, restaurantData, numImages = 6, options = {}) {
    try {
      console.log('[SDXLService] Starting food image generation for:', dealData.title);
      
      const images = [];
      const prompts = this.generateFoodPrompts(dealData, restaurantData, numImages);
      
      // Generate images sequentially to avoid rate limiting
      for (let i = 0; i < numImages; i++) {
        console.log(`[SDXLService] Generating image ${i + 1}/${numImages}...`);
        
        const imageResult = await this.generateSingleFoodImage(
          prompts[i], 
          dealData, 
          restaurantData, 
          i,
          options
        );
        
        if (imageResult.success) {
          images.push(imageResult);
          console.log(`[SDXLService] Image ${i + 1} generated successfully`);
        } else {
          console.warn(`[SDXLService] Image ${i + 1} generation failed:`, imageResult.error);
        }
      }
      
      console.log(`[SDXLService] Completed food image generation. ${images.length}/${numImages} images successful`);
      
      return {
        success: images.length > 0,
        images: images,
        totalGenerated: images.length,
        requested: numImages
      };
      
    } catch (error) {
      console.error('[SDXLService] Food image generation failed:', error.message);
      return {
        success: false,
        error: error.message,
        images: []
      };
    }
  }

  /**
   * Generate a single food image using Google Imagen 4 Fast
   */
  async generateSingleFoodImage(prompt, dealData, restaurantData, imageIndex, options = {}) {
    try {
      const output = await this.replicate.run(
        "google/imagen-4-fast",
        {
          input: {
            prompt: prompt,
            aspect_ratio: "1:1",
            output_format: "jpg",
            safety_filter_level: "block_only_high"
          }
        }
      );

      if (!output || output.length === 0) {
        throw new Error('Imagen returned no output');
      }

      // Get the image URL
      const imageUrl = output[0].url();
      
      // Download the image
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image: ${imageResponse.status}`);
      }
      
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      
      return {
        success: true,
        imageBuffer: imageBuffer,
        imageUrl: imageUrl,
        prompt: prompt,
        imageIndex: imageIndex,
        dealId: dealData.deal_id,
        restaurantId: restaurantData.restaurant_id,
        metadata: {
          model: 'sdxl',
          width: options.width || 1024,
          height: options.height || 1024,
          guidance_scale: options.guidance_scale || 7.5,
          steps: options.num_inference_steps || 25
        }
      };

    } catch (error) {
      console.error(`[SDXLService] Single image generation failed for index ${imageIndex}:`, error.message);
      return {
        success: false,
        error: error.message,
        imageIndex: imageIndex
      };
    }
  }

  /**
   * Generate engaging food prompts for TikTok-style videos
   * Creates multiple images that tell a story about the deal
   */
  generateFoodPrompts(dealData, restaurantData, numImages) {
    const prompts = [];
    const baseStyle = "TikTok viral style, trending food photography, vibrant colors, dynamic composition, Instagram reels aesthetic";
    
    // Image 1: Main deal showcase (hero shot)
    prompts.push(
      `Delicious ${dealData.title.toLowerCase()}, professional food photography, ${baseStyle}, close-up shot, appetizing presentation, restaurant plating, high-end food styling, natural lighting, no text overlay, clean composition, food porn aesthetic`
    );
    
    // Image 2: Restaurant ambiance and atmosphere
    prompts.push(
      `Beautiful ${restaurantData.name} restaurant interior, cozy dining atmosphere, warm lighting, elegant decor, professional restaurant photography, no text overlay, clean background, inviting atmosphere, Singapore restaurant, trendy cafe vibes`
    );
    
    // Image 3: Food ingredients or preparation process
    prompts.push(
      `Fresh ingredients for ${dealData.title.toLowerCase()}, professional food photography, ${baseStyle}, ingredient showcase, natural colors, no text overlay, clean composition, appetizing presentation, cooking process`
    );
    
    // Image 4: Restaurant exterior or location
    prompts.push(
      `${restaurantData.name} restaurant exterior, ${restaurantData.address}, Singapore street view, professional restaurant photography, no text overlay, clean background, inviting storefront, urban setting, city vibes`
    );
    
    // Image 5: Deal value proposition (money-saving concept)
    prompts.push(
      `Money saving concept, ${dealData.title.toLowerCase()}, value for money, professional food photography, ${baseStyle}, no text overlay, clean composition, savings visualization, attractive pricing`
    );
    
    // Image 6: Social dining experience
    prompts.push(
      `Social dining experience, friends enjoying ${dealData.title.toLowerCase()}, ${restaurantData.name}, professional food photography, ${baseStyle}, no text overlay, clean composition, happy atmosphere, Singapore lifestyle`
    );
    
    return prompts;
  }

  /**
   * Generate a single poster-style image for deals
   * Alternative to multiple images when only one is needed
   */
  async generateDealPoster(dealData, restaurantData, options = {}) {
    try {
      const posterPrompt = `Professional restaurant deal poster, ${dealData.title}, ${restaurantData.name}, ${dealData.description}, appetizing food photography, vibrant colors, Singapore vibe, professional composition, no text overlay, clean background, high quality, social media ready`;
      
      return await this.generateSingleFoodImage(
        posterPrompt,
        dealData,
        restaurantData,
        0,
        {
          ...options,
          width: 1024,
          height: 1792, // 9:16 aspect ratio for social media
          negative_prompt: "text, watermark, logo, blurry, low quality, distorted, ugly, scary, inappropriate, white background, solid background, background, people, faces, hands, fingers, words, letters"
        }
      );
      
    } catch (error) {
      console.error('[ImagenService] Deal poster generation failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test Imagen connection and basic functionality
   */
  async testConnection() {
    try {
      console.log('[ImagenService] Testing Imagen connection...');
      
      const testPrompt = "A simple red apple on a white background, professional food photography, high quality, no text";
      
      const output = await this.replicate.run(
        "google/imagen-4-fast",
        {
          input: {
            prompt: testPrompt,
            aspect_ratio: "1:1",
            output_format: "jpg",
            safety_filter_level: "block_only_high"
          }
        }
      );

      if (output && output.length > 0) {
        console.log('[ImagenService] Connection test successful');
        return {
          success: true,
          message: 'Imagen connection working',
          testImageUrl: output[0].url()
        };
      } else {
        throw new Error('No output from Imagen test');
      }
      
    } catch (error) {
      console.error('[ImagenService] Connection test failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default ImagenService;
