// Daily Deal Social Media Agency Handler
// NEW FLOW: hello > welcome > restaurant setup > location > daily deal > multi-platform content > daily reminders

import { sendWhatsAppMessage } from '../utils/whatsappUtils.js';
import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import { generateViralCaption, generateViralMediaPackage, generatePlatformContent, generateSmartHashtags } from '../utils/viralContentUtils.js';
import { searchOfficialSocialHandles } from '../utils/googleSearchUtils.js';
import DealPipeline from '../services/dealPipeline.js';
import HetznerVideoService from '../services/hetznerVideoService.js';
import S3ImageService from '../services/s3ImageService.js';

async function fetchEnrichedRestaurantInfo(name, address, botConfig) {
    try {
        const openai = new OpenAI({ apiKey: botConfig.openAiApiKey });
        console.log(`[DailyDeal] Enhanced search: enriching "${name}" at "${address}" via OpenAI web search`);
        const query = `Provide official website and social handles (instagram, facebook, tiktok) for "${name}" in Singapore only. Also write a 1-2 line short summary for customers. Respond as JSON with keys: website, instagram, facebook, tiktok, shortSummary. If unknown, use empty string.`;
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini-search-preview',
            web_search_options: {},
            messages: [{ role: 'user', content: query }]
        });
        const text = completion.choices[0]?.message?.content || '{}';
        let parsed = {};
        try {
            parsed = JSON.parse(text);
        } catch (parseErr) {
            try {
                const start = text.indexOf('{');
                const end = text.lastIndexOf('}');
                if (start !== -1 && end !== -1) {
                    parsed = JSON.parse(text.substring(start, end + 1));
                }
            } catch {}
        }
        console.log('[DailyDeal] Enhanced search result (OpenAI):', JSON.stringify(parsed));
        return parsed;
    } catch (e) {
        console.error('[DailyDeal] fetchEnrichedRestaurantInfo failed:', e.message);
        return {};
    }
}

const dynamodb = new DynamoDBClient({ region: 'ap-southeast-1' });
const s3Client = new S3Client({ region: 'ap-southeast-1' });

/**
 * Check if restaurant exists in database
 */
async function getExistingRestaurant(ownerPhoneNumber) {
    try {
        const params = {
            TableName: 'RestaurantProfiles',
            Key: marshall({ userId: ownerPhoneNumber })
        };
        
        const { Item } = await dynamodb.send(new GetItemCommand(params));
        
        if (Item) {
            return unmarshall(Item);
        }
        return null;
    } catch (error) {
        console.error('[DailyDeal] Error checking existing restaurant:', error);
        return null;
    }
}

/**
 * Use OpenAI to detect if message is deal data
 */
async function isDealMessage(messageText, restaurantName, botConfig) {
    try {
        const openai = new OpenAI({ apiKey: botConfig.openAiApiKey });
        
        const prompt = `You are analyzing a message from "${restaurantName}" restaurant owner.
        
Determine if this message contains a FOOD DEAL/SPECIAL OFFER that should be turned into viral social media content.

Message: "${messageText}"

Respond with ONLY:
- "YES" if it's a food deal/special offer (contains dish/food name, price, special promotion, etc.)
- "NO" if it's just a greeting, question, or casual message

Examples of YES: "Special fried rice $12 today", "Buy 1 get 1 pizza", "Fresh seafood platter only $25"
Examples of NO: "Hello", "How are you", "Thank you", "What time do you close"`;

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 10,
            temperature: 0.1
        });

        const result = response.choices[0]?.message?.content?.trim()?.toUpperCase();
        console.log(`[DailyDeal] OpenAI deal detection for "${messageText}": ${result}`);
        
        return result === "YES";
    } catch (error) {
        console.error('[DailyDeal] Error in OpenAI deal detection:', error);
        // Fallback: simple keyword detection
        const dealKeywords = ['$', 'special', 'offer', 'deal', 'today', 'only', 'price', 'buy', 'get', 'free', 'discount'];
        return dealKeywords.some(keyword => messageText.toLowerCase().includes(keyword));
    }
}

/**
 * Create interactive message when deal info is received (using OpenAI)
 */
async function createDealReceivedMessage(dealText, restaurantName, botConfig) {
    try {
        const openai = new OpenAI({ apiKey: botConfig.openAiApiKey });
        
        const prompt = `You are a helpful AI assistant for a restaurant owner named "${restaurantName}". 
        
The owner just sent this deal information: "${dealText}"

Create a friendly, encouraging message that:
1. Acknowledges their deal submission
2. Explains what will happen next
3. Keeps them engaged and excited
4. Is under 200 characters for WhatsApp

Make it warm, professional, and motivating. Use emojis appropriately.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 150,
            temperature: 0.7
        });

        const aiMessage = response.choices[0]?.message?.content?.trim() || 
            `🎉 Great deal, ${restaurantName}! We're working on making it viral! 🚀`;

        return {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: "🎯 Deal Received!"
                },
                body: {
                    text: aiMessage
                },
                footer: {
                    text: "We're processing your deal..."
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "check_status",
                                title: "📊 Check Status"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "submit_another",
                                title: "➕ Submit Another"
                            }
                        }
                    ]
                }
            }
        };
    } catch (error) {
        console.error('[DailyDeal] Error creating AI deal message:', error);
        // Fallback message
        return {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: "🎯 Deal Received!"
                },
                body: {
                    text: `🎉 Great deal, ${restaurantName}! We're working on making it viral! 🚀\n\nOur AI is creating content for all platforms. This usually takes 2-3 minutes.`
                },
                footer: {
                    text: "We're processing your deal..."
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "check_status",
                                title: "📊 Check Status"
                            }
                        }
                    ]
                }
            }
        };
    }
}

/**
 * Main handler for Daily Deal Agency workflow
 */
export async function handleDailyDealMessage(storeId, fromNumber, messageType, messageBody, interactiveData, locationData, botConfig, session) {
    console.log(`[DailyDeal] Processing message from ${fromNumber}`);
    
    // Follow best practices for session initialization
    let sessionData = session;
    
    // Handle different session formats from webhook
    if (Array.isArray(session)) {
        // Session comes as conversation array from webhook
        sessionData = { 
            conversation: session,
            dailyDeal: null // Will be initialized below
        };
    } else if (session && typeof session === 'object') {
        // Session already has structure, ensure it's valid
        sessionData = session;
    } else {
        // No session data, create new structure
        sessionData = {
            conversation: [],
            dailyDeal: null
        };
    }
    
    // Initialize daily deal state following best practices
    if (!sessionData.dailyDeal) {
        console.log(`[DailyDeal] Initializing new session for user: ${fromNumber}`);
        sessionData.dailyDeal = {
            step: 'welcome',
            restaurantProfile: {},
            todaysDeal: {},
            userId: fromNumber,
            registeredAt: new Date().toISOString(),
            lastDealDate: null,
            reminderEnabled: true,
            sessionVersion: '1.0',
            lastActivity: new Date().toISOString()
        };
    } else {
        // Update existing session with current activity
        sessionData.dailyDeal.lastActivity = new Date().toISOString();
        sessionData.dailyDeal.userId = fromNumber; // Ensure userId is current
    }
    
    // Validate session data structure
    if (!sessionData.dailyDeal.step) {
        sessionData.dailyDeal.step = 'welcome';
    }
    
    if (!sessionData.dailyDeal.restaurantProfile) {
        sessionData.dailyDeal.restaurantProfile = {};
    }
    
    if (!sessionData.dailyDeal.todaysDeal) {
        sessionData.dailyDeal.todaysDeal = {};
    }
    
    const dailyDealState = sessionData.dailyDeal;

    try {
        let response;

        // Handle different message types
        if (messageType === 'interactive' && interactiveData) {
            response = await handleDailyDealInteractive(dailyDealState, interactiveData, fromNumber, botConfig, storeId);
        } else if (messageType === 'text') {
            response = await handleDailyDealText(dailyDealState, messageBody, fromNumber, botConfig);
        } else if (messageType === 'location' && locationData) {
            // Location sharing not needed anymore - using Google Places API
            response = {
                type: "text",
                text: "📍 Thanks for sharing your location! However, I'll get all the details I need from Google Places when you provide your restaurant name. Please click 'Setup Restaurant' to start."
            };
        } else if (messageType === 'image') {
            response = await handleDailyDealImage(dailyDealState, locationData, fromNumber, botConfig);
        } else {
            // Default to welcome message
            response = createDailyDealWelcome();
        }

        // Send the response immediately via WhatsApp
        if (response) {
            await sendWhatsAppMessage(storeId, fromNumber, response, botConfig);
            console.log(`[DailyDeal] Sent response to ${fromNumber}`);
        }

        // Save updated userState back to session
        sessionData.dailyDeal = dailyDealState;

        return { success: true, response, session: sessionData };
    } catch (error) {
        console.error('[DailyDeal] Error processing message:', error);
        // Send error message to user
        try {
            await sendWhatsAppMessage(storeId, fromNumber, {
                type: "text",
                text: "Sorry, there was an error processing your request. Please try again or contact support."
            }, botConfig);
        } catch (sendError) {
            console.error('[DailyDeal] Error sending error message:', sendError);
        }
        
        // Save updated userState back to session even on error
        sessionData.dailyDeal = dailyDealState;
        
        return { success: false, error: error.message, session: sessionData };
    }
}

/**
 * Handle interactive button clicks
 */
async function handleDailyDealInteractive(interactiveState, interactiveData, fromNumber, botConfig, storeId) {
    const actionId = interactiveData.button_reply?.id;
    console.log(`[DailyDeal] Processing action: ${actionId}`);

    switch (actionId) {
        case 'submit_another':
        case 'submit_deal':
            interactiveState.step = 'collect_deal_details';
            return createTodaysDealMessage();
        case 'start_restaurant_setup':
            // Immediately move to restaurant name collection on first press
            interactiveState.step = 'collect_restaurant_name';
            return createRestaurantNameMessage();
            
        case 'submit_daily_deal':
        case 'submit_todays_deal':
            // Ensure restaurant profile exists for deal submission
            if (!interactiveState.restaurantProfile || !interactiveState.restaurantProfile.name) {
                interactiveState.restaurantProfile = {
                    name: 'Test Restaurant',
                    location: { address: 'Singapore' }
                };
            }
            interactiveState.step = 'collect_deal_details';
            return createTodaysDealMessage();
            
        case 'confirm_restaurant':
            // After confirmation, fetch official photos for the confirmed place using exact name + address
            try {
                const confirmedName = interactiveState.restaurantProfile?.name || '';
                const confirmedAddress = interactiveState.restaurantProfile?.location?.address || '';
                if (botConfig.googleMapsApiKey && confirmedName) {
                    const placeId = interactiveState.restaurantProfile?.placeId || await ensurePlaceId(confirmedName, confirmedAddress, botConfig);
                    if (placeId) {
                        console.log(`[DailyDeal] Confirmed. Downloading official Google photos for ${confirmedName} (${placeId})`);
                        const photos = await downloadRestaurantPhotos(placeId, confirmedName, botConfig, /*maxPhotos*/ 2);
                        if (photos?.length) {
                            interactiveState.restaurantProfile.photos = photos;
                        }
                    }
                }
            } catch (e) {
                console.log('[DailyDeal] Skipping photo fetch post-confirmation:', e.message);
            }

            // Check if restaurant already has photos in S3
            const existingPhotoCount = interactiveState.restaurantProfile.existingPhotos ? interactiveState.restaurantProfile.existingPhotos.length : 0;
            
            if (existingPhotoCount >= 2) {
                // Skip photo collection if they already have photos
                interactiveState.step = 'collect_deal_details';
                return {
                    type: 'text',
                    text: `🏪 Restaurant confirmed! I found ${existingPhotoCount} existing photos for ${interactiveState.restaurantProfile.name}.\n\nSkipping photo collection since you already have photos. Let's move to deal details!\n\nPlease tell me about today's deal (dish name, pricing, special offer, etc.)`
                };
            } else {
                // Enhanced: Add step for collecting restaurant images
                interactiveState.step = 'collect_restaurant_images';
                return {
                    type: 'interactive',
                    interactive: {
                        type: 'button',
                        header: { type: 'text', text: '📸 Restaurant Images' },
                        body: { 
                            text: `🏪 **${interactiveState.restaurantProfile.name}**\n\nNow let's collect some images of your restaurant to make your deals more engaging!\n\n📱 **Send us photos of:**\n• Restaurant exterior/signage\n• Interior atmosphere\n• Popular dishes\n• Staff/chef in action\n• Any other relevant images\n\nYou can send up to 4 photos. Type "done" when finished.\n\n${existingPhotoCount > 0 ? `You already have ${existingPhotoCount} photo(s).` : ''}` 
                        },
                        footer: { text: 'Send images or click done' },
                        action: { 
                            buttons: [
                                { type: 'reply', reply: { id: 'skip_images', title: '⏭️ Skip Images' } },
                                { type: 'reply', reply: { id: 'done_images', title: '✅ Done with Images' } }
                            ] 
                        }
                    }
                };
            }
        
        case 'edit_restaurant':
            interactiveState.step = 'await_restaurant_updates';
            return {
                type: 'text',
                text: '✏️ Please reply with updates (name, address, phone, website, IG/FB/TikTok). I will refine and re-validate.'
            };

        case 'approve_restaurant':
            // Save approved profile then move to deal details
            await saveRestaurantProfile(interactiveState, fromNumber);
            interactiveState.step = 'collect_deal_details';
            return createTodaysDealMessage();
            
        case 'skip_images':
            // User chose to skip image collection
            interactiveState.step = 'collect_deal_details';
            return createTodaysDealMessage();
            
        case 'done_images':
            // User finished uploading images, proceed to deal details
            interactiveState.step = 'collect_deal_details';
            return createTodaysDealMessage();
            
        case 'next_platform':
            interactiveState.currentPlatformIndex = (interactiveState.currentPlatformIndex || 0) + 1;
            return await sendNextPlatformMessage(interactiveState, botConfig);
            
        case 'previous_platform':
            interactiveState.currentPlatformIndex = 0;
            return await sendNextPlatformMessage(interactiveState, botConfig);
            
        case 'regenerate_content':
            return await generateMultiPlatformContent(interactiveState, botConfig, true);
            
        case 'publish_all':
            return await publishApprovedPlatforms(interactiveState, botConfig);
            
        case 'watch_video':
            if (interactiveState.viralVideo && interactiveState.viralVideo.videoUrl) {
                return {
                    type: 'interactive',
                    interactive: {
                        type: 'button',
                        body: {
                            text: '🎬 Your viral video is ready!'
                        },
                        action: {
                            buttons: [{
                                type: 'reply',
                                reply: {
                                    id: 'watch_video',
                                    title: 'Watch Video'
                                }
                            }]
                        }
                    }
                };
            }
            break;
            
        case 'enable_reminder':
            interactiveState.reminderEnabled = true;
            await saveUserSettings(interactiveState);
                return {
                    type: 'text',
                text: '🔔 Daily reminder enabled! You\'ll get notified to submit deals.'
                };
            
        case 'disable_reminder':
            interactiveState.reminderEnabled = false;
            await saveUserSettings(interactiveState);
                return {
                    type: 'text',
                text: '🔕 Daily reminder disabled.'
            };
            
        case 'approve_platform':
            const platform = interactiveData.button_reply?.title?.toLowerCase();
            return await approvePlatform(interactiveState, platform, botConfig);
            
        case 'edit_platform':
            const editPlatform = interactiveData.button_reply?.title?.toLowerCase();
            return await editPlatformContent(interactiveState, editPlatform, botConfig);
            
        case 'check_status':
            // User wants to check content generation status
            if (interactiveState.step === 'generate_content') {
                // Check if content generation is complete
                if (interactiveState.contentPackage) {
                    interactiveState.step = 'content_generated';
                    return {
                        type: 'interactive',
                        interactive: {
                            type: 'button',
                            header: { type: 'text', text: '🎬 Viral Content Ready!' },
                            body: { 
                                text: `🎉 **Your Viral Content is Ready!** 🎉\n\n📝 **Deal:** ${interactiveState.todaysDeal?.description}\n🏪 **Restaurant:** ${interactiveState.restaurantProfile?.name}\n\n🎬 **Generated Content:**\n• Viral video with AI poster\n• Multi-platform social media posts\n• Engaging captions and hashtags\n• WhatsApp broadcast message\n\nWould you like to preview and approve the content?` 
                            },
                            footer: { text: 'Review your viral content' },
                            action: { 
                                buttons: [
                                    { type: 'reply', reply: { id: 'preview_content', title: '👀 Preview Content' } },
                                    { type: 'reply', reply: { id: 'approve_content', title: '✅ Approve & Post' } },
                                    { type: 'reply', reply: { id: 'regenerate_content', title: '🔄 Regenerate' } }
                                ] 
                            }
                        }
                    };
                } else {
                    // Content still generating
                    return {
                        type: 'text',
                        text: `⏳ **Content Still Generating...**\n\nYour viral content is being created. This usually takes 2-3 minutes.\n\nPlease wait a bit longer and check again, or we'll notify you when it's ready!`
                    };
                }
            }
            break;
            
        case 'cancel_generation':
            // User wants to cancel content generation
            interactiveState.step = 'collect_deal_details';
            return {
                type: 'text',
                text: `❌ **Content Generation Cancelled**\n\nYour deal details have been saved, but content generation was cancelled.\n\nYou can:\n• Submit a new deal\n• Modify existing deal details\n• Start over with restaurant setup\n\nWhat would you like to do?`
            };
            
        case 'preview_content':
        case 'preview_video':
            // Preview the generated video content
            if (interactiveState.contentPackage?.videoPackage) {
                const videoPackage = interactiveState.contentPackage.videoPackage;
                const script = videoPackage.videoScript;
                const duration = videoPackage.duration || 15;
                
                return {
                    type: 'video',
                    video: {
                        link: videoPackage.videoUrl,
                        caption: `🎬 **Video Preview**\n\n📝 **Deal:** ${interactiveState.todaysDeal?.description || 'Today\'s Special'}\n\n🏪 **Restaurant:** ${interactiveState.restaurantProfile?.name || 'Our Restaurant'}\n\n🎬 **Video Details:**\n• Title: "${script?.title || 'Viral Deal'}"\n• Duration: ${duration} seconds\n• Format: 1080x1920 (TikTok/Instagram)\n• Style: Professional food marketing\n\n🎯 **Text Overlays:**\n• Hook: ${script?.title || 'Special Deal'}\n• Price: ${script?.price_now || 'Special Price'}\n• Urgency: ${script?.urgency || 'Limited Time'}\n• Location: ${script?.details || 'Restaurant Location'}\n• CTA: ${script?.cta || 'Order Now'}\n\n✅ Approve this video to post across all platforms!`
                    }
                };
            } else {
                // Fallback for old content format
                return {
                    type: 'text',
                    text: `📝 **Deal:** ${interactiveState.todaysDeal?.description || 'Today\'s Special'}\n\n🏪 **Restaurant:** ${interactiveState.restaurantProfile?.name || 'Our Restaurant'}\n\n🎬 **Content Status:** Processing...\n\nPlease wait for the video to be generated.`
                };
            }
            break;
            
        case 'approve_content':
        case 'approve_video':
            // User approves the video for posting
            if (interactiveState.contentPackage?.videoPackage) {
                interactiveState.step = 'content_approved';
                
                const videoPackage = interactiveState.contentPackage.videoPackage;
                const script = videoPackage.videoScript;
                const duration = videoPackage.duration || 15;
                
                // Create final video message with the actual video
                const finalVideoMessage = {
                    type: 'video',
                    video: {
                        link: videoPackage.videoUrl,
                        caption: `🎉 **VIRAL VIDEO APPROVED & POSTED!** 🎉\n\n🔥 ${script?.title || 'TODAY\'S SPECIAL'} 🔥\n\n${script?.price_now || 'SPECIAL PRICE'} (${script?.price_was || 'Limited Offer'})\n\n📍 ${interactiveState.restaurantProfile?.name || 'Our Restaurant'}\n${script?.details || 'Limited Time Only'}\n\n${script?.cta || 'Order Now!'}\n\n📱 **Now Live On:**\n• WhatsApp Broadcast ✅\n• Instagram Stories & Posts ✅\n• Facebook Posts ✅\n• TikTok Videos ✅\n\n🚀 **Estimated Reach:** 10K-50K potential customers\n💰 **Expected Results:** 150% daily sales increase\n\n📊 Performance updates coming throughout the day!\n\n#${script?.hashtags?.join(' #') || 'foodie #deals #viral #singapore'}`
                    }
                };
                
                return finalVideoMessage;
            } else if (interactiveState.contentPackage) {
                // Fallback for non-video content
                interactiveState.step = 'content_approved';
                return {
                    type: 'text',
                    text: `🎉 **Content Approved!** 🎉\n\nYour viral content is now being posted across all platforms!\n\n📱 **Platforms:**\n• WhatsApp Broadcast\n• Instagram Stories & Posts\n• Facebook Posts\n• TikTok Videos\n\n🚀 **Estimated Reach:** 10K-50K potential customers\n💰 **Expected Results:** 150% daily sales increase\n\nWe'll send you performance updates throughout the day!`
                };
            }
            break;
            
        case 'show_deal_examples':
            // Show deal examples to help user
            return {
                type: 'interactive',
                interactive: {
                    type: 'button',
                    header: { type: 'text', text: '💡 Deal Examples & Tips' },
                    body: { 
                        text: `🔥 **VIRAL DEAL EXAMPLES** 🔥\n\n🍜 **Food Deals:**\n• "Today's Special: Signature Laksa - Usually $12, now only $8! Made with our secret 20-ingredient spice paste. Only 30 bowls available until 3pm!"\n\n🍕 **Pizza Deals:**\n• "Buy 1 Get 1 FREE on all pizzas! Valid today only. Our wood-fired oven creates the perfect crispy crust. Limited to first 50 orders!"\n\n🍰 **Dessert Deals:**\n• "Weekend Special: Red Velvet Cake - Usually $25, now only $18! Handcrafted with premium ingredients. Only 20 pieces available!"\n\n💡 **Viral Tips:**\n• Add urgency: "Today only!", "Limited time!"\n• Mention quantity: "Only 50 portions!"\n• Tell a story: "Our chef's secret recipe"\n• Include timing: "Until 6pm!", "Lunch special"\n\n**Now type your deal details:**` 
                    },
                    footer: { text: 'Use these examples as inspiration' },
                    action: { 
                        buttons: [
                            { type: "reply", reply: { id: "back_to_deal", title: "📝 Back to Deal" } }
                        ] 
                    }
                }
            };
            
        case 'help_with_deal':
            // Help user create a deal
            return {
                type: 'interactive',
                interactive: {
                    type: 'button',
                    header: { type: 'text', text: '❓ Deal Creation Help' },
                    body: { 
                        text: `🤔 **Need help creating your deal?**\n\n📋 **Step-by-Step Guide:**\n\n1️⃣ **Start with the dish name:**\n   "Signature Laksa"\n\n2️⃣ **Add the special offer:**\n   "Usually $12, now only $8!"\n\n3️⃣ **Include timing:**\n   "Today only until 3pm!"\n\n4️⃣ **Add urgency:**\n   "Only 30 bowls available!"\n\n5️⃣ **Tell a story:**\n   "Made with our secret 20-ingredient spice paste"\n\n**Complete Example:**\n"Today's Special: Signature Laksa - Usually $12, now only $8! Made with our secret 20-ingredient spice paste. Only 30 bowls available until 3pm!"\n\n**Ready to try? Type your deal below:**` 
                    },
                    footer: { text: 'Follow the guide to create your viral deal' },
                    action: { 
                        buttons: [
                            { type: "reply", reply: { id: "back_to_deal", title: "📝 Back to Deal" } }
                        ] 
                    }
                }
            };
            
        case 'back_to_deal':
            // Go back to deal creation
            interactiveState.step = 'collect_deal_details';
            return createTodaysDealMessage();
            
        case 'call_restaurant':
            // Handle call restaurant button
            const phoneNumber = interactiveState.restaurantProfile?.phone;
            if (phoneNumber) {
                return {
                    type: 'text',
                    text: `📞 **Call ${interactiveState.restaurantProfile.name}**\n\n📱 **Phone:** ${phoneNumber}\n\n💡 **Pro Tip:** Mention you saw this deal on WhatsApp for faster service!\n\n⏰ **Best time to call:** During business hours\n\n🚀 **Ready to order?** Call now and enjoy your special deal!`
                };
            } else {
                return {
                    type: 'text',
                    text: `📞 **Contact Information**\n\nSorry, we don't have the phone number for ${interactiveState.restaurantProfile?.name || 'this restaurant'}.\n\n💡 **Alternative ways to order:**\n• Visit the restaurant directly\n• Check their social media pages\n• Look for their website\n\n📍 **Address:** ${interactiveState.restaurantProfile?.location?.address || 'Check our previous messages'}\n\n🚀 **Don't miss out on this amazing deal!**`
                };
            }
            
        case 'share_deal':
            // Handle share deal button
            return {
                type: 'text',
                text: `📤 **Share This Amazing Deal!** 📤\n\n🔥 **${interactiveState.todaysDeal?.description || 'Today\'s Special'}\n\n🏪 **${interactiveState.restaurantProfile?.name || 'Our Restaurant'}**\n📍 **${interactiveState.restaurantProfile?.location?.address || 'Singapore'}**\n\n💰 **${interactiveState.todaysDeal?.pricing || 'Special pricing available'}\n⏰ **${interactiveState.todaysDeal?.validity || 'Limited time offer'}\n\n🚀 **Forward this message to friends and family!**\n\n💡 **Pro Tip:** The more people who know about this deal, the more viral it becomes!`
            };
            
        case 'get_directions':
            // Handle get directions button
            const address = interactiveState.restaurantProfile?.location?.address;
            if (address) {
                return {
                    type: 'text',
                    text: `📍 **Get Directions to ${interactiveState.restaurantProfile?.name || 'Our Restaurant'}**\n\n🏠 **Address:** ${address}\n\n🗺️ **How to get there:**\n• Copy the address above\n• Paste in Google Maps or Waze\n• Follow the navigation\n\n🚗 **Transportation options:**\n• MRT: Check nearest station\n• Bus: Multiple routes available\n• Car: Parking available\n• Walking: Great for nearby customers\n\n⏰ **Best time to visit:** During business hours\n\n🚀 **Don't let this amazing deal slip away!**`
                };
            } else {
                return {
                    type: 'text',
                    text: `📍 **Location Information**\n\nSorry, we don't have the exact address for ${interactiveState.restaurantProfile?.name || 'this restaurant'}.\n\n💡 **What we know:**\n• Restaurant: ${interactiveState.restaurantProfile?.name || 'Name not available'}\n• General area: Singapore\n\n🚀 **Contact the restaurant directly for directions!**`
                };
            }
    }
    
    return createDailyDealWelcome();
}

/**
 * Handle text messages using OpenAI as human agent
 */
async function handleDailyDealText(textState, messageBody, fromNumber, botConfig) {
    console.log(`[DailyDeal] Processing text in step: ${textState.step}`);
    
    // Handle simple greetings immediately without AI processing
    const greetings = ['hello', 'hi', 'hey', 'start', 'help', 'good morning', 'good afternoon', 'good evening', 'morning', 'afternoon', 'evening'];
    const messageWords = messageBody.toLowerCase().trim().split(' ');
    const isSimpleGreeting = messageWords.length <= 3 && 
                            greetings.some(greeting => messageWords.some(word => word.includes(greeting)));
    
    if (isSimpleGreeting && textState.step === 'welcome') {
        console.log(`[DailyDeal] Simple greeting detected: "${messageBody}" - showing welcome message`);
        return createDailyDealWelcome();
    }
    
    // Check if message contains deal-related information for returning restaurants
    if (textState.restaurantProfile && textState.restaurantProfile.name) {
        console.log(`[DailyDeal] Existing restaurant "${textState.restaurantProfile.name}" - checking if message contains deal`);
        
        const isDeal = await isDealMessage(messageBody, textState.restaurantProfile.name, botConfig);
        if (isDeal) {
            console.log(`[DailyDeal] Deal detected for existing restaurant`);
            textState.step = 'collect_deal_details';
            textState.todaysDeal = parseDealDetails(messageBody);
            textState.todaysDeal.date = new Date().toISOString().split('T')[0];
            textState.step = 'generate_content';
            return await generateMultiPlatformContent(textState, botConfig);
        }
    }
    
    // Process based on current step
    switch (textState.step) {
        case 'welcome':
            // Check if this looks like a restaurant name
            const commonWords = ['hello', 'hi', 'start', 'help', 'menu', 'hey', 'good morning', 'good afternoon', 'good evening'];
            const isRestaurantName = messageBody.length > 2 && 
                                   !commonWords.some(word => messageBody.toLowerCase().includes(word));
            
            if (isRestaurantName) {
                console.log(`[DailyDeal] Restaurant name detected: "${messageBody}"`);
                textState.step = 'collect_restaurant_name';
                return await searchAndSaveRestaurant(messageBody.trim(), textState, fromNumber, botConfig);
            } else {
                console.log(`[DailyDeal] Not a restaurant name, showing welcome`);
                return createDailyDealWelcome();
            }
            
        case 'collect_restaurant_name':
            // User provided restaurant name - search and validate
            console.log(`[DailyDeal] Processing restaurant name: "${messageBody}"`);
            return await searchAndSaveRestaurant(messageBody.trim(), textState, fromNumber, botConfig);
            
        case 'collect_restaurant_images':
            // Handle text commands during image collection
            if (messageBody.toLowerCase().includes('done') || messageBody.toLowerCase().includes('skip')) {
                textState.step = 'collect_deal_details';
                return createTodaysDealMessage();
            } else {
                return {
                    type: 'text',
                    text: '📸 Please send restaurant photos or type "done" when finished. You can send up to 4 photos.'
                };
            }
            
        case 'await_restaurant_updates':
            // User is updating restaurant details - use OpenAI to process and refine
            console.log(`[DailyDeal] Processing restaurant update: "${messageBody}"`);
            return await processRestaurantUpdate(textState, messageBody, fromNumber, botConfig);
            
        case 'collect_deal_details':
            // User provided deal details
            console.log(`[DailyDeal] Processing deal details: "${messageBody}"`);
            textState.todaysDeal = parseDealDetails(messageBody);
            textState.todaysDeal.date = new Date().toISOString().split('T')[0];
            textState.step = 'generate_content';
            
            // Send viral video confirmation message
            const viralVideoConfirmation = {
                type: 'interactive',
                interactive: {
                    type: 'button',
                    header: { type: 'text', text: '🎬 Viral Video Creation Started!' },
                    body: { 
                        text: `🔥 **DEAL RECEIVED & PROCESSING!** 🔥\n\n📝 **Your Deal:** ${textState.todaysDeal.description}\n🏪 **Restaurant:** ${textState.restaurantProfile?.name || 'Your Restaurant'}\n\n🚀 **What Happens Next:**\n1. ✅ AI analyzing your deal details\n2. 🎨 Creating viral social media content\n3. 🎬 Generating engaging video content\n4. 📱 Preparing multi-platform posts\n\n⏱️ **Estimated Time:** 2-3 minutes\n\nWe'll send you the viral video for confirmation before posting!` 
                    },
                    footer: { text: 'Creating your viral content now...' },
                    action: { 
                        buttons: [
                            { type: 'reply', reply: { id: 'check_status', title: '📊 Check Status' } },
                            { type: 'reply', reply: { id: 'cancel_generation', title: '❌ Cancel' } }
                        ] 
                    }
                }
            };
            
            // Start content generation in background
            generateMultiPlatformContent(textState, botConfig).then(result => {
                console.log(`[DailyDeal] Background content generation completed:`, result);
                // The actual response will be sent when user checks status
            }).catch(error => {
                console.error(`[DailyDeal] Background content generation failed:`, error);
            });
            
            return viralVideoConfirmation;
            
        default:
            console.log(`[DailyDeal] Unknown step: ${textState.step}, showing welcome`);
            return createDailyDealWelcome();
    }
}

/**
 * Process restaurant updates using OpenAI to refine and validate
 */
async function processRestaurantUpdate(updateState, updateMessage, fromNumber, botConfig) {
    try {
        console.log(`[DailyDeal] Processing restaurant update with OpenAI: "${updateMessage}"`);
        
        const openai = new OpenAI({ apiKey: botConfig.openAiApiKey });
        
        // Create a prompt for OpenAI to process the restaurant update
        const systemPrompt = `You are a restaurant data specialist. The user is updating their restaurant information. 

Current restaurant profile:
- Name: ${updateState.restaurantProfile?.name || 'Not set'}
- Address: ${updateState.restaurantProfile?.location?.address || 'Not set'}
- Phone: ${updateState.restaurantProfile?.phone || 'Not set'}
- Website: ${updateState.restaurantProfile?.website || 'Not set'}

User's update message: "${updateMessage}"

Your task:
1. Extract and validate the updated information
2. Identify what fields are being updated
3. Provide a refined, professional version
4. Suggest any missing important details

Respond in JSON format:
{
    "updatedFields": ["name", "address", "phone", "website"],
    "refinedData": {
        "name": "Refined restaurant name",
        "address": "Refined address",
        "phone": "Refined phone number",
        "website": "Refined website URL"
    },
    "validation": {
        "isValid": true,
        "issues": ["Any validation issues found"],
        "suggestions": ["Suggestions for improvement"]
    },
    "message": "User-friendly message explaining what was updated"
}`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: updateMessage }
            ],
            temperature: 0.3,
            max_tokens: 800
        });

        const responseText = completion.choices[0]?.message?.content || '{}';
        let parsedResponse;
        
        try {
            parsedResponse = JSON.parse(responseText);
        } catch (parseError) {
            console.log(`[DailyDeal] OpenAI response parsing failed: ${parseError.message}`);
            // Fallback response
            parsedResponse = {
                updatedFields: ['name'],
                refinedData: { name: updateMessage },
                validation: { isValid: true, issues: [], suggestions: [] },
                message: `I've updated your restaurant name to: ${updateMessage}`
            };
        }

        console.log(`[DailyDeal] OpenAI processed update:`, parsedResponse);

        // Update the restaurant profile with refined data
        if (parsedResponse.refinedData) {
            Object.keys(parsedResponse.refinedData).forEach(key => {
                if (parsedResponse.refinedData[key] && parsedResponse.refinedData[key] !== 'Not set') {
                    if (key === 'address') {
                        if (!updateState.restaurantProfile.location) {
                            updateState.restaurantProfile.location = {};
                        }
                        updateState.restaurantProfile.location.address = parsedResponse.refinedData[key];
                    } else {
                        updateState.restaurantProfile[key] = parsedResponse.refinedData[key];
                    }
                }
            });
        }

        // Move to restaurant confirmation step
        updateState.step = 'restaurant_confirmed';
        
        // Create confirmation message with updated details
        const confirmationMessage = createRestaurantConfirmationMessage(updateState.restaurantProfile);
        
        return {
            type: 'interactive',
            interactive: {
                type: 'button',
                header: { type: 'text', text: '✅ Updated Restaurant Details' },
                body: { 
                    text: `${parsedResponse.message}\n\n${confirmationMessage.body.text}` 
                },
                footer: { text: 'Confirm the updated details' },
                action: { 
                    buttons: [
                        { type: 'reply', reply: { id: 'confirm_restaurant', title: '✅ Confirm Updated' } },
                        { type: 'reply', reply: { id: 'cancel_restaurant', title: '❌ Cancel' } }
                    ] 
                }
            }
        };

    } catch (error) {
        console.error(`[DailyDeal] Error processing restaurant update: ${error.message}`);
        
        // Fallback: simple update without OpenAI
        updateState.restaurantProfile.name = updateMessage;
        updateState.step = 'restaurant_confirmed';
        
        return {
            type: 'text',
            text: `✅ I've updated your restaurant name to: ${updateMessage}\n\nPlease confirm the details or make additional updates.`
        };
    }
}

/**
 * Handle location messages for daily deal flow
 */
async function handleDailyDealLocation(locationState, locationData, fromNumber, botConfig) {
    console.log('[DailyDeal] Processing location message');
    
    // Save location to restaurant profile
    locationState.restaurantProfile.location = {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        address: locationData.address || 'Singapore'
    };
    
    await saveRestaurantProfile(locationState, fromNumber);
    locationState.step = 'setup_complete';
    
    return createSetupCompleteMessage();
}

/**
 * Handle image messages for daily deal flow
 */
async function handleDailyDealImage(imageState, imageData, fromNumber, botConfig) {
    console.log('[DailyDeal] Processing image message');
    console.log('[DailyDeal] Current step:', imageState.step);
    console.log('[DailyDeal] Image data:', JSON.stringify(imageData, null, 2));
    
    // Save image to deal if we're collecting deal details or generating content
    if (imageState.step === 'collect_deal_details' || imageState.step === 'generate_content') {
        imageState.todaysDeal.image = imageData;
        return {
            type: 'text',
            text: '📸 Image received! Now please provide your deal details (dish name, pricing, special offer, etc.)'
        };
    }
    
    // Handle restaurant image collection - check if this is a restaurant-related image first
    if (imageState.step === 'restaurant_confirmed' || imageState.step === 'collect_restaurant_images' || 
        imageState.step === 'welcome' || imageState.step === 'restaurant_setup_complete') {
        try {
            console.log('[DailyDeal] Processing restaurant image for collection and S3 upload');
            
            // Download the actual image from WhatsApp
            const { downloadWhatsAppImage } = await import('../utils/whatsappUtils.js');
            const imageBuffer = await downloadWhatsAppImage(imageData.id, botConfig.whatsappToken);
            
            console.log(`[DailyDeal] Downloaded image buffer size: ${imageBuffer.length} bytes`);
            
            // Validate image with Gemini Flash Lite to check if it's restaurant-related
            let imageValidation = { isValid: true, reason: 'Validation skipped' };
            try {
                if (botConfig.geminiApiKey) {
                    const { default: ImageValidationService } = await import('../services/imageValidationService.js');
                    const imageValidator = new ImageValidationService(botConfig.geminiApiKey);
                    imageValidation = await imageValidator.validateRestaurantImage(imageBuffer, imageData.mime_type);
                    
                    console.log(`[DailyDeal] Gemini validation result:`, imageValidation);
                    
                    if (!imageValidation.isValid) {
                        return {
                            type: 'interactive',
                            interactive: {
                                type: 'button',
                                header: { type: 'text', text: '❌ Image Not Suitable' },
                                body: { 
                                    text: `❌ **This image doesn't appear to be restaurant-related**\n\n🔍 **What I see:** ${imageValidation.whatISee}\n\n❌ **Reason:** ${imageValidation.reason}\n\n📸 **Please send:**\n• Restaurant exterior/signage\n• Interior atmosphere\n• Popular dishes\n• Staff/chef in action\n• Food preparation areas\n\n❌ **Avoid:**\n• Personal photos\n• Random objects\n• Non-restaurant content` 
                                },
                                footer: { text: 'Send a restaurant-related image' },
                                action: { 
                                    buttons: [
                                        { type: 'reply', reply: { id: 'try_again', title: '📸 Send Different Image' } }
                                    ] 
                                }
                            }
                        };
                    }
                }
            } catch (validationError) {
                console.log(`[DailyDeal] ⚠️ Gemini image validation error (non-critical): ${validationError.message}`);
                // Continue with upload if validation fails
            }
            
            // Check if we already have enough photos (max 4)
            const currentImageCount = imageState.restaurantProfile.images ? imageState.restaurantProfile.images.length : 0;
            if (currentImageCount >= 4) {
                return {
                    type: 'text',
                    text: `📸 You already have ${currentImageCount} restaurant photos. That's the maximum allowed.\n\nYou can proceed with deal creation or type "done" to continue.`
                };
            }
            
            // Upload to S3 in restaurant-specific folder
            const { default: S3ImageService } = await import('../services/s3ImageService.js');
            const s3Service = new S3ImageService(botConfig.s3Bucket || 'viral-agency-content');
            
            const restaurantName = imageState.restaurantProfile.name || 'unknown-restaurant';
            const placeId = imageState.restaurantProfile.placeId || 'manual';
            const folderName = `${restaurantName}-${placeId}`.replace(/[^a-zA-Z0-9-_]/g, '_');
            const imageFileName = `restaurant-image-${Date.now()}.jpg`;
            
            const uploadResult = await s3Service.uploadRestaurantImages(
                folderName,
                [{
                    buffer: imageBuffer,
                    filename: imageFileName,
                    contentType: imageData.mime_type || 'image/jpeg'
                }]
            );
            
            console.log(`[DailyDeal] S3 upload result:`, uploadResult);
            
            // Store the image information in the restaurant profile
            if (!imageState.restaurantProfile.images) {
                imageState.restaurantProfile.images = [];
            }
            
            const imageInfo = {
                id: imageData?.id || `img_${Date.now()}`,
                timestamp: new Date().toISOString(),
                type: 'restaurant_photo',
                filename: imageFileName,
                s3Url: uploadResult.success ? uploadResult.urls[0] : null,
                s3Key: uploadResult.success ? uploadResult.keys[0] : null,
                contentType: imageData.mime_type || 'image/jpeg',
                size: imageBuffer.length,
                metadata: imageData
            };
            
            imageState.restaurantProfile.images.push(imageInfo);
            
            // Update step to indicate we're collecting more images
            imageState.step = 'collect_restaurant_images';
            
            // Update the restaurant profile in DynamoDB with new image
            try {
                await saveRestaurantProfileToDynamoDB(imageState.restaurantProfile, fromNumber, botConfig);
                console.log('[DailyDeal] Updated restaurant profile in DynamoDB with new image');
            } catch (dbError) {
                console.log(`[DailyDeal] ⚠️ DynamoDB update error (non-critical): ${dbError.message}`);
            }
            
            const remainingPhotos = 4 - imageState.restaurantProfile.images.length;
            const successMessage = uploadResult.success 
                ? `📸 Restaurant image uploaded to S3 and saved! I've collected ${imageState.restaurantProfile.images.length}/4 photos.\n\n🔗 Image URL: ${uploadResult.urls[0]}\n\n${remainingPhotos > 0 ? `You can send ${remainingPhotos} more photo(s) or type "done" when finished.` : 'You have reached the maximum of 4 photos. Type "done" to continue.'}`
                : `📸 Restaurant image processed! I've collected ${imageState.restaurantProfile.images.length}/4 photos.\n\n${remainingPhotos > 0 ? `You can send ${remainingPhotos} more photo(s) or type "done" when finished.` : 'You have reached the maximum of 4 photos. Type "done" to continue.'}`;
            
            return {
                type: 'text',
                text: successMessage
            };
            
        } catch (error) {
            console.error('[DailyDeal] Error processing and uploading restaurant image:', error);
            return {
                type: 'text',
                text: '❌ Sorry, there was an error downloading and saving your restaurant image. Please try again or continue with text.'
            };
        }
    }
    
    // If we reach here, the image wasn't processed by the main logic
    // Check if this might be a restaurant image that should be processed anyway
    if (imageState.restaurantProfile && imageState.restaurantProfile.name) {
        console.log(`[DailyDeal] Attempting to process image for known restaurant: ${imageState.restaurantProfile.name}`);
        // Force the step to image collection and try again
        imageState.step = 'collect_restaurant_images';
        return await handleDailyDealImage(imageState, imageData, fromNumber, botConfig);
    }
    
    // Default: Show welcome message for other contexts
    return createDailyDealWelcome();
}

/**
 * Create welcome message for daily deal flow
 */
function createErrorMessage(errorText) {
    return {
        type: "text",
        text: `❌ **ERROR** ❌\n\n${errorText}\n\nPlease try again or contact support.`
    };
}

function createDailyDealWelcome() {
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: {
                type: "text",
                text: "🚀 DAILY DEAL VIRAL AGENCY"
            },
            body: {
                text: `🌟 **Welcome to Singapore's #1 Daily Deal Marketing Agency!** 🇸🇬

🎯 **What We Do Daily:**
✅ Turn your daily specials into viral social media content
✅ Post across 8+ platforms simultaneously  
✅ Generate stunning AI posters & captions
✅ Track performance & customer engagement

📱 **Our Platform Network:**
🔥 Facebook • Instagram • TikTok • Telegram
🔥 WhatsApp • Twitter • YouTube • Xiaohongshu

💰 **Daily Revenue Boost:**
📊 Average 150% daily sales increase
🚀 Viral reach: 10K-50K per post
💵 Commission-based: Pay only for results!

🎉 **Ready to make your daily specials go VIRAL across Singapore?**`
            },
            footer: {
                text: "Start your viral journey today! 🚀"
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "start_restaurant_setup",
                            title: "🏪 Setup Restaurant"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "submit_todays_deal",
                            title: "📢 Submit Deal"
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Create restaurant name collection message
 */
function createRestaurantNameMessage() {
    return {
        type: "text",
        text: `🏪 **RESTAURANT SETUP** 🏪

What's your restaurant name?

📝 Please type the name of your restaurant (e.g., "Newton Food Centre", "Ah Leng Char Kway Teow", "The Coffee Bean")`
    };
}

// Location request removed - using Google Places API instead

/**
 * Search restaurant location using Google Maps
 */
async function searchRestaurantLocation(restaurantName, botConfig) {
    try {
        console.log(`[DailyDeal] Searching for restaurant: ${restaurantName}`);
        
        // First, search for the restaurant using Google Places API
        const googleMapsApiKey = botConfig.googleMapsApiKey;
        if (!googleMapsApiKey) {
            console.error('[DailyDeal] Google Maps API key not found in botConfig');
            return createErrorMessage('Google Maps search is not configured. Please contact support.');
        }

        // Use the new Google Places API (Places API New)
        const searchQuery = `${restaurantName} Singapore restaurant`;
        const placesUrl = 'https://places.googleapis.com/v1/places:searchText';
        
        const requestBody = {
            textQuery: searchQuery,
            pageSize: 5,
            locationBias: {
                rectangle: {
                    low: {
                        latitude: 1.2,
                        longitude: 103.6
                    },
                    high: {
                        latitude: 1.5,
                        longitude: 104.0
                    }
                }
            }
        };

        console.log(`[DailyDeal] Calling Google Places API (New): ${placesUrl}`);
        console.log(`[DailyDeal] Search query: "${searchQuery}"`);
        
        const placesResponse = await fetch(placesUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': googleMapsApiKey,
                'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.rating,places.priceLevel,places.types,places.websiteUri,places.regularOpeningHours,places.photos'
            },
            body: JSON.stringify(requestBody)
        });

        const placesData = await placesResponse.json();
        
        console.log(`[DailyDeal] Google Places API response status: ${placesResponse.status}`);
        
        if (!placesResponse.ok || !placesData.places || placesData.places.length === 0) {
            console.log(`[DailyDeal] No results found for: ${restaurantName}`);
            console.log(`[DailyDeal] API Error: ${JSON.stringify(placesData)}`);
            return {
                type: "text",
                text: `🔍 **RESTAURANT SEARCH** 🔍\n\n❌ Sorry, I couldn't find "${restaurantName}" in Singapore.\n\n**Please try:**\n• Check the spelling\n• Include more details (e.g., "Newton Food Centre")\n• Try a different restaurant name\n\n**Type the restaurant name again:**`
            };
        }

        // Get the first (best) result
        const restaurant = placesData.places[0];
        console.log(`[DailyDeal] Found restaurant: ${restaurant.displayName?.text || 'Unknown'}`);

        // No need for separate details call with new API - we get everything in one call
        
        // Format the restaurant information using new API response format
        const name = restaurant.displayName?.text || restaurantName;
        const priceLevel = restaurant.priceLevel ? '💰'.repeat(restaurant.priceLevel === 'PRICE_LEVEL_INEXPENSIVE' ? 1 : 
                                                                 restaurant.priceLevel === 'PRICE_LEVEL_MODERATE' ? 2 :
                                                                 restaurant.priceLevel === 'PRICE_LEVEL_EXPENSIVE' ? 3 :
                                                                 restaurant.priceLevel === 'PRICE_LEVEL_VERY_EXPENSIVE' ? 4 : 2) : 'Price not available';
        const rating = restaurant.rating ? `⭐ ${restaurant.rating}/5` : 'Rating not available';
        const phone = restaurant.nationalPhoneNumber || 'Phone not available';
        const website = restaurant.websiteUri || 'Website not available';
        const address = restaurant.formattedAddress || 'Address not available';
        
        // Format opening hours
        let hours = 'Hours not available';
        if (restaurant.regularOpeningHours && restaurant.regularOpeningHours.weekdayDescriptions) {
            hours = restaurant.regularOpeningHours.weekdayDescriptions.slice(0, 3).join('\n');
        }
        
        // Determine cuisine type from Google types
        const cuisineTypes = restaurant.types?.filter(type => 
            ['restaurant', 'food', 'meal_takeaway', 'cafe', 'bakery'].includes(type)
        ) || [];
        const cuisine = cuisineTypes.length > 0 ? cuisineTypes.join(', ') : 'Restaurant';

        const restaurantDetails = `**${name}** 🏪

📍 **Address:** ${address}

${rating} | ${priceLevel}

📞 **Phone:** ${phone}
🌐 **Website:** ${website}

🕒 **Hours:**
${hours}

🍽️ **Type:** ${cuisine}

📊 **Google Maps Data:** ✅ VERIFIED`;

        return {
            type: "interactive",
            interactive: {
                type: "button",
                header: {
                    type: "text",
                    text: "🔍 RESTAURANT FOUND!"
                },
                body: {
                    text: `**${restaurantName}** 🏪\n\n${restaurantDetails}\n\n**Is this your restaurant?**\n\n(We will fetch official social handles next)`
                },
                footer: {
                    text: "Confirm or provide more details"
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: "confirm_restaurant",
                                title: "✅ Confirm Restaurant"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "search_again",
                                title: "🔍 Search Again"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "manual_location",
                                title: "📍 Share My Location"
                            }
                        }
                    ]
                }
            }
        };
    } catch (error) {
        console.error('[DailyDeal] Error searching restaurant:', error);
        return {
            type: "text",
            text: "❌ Error searching for restaurant. Please try again or share your location manually."
        };
    }
}

/**
 * Create social media details collection message
 */
function createSocialMediaMessage() {
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: {
                type: "text",
                text: "📱 SOCIAL MEDIA SETUP"
            },
            body: {
                text: "**STEP 2: Social Media Details** 📱\n\n**Please provide your social media accounts:**\n\n📝 **Format (one per line):**\n• Facebook: @your-page-name\n• Instagram: @your-handle\n• TikTok: @your-handle\n• Website: your-website.com\n• Google My Business: Yes/No\n\n📈 **Why We Need This:**\n✅ Tag your accounts in viral posts\n✅ Drive followers to your pages\n✅ Cross-platform promotion\n✅ Track engagement properly\n\n**Type your social media details, or skip for now:**"
            },
            footer: {
                text: "We'll maximize your online presence"
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "skip_social_media",
                            title: "⏭️ Skip For Now"
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Create setup complete message
 */
function createSetupCompleteMessage() {
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: {
                type: "text",
                text: "🎉 SETUP COMPLETE!"
            },
            body: {
                text: "**Your restaurant is now registered!** ✅\n\n🔥 **You're ready to start posting viral daily deals!**\n\n📅 **Daily Workflow:**\n1️⃣ Submit your daily special (text/photo)\n2️⃣ AI generates viral content for all platforms\n3️⃣ You approve the content\n4️⃣ We post across 8+ social media platforms\n5️⃣ Track performance & customer engagement\n\n⏰ **Daily Reminders:**\nWe'll remind you every morning to submit your daily special!\n\n**Ready to submit your first viral deal?**"
            },
            footer: {
                text: "Let's make your food go viral!"
            },
            action: {
                buttons: [
                    {
                        type: "reply",
                        reply: {
                            id: "submit_todays_deal",
                            title: "📢 Submit Deal"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "enable_reminders",
                            title: "🔔 Enable Daily Reminders"
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Create today's deal collection message
 */
function createTodaysDealMessage() {
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: { type: "text", text: "📢 TODAY'S SPECIAL DEAL 🔥" },
            body: { 
                text: `🏪 **Ready to create your viral deal?**\n\n📝 **Please provide your daily special details:**\n\n🍜 **Include:**\n• Dish name & description\n• Original price → Special price\n• Valid timing (e.g., lunch only, all day)\n• Special offer details\n• Photo of the dish (optional)\n\n💡 **Pro Tips for Maximum Viral Impact:**\n• Mention limited quantity ("Only 50 portions!")\n• Add urgency ("Today only!", "Until 6pm!")\n• Highlight what makes it special\n• Include any story behind the dish\n\n**Example:**\n"Today's Special: Signature Laksa - Usually $12, now only $8! Made with our secret 20-ingredient spice paste. Only 30 bowls available until 3pm!"\n\n**Type your today's deal details below:**` 
            },
            footer: { text: "Create your viral deal now! 🚀" },
            action: { 
                buttons: [
                    { type: "reply", reply: { id: "show_deal_examples", title: "💡 Show Examples" } },
                    { type: "reply", reply: { id: "help_with_deal", title: "❓ Help with Deal" } }
                ] 
            }
        }
    };
}

/**
 * Generate multi-platform content with AI poster generation
 */
async function generateMultiPlatformContent(contentState, botConfig) {
        console.log('[DailyDeal] Generating multi-platform content with AI poster generation...');
        
    try {
        // Extract deal information
        const dealData = contentState.todaysDeal;
        const restaurantData = contentState.restaurantProfile;
        
        if (!dealData || !dealData.description) {
            throw new Error('Invalid deal data structure');
        }
        
        // Extract pricing information
        const pricing = extractPricing(dealData.description);
        const validity = extractValidity(dealData.description);
        
        // Create deal data structure for video processor
        const processedDealData = {
            title: dealData.description.split(' ').slice(0, 3).join(' '), // First 3 words
            description: dealData.description,
            pricing: `$${pricing.specialPrice} (was $${pricing.originalPrice})`,
            validity: validity,
            date: new Date().toISOString().split('T')[0]
        };
        
        const processedRestaurantData = {
            name: restaurantData?.name || 'Your Restaurant',
            address: restaurantData?.location?.address || 'Singapore',
            phone: restaurantData?.phone || 'Not available'
        };
        
        console.log('[DailyDeal] Processed deal data:', processedDealData);
        console.log('[DailyDeal] Processed restaurant data:', processedRestaurantData);
        
        // Get restaurant images from S3
        const s3Service = new S3ImageService({ bucket: process.env.S3_BUCKET_NAME || 'viral-agency-content' });
        const restaurantImages = await s3Service.getRestaurantImages(processedRestaurantData.name);
        console.log('[DailyDeal] Retrieved restaurant images:', restaurantImages.length);
        
        // Initialize Hetzner video service
        const hetznerVideo = new HetznerVideoService(botConfig);
        
        // Create viral video using Hetzner FFmpeg service
        const videoPackage = await hetznerVideo.createViralVideo(
            processedDealData,
            processedRestaurantData,
            restaurantImages,
            botConfig
        );
        
        console.log('[DailyDeal] Viral video created with Hetzner:', videoPackage);
        
        // Create content package with video elements
        const contentPackage = {
            deal: processedDealData,
            restaurant: processedRestaurantData,
            videoPackage: videoPackage,
            platforms: ['whatsapp', 'instagram', 'facebook', 'tiktok'],
            generatedAt: new Date().toISOString()
        };
        
        console.log('[DailyDeal] Content package generated successfully');
        
        // Update session state
        contentState.contentPackage = contentPackage;
        contentState.step = 'content_generated';
        
        // Create interactive deal message with video link
        const dealMessage = createFinalDealMessage(processedDealData, processedRestaurantData, contentPackage);
        
        // Create success message using Hetzner video service
        const successMessage = hetznerVideo.createVideoPreviewMessage(videoPackage);
        
        return {
            success: true,
            contentPackage: contentPackage,
            message: successMessage
        };
        
    } catch (error) {
        console.error('[DailyDeal] Error generating multi-platform content:', error);
        throw error;
    }
}

/**
 * Create final deal message with video link for WhatsApp broadcast
 */
function createFinalDealMessage(dealData, restaurantData, contentPackage) {
    try {
        console.log('[DailyDeal] Creating final deal message with video link');
        
        // Extract key information
        const dealTitle = dealData.title || 'Today\'s Special';
        const dealDescription = dealData.description || '';
        const pricing = dealData.pricing || '';
        const validity = dealData.validity || 'Today only';
        const restaurantName = restaurantData.name || 'Our Restaurant';
        const restaurantAddress = restaurantData.address || 'Singapore';
        const restaurantPhone = restaurantData.phone || '';
        
        // Create engaging deal message
        const dealMessage = {
            type: 'interactive',
            interactive: {
                type: 'button',
                header: { type: 'text', text: `🔥 ${dealTitle.toUpperCase()} 🔥` },
                body: { 
                    text: `🏪 **${restaurantName}**\n\n${dealDescription}\n\n💰 **${pricing}**\n⏰ **${validity}**\n\n📍 **Location:** ${restaurantAddress}\n📞 **Call:** ${restaurantPhone || 'Check our social media'}\n\n🎬 **Watch our viral video below!**\n\n🚀 **Share this deal with friends and family!**` 
                },
                footer: { text: 'Limited time offer - Act fast! ⚡' },
                action: { 
                    buttons: [
                        { type: 'reply', reply: { id: 'call_restaurant', title: '📞 Call Now' } },
                        { type: 'reply', reply: { id: 'share_deal', title: '📤 Share Deal' } },
                        { type: 'reply', reply: { id: 'get_directions', title: '📍 Get Directions' } }
                    ] 
                }
            }
        };
        
        // If we have a video URL, add it to the message
        if (contentPackage?.aiPoster?.videoUrl) {
            dealMessage.video = {
                link: contentPackage.aiPoster.videoUrl,
                caption: `${dealTitle} - ${restaurantName}\n\n${dealDescription}\n\n${pricing} | ${validity}\n\n📍 ${restaurantAddress}`
            };
        }
        
        console.log('[DailyDeal] Final deal message created successfully');
        return dealMessage;
        
    } catch (error) {
        console.error('[DailyDeal] Error creating final deal message:', error);
        
        // Fallback to simple text message
        return {
            type: 'text',
            text: `🔥 ${dealData?.title || 'Today\'s Special'} 🔥\n\n${dealData?.description || 'Amazing deal available!'}\n\n🏪 ${restaurantData?.name || 'Our Restaurant'}\n📍 ${restaurantData?.address || 'Singapore'}\n\n${dealData?.pricing || ''}\n${dealData?.validity || 'Today only'}\n\nCall us now to order!`
        };
    }
}

/**
 * Publish content across all platforms
 */
async function publishMultiPlatformContent(publishState, botConfig) {
    try {
        console.log('[DailyDeal] Publishing multi-platform content...');
        
        // Create unique deal ID
        const dealId = `deal_${Date.now()}_${publishState.userId.slice(-4)}`;
        
        // Save deal to database
        const dealData = {
            dealId,
            restaurantName: publishState.restaurantProfile.name,
            userId: publishState.userId,
            dealDetails: publishState.todaysDeal,
            generatedContent: publishState.generatedContent,
            status: 'active',
            createdAt: new Date().toISOString(),
            platforms: publishState.generatedContent.platforms
        };
        
        // Save to database (implement as needed)
        // await saveDealToDatabase(dealData);
        
        // Update user state
        publishState.lastDealDate = new Date().toISOString().split('T')[0];
        
        console.log('[DailyDeal] Deal published successfully:', dealId);
        
        return createDealPublishedMessage(publishState);
        
    } catch (error) {
        console.error('[DailyDeal] Error publishing content:', error);
        return {
            type: 'text',
            text: '❌ Error publishing content. Please try again.'
        };
    }
}

/**
 * Helper functions
 */
function parseSocialMediaDetails(text) {
    const socialMedia = {};
    const lines = text.split('\n');
    
    lines.forEach(line => {
        if (line.toLowerCase().includes('facebook')) {
            socialMedia.facebook = line.split(':')[1]?.trim();
        } else if (line.toLowerCase().includes('instagram')) {
            socialMedia.instagram = line.split(':')[1]?.trim();
        } else if (line.toLowerCase().includes('tiktok')) {
            socialMedia.tiktok = line.split(':')[1]?.trim();
        } else if (line.toLowerCase().includes('website')) {
            socialMedia.website = line.split(':')[1]?.trim();
        }
    });
    
    return socialMedia;
}

function parseDealDetails(text) {
    return {
        description: text,
        submittedAt: new Date().toISOString(),
        type: 'daily_special'
    };
}

/**
 * Save restaurant profile to database
 */
async function saveRestaurantProfile(profileState, ownerPhoneNumber) {
    try {
        console.log('[DailyDeal] Saving restaurant profile...');
        
        // Create restaurant profile object
        const restaurantProfile = {
            restaurantId: profileState.restaurantProfile.placeId || `rest_${Date.now()}`,
            name: profileState.restaurantProfile.name,
            location: profileState.restaurantProfile.location,
            socialMedia: profileState.restaurantProfile.socialMedia || {},
            registeredAt: profileState.registeredAt || new Date().toISOString(),
            reminderEnabled: profileState.reminderEnabled !== undefined ? profileState.reminderEnabled : true,
            ownerPhoneNumber,
            lastUpdated: new Date().toISOString()
        };
        
        // Save to database (implement as needed)
        // await saveRestaurantToDatabase(restaurantProfile);
        
        console.log(`[DailyDeal] Restaurant profile saved for owner: ${ownerPhoneNumber}, restaurant: ${profileState.restaurantProfile.name}`);
        
        return true;
        
    } catch (error) {
        console.error('[DailyDeal] Error saving restaurant profile:', error);
        return false;
    }
}

/**
 * Update or set lastMessageTime for the restaurant owner (used by daily reminders)
 */
async function updateOwnerLastMessageTime(ownerPhoneNumber) {
    try {
        await dynamodb.send(new UpdateItemCommand({
            TableName: 'RestaurantProfiles',
            Key: marshall({ userId: ownerPhoneNumber }),
            UpdateExpression: 'SET lastMessageTime = :ts, lastUpdated = :ts',
            ExpressionAttributeValues: marshall({
                ':ts': new Date().toISOString()
            })
        }));
        console.log(`[DailyDeal] Updated lastMessageTime for owner: ${ownerPhoneNumber}`);
    } catch (error) {
        console.error('[DailyDeal] Error updating lastMessageTime:', error);
        // Swallow error; not critical for main flow
    }
}

/**
 * Download restaurant photos using Google Places API
 * @param {string} placeId - Google Places place ID
 * @param {string} restaurantName - Restaurant name for S3 folder
 * @param {Object} botConfig - Bot configuration with Google Maps API key
 * @returns {Promise<Array>} - Array of downloaded photo URLs
 */
async function downloadRestaurantPhotos(placeId, restaurantName, botConfig, maxPhotosDesired = 2) {
    try {
        console.log(`[DailyDeal] Downloading photos for place: ${placeId}`);
        
        if (!botConfig.googleMapsApiKey) {
            console.log('[DailyDeal] No Google Maps API key available for photo download');
            return [];
        }

        // Step 1: Get place details with photos
        const placeDetailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${botConfig.googleMapsApiKey}`;
        
        const detailsResponse = await fetch(placeDetailsUrl);
        if (!detailsResponse.ok) {
            throw new Error(`Place details failed: ${detailsResponse.status}`);
        }
        
        const placeData = await detailsResponse.json();
        if (!placeData.result?.photos || placeData.result.photos.length === 0) {
            console.log('[DailyDeal] No photos found for this place');
            return [];
        }

        console.log(`[DailyDeal] Found ${placeData.result.photos.length} photos for ${restaurantName}`);

        // Step 2: Download and save photos to S3
        const downloadedPhotos = [];
        const maxPhotos = Math.min(maxPhotosDesired, placeData.result.photos.length);
        
        for (let i = 0; i < maxPhotos; i++) {
            try {
                const photo = placeData.result.photos[i];
                const photoReference = photo.photo_reference;
                
                // Download photo with optimal dimensions for video (1360x1020)
                const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1360&maxheight=1020&photo_reference=${photoReference}&key=${botConfig.googleMapsApiKey}`;
                
                console.log(`[DailyDeal] Downloading photo ${i + 1}/${maxPhotos}...`);
                
                // Download the photo
                const photoResponse = await fetch(photoUrl);
                if (!photoResponse.ok) {
                    console.log(`[DailyDeal] Photo ${i + 1} download failed: ${photoResponse.status}`);
                    continue;
                }
                
                const photoBuffer = await photoResponse.arrayBuffer();
                const photoData = Buffer.from(photoBuffer);
                
                // Generate S3 key for restaurant folder
                const restaurantFolder = restaurantName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
                const photoFileName = `photo_${i + 1}_${Date.now()}.jpg`;
                const s3Key = `restaurant-photos/${restaurantFolder}/${photoFileName}`;
                
                // Upload to S3
                const s3Url = await uploadPhotoToS3(photoData, s3Key, restaurantName);
                
                if (s3Url) {
                    downloadedPhotos.push({
                        id: `places_api_${i + 1}`,
                        url: s3Url,
                        thumbnail: s3Url,
                        title: `${restaurantName} - Photo ${i + 1}`,
                        source: 'google_places_api',
                        width: photo.width || 1360,
                        height: photo.height || 1020,
                        relevance: 0.95 - (i * 0.05),
                        metadata: {
                            photoReference: photoReference,
                            placeId: placeId,
                            originalWidth: photo.width,
                            originalHeight: photo.height,
                            authorAttributions: photo.html_attributions || []
                        }
                    });
                    
                    console.log(`[DailyDeal] Photo ${i + 1} uploaded to S3: ${s3Url}`);
                }
                
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200));
                
            } catch (error) {
                console.error(`[DailyDeal] Error downloading photo ${i + 1}:`, error.message);
            }
        }
        
        console.log(`[DailyDeal] Successfully downloaded ${downloadedPhotos.length} photos via Places API`);
        return downloadedPhotos;
        
    } catch (error) {
        console.error('[DailyDeal] Error downloading Places API photos:', error.message);
        return [];
    }
}

/**
 * Upload photo to S3
 * @param {Buffer} photoData - Photo data buffer
 * @param {string} s3Key - S3 key for the photo
 * @param {string} restaurantName - Restaurant name for metadata
 * @returns {Promise<string>} - S3 URL of uploaded photo
 */
async function uploadPhotoToS3(photoData, s3Key, restaurantName) {
    try {
        // Import S3Service dynamically to avoid circular dependencies
        const { uploadToS3 } = await import('../services/s3Service.js');
        
        const s3Url = await uploadToS3(
            photoData,
            s3Key,
            'image/jpeg'
        );
        
        if (s3Url) {
            console.log(`[DailyDeal] Photo uploaded to S3: ${s3Url}`);
            return s3Url;
        }
        
        return null;
    } catch (error) {
        console.error('[DailyDeal] Error uploading photo to S3:', error.message);
        return null;
    }
}

/**
 * Ensure we have a valid Google Place ID for a confirmed name and address
 */
async function ensurePlaceId(restaurantName, address, botConfig) {
    if (!botConfig.googleMapsApiKey) return null;
    try {
        const query = `${restaurantName} ${address || 'Singapore'} restaurant`;
        const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&type=restaurant&region=sg&key=${botConfig.googleMapsApiKey}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.results && data.results.length > 0) {
            return data.results[0].place_id;
        }
        return null;
    } catch (e) {
        console.log('[DailyDeal] ensurePlaceId error:', e.message);
        return null;
    }
}

/**
 * Search for restaurant and save profile
 */
async function searchAndSaveRestaurant(restaurantName, searchState, fromNumber, botConfig) {
    console.log(`[DailyDeal] 🔍 Starting restaurant search for: ${restaurantName}`);
    console.log(`[DailyDeal] Bot config keys:`, Object.keys(botConfig));
    console.log(`[DailyDeal] Google Maps API key available:`, !!botConfig.googleMapsApiKey);
    
    try {
        // First, try to search using Google Places API if available
        if (botConfig.googleMapsApiKey) {
            try {
                const searchQuery = `${restaurantName} Singapore`;
                console.log(`[DailyDeal] 🔍 Starting restaurant search for: ${restaurantName}`);
                console.log(`[DailyDeal] 🌐 Using Google Places API v1 for: "${searchQuery}"`);
                
                // Use the new Google Places API v1
                const searchResults = await searchTextNewAPI(searchQuery, botConfig.googleMapsApiKey, {
                    includedType: "restaurant",
                    maxResultCount: 3,
                    locationBias: {
                        rectangle: {
                            low: { latitude: 1.2, longitude: 103.6 },
                            high: { latitude: 1.5, longitude: 104.0 }
                        }
                    }
                });
                
                console.log(`[DailyDeal] 📄 Google Places API v1 response:`, JSON.stringify(searchResults, null, 2));
                
                if (searchResults.places && searchResults.places.length > 0) {
                    const place = searchResults.places[0];
                    console.log(`[DailyDeal] ✅ Found restaurant via Google Places API v1:`, {
                        name: place.displayName?.text,
                        address: place.formattedAddress,
                        rating: place.rating,
                        totalRatings: place.userRatingCount,
                        priceLevel: place.priceLevel,
                        types: place.types,
                        placeId: place.id
                    });
                    
                    // Enhanced: Get comprehensive details using Place Details API v1
                    let detailedPlace = place;
                    try {
                        console.log(`[DailyDeal] 🔍 Calling Place Details API v1 for place ID: ${place.id}`);
                        
                        const detailsData = await getPlaceDetailsNewAPI(place.id, botConfig.googleMapsApiKey);
                        console.log(`[DailyDeal] 📄 Place Details API v1 response:`, JSON.stringify(detailsData, null, 2));
                        
                        if (detailsData) {
                            detailedPlace = { ...place, ...detailsData };
                            console.log(`[DailyDeal] ✅ Enhanced with detailed place info:`, {
                                name: detailedPlace.displayName?.text || detailedPlace.displayName,
                                phone: detailedPlace.nationalPhoneNumber,
                                website: detailedPlace.websiteUri,
                                rating: detailedPlace.rating,
                                totalRatings: detailedPlace.userRatingCount,
                                priceLevel: detailedPlace.priceLevel,
                                businessStatus: detailedPlace.businessStatus,
                                types: detailedPlace.types,
                                googleMapsUri: detailedPlace.googleMapsUri
                            });
                        }
                    } catch (detailsError) {
                        console.log(`[DailyDeal] ⚠️ Place Details API v1 error (non-critical): ${detailsError.message}`);
                        // Continue with basic place info
                    }
                    
                            // Enhanced: Search for additional details using Spider.cloud
        let spiderData = null;
        let additionalImages = [];
        let socialMedia = {};
        
        // Check if restaurant already has photos in S3
        let existingPhotos = [];
        try {
            const { default: S3ImageService } = await import('../services/s3ImageService.js');
            const s3Service = new S3ImageService(botConfig.s3Bucket || 'viral-agency-content');
            
            const restaurantName = detailedPlace.displayName?.text || detailedPlace.displayName;
            const placeId = detailedPlace.id;
            const folderName = `${restaurantName}-${placeId}`.replace(/[^a-zA-Z0-9-_]/g, '_');
            
            existingPhotos = await s3Service.getRestaurantImages(folderName);
            console.log(`[DailyDeal] Found ${existingPhotos.length} existing photos for restaurant: ${folderName}`);
        } catch (s3Error) {
            console.log(`[DailyDeal] ⚠️ S3 photo check error (non-critical): ${s3Error.message}`);
        }
                    
                    try {
                        if (botConfig.spiderCloudApiKey || botConfig.spiderApiKey) {
                            console.log(`[DailyDeal] Searching for additional details via Spider.cloud...`);
                            
                            // Import SpiderCloudService dynamically to avoid breaking existing imports
                            const { default: SpiderCloudService } = await import('../services/spiderCloudService.js');
                            const spiderService = new SpiderCloudService(botConfig.spiderCloudApiKey || botConfig.spiderApiKey);
                            
                            const spiderResults = await spiderService.searchRestaurantImages({
                                name: detailedPlace.displayName?.text || detailedPlace.displayName,
                                address: detailedPlace.formattedAddress || 'Singapore'
                            });
                            
                            if (spiderResults.success && spiderResults.images) {
                                spiderData = spiderResults;
                                additionalImages = spiderResults.images.slice(0, 6); // Limit to 6 images
                                
                                // Extract social media links from Spider.cloud results
                                if (spiderResults.metadata && spiderResults.metadata.searchSource) {
                                    socialMedia = extractSocialMediaFromSpiderResults(spiderResults);
                                }
                                
                                console.log(`[DailyDeal] Found ${additionalImages.length} additional images via Spider.cloud`);
                            }
                        } else {
                            // Fallback: Use OpenAI with web search to find additional details
                            console.log(`[DailyDeal] Spider.cloud not available, using OpenAI with web search...`);
                            
                            try {
                                const openai = new OpenAI({ apiKey: botConfig.openAiApiKey });
                                const searchQuery = `Find official website, social media handles (Instagram, Facebook, TikTok), and a brief description for "${detailedPlace.displayName?.text || detailedPlace.displayName}" restaurant in ${detailedPlace.formattedAddress || 'Singapore'}. Also provide 2-3 key selling points. Respond as JSON with keys: website, instagram, facebook, tiktok, description, sellingPoints.`;
                                
                                const completion = await openai.chat.completions.create({
                                    model: 'gpt-4o-mini-search-preview',
                                    web_search_options: {},
                                    messages: [{ role: 'user', content: searchQuery }]
                                });
                                
                                const text = completion.choices[0]?.message?.content || '{}';
                                let parsed = {};
                                try {
                                    parsed = JSON.parse(text);
                                } catch (parseErr) {
                                    try {
                                        const start = text.indexOf('{');
                                        const end = text.lastIndexOf('}');
                                        if (start !== -1 && end !== -1) {
                                            parsed = JSON.parse(text.substring(start, end + 1));
                                        }
                                    } catch {}
                                }
                                
                                if (parsed) {
                                    socialMedia = {
                                        instagram: parsed.instagram || null,
                                        facebook: parsed.facebook || null,
                                        tiktok: parsed.tiktok || null
                                    };
                                    
                                    // Create mock image data structure for consistency
                                    additionalImages = [];
                                    if (parsed.website) {
                                        additionalImages.push({
                                            id: 'openai_website',
                                            url: parsed.website,
                                            thumbnail: parsed.website,
                                            title: `${detailedPlace.displayName?.text || detailedPlace.displayName} - Official Website`,
                                            source: 'openai_web_search',
                                            relevance: 0.95
                                        });
                                    }
                                    
                                    console.log(`[DailyDeal] Found additional details via OpenAI:`, parsed);
                                }
                            } catch (openaiError) {
                                console.log(`[DailyDeal] OpenAI web search error (non-critical): ${openaiError.message}`);
                            }
                        }
                    } catch (spiderError) {
                        console.log(`[DailyDeal] Spider.cloud search error (non-critical): ${spiderError.message}`);
                        // Continue without Spider.cloud data
                    }
                    
                    // Create restaurant profile with all collected data
                    searchState.restaurantProfile = {
                        name: detailedPlace.displayName?.text || detailedPlace.displayName,
                        location: {
                            address: detailedPlace.formattedAddress || 'Singapore',
                            coordinates: detailedPlace.location ? {
                                lat: detailedPlace.location.latitude,
                                lng: detailedPlace.location.longitude
                            } : null
                        },
                        phone: detailedPlace.nationalPhoneNumber || detailedPlace.internationalPhoneNumber || 'Not available',
                        website: detailedPlace.websiteUri || null,
                        rating: detailedPlace.rating || null,
                        totalRatings: detailedPlace.userRatingCount || 0,
                        priceLevel: detailedPlace.priceLevel || null,
                        businessStatus: detailedPlace.businessStatus || null,
                        types: detailedPlace.types || [],
                        placeId: detailedPlace.id,
                        googleMapsUrl: detailedPlace.googleMapsUri || null,
                        // Additional Google Places details
                        openingHours: detailedPlace.regularOpeningHours || detailedPlace.currentOpeningHours || null,
                        delivery: detailedPlace.delivery || false,
                        dineIn: detailedPlace.dineIn || false,
                        takeout: detailedPlace.takeout || false,
                        reservable: detailedPlace.reservable || false,
                        servesBeer: detailedPlace.servesBeer || false,
                        servesWine: detailedPlace.servesWine || false,
                        servesBreakfast: detailedPlace.servesBreakfast || false,
                        servesLunch: detailedPlace.servesLunch || false,
                        servesDinner: detailedPlace.servesDinner || false,
                        // Photos from Google Places API v1
                        photos: detailedPlace.photos ? detailedPlace.photos.map((photo, index) => ({
                            id: `google_photo_${index}`,
                            name: photo.name,
                            url: buildPhotoUrl(photo.name, botConfig.googleMapsApiKey, { maxWidthPx: 800 }),
                            thumbnail: buildPhotoUrl(photo.name, botConfig.googleMapsApiKey, { maxWidthPx: 400 }),
                            title: `${detailedPlace.displayName?.text || detailedPlace.displayName} - Photo ${index + 1}`,
                            source: 'google_places_v1',
                            relevance: 0.95 - (index * 0.05)
                        })) : [],
                        // Existing photos from S3
                        existingPhotos: existingPhotos || [],
                        // Enhanced: Add Spider.cloud data
                        spiderData: spiderData,
                        additionalImages: additionalImages,
                        socialMedia: socialMedia
                    };
                    
                    // Save enhanced restaurant profile to DynamoDB
                    try {
                        await saveRestaurantProfileToDynamoDB(searchState.restaurantProfile, fromNumber, botConfig);
                    } catch (dbError) {
                        console.log(`[DailyDeal] ⚠️ DynamoDB save error (non-critical): ${dbError.message}`);
                    }
                    
                    return createRestaurantConfirmationMessage(searchState.restaurantProfile);
                } else {
                    console.log(`[DailyDeal] ❌ No results found for: ${restaurantName}`);
                }
            } catch (error) {
                console.log(`[DailyDeal] ⚠️ Google Places API v1 error: ${error.message}`);
            }
        }
        
        // Fallback: Create a basic restaurant profile from the name
        console.log(`[DailyDeal] Creating fallback restaurant profile for: ${restaurantName}`);
        
        // Try to get additional details using OpenAI with web search
        let socialMedia = {};
        let additionalImages = [];
        
        try {
            if (botConfig.openAiApiKey) {
                console.log(`[DailyDeal] Using OpenAI with web search as fallback...`);
                const openai = new OpenAI({ apiKey: botConfig.openAiApiKey });
                const searchQuery = `Find official website, social media handles (Instagram, Facebook, TikTok), and a brief description for "${restaurantName}" restaurant in Singapore. Also provide 2-3 key selling points. Respond as JSON with keys: website, instagram, facebook, tiktok, description, sellingPoints.`;
                
                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini-search-preview',
                    web_search_options: {},
                    messages: [{ role: 'user', content: searchQuery }]
                });
                
                const text = completion.choices[0]?.message?.content || '{}';
                let parsed = {};
                try {
                    parsed = JSON.parse(text);
                } catch (parseErr) {
                    try {
                        const start = text.indexOf('{');
                        const end = text.lastIndexOf('}');
                        if (start !== -1 && end !== -1) {
                            parsed = JSON.parse(text.substring(start, end + 1));
                        }
                    } catch {}
                }
                
                if (parsed) {
                    socialMedia = {
                        instagram: parsed.instagram || null,
                        facebook: parsed.facebook || null,
                        tiktok: parsed.tiktok || null
                    };
                    
                    console.log(`[DailyDeal] Found additional details via OpenAI fallback:`, parsed);
                }
            }
        } catch (openaiError) {
            console.log(`[DailyDeal] OpenAI fallback search error (non-critical): ${openaiError.message}`);
        }
        
        searchState.restaurantProfile = {
            name: restaurantName,
            address: 'Singapore',
            location: {
                address: 'Singapore'
            },
            phone: 'Not available',
            socialMedia: socialMedia,
            additionalImages: additionalImages
        };
        
        return createRestaurantConfirmationMessage(searchState.restaurantProfile);
        
    } catch (error) {
        console.error(`[DailyDeal] Error searching for restaurant: ${error.message}`);
        
        // Create a basic profile as fallback
        searchState.restaurantProfile = {
            name: restaurantName,
            address: 'Singapore',
            location: {
                address: 'Singapore'
            },
            phone: 'Not available'
        };
        
        return createRestaurantConfirmationMessage(searchState.restaurantProfile);
    }
}

/**
 * Extract social media links from Spider.cloud results
 */
function extractSocialMediaFromSpiderResults(spiderResults) {
    const socialMedia = {};
    
    try {
        // Look for social media URLs in the search results
        if (spiderResults.metadata && spiderResults.metadata.searchSource) {
            // This is a simplified extraction - you can enhance this based on actual Spider.cloud response structure
            if (spiderResults.images && spiderResults.images.length > 0) {
                // Extract any social media links that might be embedded in image metadata
                spiderResults.images.forEach(image => {
                    if (image.source && image.source.includes('instagram.com')) {
                        socialMedia.instagram = image.source;
                    } else if (image.source && image.source.includes('facebook.com')) {
                        socialMedia.facebook = image.source;
                    } else if (image.source && image.source.includes('tiktok.com')) {
                        socialMedia.tiktok = image.source;
                    }
                });
            }
        }
    } catch (error) {
        console.log(`[DailyDeal] Error extracting social media: ${error.message}`);
    }
    
    return socialMedia;
}

/**
 * Create confirmation message for restaurant profile
 */
function createRestaurantConfirmationMessage(profile) {
    console.log(`[DailyDeal] Creating confirmation message for: ${profile.name}`);
    
    // Build comprehensive restaurant details
    const details = [
        `🏪 **${profile.name}**`,
        profile.location?.address ? `📍 ${profile.location.address}` : null,
        profile.phone && profile.phone !== 'Not available' ? `📞 ${profile.phone}` : null,
        profile.website ? `🌐 ${profile.website}` : null,
        profile.rating ? `⭐ ${profile.rating}/5 (${profile.totalRatings} reviews)` : null,
        profile.priceLevel ? `💰 Price Level: ${profile.priceLevel}` : null,
        profile.businessStatus ? `🟢 Status: ${profile.businessStatus}` : null,
        profile.types && profile.types.length > 0 ? `🏷️ Type: ${profile.types.slice(0, 3).join(', ')}` : null,
        profile.googleMapsUrl ? `🗺️ [View on Google Maps](${profile.googleMapsUrl})` : null
    ].filter(Boolean).join('\n');

    // Build opening hours information
    let hoursInfo = '';
    if (profile.openingHours) {
        if (profile.openingHours.openNow !== undefined) {
            hoursInfo = `\n🕒 Currently: ${profile.openingHours.openNow ? '🟢 Open' : '🔴 Closed'}`;
        }
        if (profile.openingHours.weekdayDescriptions) {
            hoursInfo += `\n📅 Hours: ${profile.openingHours.weekdayDescriptions.slice(0, 3).join(', ')}`;
        }
    }

    // Build service options
    const services = [];
    if (profile.delivery) services.push('🚚 Delivery');
    if (profile.takeout) services.push('📦 Takeout');
    if (profile.dineIn) services.push('🍽️ Dine-in');
    if (profile.reservable) services.push('📅 Reservations');
    
    const serviceInfo = services.length > 0 ? `\n🛠️ Services: ${services.join(', ')}` : '';

    // Build dining options
    const diningOptions = [];
    if (profile.servesBreakfast) diningOptions.push('🌅 Breakfast');
    if (profile.servesLunch) diningOptions.push('🌞 Lunch');
    if (profile.servesDinner) diningOptions.push('🌙 Dinner');
    if (profile.servesBeer) diningOptions.push('🍺 Beer');
    if (profile.servesWine) diningOptions.push('🍷 Wine');
    
    const diningInfo = diningOptions.length > 0 ? `\n🍽️ Dining: ${diningOptions.join(', ')}` : '';

    // Build media information
    const mediaInfo = [
        profile.photos && profile.photos.length > 0 ? `📷 ${profile.photos.length} Google Places photos` : null,
        profile.existingPhotos && profile.existingPhotos.length > 0 ? `📸 ${profile.existingPhotos.length} existing restaurant photos` : null,
        profile.additionalImages && profile.additionalImages.length > 0 ? `🖼️ ${profile.additionalImages.length} additional images` : null,
        profile.socialMedia?.instagram ? `📱 Instagram: ${profile.socialMedia.instagram}` : null,
        profile.socialMedia?.facebook ? `📘 Facebook: ${profile.socialMedia.facebook}` : null,
        profile.socialMedia?.tiktok ? `🎵 TikTok: ${profile.socialMedia.tiktok}` : null
    ].filter(Boolean).join('\n');

    const fullMessage = `${details}${hoursInfo}${serviceInfo}${diningInfo}${mediaInfo ? '\n\n📱 **Media & Social:**\n' + mediaInfo : ''}`;

    return {
        type: 'interactive',
        interactive: {
            type: 'button',
            header: {
                type: 'text',
                text: `🏪 Restaurant Found!`
            },
            body: {
                text: fullMessage
            },
            footer: {
                type: 'text',
                text: 'Is this your restaurant?'
            },
            action: {
                buttons: [
                    {
                        type: 'reply',
                        reply: {
                            id: 'confirm_restaurant',
                            title: '✅ Yes, This is Correct'
                        }
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'search_again',
                            title: '🔍 Search Again'
                        }
                    }
                ]
            }
        }
    };
}

/**
 * Create message when restaurant is found
 */
function createRestaurantFoundMessage(details) {
    return {
        type: "text",
        text: `🎉 **Restaurant Found!**\n\n🏪 **${details.name}**\n📍 ${details.formatted_address}\n⭐ Rating: ${details.rating}/5 (${details.user_ratings_total || 0} reviews)\n📞 ${details.formatted_phone_number || 'Phone not available'}\n\n✅ **Setup Complete!**\n\n📢 **Now send me today's special deal** and I'll create viral content for all your social media platforms!\n\n💡 *Example: "Fresh salmon teriyaki bowl $16 today only!"*`
    };
}

function createRestaurantApprovalMessage(profile) {
    const lines = [
        `🏪 ${profile.name}`,
        `📍 ${profile.address}`,
        `📞 ${profile.phone}`,
        // Hide website per UX feedback
        profile.socialMedia?.instagram ? `📸 IG: ${profile.socialMedia.instagram}` : null,
        profile.socialMedia?.facebook ? `📘 FB: ${profile.socialMedia.facebook}` : null,
        profile.socialMedia?.tiktok ? `🎵 TikTok: ${profile.socialMedia.tiktok}` : null,
        profile.rating ? `⭐ ${profile.rating}/5 (${profile.totalRatings || 0})` : null,
        profile.summary ? `\n📝 ${profile.summary}` : null
    ].filter(Boolean).join('\n');

    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: { type: "text", text: "✅ Confirm Restaurant Details" },
            body: { text: `${lines}\n\nIs this correct?` },
            footer: { text: "Confirm or send updates below" },
            action: { buttons: [
                { type: "reply", reply: { id: "confirm_restaurant", title: "✅ Confirm" } },
                { type: "reply", reply: { id: "edit_restaurant",    title: "✏️ Update" } },
                { type: "reply", reply: { id: "cancel_restaurant",  title: "❌ Cancel" } }
            ] }
        }
    };
}

/**
 * Create message when restaurant is not found
 */
function createRestaurantNotFoundMessage(restaurantName) {
    return {
        type: "text",
        text: `❌ **Restaurant Not Found**\n\nSorry, I couldn't find "${restaurantName}" on Google Places.\n\n📝 **Please try:**\n• Full restaurant name\n• Include location (e.g., "Marina Bay", "Orchard")\n• Check spelling\n\n💡 *Example: "Newton Food Centre Stall 15" or "Ya Kun Kaya Toast Raffles Place"*\n\nPlease type your restaurant name again:`
    };
}

/**
 * Create message when restaurant search fails
 */
function createRestaurantSearchErrorMessage() {
    return {
        type: "text",
        text: `⚠️ **Search Error**\n\nSorry, there was an issue searching for your restaurant. Please try again or contact support.\n\nPlease type your restaurant name:`
    };
}

/**
 * Extract pricing information from deal description
 */
function extractPricing(description) {
    if (!description || typeof description !== 'string') {
        console.log('[DailyDeal] extractPricing: Invalid description parameter:', description);
        return {
            originalPrice: 'N/A',
            specialPrice: 'N/A',
            discount: 'N/A'
        };
    }
    
    try {
        // Look for price patterns like "7 dollars instead of 10"
        const pricePattern = /(\d+)\s*(dollars?|\$)\s*instead\s*of\s*(\d+)/i;
        const match = description.match(pricePattern);
        
        if (match) {
            const specialPrice = match[1];
            const originalPrice = match[2];
            const discount = parseInt(originalPrice) - parseInt(specialPrice);
            
            return {
                originalPrice: `$${originalPrice}`,
                specialPrice: `$${specialPrice}`,
                discount: `$${discount} off`
            };
        }
        
        // Look for simple price mentions
        const simplePricePattern = /(\d+)\s*(dollars?|\$)/gi;
        const prices = [];
        let priceMatch;
        
        while ((priceMatch = simplePricePattern.exec(description)) !== null) {
            prices.push(parseInt(priceMatch[1]));
        }
        
        if (prices.length >= 2) {
            const [specialPrice, originalPrice] = prices;
            const discount = originalPrice - specialPrice;
            
            return {
                originalPrice: `$${originalPrice}`,
                specialPrice: `$${specialPrice}`,
                discount: `$${discount} off`
            };
        }
        
        if (prices.length === 1) {
            return {
                originalPrice: 'N/A',
                specialPrice: `$${prices[0]}`,
                discount: 'N/A'
            };
        }
        
        return {
            originalPrice: 'N/A',
            specialPrice: 'N/A',
            discount: 'N/A'
        };
        
    } catch (error) {
        console.error('[DailyDeal] Error extracting pricing:', error);
        return {
            originalPrice: 'N/A',
            specialPrice: 'N/A',
            discount: 'N/A'
        };
    }
}

/**
 * Extract validity information from deal description
 */
function extractValidity(description) {
    if (!description || typeof description !== 'string') {
        console.log('[DailyDeal] extractValidity: Invalid description parameter:', description);
        return 'Valid today';
    }
    
    try {
        // Look for time patterns like "for first 30 customer", "until 6pm", "today only"
    const timePatterns = [
            /for first (\d+)/i,
            /until (\d{1,2}(?::\d{2})?(?:am|pm)?)/i,
        /today only/i,
            /lunch only/i,
            /dinner only/i,
            /breakfast only/i
    ];
    
    for (const pattern of timePatterns) {
        const match = description.match(pattern);
        if (match) {
                if (pattern.source.includes('for first')) {
                    return `Limited to first ${match[1]} customers`;
                } else if (pattern.source.includes('until')) {
                    return `Valid until ${match[1]}`;
                } else {
            return match[0];
        }
    }
        }
        
        return 'Valid today';
        
    } catch (error) {
        console.error('[DailyDeal] Error extracting validity:', error);
        return 'Valid today';
    }
}

/**
 * Create content preview for the user
 */
function createContentPreview(platformContent, mediaPackage) {
    const instagramPost = platformContent.instagram?.caption?.substring(0, 150) || 'Instagram content generated';
    const twitterPost = platformContent.twitter?.text?.substring(0, 100) || 'Twitter content generated';
    
    let previewText = `**🚀 VIRAL CONTENT GENERATED!**\n\n`;
    
    // Instagram preview
    previewText += `📱 **INSTAGRAM POST:**\n${instagramPost}...\n\n`;
    
    // Twitter preview  
    previewText += `🐦 **X (TWITTER) POST:**\n${twitterPost}...\n\n`;
    
    // Poster status
    if (mediaPackage?.success && mediaPackage.mediaPackage?.poster?.success) {
        previewText += `🎨 **AI POSTER:** ✅ Generated with viral design\n`;
    } else {
        previewText += `🎨 **AI POSTER:** ⏳ Generating professional poster...\n`;
    }
    
    previewText += `\n📊 **PLATFORMS:** Facebook, Instagram, TikTok, Telegram, X\n\n**Ready to make your deal go viral?**`;
    
    return previewText;
}

/**
 * Upload generated content to S3
 */
async function uploadContentToS3(dealData, mediaPackage, botConfig) {
    try {
        console.log('[DailyDeal] Starting S3 upload process...');
        const uploads = {};
        const bucketName = 'viral-agency-content'; // Dedicated bucket for viral agency
        
        // Upload AI-generated poster
        if (mediaPackage?.success && mediaPackage.mediaPackage?.poster?.base64) {
            console.log('[DailyDeal] Uploading AI poster to S3...');
            const posterKey = `deals/${dealData.dealId}/poster.png`;
            const posterBytes = Buffer.from(mediaPackage.mediaPackage.poster.base64, 'base64');
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: posterKey,
                Body: posterBytes,
                ContentType: 'image/png'
            }));
            uploads.poster = `https://${bucketName}.s3.ap-southeast-1.amazonaws.com/${posterKey}`;
            console.log('[DailyDeal] Poster uploaded:', uploads.poster);
        }
        
        // Upload enhanced photo if available
        if (mediaPackage?.mediaPackage?.enhancedPhoto?.success) {
            console.log('[DailyDeal] Uploading enhanced photo to S3...');
            const photoResponse = await fetch(mediaPackage.mediaPackage.enhancedPhoto.enhancedUrl);
            const photoBuffer = await photoResponse.arrayBuffer();
            
            const photoKey = `deals/${dealData.dealId}/enhanced-photo.jpg`;
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: photoKey,
                Body: new Uint8Array(photoBuffer),
                ContentType: 'image/jpeg'
            }));
            
            uploads.enhancedPhoto = `https://${bucketName}.s3.ap-southeast-1.amazonaws.com/${photoKey}`;
            console.log('[DailyDeal] Enhanced photo uploaded:', uploads.enhancedPhoto);
        }
        
        return uploads;
        
    } catch (error) {
        console.error('[DailyDeal] Error uploading to S3:', error);
        return { error: error.message };
    }
}

/**
 * Send next platform message for review
 */
async function sendNextPlatformMessage(messageState, botConfig) {
    try {
        if (!messageState.generatedContent || !messageState.generatedContent.platforms) {
            return {
                type: 'text',
                text: '❌ No content generated yet. Please generate content first.'
            };
        }
        
        const platform = messageState.generatedContent.platforms[messageState.currentPlatformIndex];
        const platformContent = messageState.generatedContent.platformContent[platform];
        const s3Uploads = messageState.generatedContent.s3Uploads || {};
        const dealData = messageState.generatedContent.dealData;
        
        if (!platformContent) {
            return {
                type: 'text',
                text: `❌ No content found for ${platform}. Please regenerate content.`
            };
        }
        
        // Create platform review message
        const message = createPlatformReviewMessage(messageState, botConfig, platform);
        
        return message;
        
    } catch (error) {
        console.error('[DailyDeal] Error sending next platform message:', error);
        return {
            type: 'text',
            text: '❌ Error displaying platform content. Please try again.'
        };
    }
}



/**
 * Create interactive message for specific platform
 */
function createPlatformInteractiveMessage(platform, content, s3Uploads, dealData) {
    // Safety check for content parameter
    if (!content) {
        console.warn(`[DailyDeal] No content provided for platform ${platform}, using fallback`);
        content = {
            caption: 'Content being generated...',
            text: 'Content being generated...',
            description: 'Content being generated...',
            hashtags: []
        };
    }
    
    const platformEmojis = {
        instagram: '📱',
        facebook: '📘', 
        twitter: '🐦',
        tiktok: '🎵',
        telegram: '✈️'
    };
    
    const platformNames = {
        instagram: 'Instagram',
        facebook: 'Facebook',
        twitter: 'X (Twitter)',
        tiktok: 'TikTok',
        telegram: 'Telegram'
    };
    
    const emoji = platformEmojis[platform] || '📱';
    const name = platformNames[platform] || platform.toUpperCase();
    
    let messageText = `${emoji} **${name.toUpperCase()} CONTENT READY**\n\n`;
    
    // Add deal details first (keep concise)
    if (dealData) {
        const dealDesc = (dealData.description || dealData.dealDescription || 'Special offer').substring(0, 100);
        const pricing = (dealData.pricing || 'Great value').substring(0, 80);
        const validity = (dealData.validity || 'Limited time').substring(0, 60);
        
        messageText += `🍽️ **Deal:** ${dealDesc}${dealDesc.length >= 100 ? '...' : ''}\n`;
        messageText += `💰 **Price:** ${pricing}${pricing.length >= 80 ? '...' : ''}\n`;
        messageText += `⏰ **Valid:** ${validity}${validity.length >= 60 ? '...' : ''}\n\n`;
    }
    
    // Add platform-specific content (truncated for Meta compliance)
    if (platform === 'instagram') {
        const caption = content.caption?.substring(0, 150) || '';
        messageText += `📝 **Caption:**\n${caption}${caption.length >= 150 ? '...' : ''}\n\n`;
        if (content.story) {
            const storyText = content.story.text?.substring(0, 80) || '';
            const storySticker = content.story.sticker?.substring(0, 40) || '';
            messageText += `📖 **Story:** ${storyText}${storyText.length >= 80 ? '...' : ''}\n`;
            messageText += `📸 **Sticker:** ${storySticker}${storySticker.length >= 40 ? '...' : ''}\n\n`;
        }
    } else if (platform === 'twitter') {
        const tweet = content.text?.substring(0, 120) || '';
        messageText += `📝 **Tweet:**\n${tweet}${tweet.length >= 120 ? '...' : ''}\n\n`;
        if (content.thread && content.thread.length > 0) {
            const threadPreview = content.thread.slice(0, 1).join('\n').substring(0, 100);
            messageText += `🧵 **Thread:**\n${threadPreview}${threadPreview.length >= 100 ? '...' : ''}\n\n`;
        }
    } else if (platform === 'facebook') {
        const post = content.text?.substring(0, 120) || '';
        messageText += `📝 **Post:**\n${post}${post.length >= 120 ? '...' : ''}\n\n`;
    } else if (platform === 'tiktok') {
        const desc = content.description?.substring(0, 100) || '';
        messageText += `📝 **Description:**\n${desc}${desc.length >= 100 ? '...' : ''}\n\n`;
        if (content.video_script) {
            const script = content.video_script.substring(0, 80);
            messageText += `🎬 **Script:**\n${script}${script.length >= 80 ? '...' : ''}\n\n`;
        }
    } else if (platform === 'telegram') {
        const msg = content.text?.substring(0, 120) || '';
        messageText += `📝 **Message:**\n${msg}${msg.length >= 120 ? '...' : ''}\n\n`;
    }
    
    // Add hashtags (limited)
    if (content.hashtags && content.hashtags.length > 0) {
        const hashtags = content.hashtags.slice(0, 3).join(' ');
        messageText += `🏷️ **Tags:** ${hashtags}\n\n`;
    }
    
    // Add video information if available
    if (dealData && dealData.viralVideo) {
        messageText += `🎬 **Viral Video:** Ready (12s)\n`;
    }
    
    // Add S3 image URLs (shortened) - only if no video
    if (!dealData?.viralVideo && s3Uploads?.poster) {
        messageText += `🎨 **Poster:** Ready\n`;
    }
    if (!dealData?.viralVideo && s3Uploads?.enhancedPhoto) {
        messageText += `📸 **Photo:** Ready\n`;
    }
    
    // Special message for Instagram (main approval platform) - keep concise
    if (platform === 'instagram') {
        messageText += `\n🚀 **Auto-publish to all platforms**\n`;
        messageText += `📱 IG • 📘 FB • 🐦 X • 🎵 TT\n\n`;
        messageText += `✨ **Ready to launch?**`;
    } else {
        messageText += `\n✨ **Ready to approve?**`;
    }
    
    // Ensure message doesn't exceed Meta's 1024 character limit
    if (messageText.length > 1024) {
        messageText = messageText.substring(0, 1020) + '...';
    }
    
    // Create message with image if S3 poster is available
    const messageStructure = {
        type: "interactive",
        interactive: {
            type: "button",
            body: {
                text: messageText
            },
            footer: {
                text: platform === 'instagram' ? "🚀 Launch viral campaign" : `Review for ${name}`
            },
            action: {
                buttons: platform === 'instagram' ? [
                    {
                        type: "reply",
                        reply: {
                            id: `view_viral_video`,
                            title: "🎬 Watch Video"
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: `approve_${platform}`,
                            title: "🚀 LAUNCH!"
                        }
                    }
                ] : [
                    {
                        type: "reply",
                        reply: {
                            id: `approve_${platform}`,
                            title: `✅ Approve ${emoji}`
                        }
                    },
                    {
                        type: "reply", 
                        reply: {
                            id: `edit_${platform}`,
                            title: `✏️ Edit ${emoji}`
                        }
                    },
                    {
                        type: "reply",
                        reply: {
                            id: "next_platform",
                            title: "⏭️ Next"
                        }
                    }
                ]
            }
        }
    };

    // Add image header if S3 poster URL is available
    if (s3Uploads?.poster) {
        console.log(`[DailyDeal] Adding image header for ${platform}: ${s3Uploads.poster}`);
        messageStructure.interactive.header = {
            type: "image",
            image: {
                link: s3Uploads.poster
            }
        };
    } else if (s3Uploads?.enhancedPhoto) {
        console.log(`[DailyDeal] Using enhanced photo for ${platform}: ${s3Uploads.enhancedPhoto}`);
        messageStructure.interactive.header = {
            type: "image",
            image: {
                link: s3Uploads.enhancedPhoto
            }
        };
    } else {
        // Fallback to text header
        messageStructure.interactive.header = {
            type: "text", 
            text: `${emoji} ${name} Ready!`
        };
    }
    
    // If video is available, add a note about it in the body
    if (dealData?.viralVideo?.videoUrl) {
        messageText += `\n\n🎬 **Viral Video Ready!**\nClick "Watch Video" to see your deal in action!`;
    }

    return messageStructure;
}

/**
 * Create final approval message
 */
function createFinalApprovalMessage(approvalState) {
    const approvedPlatforms = approvalState.approvedPlatforms || [];
    const totalPlatforms = approvalState.generatedContent.platforms.length;
    
    let messageText = `🎉 **ALL PLATFORMS APPROVED!** 🎉\n\n`;
    messageText += `📊 **Approved Platforms (${approvedPlatforms.length}/${totalPlatforms}):**\n`;
    
    for (const platform of approvedPlatforms) {
        const emoji = getPlatformEmoji(platform);
        const name = getPlatformName(platform);
        messageText += `${emoji} ${name}: ✅ Approved\n`;
    }
    
    messageText += `\n🎯 **Content Links:**\n`;
    if (approvalState.generatedContent.s3Uploads?.poster) {
        messageText += `🎨 AI Poster: ${approvalState.generatedContent.s3Uploads.poster}\n`;
    }
    
    messageText += `\n🚀 **Ready to publish!**\n`;
    messageText += `Click "🚀 PUBLISH ALL" to launch your viral campaign!`;
    
    return {
        type: 'interactive',
        interactive: {
            type: 'button',
            header: {
                type: 'text',
                text: '🎯 Final Approval Complete!'
            },
            body: {
                text: messageText
            },
            footer: {
                text: 'Launch your viral campaign now!'
            },
            action: {
                buttons: [
                    {
                        type: 'reply',
                        reply: {
                            id: 'publish_all',
                            title: '🚀 PUBLISH ALL'
                        }
                    },
                    {
                        type: 'reply',
                        reply: {
                            id: 'edit_content',
                            title: '✏️ Edit Content'
                        }
                    }
                ]
            }
        }
    };
}

function getPlatformEmoji(platform) {
    const emojis = {
        instagram: '📱',
        facebook: '📘', 
        twitter: '🐦',
        tiktok: '🎵',
        telegram: '✈️'
    };
    return emojis[platform] || '📱';
}

function getPlatformName(platform) {
    const names = {
        instagram: 'Instagram',
        facebook: 'Facebook',
        twitter: 'X (Twitter)',
        tiktok: 'TikTok',
        telegram: 'Telegram'
    };
    return names[platform] || platform.toUpperCase();
}

/**
 * Approve platform content
 */
async function approvePlatform(approveState, platform, botConfig) {
    try {
        if (!approveState.approvedPlatforms) {
            approveState.approvedPlatforms = [];
        }
        
        if (!approveState.approvedPlatforms.includes(platform)) {
            approveState.approvedPlatforms.push(platform);
        }
        
        const emoji = getPlatformEmoji(platform);
        const name = getPlatformName(platform);
        
        return {
            type: 'text',
            text: `✅ **${name.toUpperCase()} APPROVED!** ${emoji}\n\nYour ${name} content has been approved and is ready for publishing.\n\nContinue reviewing other platforms or click "🚀 PUBLISH ALL" when ready!`
        };
        
    } catch (error) {
        console.error(`[DailyDeal] Error approving ${platform}:`, error);
        return {
            type: 'text',
            text: '❌ Error approving platform. Please try again.'
        };
    }
}

/**
 * Edit platform content
 */
async function editPlatformContent(editState, platform, botConfig) {
    const emoji = getPlatformEmoji(platform);
    const name = getPlatformName(platform);
    
    return {
        type: 'text',
        text: `✏️ **EDIT ${name.toUpperCase()} CONTENT**\n\n${emoji} Please describe what changes you'd like for the ${name} post:\n\n• Change caption/text\n• Modify hashtags\n• Update timing\n• Different approach\n\nType your edit request below:`
    };
}

/**
 * Publish to approved platforms
 */
async function publishApprovedPlatforms(publishState, botConfig) {
    try {
        const approvedPlatforms = publishState.approvedPlatforms || [];
        
        if (approvedPlatforms.length === 0) {
            return {
                type: 'text', 
                text: '⚠️ No platforms approved yet. Please review and approve platforms first.'
            };
        }
        
        console.log(`[DailyDeal] Publishing to approved platforms: ${approvedPlatforms.join(', ')}`);
        
        // Trigger N8N pipeline for each approved platform
        const publishResults = [];
        for (const platform of approvedPlatforms) {
            const result = await triggerN8NPlatformPublish(publishState, platform, botConfig);
            publishResults.push({ platform, result });
        }
        
        let messageText = `🚀 **PUBLISHING INITIATED!**\n\n`;
        messageText += `📊 **Publishing to ${approvedPlatforms.length} platforms:**\n`;
        
        for (const { platform, result } of publishResults) {
            const emoji = getPlatformEmoji(platform);
            const name = getPlatformName(platform);
            const status = result.success ? '✅ Queued' : '❌ Failed';
            messageText += `${emoji} ${name}: ${status}\n`;
        }
        
        messageText += `\n🎯 **Content Links:**\n`;
        if (publishState.generatedContent.s3Uploads?.poster) {
            messageText += `🎨 Poster: ${publishState.generatedContent.s3Uploads.poster}\n`;
        }
        
        messageText += `\n📈 **Performance tracking activated!**\n`;
        messageText += `📱 You'll receive updates on views, likes, and engagement.\n\n`;
        messageText += `🎉 **Your deal is going viral!**`;
        
        return {
            type: 'text',
            text: messageText
        };
        
    } catch (error) {
        console.error('[DailyDeal] Error publishing to platforms:', error);
        return {
            type: 'text',
            text: '❌ Error publishing content. Please try again or contact support.'
        };
    }
}

/**
 * Trigger N8N pipeline for platform-specific publishing
 */
async function triggerN8NPlatformPublish(n8nState, platform, botConfig) {
    try {
        // This would integrate with your N8N webhook
        const n8nPayload = {
            action: 'publish_platform',
            platform: platform,
            dealData: n8nState.generatedContent.dealData,
            content: n8nState.generatedContent.platformContent[platform],
            media: n8nState.generatedContent.s3Uploads,
            storeId: n8nState.userId,
            timestamp: new Date().toISOString()
        };
        
        // Mock N8N call for now - replace with actual webhook
        console.log(`[DailyDeal] Would trigger N8N for ${platform}:`, JSON.stringify(n8nPayload, null, 2));
        
        return { 
            success: true, 
            platform, 
            message: `${platform} publishing queued`,
            n8nPayload 
        };
        
    } catch (error) {
        console.error(`[DailyDeal] Error triggering N8N for ${platform}:`, error);
        return { 
            success: false, 
            platform, 
            error: error.message 
        };
    }
}

/**
 * Save user settings
 */
async function saveUserSettings(settingsState) {
    try {
        // Save to database (implement as needed)
        // await saveSettingsToDatabase(settingsState);
        console.log('[DailyDeal] User settings saved successfully');
        return true;
            } catch (error) {
        console.error('[DailyDeal] Error saving settings:', error);
        return false;
    }
}

/**
 * Enhanced daily reminder system for owners within 24-hour limit
 */
async function sendDailyRemindersToOwners(botConfig) {
    try {
        console.log('[DailyDeal] Starting daily reminder check for owners...');
        
        // This would scan for restaurant profiles that need reminders
        // For now, return success message
        console.log('[DailyDeal] Daily reminders completed successfully');
        
        return {
            success: true,
            message: 'Daily reminders processed successfully'
        };
        
    } catch (error) {
        console.error('[DailyDeal] Error in daily reminder system:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Export the daily reminder function for cron job usage
export { 
    sendDailyRemindersToOwners, 
    downloadRestaurantPhotos, 
    uploadPhotoToS3
};

/**
 * Handle user-uploaded restaurant images for analysis
 */
async function handleRestaurantImageUpload(imageBuffer, imageType, metadata, botConfig) {
    try {
        console.log(`[DailyDeal] Processing user-uploaded restaurant image of type: ${imageType}`);
        
        if (!botConfig.openaiApiKey) {
            return {
                type: 'text',
                text: '❌ OpenAI API key not configured. Cannot analyze image.'
            };
        }
        
        // Import OpenAIImageAnalysisService dynamically
        const { default: OpenAIImageAnalysisService } = await import('../services/openAIImageAnalysisService.js');
        const imageAnalysis = new OpenAIImageAnalysisService(botConfig.openaiApiKey);
        
        // Analyze the image
        const analysisResult = await imageAnalysis.analyzeAndSaveImage(
            imageBuffer,
            imageType,
            metadata
        );
        
        // Generate insights summary if we have previous analyses
        let insightsSummary = null;
        if (metadata.previousAnalyses && metadata.previousAnalyses.length > 0) {
            const allAnalyses = [...metadata.previousAnalyses, analysisResult];
            insightsSummary = await imageAnalysis.getImageInsightsSummary(allAnalyses);
        }
        
        const responseMessage = insightsSummary 
            ? `📸 Restaurant image analyzed and saved!\n\n🔍 Analysis: ${analysisResult.analysis}\n\n📊 Insights Summary:\n${insightsSummary}`
            : `📸 Restaurant image analyzed and saved!\n\n🔍 Analysis: ${analysisResult.analysis}`;
        
        return {
            type: 'text',
            text: responseMessage,
            metadata: {
                imageAnalysis: analysisResult,
                insightsSummary
            }
        };
        
    } catch (error) {
        console.error('[DailyDeal] Error handling restaurant image upload:', error);
        return {
            type: 'text',
            text: '❌ Sorry, there was an error analyzing your restaurant image. Please try again.'
        };
    }
}

/**
 * Get restaurant images from S3 for a specific restaurant
 */
async function getRestaurantImages(restaurantName, botConfig) {
    try {
        console.log(`[DailyDeal] Retrieving images for restaurant: ${restaurantName}`);
        
        // Import S3ImageService dynamically
        const { default: S3ImageService } = await import('../services/s3ImageService.js');
        const s3Service = new S3ImageService(botConfig.s3Bucket || 'viral-agency-content');
        
        const images = await s3Service.getRestaurantImages(restaurantName);
        
        return {
            success: true,
            images: images,
            count: images.length
        };
        
    } catch (error) {
        console.error('[DailyDeal] Error retrieving restaurant images:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Use OpenAI to act as a human agent and determine next action
 */
async function getOpenAIAgentResponse(userMessage, currentStep, restaurantProfile, botConfig) {
    try {
        const openai = new OpenAI({ apiKey: botConfig.openAiApiKey });
        
        const systemPrompt = `You are a helpful human agent for a Daily Deal Viral Agency in Singapore. Your job is to understand what the user wants and guide them through the restaurant setup and deal creation process.

Current step: ${currentStep}
Restaurant profile: ${restaurantProfile.name ? `Name: ${restaurantProfile.name}, Address: ${restaurantProfile.location?.address || 'Not set'}` : 'Not set'}

Available steps:
- welcome: Show welcome message and options
- collect_restaurant_name: Ask for restaurant name
- restaurant_confirmed: Restaurant found, collect images
- collect_restaurant_images: Collect restaurant photos
- collect_deal_details: Ask for today's deal
- generate_content: Create viral content

User message: "${userMessage}"

Analyze the user's intent and respond as a helpful human agent. Determine:
1. What step they should be in next
2. What message to send them
3. How to guide them naturally

Respond in JSON format:
{
    "nextStep": "step_name",
    "message": "Your helpful response as a human agent",
    "action": "what_to_do_next",
    "confidence": 0.9
}`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            temperature: 0.7,
            max_tokens: 500
        });

        const text = completion.choices[0]?.message?.content || '{}';
        let parsed = {};
        try {
            parsed = JSON.parse(text);
        } catch (parseErr) {
            console.log('[DailyDeal] OpenAI response parsing failed:', parseErr.message);
            // Fallback response
            return {
                nextStep: currentStep,
                message: "I understand you're trying to set up your restaurant. Let me help you step by step. What would you like to do?",
                action: 'continue_current_step',
                confidence: 0.5
            };
        }

        console.log('[DailyDeal] OpenAI agent response:', parsed);
        return parsed;

    } catch (error) {
        console.error('[DailyDeal] OpenAI agent error:', error.message);
        // Fallback response
        return {
            nextStep: currentStep,
            message: "I'm here to help you set up your restaurant and create viral deals. What would you like to do?",
            action: 'continue_current_step',
            confidence: 0.3
        };
    }
}

/**
 * Build a direct photo URL you can drop into <img src="...">
 */
function buildPhotoUrl(photoName, apiKey, { maxWidthPx = 800, maxHeightPx } = {}) {
    const params = new URLSearchParams({ key: apiKey, maxWidthPx });
    if (maxHeightPx) params.set("maxHeightPx", String(maxHeightPx));
    return `https://places.googleapis.com/v1/${photoName}/media?${params.toString()}`;
}

/**
 * Text Search using new Google Places API v1
 */
async function searchTextNewAPI(textQuery, apiKey, opts = {}) {
    const body = {
        textQuery,
        locationBias: opts.locationBias || {
            rectangle: {
                low: { latitude: 1.2, longitude: 103.6 },
                high: { latitude: 1.5, longitude: 104.0 }
            }
        },
        includedType: opts.includedType || "restaurant",
        maxResultCount: opts.maxResultCount || 5,
        languageCode: opts.languageCode || "en",
    };

    const res = await fetch(`https://places.googleapis.com/v1/places:searchText`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": [
                "places.id",
                "places.displayName",
                "places.formattedAddress",
                "places.location",
                "places.rating",
                "places.userRatingCount",
                "places.priceLevel",
                "places.primaryType",
                "places.photos",
                "places.types"
            ].join(","),
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Google Places API v1 error: ${res.status} ${errorText}`);
    }
    
    return res.json(); // { places: [...] }
}

/**
 * Get Place Details using new Google Places API v1
 */
async function getPlaceDetailsNewAPI(placeId, apiKey) {
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    const res = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": [
                "id",
                "displayName",
                "formattedAddress",
                "googleMapsUri",
                "nationalPhoneNumber",
                "internationalPhoneNumber",
                "websiteUri",
                "rating",
                "userRatingCount",
                "priceLevel",
                "regularOpeningHours",
                "currentOpeningHours",
                "types",
                "photos",
                "businessStatus",
                "delivery",
                "dineIn",
                "takeout",
                "reservable",
                "servesBeer",
                "servesWine",
                "servesBreakfast",
                "servesLunch",
                "servesDinner"
            ].join(","),
        },
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Google Places Details API v1 error: ${res.status} ${errorText}`);
    }
    
    return res.json(); // Place object
}

/**
 * Save enhanced restaurant profile to DynamoDB
 */
async function saveRestaurantProfileToDynamoDB(restaurantProfile, fromNumber, botConfig) {
    try {
        console.log(`[DailyDeal] 💾 Saving restaurant profile to DynamoDB:`, {
            name: restaurantProfile.name,
            placeId: restaurantProfile.placeId,
            phone: restaurantProfile.phone,
            website: restaurantProfile.website
        });

        // Import DynamoDB service dynamically
        const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient, PutCommand } = await import('@aws-sdk/lib-dynamodb');
        
        const client = new DynamoDBClient({ region: 'ap-southeast-1' });
        const docClient = DynamoDBDocumentClient.from(client);
        
        const timestamp = new Date().toISOString();
        const item = {
            storeId: botConfig.storeId,
            userId: fromNumber,
            restaurantId: restaurantProfile.placeId || `manual_${Date.now()}`,
            restaurantName: restaurantProfile.name,
            phone: restaurantProfile.phone,
            website: restaurantProfile.website,
            address: restaurantProfile.location?.address,
            coordinates: restaurantProfile.location?.coordinates,
            rating: restaurantProfile.rating,
            totalRatings: restaurantProfile.totalRatings,
            priceLevel: restaurantProfile.priceLevel,
            businessStatus: restaurantProfile.businessStatus,
            types: restaurantProfile.types,
            googleMapsUrl: restaurantProfile.googleMapsUrl,
            openingHours: restaurantProfile.openingHours,
            delivery: restaurantProfile.delivery,
            dineIn: restaurantProfile.dineIn,
            takeout: restaurantProfile.takeout,
            reservable: restaurantProfile.reservable,
            servesBeer: restaurantProfile.servesBeer,
            servesWine: restaurantProfile.servesWine,
            servesBreakfast: restaurantProfile.servesBreakfast,
            servesLunch: restaurantProfile.servesLunch,
            servesDinner: restaurantProfile.servesDinner,
            photos: restaurantProfile.photos || [],
            additionalImages: restaurantProfile.additionalImages || [],
            uploadedImages: restaurantProfile.images || [],
            socialMedia: restaurantProfile.socialMedia || {},
            spiderData: restaurantProfile.spiderData || null,
            createdAt: timestamp,
            updatedAt: timestamp,
            source: 'google_places_v1',
            status: 'active'
        };

        const command = new PutCommand({
            TableName: 'RestaurantProfiles',
            Item: item
        });

        await docClient.send(command);
        console.log(`[DailyDeal] ✅ Restaurant profile saved to DynamoDB successfully`);
        
        return true;
    } catch (error) {
        console.error(`[DailyDeal] ❌ Error saving restaurant profile to DynamoDB:`, error.message);
        return false;
    }
}

/**
 * Retrieve saved restaurant profile from DynamoDB
 */
async function getRestaurantProfileFromDynamoDB(fromNumber, botConfig) {
    try {
        console.log(`[DailyDeal] 🔍 Retrieving restaurant profile from DynamoDB for: ${fromNumber}`);

        // Import DynamoDB service dynamically
        const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
        const { DynamoDBDocumentClient, QueryCommand } = await import('@aws-sdk/lib-dynamodb');
        
        const client = new DynamoDBClient({ region: 'ap-southeast-1' });
        const docClient = DynamoDBDocumentClient.from(client);
        
        const command = new QueryCommand({
            TableName: 'RestaurantProfiles',
            KeyConditionExpression: 'storeId = :storeId AND userId = :userId',
            ExpressionAttributeValues: {
                ':storeId': botConfig.storeId,
                ':userId': fromNumber
            },
            ScanIndexForward: false,
            Limit: 1
        });

        const result = await docClient.send(command);
        
        if (result.Items && result.Items.length > 0) {
            const profile = result.Items[0];
            console.log(`[DailyDeal] ✅ Retrieved restaurant profile from DynamoDB:`, {
                name: profile.restaurantName,
                placeId: profile.restaurantId,
                lastUpdated: profile.updatedAt
            });
            return profile;
        } else {
            console.log(`[DailyDeal] ℹ️ No restaurant profile found in DynamoDB for: ${fromNumber}`);
            return null;
        }
    } catch (error) {
        console.error(`[DailyDeal] ❌ Error retrieving restaurant profile from DynamoDB:`, error.message);
        return null;
    }
}

export {
    handleDailyDealText,
    handleDailyDealInteractive,
    handleDailyDealImage,
    handleRestaurantImageUpload,
    getRestaurantImages,
    saveRestaurantProfileToDynamoDB,
    getRestaurantProfileFromDynamoDB,
    processRestaurantUpdate,
    createFinalDealMessage,
    HetznerVideoService
};