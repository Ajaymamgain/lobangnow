// Singapore-specific features and enhancements for LobangLah
import { getWeatherForLocation } from './googleLocationUtils.js';
import OpenAI from 'openai';

/**
 * Singaporean slang and expressions for more authentic communication
 */
export const singaporeSlang = {
    greetings: [
        "Wah! Hello there! 👋",
        "Eh, what's up lah! 😄",
        "Yo! Ready to find some good lobang? 🎯",
        "Hello! Got any good deals today? 💰",
        "Hi! Let's go hunting for deals! 🏃‍♂️"
    ],
    
    dealExpressions: [
        "Wah! This one really good deal lah! 👍",
        "Steady lah! Found you a solid lobang! 💪",
        "This one cannot miss one! Must grab! ⚡",
        "Wah piang! Such good value! 😱",
        "This one really worth it! Don't wait! 🎉"
    ],
    
    weatherResponses: [
        "Today weather like that ah, perfect for {indoor/outdoor} deals!",
        "Wah, {weather_condition}! Better find some {indoor/outdoor} lobang!",
        "With this weather, I got the perfect deals for you!",
        "Weather like that, must find you the best deals lah!",
        "Today's weather calls for some amazing deals!"
    ],
    
    encouragements: [
        "Don't wait lah! Grab while you can! 🏃‍♂️",
        "This one really good lobang! Don't miss out! ⚡",
        "Wah! Such good deal, must share with friends! 👥",
        "Steady lah! You found a gem! 💎",
        "This one really worth your money! 💰"
    ],
    
    locationResponses: [
        "Wah! {location} ah! Got many good deals there!",
        "Steady! {location} is a good area for deals!",
        "Wah piang! {location} got so many lobang!",
        "Good choice! {location} got the best deals!",
        "Nice! {location} is my favorite hunting ground!"
    ]
};

/**
 * Singapore-specific deal categories and preferences
 */
export const singaporeDealCategories = {
    food: {
        keywords: ['1-for-1', 'set meal', 'happy hour', 'lunch special', 'dinner promotion', 'buffet', 'high tea', 'dim sum', 'chicken rice', 'laksa', 'char kway teow'],
        popularAreas: ['Orchard Road', 'Marina Bay', 'Chinatown', 'Little India', 'Bugis', 'Tampines', 'Jurong East', 'Woodlands'],
        mealTimes: {
            breakfast: '7:00 AM - 10:00 AM',
            lunch: '11:30 AM - 2:30 PM',
            tea: '2:30 PM - 5:30 PM',
            dinner: '6:00 PM - 9:30 PM',
            supper: '10:00 PM - 2:00 AM'
        }
    },
    
    events: {
        keywords: ['free entry', 'student discount', 'senior citizen', 'family package', 'group booking', 'early bird', 'member price', 'weekend special'],
        popularVenues: ['Marina Bay Sands', 'Esplanade', 'Singapore Zoo', 'Universal Studios', 'Gardens by the Bay', 'ArtScience Museum', 'National Gallery'],
        eventTypes: ['concerts', 'exhibitions', 'workshops', 'festivals', 'shows', 'tours', 'activities']
    },
    
    fashion: {
        keywords: ['sale', 'clearance', 'end of season', 'member discount', 'student price', 'buy 2 get 1', 'flash sale', 'warehouse sale'],
        popularMalls: ['ION Orchard', 'Marina Bay Sands', 'VivoCity', 'Jewel Changi', 'Plaza Singapura', 'Bugis Junction', 'Tampines Mall'],
        seasons: ['Chinese New Year', 'Great Singapore Sale', 'Black Friday', 'Christmas', 'New Year']
    }
};

/**
 * Singapore weather-based deal recommendations
 */
export async function getWeatherBasedRecommendations(latitude, longitude, googleMapsApiKey) {
    try {
        const weather = await getWeatherForLocation(latitude, longitude, googleMapsApiKey);
        
        if (!weather.isValid) {
            return {
                indoor: true,
                outdoor: true,
                recommendation: "Let me find you the best deals regardless of weather! 🌤️"
            };
        }
        
        const condition = weather.condition.toLowerCase();
        const temperature = weather.temperature;
        
        let indoor = false;
        let outdoor = false;
        let recommendation = "";
        
        // Rainy weather
        if (condition.includes('rain') || condition.includes('drizzle') || condition.includes('storm')) {
            indoor = true;
            recommendation = "Wah! Raining outside! Perfect time for indoor deals like malls, cafes, and entertainment! ☔";
        }
        // Hot and sunny
        else if (condition.includes('sunny') || condition.includes('clear') || temperature > 30) {
            indoor = true;
            outdoor = true;
            recommendation = "Wah piang! So hot today! Got both indoor and outdoor deals for you! 🌞";
        }
        // Cool weather
        else if (temperature < 25) {
            outdoor = true;
            recommendation = "Nice cool weather! Perfect for outdoor activities and al fresco dining! 🌤️";
        }
        // Normal weather
        else {
            indoor = true;
            outdoor = true;
            recommendation = "Weather looks good! Got deals for both indoor and outdoor activities! 😊";
        }
        
        return { indoor, outdoor, recommendation };
        
    } catch (error) {
        console.error('[SingaporeFeatures] Error getting weather recommendations:', error);
        return {
            indoor: true,
            outdoor: true,
            recommendation: "Let me find you the best deals! 🎯"
        };
    }
}

/**
 * Singapore-specific welcome messages based on time of day
 */
export function getSingaporeWelcomeMessage() {
    const hour = new Date().getHours();
    let timeGreeting = "";
    let timeEmoji = "";
    
    if (hour >= 5 && hour < 12) {
        timeGreeting = "Good morning!";
        timeEmoji = "🌅";
    } else if (hour >= 12 && hour < 17) {
        timeGreeting = "Good afternoon!";
        timeEmoji = "☀️";
    } else if (hour >= 17 && hour < 21) {
        timeGreeting = "Good evening!";
        timeEmoji = "🌆";
    } else {
        timeGreeting = "Good night!";
        timeEmoji = "🌙";
    }
    
    const randomGreeting = singaporeSlang.greetings[Math.floor(Math.random() * singaporeSlang.greetings.length)];
    
    return {
        type: "interactive",
        interactive: {
            type: "button",
            header: { 
                type: "text", 
                text: `${timeEmoji} ${timeGreeting} Welcome to LobangLah!` 
            },
            body: { 
                text: `${randomGreeting}\n\nI'm your personal AI deal hunter from **LobangLah** - Singapore's smartest deal discovery platform! 🤖\n\nI can find the best deals near you for food, events, fashion, and more, all with today's weather forecast.\n\n📍 **Ready to start saving?** Share your location and I'll find amazing deals nearby!` 
            },
            footer: { text: "🚀 Powered by LobangLah AI" },
            action: {
                buttons: [
                    { type: "reply", reply: { id: "share_location_prompt", title: "📍 Share Location" } },
                    { type: "reply", reply: { id: "how_it_works", title: "❓ How It Works" } }
                ]
            }
        }
    };
}

/**
 * Singapore-specific deal formatting with local context
 */
export function formatSingaporeDeal(deal, category, location) {
    let formattedDeal = { ...deal };
    
    // Add Singapore-specific context
    if (category === 'food') {
        // Add meal time recommendations
        const hour = new Date().getHours();
        if (hour >= 7 && hour < 11) {
            formattedDeal.mealTime = "Breakfast";
        } else if (hour >= 11 && hour < 15) {
            formattedDeal.mealTime = "Lunch";
        } else if (hour >= 15 && hour < 18) {
            formattedDeal.mealTime = "Tea Time";
        } else if (hour >= 18 && hour < 22) {
            formattedDeal.mealTime = "Dinner";
        } else {
            formattedDeal.mealTime = "Supper";
        }
    }
    
    // Add Singapore-specific pricing context
    if (formattedDeal.price) {
        if (formattedDeal.price.includes('$') || formattedDeal.price.includes('SGD')) {
            // Already in SGD
        } else {
            // Assume it's in SGD and add $ if missing
            if (!formattedDeal.price.startsWith('$')) {
                formattedDeal.price = `$${formattedDeal.price}`;
            }
        }
    }
    
    // Add location context
    if (location && location.area) {
        formattedDeal.area = location.area;
        formattedDeal.distance = "Nearby"; // Could be enhanced with actual distance calculation
    }
    
    return formattedDeal;
}

/**
 * Singapore-specific deal ranking based on local preferences
 */
export function rankSingaporeDeals(deals, category) {
    return deals.map(deal => {
        let score = 0;
        
        // Score based on Singapore keywords
        const keywords = singaporeDealCategories[category]?.keywords || [];
        const dealText = `${deal.title} ${deal.description} ${deal.offer}`.toLowerCase();
        
        keywords.forEach(keyword => {
            if (dealText.includes(keyword.toLowerCase())) {
                score += 2;
            }
        });
        
        // Score based on popular areas
        const popularAreas = singaporeDealCategories[category]?.popularAreas || [];
        if (deal.address) {
            popularAreas.forEach(area => {
                if (deal.address.toLowerCase().includes(area.toLowerCase())) {
                    score += 1;
                }
            });
        }
        
        // Score based on price (prefer deals with clear pricing)
        if (deal.price && deal.price !== 'Contact for price') {
            score += 1;
        }
        
        // Score based on validity (prefer current deals)
        if (deal.validUntil && new Date(deal.validUntil) > new Date()) {
            score += 1;
        }
        
        return { ...deal, singaporeScore: score };
    }).sort((a, b) => b.singaporeScore - a.singaporeScore);
}

/**
 * Singapore-specific error messages
 */
export function getSingaporeErrorMessage(errorType, context = {}) {
    const errorMessages = {
        noLocation: "Eh! I need your location to find good lobang near you lah! 📍\n\nPlease share your location by tapping the 📎 attachment icon and selecting 'Location'.",
        
        noDeals: `Wah! No ${context.category || 'good'} deals found near ${context.location || 'your area'} right now.\n\nTry another category or location lah! 🔄`,
        
        apiError: "Sorry lah! Something went wrong with my deal hunting.\n\nPlease try again in a while! 🔄",
        
        weatherError: "Weather info not available, but I'll still find you the best deals! 🌤️",
        
        networkError: "Network a bit slow lah! Please try again in a moment! 📶"
    };
    
    return errorMessages[errorType] || errorMessages.apiError;
}

/**
 * Singapore-specific success messages
 */
export function getSingaporeSuccessMessage(type, context = {}) {
    const successMessages = {
        locationConfirmed: `Wah! ${context.location} ah! Got many good deals there! 🎯`,
        
        dealsFound: `Steady lah! Found ${context.count} amazing ${context.category} deals for you! 💪`,
        
        dealShared: "Wah! Good lobang must share with friends! 👥",
        
        categorySelected: `Nice choice! ${context.category} deals are the best! 🎉`
    };
    
    return successMessages[type] || "Wah! Success lah! 🎉";
}

/**
 * Generate AI-powered fun Singapore content with conversation context
 */
export async function generateAISingaporeContent(context, location, weather, botConfig, conversationHistory = []) {
    try {
        const openAIApiKey = botConfig?.openAiApiKey || botConfig?.openAIApiKey || process.env.OPENAI_API_KEY;
        if (!openAIApiKey) {
            console.log('[SingaporeFeatures] No OpenAI API key, using fallback content');
            return getFallbackSingaporeContent(context, location, weather);
        }
        
        const openai = new OpenAI({ apiKey: openAIApiKey });
        
        // Format conversation history for context
        const conversationContext = conversationHistory.length > 0 
            ? conversationHistory.slice(-5).map(msg => `${msg.role === 'user' ? 'User' : 'Bot'}: ${msg.content}`).join('\n')
            : 'No previous conversation';
        
        let prompt;
        
        if (context === 'session_start') {
            prompt = `You are LobangLah, Singapore's most fun and engaging AI deal hunter! The user just started a location search session.

Previous conversation:
${conversationContext}

Create a short, contextual message that:
1. References their previous messages naturally
2. Shows you remember what they were talking about
3. Uses Singaporean English with "lah", "leh", "lor" naturally
4. Includes local expressions and cultural references
5. Makes it fun and engaging (under 80 words)
6. Uses emojis appropriately
7. Transitions smoothly into the location search session

Examples:
- "Wah! Still looking for good lobang ah? Let's find you the best deals!"
- "Steady lah! I remember you mentioned {previous topic}. Now let's find deals near you!"
- "Wah piang! You're really serious about finding deals! Let's get started!"

Make it feel like a local Singaporean friend who remembers your conversation.`;
        } else {
            prompt = `You are LobangLah, Singapore's most fun and engaging AI deal hunter! Create a short, entertaining message for a Singaporean user.

Context: ${context}
Location: ${location || 'Singapore'}
Weather: ${weather || 'unknown'}

Previous conversation:
${conversationContext}

Requirements:
1. Use Singaporean English with "lah", "leh", "lor" naturally
2. Include local expressions and cultural references
3. Make it fun and engaging (under 100 words)
4. Use emojis appropriately
5. Reference the location and weather if provided
6. Be encouraging and enthusiastic about finding deals
7. Reference previous conversation if relevant

Examples of tone:
- "Wah! {location} ah! Perfect place for some good lobang!"
- "Steady lah! With this weather, I got the perfect deals for you!"
- "Wah piang! Such good timing to find deals near {location}!"

Make it feel like a local Singaporean friend is talking to them.`;
        }

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 150,
            temperature: 0.8
        });
        
        const aiContent = response.choices[0].message.content.trim();
        console.log(`[SingaporeFeatures] Generated AI content: ${aiContent.substring(0, 50)}...`);
        
        return aiContent;
        
    } catch (error) {
        console.error('[SingaporeFeatures] Error generating AI content:', error);
        return getFallbackSingaporeContent(context, location, weather);
    }
}

/**
 * Fallback Singapore content when AI is not available
 */
function getFallbackSingaporeContent(context, location, weather) {
    const fallbackMessages = {
        location_confirmed: `Wah! ${location || 'Singapore'} ah! Got many good deals there! 🎯`,
        weather_good: `Steady lah! Weather looks good for finding deals! 🌤️`,
        weather_rainy: `Wah! Raining outside! Perfect time for indoor deals! ☔`,
        weather_hot: `Wah piang! So hot today! Got both indoor and outdoor deals for you! 🌞`,
        deals_found: `Wah! Found some solid lobang for you! 💪`,
        welcome: `Eh! Ready to find some good deals lah! 🚀`
    };
    
    return fallbackMessages[context] || fallbackMessages.welcome;
} 