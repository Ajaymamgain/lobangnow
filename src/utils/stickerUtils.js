// LobangLah Sticker Generation and Sending Utilities
import axios from 'axios';

/**
 * Generate a personalized sticker using Replicate API with weather and location context
 */
export async function generatePlayfulSticker(context = 'general', botConfig, weatherData = null, locationData = null) {
    try {
        const replicateApiToken = botConfig?.replicateApiToken || process.env.REPLICATE_API_TOKEN;
        if (!replicateApiToken) {
            console.log('[StickerUtils] Replicate API token not found, skipping sticker generation');
            return null;
        }

        // Generate personalized prompts based on weather, location, and context
        const selectedPrompt = generatePersonalizedPrompt(context, weatherData, locationData);
        
        console.log(`[StickerUtils] Generating ${context} sticker with personalized prompt: ${selectedPrompt}`);

        const response = await axios.post('https://api.replicate.com/v1/predictions', {
            version: "fofr/sticker-maker:4acb778eb059772225ec213948f0660867b2e03f277448f18cf1800b96a65a1a",
            input: {
                steps: 17,
                width: 1152,
                height: 1152,
                prompt: selectedPrompt + ", transparent background, no background, clean sticker design",
                output_format: "png",
                output_quality: 100,
                negative_prompt: "ugly, blurry, low quality, distorted, scary, inappropriate, white background, solid background, background",
                number_of_images: 1
            }
        }, {
            headers: {
                'Authorization': `Bearer ${replicateApiToken}`,
                'Content-Type': 'application/json',
                'Prefer': 'wait'
            },
            timeout: 30000 // 30 second timeout
        });

        if (response.data && response.data.output && response.data.output.length > 0) {
            const stickerUrl = response.data.output[0];
            console.log(`[StickerUtils] Successfully generated ${context} sticker: ${stickerUrl}`);
            return {
                url: stickerUrl,
                context: context,
                prompt: selectedPrompt,
                weather: weatherData?.description || 'unknown',
                location: locationData?.displayName || 'Singapore'
            };
        } else {
            console.log('[StickerUtils] No sticker URL in Replicate response');
            return null;
        }

    } catch (error) {
        console.error('[StickerUtils] Error generating sticker:', error.message);
        return null;
    }
}

/**
 * Generate personalized sticker prompt based on weather, location, and context
 */
export function generatePersonalizedPrompt(context, weatherData, locationData) {
    // Extract weather and location details
    const weather = weatherData ? {
        condition: weatherData.description || weatherData.main || 'clear',
        temperature: weatherData.temperature || 28,
        emoji: weatherData.emoji || '☀️',
        isDaytime: weatherData.isDaytime !== false // default to true if not specified
    } : null;
    
    // Extract location details for sticker context
    const location = locationData ? {
        name: locationData.displayName || locationData.name || 'Singapore',
        area: locationData.area || 'Singapore'
    } : { name: 'Singapore', area: 'Singapore' };

    // Base character themes for different contexts
    const baseThemes = {
        welcome: "cute merlion mascot waving hello",
        searching: "adorable cartoon magnifying glass with eyes searching for deals",
        deals_found: "excited kawaii character celebrating with deal tags",
        food: "cute cartoon dim sum character with big smile",
        fashion: "adorable fashion-forward character",
        groceries: "cute cartoon shopping cart character",
        chat: "adorable robot assistant with friendly expression",
        goodbye: "cute merlion waving goodbye",
        location_received: "happy kawaii GPS pin character",
        more_deals: "excited cartoon treasure hunter character"
    };

    let baseCharacter = baseThemes[context] || baseThemes.welcome;
    
    // Weather-based enhancements with short form weather info
    let weatherEnhancement = "";
    let weatherText = "";
    if (weather) {
        const weatherCondition = weather.condition.toLowerCase();
        const temp = weather.temperature;
        
        // Create short weather text for sticker
        weatherText = `${weather.emoji} ${temp}°C ${weather.condition}`;
        
        if (weatherCondition.includes('rain') || weatherCondition.includes('shower')) {
            weatherEnhancement = " holding a cute umbrella, raindrops around, cozy rainy mood";
        } else if (weatherCondition.includes('cloud') || weatherCondition.includes('overcast')) {
            weatherEnhancement = " under soft cloudy sky, gentle lighting, peaceful atmosphere";
        } else if (weatherCondition.includes('sun') || weatherCondition.includes('clear')) {
            weatherEnhancement = weather.isDaytime ? 
                " in bright sunny weather, cheerful sunny day vibes, golden lighting" :
                " under starry night sky, peaceful evening atmosphere, soft moonlight";
        } else if (weatherCondition.includes('storm') || weatherCondition.includes('thunder')) {
            weatherEnhancement = " with dramatic sky background, cozy indoor feeling, safe and warm";
        } else if (weatherCondition.includes('mist') || weatherCondition.includes('fog')) {
            weatherEnhancement = " in misty singapore morning, dreamy atmospheric lighting, soft focus";
        } else {
            weatherEnhancement = ` in ${weather.temperature}°C singapore weather, comfortable outdoor setting`;
        }
    }
    
    // Simple Singapore background (no specific location context)
    const locationEnhancement = " with singapore skyline background";
    
    // Time-based mood adjustment
    const timeEnhancement = weather?.isDaytime ? 
        ", bright and energetic daytime mood" : 
        ", calm and cozy evening mood";
    
    // Combine all elements with weather info
    let fullPrompt = `${baseCharacter}${weatherEnhancement}${locationEnhancement}${timeEnhancement}, kawaii style, high quality, cute and friendly, singapore theme, sticker design, clean background`;
    
    // Add weather text if available
    if (weatherText) {
        fullPrompt += `, weather info: ${weatherText}`;
    }
    
    return fullPrompt;
}

/**
 * Check if location is in urban area of Singapore
 */
export function isUrbanArea(locationData) {
    if (!locationData) return true; // default to urban
    
    const urbanAreas = [
        'orchard', 'marina', 'raffles', 'city', 'downtown', 'central', 'cbd',
        'bugis', 'clarke quay', 'boat quay', 'chinatown', 'little india',
        'kampong glam', 'tanjong pagar', 'shenton way'
    ];
    
    const locationText = (
        (locationData.displayName || '') + ' ' +
        (locationData.area || '') + ' ' +
        (locationData.sublocality || '') + ' ' +
        (locationData.vicinity || '')
    ).toLowerCase();
    
    return urbanAreas.some(area => locationText.includes(area));
}


/**
 * Send a sticker message via WhatsApp
 */
export async function sendStickerMessage(storeId, phoneNumber, stickerUrl, botConfig, weatherData = null) {
    try {
        if (!stickerUrl) {
            console.log('[StickerUtils] No sticker URL provided, skipping sticker send');
            return false;
        }

        const whatsappToken = botConfig?.whatsappToken || process.env.WHATSAPP_TOKEN;
        const whatsappPhoneNumberId = botConfig?.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;

        if (!whatsappToken || !whatsappPhoneNumberId) {
            console.error('[StickerUtils] WhatsApp credentials missing');
            return false;
        }

        // Send sticker message as an image with caption for better visibility and engagement
        console.log(`[StickerUtils] Sending sticker message to ${phoneNumber} using URL: ${stickerUrl}`);
        
        // Create a fun caption with weather info if available
        let caption = "";
        if (weatherData && weatherData.description && weatherData.temperature) {
            const weatherInfo = `${weatherData.emoji || '🌤️'} ${weatherData.temperature}°C ${weatherData.description}`;
            caption = `🌤️ ${weatherInfo} | 🔍 Hunting for amazing deals near you! ✨`;
        } else {
            const funCaptions = [
                "✨ I'm hunting for amazing deals near you! ✨",
                "🎉 Finding the best deals just for you! 🎉",
                "🌟 Deal detective at work! Stay tuned! 🌟",
                "🔍 Searching for hidden gems nearby! 🔍",
                "💫 Your personal deal finder is on the case! 💫"
            ];
            caption = funCaptions[Math.floor(Math.random() * funCaptions.length)];
        }
        
        const messageResponse = await axios.post(
            `https://graph.facebook.com/v19.0/${whatsappPhoneNumberId}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: phoneNumber,
                type: "image",
                image: {
                    link: stickerUrl,
                    caption: caption
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
            console.log(`[StickerUtils] Sticker sent successfully to ${phoneNumber}`);
            return true;
        } else {
            console.error('[StickerUtils] Failed to send sticker message');
            return false;
        }

    } catch (error) {
        console.error('[StickerUtils] Error sending sticker:', error.message);
        return false;
    }
}

/**
 * Generate and send a contextual sticker with weather and location data (combines generation and sending)
 */
export async function generateAndSendSticker(storeId, phoneNumber, context, botConfig, weatherData = null, locationData = null) {
    try {
        console.log(`[StickerUtils] Generating and sending ${context} sticker to ${phoneNumber} with weather/location context`);
        
        // Generate the personalized sticker with weather and location context
        const sticker = await generatePlayfulSticker(context, botConfig, weatherData, locationData);
        if (!sticker) {
            console.log('[StickerUtils] Sticker generation failed, skipping send');
            return false;
        }

        // Send the sticker with weather data
        const sent = await sendStickerMessage(storeId, phoneNumber, sticker.url, botConfig, weatherData);
        if (sent) {
            console.log(`[StickerUtils] Successfully sent ${context} sticker to ${phoneNumber}:`, {
                weather: sticker.weather,
                location: sticker.location,
                prompt: sticker.prompt.substring(0, 100) + '...'
            });
            return true;
        } else {
            console.log(`[StickerUtils] Failed to send ${context} sticker to ${phoneNumber}`);
            return false;
        }

    } catch (error) {
        console.error('[StickerUtils] Error in generateAndSendSticker:', error);
        return false;
    }
}

/**
 * Get random playful sticker context based on interaction type
 */
export function getRandomStickerContext(interactionType = 'general') {
    const contextMappings = {
        welcome: ['welcome'],
        location_received: ['searching'],
        category_selected: ['searching'],
        deals_found: ['deals_found'],
        no_deals: ['chat'],
        food_deals: ['food'],
        fashion_deals: ['fashion'],
        groceries_deals: ['groceries'],
        chat_started: ['chat'],
        more_deals: ['searching'],
        goodbye: ['goodbye'],
        general: ['welcome', 'chat', 'deals_found']
    };

    const possibleContexts = contextMappings[interactionType] || contextMappings.general;
    return possibleContexts[Math.floor(Math.random() * possibleContexts.length)];
}

/**
 * Should send sticker based on interaction frequency (don't spam users)
 */
export function shouldSendSticker(userState, interactionType) {
    // Send stickers for key interactions but not too frequently
    const stickerInteractions = [
        'welcome',
        'deals_found', 
        'chat_started',
        'category_selected'
    ];

    // Allow frequent sticker sending for playful interactions
    return stickerInteractions.includes(interactionType);
}
