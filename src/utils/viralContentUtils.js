// Viral Content Utilities
// Provides: generateViralCaption, generateViralMediaPackage, generatePlatformContent, generateSmartHashtags

import OpenAI from 'openai';
import fetch from 'node-fetch';
import ImagenService from '../services/imagenService.js';

/**
 * Generate 3 viral captions for the deal
 */
export async function generateViralCaption(dealData, botConfig) {
  try {
    const openai = new OpenAI({ apiKey: botConfig.openAiApiKey });
    const prompt = `Create 3 short, punchy, platform-friendly captions for a restaurant deal.
Restaurant: ${dealData.restaurant.name}
Deal: ${dealData.dealDescription}
Tone: energetic, trustworthy, Singapore vibe
Keep each under 140 chars. Return as a numbered list 1..3.`;

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.7,
    });
    const text = res.choices?.[0]?.message?.content || '';
    const lines = text
      .split(/\n+/)
      .map(l => l.replace(/^\d+\.?\s*/, '').trim())
      .filter(Boolean);
    return lines.slice(0, 3);
  } catch (err) {
    console.error('[ViralUtils] Caption generation error:', err);
    // Fallback captions
    return [
      `🔥 ${dealData.restaurant.name}: ${dealData.dealDescription}`.slice(0, 120),
      `🍽️ Today only: ${dealData.dealDescription}`.slice(0, 120),
      `🇸🇬 Don't miss it: ${dealData.dealDescription}`.slice(0, 120),
    ];
  }
}

/**
 * Very lightweight hashtag generator
 */
export function generateSmartHashtags(dealData) {
  const base = [
    '#SingaporeFood',
    '#SGDeals',
    '#FoodPromo',
    '#DailySpecial',
  ];
  const nameTag = `#${dealData.restaurant.name.replace(/\s+/g, '')}`.slice(0, 30);
  const dishMatches = (dealData.dealDescription || '').toLowerCase().match(/[a-z]{4,}/g) || [];
  const dishTag = dishMatches.length > 0 ? `#${dishMatches[0].replace(/[^a-z0-9]/g, '')}` : '#Yum';
  const unique = Array.from(new Set([nameTag, dishTag, ...base])).slice(0, 5);
  return unique;
}

/**
 * Generate platform-specific content variations
 */
export function generatePlatformContent(dealData, baseCaption, platform) {
  const platformConfigs = {
    instagram: {
      maxLength: 2200,
      hashtagCount: 20,
      emojiStyle: 'trendy'
    },
    facebook: {
      maxLength: 63206,
      hashtagCount: 5,
      emojiStyle: 'professional'
    },
    tiktok: {
      maxLength: 150,
      hashtagCount: 3,
      emojiStyle: 'viral'
    },
    twitter: {
      maxLength: 280,
      hashtagCount: 2,
      emojiStyle: 'minimal'
    }
  };

  const config = platformConfigs[platform] || platformConfigs.instagram;
  const hashtags = generateSmartHashtags(dealData).slice(0, config.hashtagCount);
  
  let caption = baseCaption;
  if (config.emojiStyle === 'trendy') {
    caption = `🔥 ${caption} 🚀`;
  } else if (config.emojiStyle === 'viral') {
    caption = `💥 ${caption} ⚡`;
  }
  
  caption += `\n\n${hashtags.join(' ')}`;
  
  if (caption.length > config.maxLength) {
    caption = caption.substring(0, config.maxLength - 3) + '...';
  }
  
  return caption;
}

/**
 * Generate viral media package using OpenAI → SDXL pipeline
 * Replaces Flux Schnell with SDXL for better food photography quality
 */
export async function generateViralMediaPackage(dealData, botConfig) {
  try {
    console.log('[ViralUtils] Starting OpenAI → SDXL poster generation pipeline');
    
    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey: botConfig.openAiApiKey });
    
    // Step 1: Optimize prompt with OpenAI
    const promptOptimizationRequest = `You are a prompt engineering expert. Create a detailed visual prompt for SDXL model to generate a viral restaurant deal poster.

Restaurant: ${dealData.restaurant?.name || 'Restaurant'}
Deal: ${dealData.dealDescription || dealData.description || 'Special Offer'}
Location: ${dealData.restaurant?.address || 'Singapore'}
Category: ${dealData.restaurant?.category || 'Restaurant'}

Requirements:
- Professional food photography style
- Appetizing, vibrant presentation
- Singapore/Asian cuisine aesthetic
- Social media optimized (9:16 aspect ratio)
- Clean background for text overlays
- High quality, shareable content
- No text overlay (text will be added by video processor)

Generate a single detailed prompt (max 200 words) for SDXL model:`;

    const promptResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: promptOptimizationRequest }],
      max_tokens: 300,
      temperature: 0.7
    });

    const optimizedPrompt = promptResponse.choices?.[0]?.message?.content || 
      `Professional viral restaurant poster, Singapore food photography, appetizing ${dealData.restaurant?.name || 'restaurant'} cuisine, social media optimized, clean background space for text overlay, trending aesthetic, high quality food photography`;

    console.log('[ViralUtils] OpenAI generated optimized prompt:', optimizedPrompt.substring(0, 100) + '...');

    // Step 2: Generate image with SDXL (replaces Flux Schnell)
    let posterBase64 = null;
    let baseImageUrl = null;
    const replicateApiToken = botConfig?.replicateApiToken || process.env.REPLICATE_API_TOKEN;
    
    try {
      if (replicateApiToken) {
        const imagenService = new ImagenService(replicateApiToken);
        
                  // Generate a single poster image with Imagen
          const imageResult = await imagenService.generateDealPoster(
          {
            title: dealData.dealDescription || dealData.description,
            deal_id: `deal_${Date.now()}`
          },
          {
            name: dealData.restaurant?.name || 'Restaurant',
            address: dealData.restaurant?.address || 'Singapore',
            restaurant_id: `rest_${Date.now()}`
          },
          {
            width: 1024,
            height: 1792, // 9:16 aspect ratio for social media
            guidance_scale: 7.5,
            num_inference_steps: 25
          }
        );
        
        if (imageResult.success) {
          baseImageUrl = imageResult.imageUrl;
          console.log('[ViralUtils] SDXL generated base image successfully');
          posterBase64 = imageResult.imageBuffer.toString('base64');
        } else {
          console.warn('[ViralUtils] SDXL returned no output. Falling back.');
        }
      } else {
        console.warn('[ViralUtils] Replicate token missing. Using OpenAI Images fallback.');
      }
    } catch (sdxlErr) {
      console.warn('[ViralUtils] SDXL call failed, falling back to OpenAI Images:', sdxlErr.message);
    }

    if (!posterBase64) {
      // Fallback: OpenAI Images (DALL·E / gpt-image-1)
      const imagePrompt = `Create a vertical, Instagram-ready restaurant deal poster (9:16).
Restaurant: ${dealData.restaurant?.name || 'Restaurant'}
Deal: ${dealData.dealDescription || dealData.description || 'Special Offer'}
Location: ${dealData.restaurant?.address || 'Singapore'}
Style: vibrant, appetizing, Singapore vibe, professional look, beautiful composition.`;
      const imageRes = await openai.images.generate({
        model: 'gpt-image-1',
        prompt: imagePrompt,
        size: '1024x1792'
      });
      // OpenAI Images returns base64 as 'b64_json'
      posterBase64 = imageRes.data?.[0]?.b64_json || null;
      if (!posterBase64) {
        throw new Error('OpenAI Images fallback failed to produce output');
      }
    }

    // Return media package with base64 so caller can upload to S3
    return {
      success: true,
      mediaPackage: {
        poster: {
          success: true,
          base64: posterBase64,
          baseImageUrl: baseImageUrl || 'sdxl-image',
          prompt: optimizedPrompt,
          style: 'singapore',
          format: 'png'
        },
        enhancedPhoto: { success: false, reason: 'Poster covers primary visual' }
      }
    };

  } catch (err) {
    console.error('[ViralUtils] Viral media generation error:', err);
    
    // Return fallback message
    return { 
      success: false, 
      error: `AI poster generation failed: ${err.message}`,
      fallback: {
        message: `🔥 ${dealData.dealDescription || 'Special Deal'} at ${dealData.restaurant?.name || 'Restaurant'}! 📍 ${dealData.restaurant?.address || 'Singapore'} 🚀 WhatsApp to claim!`,
        hashtags: generateSmartHashtags(dealData)
      }
    };
  }
}




