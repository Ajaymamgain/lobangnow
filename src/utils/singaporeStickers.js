// Singapore-specific stickers and emojis for LobangLah
import { sendWhatsAppMessage } from './whatsappUtils.js';

/**
 * Singapore-specific sticker categories
 */
export const singaporeStickers = {
    greetings: [
        "👋", "😄", "🎯", "💰", "🏃‍♂️", "🔥", "🚀", "💪"
    ],
    
    deals: [
        "🎉", "⚡", "💎", "🏆", "⭐", "💯", "🔥", "💪"
    ],
    
    weather: [
        "🌞", "☔", "🌤️", "🌧️", "⛈️", "🌦️", "🌡️", "🌈"
    ],
    
    food: [
        "🍽️", "🍕", "🍜", "🍚", "🍖", "🥘", "🍤", "🥟"
    ],
    
    events: [
        "🎉", "🎭", "🎪", "🎨", "🎬", "🎤", "🎵", "🎊"
    ],
    
    fashion: [
        "👗", "👕", "👠", "👜", "💄", "💍", "👒", "🕶️"
    ],
    
    locations: [
        "📍", "🏢", "🏪", "🏬", "🏨", "🏛️", "🎡", "🌴"
    ],
    
    singapore: [
        "🇸🇬", "🦁", "🌺", "🏙️", "🌉", "🚇", "🚌", "🚕"
    ]
};

/**
 * Get random sticker from category
 */
export function getRandomSticker(category = 'greetings') {
    const stickers = singaporeStickers[category] || singaporeStickers.greetings;
    return stickers[Math.floor(Math.random() * stickers.length)];
}

/**
 * Send Singapore-themed sticker message
 */
export async function sendSingaporeSticker(storeId, fromNumber, category, botConfig) {
    const sticker = getRandomSticker(category);
    
    const stickerMessage = {
        type: "sticker",
        sticker: {
            link: `https://example.com/stickers/${category}/${sticker}.webp`
        }
    };
    
    try {
        await sendWhatsAppMessage(storeId, fromNumber, stickerMessage, botConfig);
        console.log(`[SingaporeStickers] Sent ${category} sticker: ${sticker}`);
    } catch (error) {
        console.error(`[SingaporeStickers] Error sending sticker:`, error);
    }
}

/**
 * Create Singapore-themed emoji sequence
 */
export function createSingaporeEmojiSequence(category, count = 3) {
    const emojis = [];
    const categoryStickers = singaporeStickers[category] || singaporeStickers.greetings;
    
    for (let i = 0; i < count; i++) {
        emojis.push(categoryStickers[Math.floor(Math.random() * categoryStickers.length)]);
    }
    
    return emojis.join(' ');
}

/**
 * Singapore-specific success emoji combinations
 */
export function getSingaporeSuccessEmojis(context = {}) {
    const combinations = {
        location: "📍🇸🇬🎯",
        deals: "💰💎🎉",
        food: "🍽️😋💯",
        events: "🎉🎭⭐",
        fashion: "👗💄🔥",
        weather: "🌤️☀️🌈",
        default: "🎯💪🚀"
    };
    
    return combinations[context.type] || combinations.default;
}

/**
 * Singapore-specific loading emoji
 */
export function getSingaporeLoadingEmoji() {
    const loadingEmojis = ["🔍", "⏳", "🔄", "💫", "✨", "🌟"];
    return loadingEmojis[Math.floor(Math.random() * loadingEmojis.length)];
} 