// Deal Poster Generation with Flux Schnell and Text Overlays
import axios from 'axios';
import { createCanvas, registerFont, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { uploadToS3 } from './s3Utils.js';

/**
 * Generate a viral poster for business-submitted deals using Flux Schnell model
 * @param {Object} viralDealData - Deal data from ViralDeals table
 * @param {Object} botConfig - Bot configuration with API keys
 * @param {Object} options - Poster generation options
 * @returns {Object} - Poster data with URLs and metadata
 */
export async function generateViralDealPoster(viralDealData, botConfig, options = {}) {
    try {
        const replicateApiToken = botConfig?.replicateApiToken || process.env.REPLICATE_API_TOKEN;
        if (!replicateApiToken) {
            console.log('[DealPosterUtils] Replicate API token not found, skipping viral poster generation');
            return null;
        }

        console.log(`[DealPosterUtils] Generating viral poster for deal: ${viralDealData.dealId}`);

        // Step 1: Generate base image with Flux Schnell (or use provided base image)
        let baseImage;
        if (options.baseImageUrl) {
            console.log('[DealPosterUtils] Using provided base image URL');
            baseImage = {
                url: options.baseImageUrl,
                model: 'provided-image',
                prompt: 'Using externally provided base image'
            };
        } else {
            baseImage = await generateViralBaseImage(viralDealData, replicateApiToken, options);
            if (!baseImage) {
                console.error('[DealPosterUtils] Failed to generate base image for viral deal');
                return null;
            }
        }

        // Step 2: Add viral text overlay to create poster
        const posterUrl = await addViralTextOverlay(baseImage, viralDealData, options);
        if (!posterUrl) {
            console.error('[DealPosterUtils] Failed to add viral text overlay');
            return baseImage; // Return base image if overlay fails
        }

        console.log(`[DealPosterUtils] Successfully generated viral poster for deal: ${viralDealData.dealId}`);
        return {
            url: posterUrl,
            baseImageUrl: baseImage.url,
            dealId: viralDealData.dealId,
            restaurantName: viralDealData.restaurant?.name || 'Restaurant',
            dealDescription: viralDealData.dealDescription,
            style: options.style || 'singapore',
            generatedAt: new Date().toISOString()
        };

    } catch (error) {
        console.error('[DealPosterUtils] Error generating viral deal poster:', error.message);
        return null;
    }
}

/**
 * Generate base image for viral deals using Flux Schnell model
 */
async function generateViralBaseImage(viralDealData, replicateApiToken, options = {}) {
    try {
        const prompt = createViralFluxPrompt(viralDealData, options);
        console.log(`[DealPosterUtils] Using viral prompt: ${prompt}`);

        const response = await axios.post('https://api.replicate.com/v1/predictions', {
            model: "black-forest-labs/flux-schnell",
            input: {
                prompt: prompt,
                aspect_ratio: options.aspectRatio || "9:16", // Poster format for social media
                output_format: "png",
                output_quality: 95, // Higher quality for viral content
                seed: Math.floor(Math.random() * 1000000),
                num_inference_steps: 4 // Schnell is optimized for 4 steps
            }
        }, {
            headers: {
                'Authorization': `Bearer ${replicateApiToken}`,
                'Content-Type': 'application/json',
                'Prefer': 'wait'
            },
            timeout: 45000 // Longer timeout for Flux
        });

        if (response.data && response.data.output && response.data.output.length > 0) {
            const imageUrl = response.data.output[0];
            console.log(`[DealPosterUtils] Successfully generated viral base image: ${imageUrl}`);
            return {
                url: imageUrl,
                prompt: prompt,
                model: 'flux-schnell'
            };
        } else {
            console.error('[DealPosterUtils] No image URL in Flux response');
            return null;
        }

    } catch (error) {
        console.error('[DealPosterUtils] Error generating viral base image:', error.message);
        return null;
    }
}

/**
 * Generate base image using Flux Schnell model (legacy function for compatibility)
 */
async function generateBaseImage(dealData, replicateApiToken, options = {}) {
    try {
        const prompt = createFluxPrompt(dealData, options);
        console.log(`[DealPosterUtils] Using prompt: ${prompt}`);

        const response = await axios.post('https://api.replicate.com/v1/predictions', {
            model: "black-forest-labs/flux-schnell",
            input: {
                prompt: prompt,
                aspect_ratio: options.aspectRatio || "9:16", // Poster format
                output_format: "png",
                output_quality: 90,
                seed: Math.floor(Math.random() * 1000000),
                num_inference_steps: 4 // Schnell is optimized for 4 steps
            }
        }, {
            headers: {
                'Authorization': `Bearer ${replicateApiToken}`,
                'Content-Type': 'application/json',
                'Prefer': 'wait'
            },
            timeout: 45000 // Longer timeout for Flux
        });

        if (response.data && response.data.output && response.data.output.length > 0) {
            const imageUrl = response.data.output[0];
            console.log(`[DealPosterUtils] Successfully generated base image: ${imageUrl}`);
            return {
                url: imageUrl,
                prompt: prompt,
                model: 'flux-schnell'
            };
        } else {
            console.error('[DealPosterUtils] No image URL in Flux response');
            return null;
        }

    } catch (error) {
        console.error('[DealPosterUtils] Error generating base image:', error.message);
        return null;
    }
}

/**
 * Create optimized viral prompt for Flux Schnell model
 */
function createViralFluxPrompt(viralDealData, options = {}) {
    const style = options.style || 'singapore';
    const restaurant = viralDealData.restaurant || {};
    const restaurantName = restaurant.name || 'Restaurant';
    const dealDescription = viralDealData.dealDescription || 'Special Offer';
    const location = restaurant.address || 'Singapore';
    
    // Viral-focused prompts for social media appeal
    const viralStylePrompts = {
        singapore: `Vibrant Singapore-themed viral social media poster, tropical colors, local aesthetic, eye-catching design, Instagram-ready`,
        modern: `Modern viral social media poster design, trendy composition, bold colors, millennial appeal, shareable content`,
        vibrant: `High-energy viral poster design, explosive colors, dynamic composition, attention-grabbing, social media optimized`,
        elegant: `Elegant viral poster design, premium aesthetic, sophisticated colors, upscale appeal, luxury dining vibe`,
        foodie: `Food-focused viral poster, appetizing colors, culinary photography style, foodie community appeal`,
        trendy: `Ultra-trendy viral design, Gen-Z aesthetic, bold typography space, social media native, shareable format`
    };

    // Restaurant type specific elements for viral appeal
    const viralBusinessElements = {
        food: `mouthwatering ${restaurantName.toLowerCase()} food photography, viral food content, appetizing atmosphere`,
        restaurant: `amazing restaurant ambiance, viral dining experience, food photography style`,
        cafe: `trendy cafe atmosphere, Instagram-worthy setup, coffee culture vibes`,
        hawker: `authentic Singapore hawker culture, local food heritage, street food appeal`,
        fine_dining: `upscale restaurant photography, premium dining experience, luxury food presentation`,
        default: `attractive restaurant photography, viral social media content, food and dining focus`
    };

    // Determine business type from restaurant name or deal description
    const businessType = determineViralBusinessType(viralDealData);
    const businessElement = viralBusinessElements[businessType] || viralBusinessElements.default;
    const stylePrompt = viralStylePrompts[style] || viralStylePrompts.singapore;

    // Add Singapore-specific elements for local viral appeal
    const locationElements = location.toLowerCase().includes('singapore') ? 
        ', Singapore food scene, local viral appeal, Southeast Asian aesthetic' : 
        `, ${location} local dining scene, regional food culture`;

    // Viral-optimized prompt
    const fullPrompt = `${stylePrompt}, ${businessElement}${locationElements}, social media poster format, viral content style, high engagement potential, professional food photography, clean background space for text overlay, trending aesthetic, shareable design`;

    return fullPrompt;
}

/**
 * Determine business type for viral content optimization
 */
function determineViralBusinessType(viralDealData) {
    const name = (viralDealData.restaurant?.name || '').toLowerCase();
    const description = (viralDealData.dealDescription || '').toLowerCase();
    const combined = `${name} ${description}`;
    
    if (combined.includes('hawker') || combined.includes('kopitiam') || combined.includes('zi char')) return 'hawker';
    if (combined.includes('cafe') || combined.includes('coffee') || combined.includes('tea')) return 'cafe';
    if (combined.includes('fine') || combined.includes('premium') || combined.includes('luxury')) return 'fine_dining';
    if (combined.includes('food') || combined.includes('restaurant') || combined.includes('dining')) return 'restaurant';
    
    return 'food'; // Default to food category for viral appeal
}

/**
 * Create optimized prompt for Flux Schnell model (legacy function)
 */
function createFluxPrompt(dealData, options = {}) {
    const style = options.style || 'modern';
    const businessType = dealData.category || 'restaurant';
    const businessName = dealData.businessName || dealData.restaurant || dealData.store || 'Restaurant';
    const location = dealData.location || dealData.address || 'Singapore';
    
    // Base prompt templates for different styles
    const stylePrompts = {
        modern: `Modern minimalist poster design, clean composition, vibrant colors, professional photography style`,
        vibrant: `Colorful vibrant poster design, energetic composition, bright colors, dynamic layout`,
        elegant: `Elegant sophisticated poster design, refined composition, premium colors, upscale aesthetic`,
        casual: `Casual friendly poster design, approachable composition, warm colors, welcoming atmosphere`,
        singapore: `Singapore-themed poster design, local aesthetic, tropical colors, Southeast Asian style`
    };

    // Business type specific elements
    const businessElements = {
        food: `delicious ${businessType} food photography, appetizing dishes, restaurant ambiance`,
        fashion: `stylish fashion photography, trendy clothing displays, boutique atmosphere`,
        events: `exciting event photography, celebration atmosphere, entertainment vibes`,
        shopping: `attractive product displays, shopping atmosphere, retail environment`,
        services: `professional service photography, clean modern environment`,
        default: `attractive ${businessType} photography, welcoming atmosphere`
    };

    const category = dealData.category?.toLowerCase() || 'default';
    const businessElement = businessElements[category] || businessElements.default;
    const stylePrompt = stylePrompts[style] || stylePrompts.modern;

    // Location-specific elements for Singapore
    const locationElements = location.toLowerCase().includes('singapore') ? 
        ', Singapore cityscape background, Southeast Asian aesthetic' : 
        `, ${location} local atmosphere`;

    // Combine elements
    const fullPrompt = `${stylePrompt}, ${businessElement}${locationElements}, poster layout, commercial photography, high quality, professional lighting, no text overlay, clean background space for text`;

    return fullPrompt;
}

/**
 * Add viral text overlay optimized for social media sharing
 */
export async function addViralTextOverlay(baseImage, viralDealData, options = {}) {
    try {
        console.log('[DealPosterUtils] Adding viral text overlay to base image');

        // Download the base image
        const imageResponse = await axios.get(baseImage.url, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data);

        // Load the image using canvas
        const baseImg = await loadImage(imageBuffer);
        
        // Create canvas with same dimensions
        const canvas = createCanvas(baseImg.width, baseImg.height);
        const ctx = canvas.getContext('2d');

        // Draw base image
        ctx.drawImage(baseImg, 0, 0);

        // Add viral poster elements optimized for social media
        await addViralPosterElements(ctx, canvas, viralDealData, options);

        // Convert canvas to buffer
        const posterBuffer = canvas.toBuffer('image/png');
        
        // Upload to S3 and return public URL (preserving existing functionality)
        const s3Url = await uploadPosterToS3(posterBuffer, viralDealData.dealId || `temp_${Date.now()}`);
        
        console.log('[DealPosterUtils] Viral text overlay added and uploaded to S3 successfully');
        return s3Url;

    } catch (error) {
        console.error('[DealPosterUtils] Error adding viral text overlay:', error.message);
        return null;
    }
}

/**
 * Add text overlay to create poster-style image (legacy function)
 */
async function addTextOverlay(baseImage, dealData, options = {}) {
    try {
        console.log('[DealPosterUtils] Adding text overlay to base image');

        // Download the base image
        const imageResponse = await axios.get(baseImage.url, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data);

        // Load the image using canvas
        const baseImg = await loadImage(imageBuffer);
        
        // Create canvas with same dimensions
        const canvas = createCanvas(baseImg.width, baseImg.height);
        const ctx = canvas.getContext('2d');

        // Draw base image
        ctx.drawImage(baseImg, 0, 0);

        // Add poster elements
        await addPosterElements(ctx, canvas, dealData, options);

        // Convert canvas to buffer
        const posterBuffer = canvas.toBuffer('image/png');
        
        // Upload to S3 and return public URL (legacy function compatibility)
        const s3Url = await uploadPosterToS3(posterBuffer, `legacy_${Date.now()}`);

        console.log('[DealPosterUtils] Text overlay added and uploaded to S3 successfully');
        return s3Url;

    } catch (error) {
        console.error('[DealPosterUtils] Error adding text overlay:', error.message);
        return null;
    }
}

/**
 * Add viral poster elements optimized for social media engagement
 */
async function addViralPosterElements(ctx, canvas, viralDealData, options = {}) {
    const width = canvas.width;
    const height = canvas.height;
    const style = options.style || 'singapore';

    // Add gradient overlay for text readability (more dramatic for viral content)
    const gradient = ctx.createLinearGradient(0, height * 0.5, 0, height);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.4)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, height * 0.5, width, height * 0.5);

    // Viral-focused color schemes
    const viralColorSchemes = {
        singapore: { primary: '#FFFFFF', secondary: '#ED2939', accent: '#FFD700', highlight: '#00D4AA' },
        modern: { primary: '#FFFFFF', secondary: '#FF6B6B', accent: '#4ECDC4', highlight: '#45B7D1' },
        vibrant: { primary: '#FFFFFF', secondary: '#FF3366', accent: '#33FFCC', highlight: '#FFCC33' },
        elegant: { primary: '#FFFFFF', secondary: '#D4AF37', accent: '#8B4513', highlight: '#CD853F' },
        foodie: { primary: '#FFFFFF', secondary: '#FF6B35', accent: '#F7931E', highlight: '#FFD23F' },
        trendy: { primary: '#FFFFFF', secondary: '#E91E63', accent: '#00BCD4', highlight: '#8BC34A' }
    };
    const colors = viralColorSchemes[style] || viralColorSchemes.singapore;

    // Extract viral deal information
    const restaurant = viralDealData.restaurant || {};
    const restaurantName = restaurant.name || 'Restaurant';
    const dealDescription = viralDealData.dealDescription || 'Special Deal';
    const pricing = viralDealData.pricing || '';
    const validity = viralDealData.validity || 'Limited Time';
    const address = restaurant.address || '';

    // Use viral caption if available
    const viralCaption = viralDealData.viralContent?.selectedCaption || dealDescription;
    
    // Font sizes optimized for social media visibility
    const dealFontSize = Math.min(width * 0.14, 100); // Larger for viral impact
    const restaurantFontSize = Math.min(width * 0.09, 70);
    const pricingFontSize = Math.min(width * 0.07, 50);
    const detailFontSize = Math.min(width * 0.045, 36);

    // Add "VIRAL DEAL" or "LIMITED TIME" badge
    ctx.fillStyle = colors.secondary;
    ctx.fillRect(width * 0.05, height * 0.05, width * 0.35, height * 0.08);
    ctx.fillStyle = colors.primary;
    ctx.font = `bold ${detailFontSize * 0.8}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('🔥 VIRAL DEAL', width * 0.225, height * 0.1);

    // Main deal text (prominent and eye-catching)
    ctx.fillStyle = colors.accent;
    ctx.font = `bold ${dealFontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    
    const dealY = height * 0.7;
    
    // Split long deal descriptions for better readability
    const dealWords = dealDescription.split(' ');
    if (dealWords.length > 4) {
        const line1 = dealWords.slice(0, Math.ceil(dealWords.length / 2)).join(' ');
        const line2 = dealWords.slice(Math.ceil(dealWords.length / 2)).join(' ');
        ctx.fillText(line1, width / 2, dealY - dealFontSize * 0.6);
        ctx.fillText(line2, width / 2, dealY + dealFontSize * 0.4);
    } else {
        ctx.fillText(dealDescription, width / 2, dealY);
    }

    // Restaurant name with highlight
    ctx.fillStyle = colors.primary;
    ctx.font = `bold ${restaurantFontSize}px Arial, sans-serif`;
    ctx.shadowBlur = 4;
    const restaurantY = dealY + dealFontSize + 15;
    ctx.fillText(restaurantName, width / 2, restaurantY);

    // Pricing information (if available)
    if (pricing) {
        ctx.fillStyle = colors.highlight;
        ctx.font = `bold ${pricingFontSize}px Arial, sans-serif`;
        ctx.shadowBlur = 3;
        const pricingY = restaurantY + restaurantFontSize + 10;
        ctx.fillText(pricing, width / 2, pricingY);
    }

    // Validity period
    ctx.fillStyle = colors.secondary;
    ctx.font = `${detailFontSize}px Arial, sans-serif`;
    ctx.shadowBlur = 2;
    const validityY = height * 0.92;
    ctx.fillText(validity, width / 2, validityY);

    // Add viral engagement elements
    addViralEngagementElements(ctx, canvas, colors, style);
}

/**
 * Add viral engagement elements (call-to-action, social indicators)
 */
function addViralEngagementElements(ctx, canvas, colors, style) {
    const width = canvas.width;
    const height = canvas.height;

    switch (style) {
        case 'singapore':
            // Add Singapore flag accent
            ctx.fillStyle = '#ED2939';
            ctx.fillRect(width * 0.85, height * 0.15, width * 0.1, height * 0.03);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(width * 0.85, height * 0.18, width * 0.1, height * 0.03);
            break;

        case 'viral':
        case 'trendy':
            // Add trending arrow or fire emoji background
            ctx.fillStyle = colors.accent;
            ctx.font = `${width * 0.08}px Arial, sans-serif`;
            ctx.fillText('🔥', width * 0.9, height * 0.2);
            break;

        case 'modern':
            // Add modern geometric accent
            ctx.fillStyle = colors.secondary;
            ctx.beginPath();
            ctx.arc(width * 0.9, height * 0.2, 25, 0, 2 * Math.PI);
            ctx.fill();
            break;
    }

    // Add subtle "Share this deal" indicator
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = `${width * 0.025}px Arial, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText('📱 Share this deal!', width * 0.95, height * 0.95);
}

/**
 * Add poster elements (text, graphics) to the canvas (legacy function)
 */
async function addPosterElements(ctx, canvas, dealData, options = {}) {
    const width = canvas.width;
    const height = canvas.height;
    const style = options.style || 'modern';

    // Add semi-transparent overlay for text readability
    const gradient = ctx.createLinearGradient(0, height * 0.6, 0, height);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, height * 0.6, width, height * 0.4);

    // Style-specific color schemes
    const colorSchemes = {
        modern: { primary: '#FFFFFF', secondary: '#00D4AA', accent: '#FFD700' },
        vibrant: { primary: '#FFFFFF', secondary: '#FF6B6B', accent: '#4ECDC4' },
        elegant: { primary: '#FFFFFF', secondary: '#D4AF37', accent: '#8B4513' },
        casual: { primary: '#FFFFFF', secondary: '#FF8C42', accent: '#6A994E' },
        singapore: { primary: '#FFFFFF', secondary: '#ED2939', accent: '#FFFFFF' }
    };
    const colors = colorSchemes[style] || colorSchemes.modern;

    // Extract deal information
    const businessName = dealData.businessName || dealData.restaurant || dealData.store || 'Great Deal';
    const offer = dealData.offer || dealData.discount || 'Special Offer';
    const validity = dealData.validity || 'Limited Time';
    const address = dealData.address || dealData.location || '';

    // Set font properties (fallback to system fonts)
    const titleFontSize = Math.min(width * 0.08, 64);
    const offerFontSize = Math.min(width * 0.12, 80);
    const detailFontSize = Math.min(width * 0.04, 32);

    // Draw offer text (main highlight)
    ctx.fillStyle = colors.accent;
    ctx.font = `bold ${offerFontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    const offerY = height * 0.75;
    ctx.fillText(offer, width / 2, offerY);

    // Draw business name
    ctx.fillStyle = colors.primary;
    ctx.font = `bold ${titleFontSize}px Arial, sans-serif`;
    ctx.shadowBlur = 3;
    const titleY = offerY + titleFontSize + 10;
    ctx.fillText(businessName, width / 2, titleY);

    // Draw validity
    ctx.fillStyle = colors.secondary;
    ctx.font = `${detailFontSize}px Arial, sans-serif`;
    ctx.shadowBlur = 2;
    const validityY = titleY + detailFontSize + 15;
    ctx.fillText(validity, width / 2, validityY);

    // Draw location if available
    if (address) {
        ctx.fillStyle = colors.primary;
        ctx.font = `${detailFontSize * 0.8}px Arial, sans-serif`;
        const locationY = validityY + detailFontSize + 10;
        ctx.fillText(address, width / 2, locationY);
    }

    // Add decorative elements
    addDecorativeElements(ctx, canvas, colors, style);
}

/**
 * Add decorative elements based on style
 */
function addDecorativeElements(ctx, canvas, colors, style) {
    const width = canvas.width;
    const height = canvas.height;

    switch (style) {
        case 'modern':
            // Add geometric shapes
            ctx.fillStyle = colors.secondary;
            ctx.fillRect(width * 0.1, height * 0.65, width * 0.8, 4);
            break;

        case 'vibrant':
            // Add colorful circles
            ctx.fillStyle = colors.secondary;
            ctx.beginPath();
            ctx.arc(width * 0.9, height * 0.7, 30, 0, 2 * Math.PI);
            ctx.fill();
            break;

        case 'elegant':
            // Add corner flourishes
            ctx.strokeStyle = colors.secondary;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(width * 0.1, height * 0.9);
            ctx.lineTo(width * 0.2, height * 0.9);
            ctx.moveTo(width * 0.1, height * 0.9);
            ctx.lineTo(width * 0.1, height * 0.8);
            ctx.stroke();
            break;

        case 'singapore':
            // Add Singapore flag colors accent
            ctx.fillStyle = '#ED2939'; // Singapore red
            ctx.fillRect(0, height * 0.95, width, height * 0.05);
            break;
    }
}

/**
 * Generate multiple poster variations for A/B testing
 */
export async function generatePosterVariations(dealData, botConfig, variations = ['modern', 'vibrant', 'elegant']) {
    const posters = [];
    
    for (const style of variations) {
        console.log(`[DealPosterUtils] Generating ${style} style poster`);
        
        const poster = await generateDealPoster(dealData, botConfig, { 
            style: style,
            aspectRatio: "9:16" // Vertical poster format
        });
        
        if (poster) {
            posters.push({ ...poster, style: style });
        }
    }
    
    return posters;
}

/**
 * Send poster message via WhatsApp
 */
export async function sendDealPoster(storeId, phoneNumber, posterData, botConfig, caption = '') {
    try {
        if (!posterData?.url) {
            console.log('[DealPosterUtils] No poster URL provided, skipping send');
            return false;
        }

        const whatsappToken = botConfig?.whatsappToken || process.env.WHATSAPP_TOKEN;
        const whatsappPhoneNumberId = botConfig?.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;

        if (!whatsappToken || !whatsappPhoneNumberId) {
            console.error('[DealPosterUtils] WhatsApp credentials missing');
            return false;
        }

        // Create engaging caption
        const dealCaption = caption || createPosterCaption(posterData.dealData);

        console.log(`[DealPosterUtils] Sending deal poster to ${phoneNumber}`);

        const messageResponse = await axios.post(
            `https://graph.facebook.com/v19.0/${whatsappPhoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: phoneNumber,
                type: "image",
                image: {
                    link: posterData.url,
                    caption: dealCaption
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${whatsappToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (messageResponse.data && messageResponse.data.messages) {
            console.log(`[DealPosterUtils] Poster sent successfully to ${phoneNumber}`);
            return true;
        } else {
            console.error('[DealPosterUtils] Failed to send poster message');
            return false;
        }

    } catch (error) {
        console.error('[DealPosterUtils] Error sending poster:', error.message);
        return false;
    }
}

/**
 * Create engaging caption for poster
 */
function createPosterCaption(dealData) {
    const businessName = dealData.businessName || dealData.restaurant || dealData.store || 'Business';
    const offer = dealData.offer || dealData.discount || 'Special Deal';
    
    const captions = [
        `🔥 Amazing deal alert! ${offer} at ${businessName}! Don't miss out! 🎉`,
        `💫 Exclusive offer: ${offer} at ${businessName}! Limited time only! ⏰`,
        `🌟 Great savings ahead! ${offer} at ${businessName}! Grab it now! 🏃‍♂️`,
        `🎯 Deal of the day: ${offer} at ${businessName}! Perfect timing! ✨`,
        `💝 Special treat for you: ${offer} at ${businessName}! Enjoy! 😊`
    ];
    
    return captions[Math.floor(Math.random() * captions.length)];
}

/**
 * Combined function to generate and send deal poster
 */
export async function generateAndSendDealPoster(storeId, phoneNumber, dealData, botConfig, options = {}) {
    try {
        console.log(`[DealPosterUtils] Generating and sending deal poster to ${phoneNumber}`);
        
        // Generate the poster
        const poster = await generateDealPoster(dealData, botConfig, options);
        if (!poster) {
            console.log('[DealPosterUtils] Poster generation failed, skipping send');
            return false;
        }

        // Send the poster
        const sent = await sendDealPoster(storeId, phoneNumber, poster, botConfig);
        if (sent) {
            console.log(`[DealPosterUtils] Successfully sent deal poster to ${phoneNumber}`);
            return true;
        } else {
            console.log(`[DealPosterUtils] Failed to send deal poster to ${phoneNumber}`);
            return false;
        }

    } catch (error) {
        console.error('[DealPosterUtils] Error in generateAndSendDealPoster:', error);
        return false;
    }
}

/**
 * Upload poster buffer to S3 and return public URL
 */
async function uploadPosterToS3(posterBuffer, dealId) {
    try {
        const bucketName = process.env.S3_POSTER_BUCKET || process.env.S3_BUCKET || 'whatsapp-store-posters';
        const key = `viral-posters/${dealId}-${Date.now()}.png`;
        
        // Upload to S3
        const s3Result = await uploadToS3(bucketName, key, posterBuffer, 'image/png');
        
        // Return public URL (adjust based on your S3/CloudFront setup)
        const publicUrl = process.env.S3_PUBLIC_URL ? 
            `${process.env.S3_PUBLIC_URL}/${key}` : 
            `https://${bucketName}.s3.${process.env.AWS_REGION || 'ap-southeast-1'}.amazonaws.com/${key}`;
            
        console.log(`[DealPosterUtils] Poster uploaded to S3: ${publicUrl}`);
        return publicUrl;
        
    } catch (error) {
        console.error('[DealPosterUtils] S3 upload failed:', error.message);
        
        // Fallback to base64 if S3 upload fails (preserving functionality)
        console.log('[DealPosterUtils] Falling back to base64 data URL');
        const base64Data = posterBuffer.toString('base64');
        return `data:image/png;base64,${base64Data}`;
    }
}